import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { claudeStream } from "../services/claude.js";
import { readProjectFiles } from "../services/generator.js";
import { getRecentLogs } from "../services/logger.js";
import { getDatabaseInfo } from "../services/database.js";
import { queryProjectDatabase } from "../services/database.js";
import { Project, Deployment, ChatMessage } from "../types.js";

const router = Router();

// Get chat history for a project
router.get("/projects/:projectId/chat", (req: Request, res: Response) => {
  const db = getDb();
  const messages = db
    .prepare("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC")
    .all(req.params.projectId);
  res.json(messages);
});

// Chat with Claude about a project (SSE streaming)
router.post("/projects/:projectId/chat", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.projectId) as Project | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Save user message
  db.prepare(
    "INSERT INTO chat_messages (project_id, role, content) VALUES (?, 'user', ?)"
  ).run(project.id, message);

  // Build context — cap total file content to avoid exceeding context limits
  const MAX_FILE_CONTEXT = 50000; // ~50K chars max for file context
  const files = readProjectFiles(project.source_path);
  const latestDeployment = db
    .prepare("SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(project.id) as Deployment | undefined;

  let logsContext = "";
  if (latestDeployment) {
    const logs = getRecentLogs(latestDeployment.id, 100);
    logsContext = logs
      .reverse()
      .map((l) => `[${l.stream}] ${l.message}`)
      .join("\n");
  }

  // Prioritize key files, truncate large ones
  const fileEntries = Object.entries(files);
  const priorityFiles = ["server.js", "server/index.js", "package.json", "index.js", "app.js"];
  fileEntries.sort((a, b) => {
    const aP = priorityFiles.findIndex(p => a[0].endsWith(p));
    const bP = priorityFiles.findIndex(p => b[0].endsWith(p));
    if (aP !== -1 && bP === -1) return -1;
    if (aP === -1 && bP !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });

  let filesContext = "";
  let totalChars = 0;
  const includedFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const [filePath, content] of fileEntries) {
    const entry = `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    if (totalChars + entry.length > MAX_FILE_CONTEXT) {
      skippedFiles.push(filePath);
      continue;
    }
    filesContext += entry;
    totalChars += entry.length;
    includedFiles.push(filePath);
  }

  if (skippedFiles.length > 0) {
    filesContext += `\n(${skippedFiles.length} additional files not shown: ${skippedFiles.slice(0, 10).join(", ")}${skippedFiles.length > 10 ? "..." : ""})\n`;
  }

  // Get database info if available
  let dbContext = "";
  try {
    dbContext = await queryProjectDatabase(project.id);
  } catch {
    dbContext = "(No database)";
  }

  // Get env vars
  const envVars = db
    .prepare("SELECT key, value FROM env_vars WHERE project_id = ?")
    .all(project.id) as Array<{ key: string; value: string }>;
  const envContext = envVars.length > 0
    ? envVars.map((v) => `${v.key}=${v.value}`).join("\n")
    : "(No environment variables set)";

  // Get GitHub connection
  const githubRepo = db
    .prepare("SELECT repo_url, branch FROM github_repos WHERE project_id = ?")
    .get(project.id) as { repo_url: string; branch: string } | undefined;
  const githubContext = githubRepo
    ? `Connected to ${githubRepo.repo_url} (branch: ${githubRepo.branch})`
    : "(No GitHub repo connected)";

  const systemPrompt = `You are a helpful AI assistant integrated into a cloud deployment platform. You have full context about the user's project, including their database schema and data.

Project: ${project.name}
Description: ${project.description}

## Current Project Files
${filesContext || "(No files generated yet)"}

## Deployments
${(() => {
  const allDeps = db.prepare("SELECT id, status, port, error, created_at FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 5").all(project.id) as Array<{ id: string; status: string; port: number | null; error: string | null; created_at: string }>;
  if (allDeps.length === 0) return "No deployments yet.";
  return allDeps.map(d => {
    let line = `- ${d.status.toUpperCase()} (${d.created_at})`;
    if (d.port) line += ` — port ${d.port}`;
    if (d.error) line += ` — Error: ${d.error}`;
    return line;
  }).join("\n");
})()}
${latestDeployment?.status && ["pending", "generating", "building", "deploying"].includes(latestDeployment.status)
  ? "\n⚠️ A deployment is currently in progress. Do NOT suggest deploying right now — wait for it to finish."
  : ""}

## Recent Logs
\`\`\`
${logsContext || "(No logs)"}
\`\`\`

## Environment Variables
\`\`\`
${envContext}
\`\`\`

## Database
${dbContext}

## GitHub
${githubContext}

Help the user understand their project, debug issues, suggest improvements, and answer questions. You can see the database tables, schema, and row counts above. You can see all environment variables and the GitHub connection. If they want to make changes, explain what you'd change. For actual code changes, suggest they click "Apply & Deploy" with their modification request.`;

  // Get chat history
  const history = db
    .prepare("SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC")
    .all(project.id) as ChatMessage[];

  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream response via SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const stream = claudeStream(systemPrompt, messages);
    let fullResponse = "";

    stream.on("text", (text) => {
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`);
    });

    await stream.finalMessage();

    // Save assistant response
    db.prepare(
      "INSERT INTO chat_messages (project_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(project.id, fullResponse);

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: "error", content: errMsg })}\n\n`);
    res.end();
  }
});

export default router;
