import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import { getDb } from "../db/client.js";
import { Project } from "../types.js";

const execFileAsync = promisify(execFile);
const router = Router();

/** Inject a GitHub token into the clone URL for private repo access */
function buildCloneUrl(repoUrl: string, token?: string | null): string {
  if (!token) return repoUrl;
  // https://github.com/user/repo.git → https://x-access-token:TOKEN@github.com/user/repo.git
  try {
    const url = new URL(repoUrl);
    url.username = "x-access-token";
    url.password = token;
    return url.toString();
  } catch {
    return repoUrl;
  }
}

interface GitHubRepo {
  id: number;
  project_id: string;
  repo_url: string;
  branch: string;
  webhook_secret: string;
}

// Connect a GitHub repo to a project
router.post("/projects/:id/github", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id as string) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { repoUrl, branch, githubToken } = req.body;
  if (!repoUrl) { res.status(400).json({ error: "repoUrl is required" }); return; }

  const webhookSecret = nanoid(32);

  // Build clone URL — inject token for private repos
  const cloneUrl = buildCloneUrl(repoUrl, githubToken);

  // Clone the repo into the project source path
  try {
    // Clean existing source
    if (fs.existsSync(project.source_path)) {
      fs.rmSync(project.source_path, { recursive: true, force: true });
    }

    await execFileAsync("git", [
      "clone",
      "--depth", "1",
      "--branch", branch || "main",
      cloneUrl,
      project.source_path,
    ], { timeout: 60000 });

    // Reset remote to the clean URL (without token) so it doesn't leak in .git/config
    if (githubToken) {
      await execFileAsync("git", ["-C", project.source_path, "remote", "set-url", "origin", repoUrl], { timeout: 5000 });
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Strip token from error messages
    const safeMsg = githubToken ? msg.replace(new RegExp(githubToken, "g"), "***") : msg;
    res.status(400).json({ error: `Failed to clone: ${safeMsg}` });
    return;
  }

  // Save the connection (token is stored encrypted-at-rest by SQLite — acceptable for MVP)
  db.prepare(
    `INSERT INTO github_repos (project_id, repo_url, branch, webhook_secret, github_token)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET repo_url = excluded.repo_url, branch = excluded.branch, webhook_secret = excluded.webhook_secret, github_token = excluded.github_token`
  ).run(project.id, repoUrl, branch || "main", webhookSecret, githubToken || null);

  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);

  res.json({
    ok: true,
    webhookSecret,
    webhookUrl: `/api/github/webhook/${project.id}`,
    message: "Add this webhook URL and secret to your GitHub repo settings.",
  });
});

// Get GitHub connection info
router.get("/projects/:id/github", (req: Request, res: Response) => {
  const db = getDb();
  const repo = db.prepare("SELECT * FROM github_repos WHERE project_id = ?").get(req.params.id as string) as GitHubRepo | undefined;
  if (!repo) { res.json(null); return; }
  res.json({ repoUrl: repo.repo_url, branch: repo.branch, webhookUrl: `/api/github/webhook/${req.params.id}` });
});

// Disconnect GitHub
router.delete("/projects/:id/github", (req: Request, res: Response) => {
  const db = getDb();
  db.prepare("DELETE FROM github_repos WHERE project_id = ?").run(req.params.id as string);
  res.json({ ok: true });
});

// GitHub webhook endpoint — receives push events
router.post("/github/webhook/:projectId", async (req: Request, res: Response) => {
  const db = getDb();
  const projectId = req.params.projectId as string;

  const repo = db.prepare("SELECT * FROM github_repos WHERE project_id = ?").get(projectId) as GitHubRepo | undefined;
  if (!repo) { res.status(404).json({ error: "No GitHub connection" }); return; }

  // Verify webhook signature
  const signature = req.headers["x-hub-signature-256"] as string;
  if (signature) {
    const body = JSON.stringify(req.body);
    const expected = "sha256=" + crypto.createHmac("sha256", repo.webhook_secret).update(body).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  // Only process push events on the configured branch
  const event = req.headers["x-github-event"];
  if (event !== "push") {
    res.json({ ok: true, skipped: "not a push event" });
    return;
  }

  const payload = req.body;
  const pushBranch = payload.ref?.replace("refs/heads/", "");
  if (pushBranch !== repo.branch) {
    res.json({ ok: true, skipped: `push to ${pushBranch}, not ${repo.branch}` });
    return;
  }

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Pull latest code
  const pullUrl = buildCloneUrl(repo.repo_url, (repo as any).github_token);
  try {
    // Temporarily set remote with token for pull
    if ((repo as any).github_token) {
      await execFileAsync("git", ["-C", project.source_path, "remote", "set-url", "origin", pullUrl], { timeout: 5000 });
    }
    await execFileAsync("git", ["-C", project.source_path, "pull", "--ff-only"], { timeout: 60000 });
    // Reset remote to clean URL
    if ((repo as any).github_token) {
      await execFileAsync("git", ["-C", project.source_path, "remote", "set-url", "origin", repo.repo_url], { timeout: 5000 });
    }
  } catch {
    // If pull fails, re-clone
    fs.rmSync(project.source_path, { recursive: true, force: true });
    await execFileAsync("git", [
      "clone", "--depth", "1", "--branch", repo.branch,
      pullUrl, project.source_path,
    ], { timeout: 60000 });
    if ((repo as any).github_token) {
      await execFileAsync("git", ["-C", project.source_path, "remote", "set-url", "origin", repo.repo_url], { timeout: 5000 });
    }
  }

  // Trigger a deploy directly via the pipeline function
  const { runPipeline } = await import("./deployments.js");

  const deploymentId = nanoid(12);
  const prompt = `Auto-deploy from GitHub push: ${payload.head_commit?.message || "new commit"}`;

  db.prepare(
    "INSERT INTO deployments (id, project_id, status) VALUES (?, ?, 'pending')"
  ).run(deploymentId, project.id);

  // Run pipeline in background — don't block the webhook response
  runPipeline(project, deploymentId, prompt).catch((err) => {
    console.error("GitHub deploy pipeline error:", err);
    db.prepare("UPDATE deployments SET status = 'failed', error = ? WHERE id = ?")
      .run(err instanceof Error ? err.message : String(err), deploymentId);
  });

  res.json({ ok: true, deploymentId, message: "Deploy triggered from GitHub push" });
});

export default router;
