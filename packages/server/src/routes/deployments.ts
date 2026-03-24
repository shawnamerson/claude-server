import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { Project, Deployment } from "../types.js";
import "../types.js";
import { generateProject, modifyProject, readProjectFiles } from "../services/generator.js";
import { deployContainer, deployFromVolume, stopContainer, releasePort, logEmitter } from "../services/deployer.js";
import { getEnvVarsForDeploy } from "./envvars.js";
import { config } from "../config.js";
import { reloadCaddyConfig } from "../services/caddy.js";
import { canDeploy } from "./auth.js";
import { setCurrentDeployment, getDeployUsage } from "../services/claude.js";
import { createDatabase, getDatabaseInfo } from "../services/database.js";
import { detectProjectConfig } from "../services/project-detect.js";
import { getAdaptationPrompt } from "../services/project-adapt.js";

const router = Router();

function addLog(deploymentId: string, stream: string, message: string) {
  const db = getDb();
  db.prepare("INSERT INTO logs (deployment_id, stream, message) VALUES (?, ?, ?)").run(deploymentId, stream, message);
  // Push to SSE so the frontend gets it in real-time
  logEmitter.emit(`log:${deploymentId}`, { stream, message, timestamp: new Date().toISOString() });
}

const VALID_EXTRA_COLUMNS = new Set(["container_id", "port", "error", "docker_image_id", "stopped_at"]);

function updateStatus(deploymentId: string, status: string, extra: Record<string, unknown> = {}) {
  const db = getDb();
  const validKeys = Object.keys(extra).filter((k) => {
    if (!VALID_EXTRA_COLUMNS.has(k)) {
      console.warn(`updateStatus: rejecting invalid column name "${k}"`);
      return false;
    }
    return true;
  });
  const sets = ["status = ?", ...validKeys.map((k) => `${k} = ?`)];
  const values = [status, ...validKeys.map((k) => extra[k]), deploymentId];
  db.prepare(`UPDATE deployments SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

// List deployments for a project
router.get("/projects/:projectId/deployments", (req: Request, res: Response) => {
  const db = getDb();
  const deployments = db
    .prepare("SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC")
    .all(req.params.projectId);
  res.json(deployments);
});

// Get single deployment
router.get("/deployments/:id", (req: Request, res: Response) => {
  const db = getDb();
  const deployment = db.prepare("SELECT * FROM deployments WHERE id = ?").get(req.params.id);
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }
  res.json(deployment);
});

// Create new deployment — generates code with Claude, builds, and deploys
router.post("/projects/:projectId/deploy", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.projectId) as Project | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { prompt } = req.body;

  // Check plan limits
  const user = req.user;
  if (user) {
    const deployCheck = canDeploy(user.id);
    if (!deployCheck.allowed) {
      res.status(402).json({ error: deployCheck.reason });
      return;
    }
  }

  const deploymentId = nanoid(12);

  db.prepare(
    "INSERT INTO deployments (id, project_id, status) VALUES (?, ?, 'pending')"
  ).run(deploymentId, project.id);

  // Return immediately, process in background
  res.status(202).json({ id: deploymentId, status: "pending" });

  // Run the pipeline asynchronously
  runPipeline(project, deploymentId, prompt).catch((err) => {
    console.error("Pipeline error:", err);
    updateStatus(deploymentId, "failed", { error: err.message });
  });
});

export async function runPipeline(project: Project, deploymentId: string, prompt?: string) {
  const db = getDb();
  setCurrentDeployment(deploymentId);

  try {
    // Step 1: Generate or modify code with Claude (agentic — files written in real-time)
    updateStatus(deploymentId, "generating");

    const existingFiles = readProjectFiles(project.source_path);
    const hasExistingFiles = Object.keys(existingFiles).length > 0;
    const log = (msg: string) => addLog(deploymentId, "system", msg);

    let result;
    if (hasExistingFiles && prompt) {
      // Check if this is a GitHub repo that needs adaptation
      const adaptPrompt = getAdaptationPrompt(project.source_path);
      const effectivePrompt = adaptPrompt
        ? `${adaptPrompt}\n\nUser's deploy message: ${prompt}`
        : prompt;

      if (adaptPrompt) {
        addLog(deploymentId, "system", `Adapting project for single-service deployment...`);
      } else {
        addLog(deploymentId, "system", `Modifying project (${Object.keys(existingFiles).length} existing files)...`);
      }

      const chatHistory = db
        .prepare("SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC")
        .all(project.id) as Array<{ role: "user" | "assistant"; content: string }>;
      result = await modifyProject(project.source_path, chatHistory, effectivePrompt, log);
    } else {
      const description = prompt || project.description;
      if (!description) {
        throw new Error("No description provided. Tell Claude what to build.");
      }
      addLog(deploymentId, "system", `Project: ${description.slice(0, 200)}`);
      result = await generateProject(project.source_path, description, log);
    }

    addLog(deploymentId, "system", `Project ready — ${result.files.length} files`);

    // Pre-deploy: auto-fix known crash patterns in generated code
    try {
      const fs = await import("fs");
      const serverPath = `${project.source_path}/server.js`;
      if (fs.existsSync(serverPath)) {
        let code = fs.readFileSync(serverPath, "utf-8");
        let fixed = false;

        // Fix: app.get('*', ...) → app.use catch-all (Express 5 / path-to-regexp v8 crash)
        if (code.match(/\.(get|use)\s*\(\s*['"`]\*['"`]/)) {
          code = code.replace(/\.(get|use)\s*\(\s*['"`]\*['"`]\s*,/g, ".use(");
          fixed = true;
          addLog(deploymentId, "system", "Auto-fix: replaced wildcard route '*' with catch-all middleware");
        }

        // Fix: unhandled database connection — wrap pool creation in try/catch
        if (code.includes("new Pool(") && !code.includes("try") && code.includes("DATABASE_URL")) {
          code = code.replace(
            /(const pool\s*=\s*new Pool\([^)]*\))/,
            "let pool;\ntry {\n  $1;\n} catch(e) { console.log('Database not available, running without persistence'); pool = null; }"
          );
          fixed = true;
          addLog(deploymentId, "system", "Auto-fix: added try/catch around database connection");
        }

        if (fixed) {
          fs.writeFileSync(serverPath, code);
        }
      }

      // Python auto-fixes
      const appPyPath = `${project.source_path}/app.py`;
      const mainPyPath = `${project.source_path}/main.py`;
      const pyEntry = fs.existsSync(appPyPath) ? appPyPath : fs.existsSync(mainPyPath) ? mainPyPath : null;

      if (pyEntry) {
        let pyCode = fs.readFileSync(pyEntry, "utf-8");
        let pyFixed = false;

        // Fix: Flask app not binding to PORT env var
        if (pyCode.includes("app.run(") && !pyCode.includes("os.environ")) {
          pyCode = pyCode.replace(
            /app\.run\([^)]*\)/,
            'app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)))'
          );
          if (!pyCode.includes("import os")) {
            pyCode = "import os\n" + pyCode;
          }
          pyFixed = true;
          addLog(deploymentId, "system", "Auto-fix: Flask app.run() now uses PORT env var");
        }

        // Fix: Database connection without try/except
        if (pyCode.includes("psycopg2.connect") && !pyCode.includes("try:") && pyCode.includes("DATABASE_URL")) {
          pyCode = pyCode.replace(
            /(conn\s*=\s*psycopg2\.connect\([^)]*\))/,
            'try:\n    $1\nexcept Exception as e:\n    print(f"Database not available: {e}")\n    conn = None'
          );
          pyFixed = true;
          addLog(deploymentId, "system", "Auto-fix: wrapped database connection in try/except");
        }

        if (pyFixed) {
          fs.writeFileSync(pyEntry, pyCode);
        }
      }
    } catch (err) {
      console.warn("Auto-fix scan failed:", err instanceof Error ? err.message : String(err));
    }

    // Skip npm install / syntax check for speed — auto-fix handles failures
    // The code pattern scanner above catches the most common issues

    // Save chat messages
    if (prompt) {
      db.prepare(
        "INSERT INTO chat_messages (project_id, deployment_id, role, content) VALUES (?, ?, 'user', ?)"
      ).run(project.id, deploymentId, prompt);
    }
    db.prepare(
      "INSERT INTO chat_messages (project_id, deployment_id, role, content) VALUES (?, ?, 'assistant', ?)"
    ).run(project.id, deploymentId, result.notes || "Project generated successfully.");

    // Save dockerfile for reference
    db.prepare("UPDATE deployments SET dockerfile = ? WHERE id = ?").run(result.dockerfile, deploymentId);

    // Auto-create database if the project uses pg/DATABASE_URL
    const needsDb = result.files.some(f =>
      f.content.includes("DATABASE_URL") || f.content.includes("pg") || f.content.includes("Pool") ||
      f.content.includes("psycopg2") || f.content.includes("sqlalchemy")
    );
    if (needsDb && !getDatabaseInfo(project.id)) {
      try {
        addLog(deploymentId, "system", "Project uses a database — creating PostgreSQL...");
        const dbInfo = await createDatabase(project.id, project.slug);
        addLog(deploymentId, "system", `Database created: ${dbInfo.dbName} (DATABASE_URL auto-set)`);
      } catch (err) {
        addLog(deploymentId, "system", `Database creation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Stop previous deployment if running
    const prevDeployment = db
      .prepare(
        "SELECT * FROM deployments WHERE project_id = ? AND status = 'running' AND id != ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(project.id, deploymentId) as Deployment | undefined;

    if (prevDeployment?.container_id) {
      addLog(deploymentId, "system", "Stopping previous deployment...");
      await stopContainer(prevDeployment.container_id);
      if (prevDeployment.port) releasePort(prevDeployment.port);
      db.prepare("UPDATE deployments SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?").run(prevDeployment.id);
    }

    // Detect project config
    const projectConfig = detectProjectConfig(project.source_path);

    // Build step: run install + build in a dev container before deploying
    if (projectConfig.buildCommand) {
      updateStatus(deploymentId, "building");
      addLog(deploymentId, "system", `Building: ${projectConfig.buildCommand.slice(0, 120)}`);

      const { DevContainer } = await import("../services/generator.js");
      const buildContainer = new DevContainer(project.source_path);
      if (projectConfig.needsMoreMemory) {
        buildContainer.memoryOverride = 2048 * 1024 * 1024;
      }
      // Pass project env vars to build container (needed for Next.js builds that reference env vars at build time)
      const buildEnv = getEnvVarsForDeploy(project.id);
      // Add placeholder env vars so Next.js builds don't crash on missing secrets
      const placeholders = [
        "NEXTAUTH_SECRET=vibestack-build-placeholder-not-a-real-secret",
        "NEXTAUTH_URL=http://localhost:3000",
        "STRIPE_SECRET_KEY=sk_build_placeholder_not_real",
        "STRIPE_WEBHOOK_SECRET=whsec_build_placeholder_not_real",
        "RESEND_API_KEY=re_build_placeholder_not_real",
        "UPSTASH_REDIS_REST_URL=",
        "UPSTASH_REDIS_REST_TOKEN=",
        "CLOUDINARY_API_KEY=build_placeholder_not_real",
        "CLOUDINARY_API_SECRET=build_placeholder_not_real",
        "CLOUDINARY_CLOUD_NAME=build_placeholder_not_real",
        "CRON_SECRET=build_placeholder_not_real",
        `NEXT_PUBLIC_APP_URL=https://${project.slug}.${config.domain}`,
      ];
      // Only add placeholders if not already set by actual env vars
      const existingKeys = new Set(buildEnv.map(e => e.split("=")[0]));
      for (const p of placeholders) {
        const key = p.split("=")[0];
        if (!existingKeys.has(key)) buildEnv.push(p);
      }
      buildContainer.extraEnv = buildEnv;
      try {
        const buildOutput = await buildContainer.exec(projectConfig.buildCommand, (msg) => addLog(deploymentId, "system", msg));
        if (buildOutput.includes("ERR!") || buildOutput.includes("FATAL") || buildOutput.includes("error TS")) {
          addLog(deploymentId, "system", `Build output: ${buildOutput.slice(-500)}`);
        }
      } finally {
        await buildContainer.cleanup();
      }
      addLog(deploymentId, "system", "Build complete");
    }

    // Mark build as succeeded — auto-fix will restart instead of rewriting code
    buildSucceeded.add(deploymentId);

    // Deploy: start the production container with just the start command
    updateStatus(deploymentId, "deploying");
    addLog(deploymentId, "system", `Starting: ${projectConfig.startCommand}`);

    const envVars = getEnvVarsForDeploy(project.id);
    const { containerId, hostPort } = await deployFromVolume(
      project.source_path, deploymentId, projectConfig.appPort, projectConfig.startCommand, envVars, project.slug,
      projectConfig.needsMoreMemory ? { memoryMb: 1024 } : undefined
    );

    db.prepare("UPDATE deployments SET docker_image_id = ? WHERE id = ?").run("claude-server/base:latest", deploymentId);

    updateStatus(deploymentId, "running", {
      container_id: containerId,
      port: hostPort,
    });

    addLog(deploymentId, "system", `Deployed successfully! Running on port ${hostPort}`);
    addLog(deploymentId, "system", `Live at: ${project.slug}.${config.domain}`);

    // Save and log total API usage for this deploy
    const usage = getDeployUsage(deploymentId);
    if (usage.inputTokens > 0) {
      db.prepare("UPDATE deployments SET input_tokens = ?, output_tokens = ?, cost_cents = ? WHERE id = ?")
        .run(usage.inputTokens, usage.outputTokens, usage.costCents, deploymentId);
      addLog(deploymentId, "system", `Total API usage: ${usage.inputTokens.toLocaleString()} input + ${usage.outputTokens.toLocaleString()} output tokens ($${(usage.costCents / 100).toFixed(3)})`);
    }

    setCurrentDeployment(null);

    // Update Caddy routing
    reloadCaddyConfig().catch((err) => console.error("Caddy reload failed:", err));

    // Update project timestamp
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);

    // Monitor container health — auto-fix if it crashes
    monitorContainer(project, deploymentId, containerId).catch((err) => {
      console.error("Monitor error:", err);
      addLog(deploymentId, "system", `Monitor error: ${err instanceof Error ? err.message : String(err)}`);
    });
  } catch (err) {
    setCurrentDeployment(null);
    const message = err instanceof Error ? err.message : String(err);
    console.error("Pipeline failed:", err);
    addLog(deploymentId, "system", `Deployment failed: ${message}`);
    updateStatus(deploymentId, "failed", { error: message });

    // Clean up project files so next deploy starts fresh instead of modify path
    try {
      const fs = await import("fs");
      if (fs.existsSync(project.source_path)) {
        const entries = fs.readdirSync(project.source_path);
        for (const entry of entries) {
          if (entry === ".git") continue;
          fs.rmSync(`${project.source_path}/${entry}`, { recursive: true, force: true });
        }
      }
    } catch (err) {
      console.warn("Failed to clean project files after failed deploy:", err instanceof Error ? err.message : String(err));
    }
  }
}

// Track whether the initial build succeeded — if so, auto-fix should NOT rewrite files
const buildSucceeded = new Set<string>();

// Auto-fix: if build succeeded, just restart with more memory. If build failed, ask Claude to fix code.
async function autoFixAndRedeploy(
  project: Project,
  deploymentId: string,
  reason: string
): Promise<string | null> {
  const db = getDb();

  addLog(deploymentId, "system", `${reason} — Auto-fixing...`);

  // Stop old container
  const oldDep = db.prepare("SELECT container_id, port FROM deployments WHERE id = ?").get(deploymentId) as { container_id: string | null; port: number | null } | undefined;
  if (oldDep?.container_id) {
    try { await stopContainer(oldDep.container_id); } catch (err) {
      console.warn("Failed to stop old container during auto-fix:", err instanceof Error ? err.message : String(err));
    }
    if (oldDep.port) releasePort(oldDep.port);
  }

  const fixConfig = detectProjectConfig(project.source_path);

  // Check error logs for code/dependency errors that need Claude to fix (not just memory)
  const recentErrors = db.prepare(
    "SELECT message FROM logs WHERE deployment_id = ? AND stream IN ('stderr', 'system') ORDER BY id DESC LIMIT 20"
  ).all(deploymentId) as Array<{ message: string }>;
  const recentErrorText = recentErrors.map(l => l.message).join("\n");
  const isCodeError = /ModuleNotFoundError|ImportError|SyntaxError|NameError|TypeError|Cannot find module|require\(\) of ES Module/.test(recentErrorText);

  // If the build succeeded AND the error is NOT a code issue, just restart with more memory
  if (buildSucceeded.has(deploymentId) && !isCodeError) {
    addLog(deploymentId, "system", "Build was successful — restarting with more memory (not rewriting code)");

    try {
      updateStatus(deploymentId, "deploying");
      const envVars = getEnvVarsForDeploy(project.id);
      const { containerId: newId, hostPort } = await deployFromVolume(
        project.source_path, deploymentId, fixConfig.appPort, fixConfig.startCommand, envVars, project.slug,
        { memoryMb: 1536 } // Bump memory on retry
      );

      updateStatus(deploymentId, "running", { container_id: newId, port: hostPort, docker_image_id: "claude-server/base:latest" });
      addLog(deploymentId, "system", `Restarted with more memory on port ${hostPort}`);
      addLog(deploymentId, "system", `Live at: ${project.slug}.${config.domain}`);

      reloadCaddyConfig().catch((err) => console.warn("Caddy reload failed after restart:", err));
      return newId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(deploymentId, "system", `Restart failed: ${msg}`);
      updateStatus(deploymentId, "failed", { error: `${reason}, restart failed: ${msg}` });
      return null;
    }
  }

  // Build failed — ask Claude to fix
  const errorLogs = db
    .prepare("SELECT stream, message FROM logs WHERE deployment_id = ? AND stream IN ('stderr', 'stdout', 'system') ORDER BY id DESC LIMIT 50")
    .all(deploymentId) as Array<{ stream: string; message: string }>;

  const errorText = errorLogs.map((l) => `[${l.stream}] ${l.message}`).reverse().join("\n");

  if (!errorText.trim()) {
    addLog(deploymentId, "system", "No error logs found");
    updateStatus(deploymentId, "failed", { error: `${reason}, no error logs` });
    return null;
  }

  addLog(deploymentId, "system", "Claude is analyzing the error and generating a fix...");
  updateStatus(deploymentId, "generating");

  const log = (msg: string) => addLog(deploymentId, "system", msg);

  try {
    const fixResult = await modifyProject(
      project.source_path,
      [],
      `The application crashed. Fix it quickly.\n\nError:\n\`\`\`\n${errorText.slice(-1500)}\n\`\`\`\n\nBe fast: read ONLY the file that caused the error, fix it, and call done. Do NOT read every file.\n\nCRITICAL RULES:\n- NEVER change "next start" to "next dev" — always use production mode\n- NEVER rewrite package.json scripts unless they are actually broken\n- Only fix the specific error shown above\n\nCommon fixes:\n- "Missing parameter name" / PathError: NEVER use app.get('*', ...) — use app.use((req, res) => ...) for catch-all\n- Database connection error: wrap db init in try/catch, don't crash if DATABASE_URL is missing\n- Missing .next directory: the build step handles this, do NOT change the start script\n- Missing dependency: add to package.json with version "*"\n- Python ModuleNotFoundError: add the missing package to requirements.txt\n- Flask: use app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)))\n- psycopg2 OperationalError: wrap db connection in try/except`,
      log
    );

    addLog(deploymentId, "system", `Claude generated fix — ${fixResult.files.length} files`);

    if (fixConfig.buildCommand) {
      updateStatus(deploymentId, "building");
      addLog(deploymentId, "system", "Rebuilding...");
      const { DevContainer } = await import("../services/generator.js");
      const buildContainer = new DevContainer(project.source_path);
      if (fixConfig.needsMoreMemory) buildContainer.memoryOverride = 2048 * 1024 * 1024;
      try {
        await buildContainer.exec(fixConfig.buildCommand, (msg) => addLog(deploymentId, "system", msg));
      } finally {
        await buildContainer.cleanup();
      }
    }

    updateStatus(deploymentId, "deploying");
    addLog(deploymentId, "system", "Starting fixed app...");

    const envVars = getEnvVarsForDeploy(project.id);
    const { containerId: newId, hostPort } = await deployFromVolume(
      project.source_path, deploymentId, fixConfig.appPort, fixConfig.startCommand, envVars, project.slug,
      fixConfig.needsMoreMemory ? { memoryMb: 1024 } : undefined
    );

    updateStatus(deploymentId, "running", { container_id: newId, port: hostPort, docker_image_id: "claude-server/base:latest" });
    addLog(deploymentId, "system", `Auto-fixed and redeployed on port ${hostPort}`);
    addLog(deploymentId, "system", `Live at: ${project.slug}.${config.domain}`);

    reloadCaddyConfig().catch((err) => console.warn("Caddy reload failed after auto-fix:", err));
    return newId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog(deploymentId, "system", `Auto-fix failed: ${msg}`);
    updateStatus(deploymentId, "failed", { error: `${reason}, auto-fix failed: ${msg}` });
    return null;
  }
}

// Monitor container health continuously
async function monitorContainer(project: Project, deploymentId: string, containerId: string) {
  const db = getDb();
  const { getContainerStatus } = await import("../services/deployer.js");
  const DOCKER_HOST = config.dockerHostIp;
  const MAX_AUTO_FIXES = 3;
  let autoFixCount = 0;

  async function checkHealth(port: number): Promise<boolean> {
    // Try /health first, then fall back to / — any HTTP response means the server is alive
    for (const path of ["/health", "/"]) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`http://${DOCKER_HOST}:${port}${path}`, {
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);
        // Any response (even 404) means the server is running and accepting connections
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  let currentContainerId = containerId;
  let checkCount = 0;

  while (autoFixCount < MAX_AUTO_FIXES) {
    // First check is quick to catch immediate crashes, then longer for startup
    const delay = checkCount === 0 ? 3000 : checkCount < 3 ? 8000 : 15000;
    await new Promise((r) => setTimeout(r, delay));
    checkCount++;

    // Check if deployment is still supposed to be running
    const dep = db.prepare("SELECT status, container_id, port FROM deployments WHERE id = ?").get(deploymentId) as { status: string; container_id: string; port: number | null } | undefined;
    if (!dep) return;
    if (dep.status === "stopped") return;
    // If already marked failed, try to auto-fix it
    if (dep.status === "failed" && autoFixCount < MAX_AUTO_FIXES) {
      autoFixCount++;
      addLog(deploymentId, "system", `Auto-fix attempt ${autoFixCount}/${MAX_AUTO_FIXES} (crashed on startup)`);
      const newId = await autoFixAndRedeploy(project, deploymentId, "App crashed on startup");
      if (!newId) return;
      currentContainerId = newId;
      checkCount = 0;
      continue;
    } else if (dep.status === "failed") {
      return;
    }
    if (dep.status !== "running") continue; // Still building/deploying

    currentContainerId = dep.container_id || currentContainerId;
    const status = await getContainerStatus(currentContainerId);

    if (status === "running") {
      if (dep.port) {
        const healthy = await checkHealth(dep.port);
        if (healthy) {
          // HTTP is responding — but check stderr for repeated errors
          if (checkCount > 3) {
            const recentErrors = db.prepare(
              "SELECT COUNT(*) as cnt FROM logs WHERE deployment_id = ? AND stream = 'stderr' AND id > (SELECT COALESCE(MAX(id), 0) - 100 FROM logs WHERE deployment_id = ?)"
            ).get(deploymentId, deploymentId) as { cnt: number };

            if (recentErrors.cnt >= 10) {
              // Lots of stderr errors even though health check passes — trigger fix
              addLog(deploymentId, "system", `Detected ${recentErrors.cnt} errors in stderr while app appears healthy`);
              // Fall through to auto-fix below
            } else {
              autoFixCount = 0; // Reset on healthy
              continue;
            }
          } else {
            autoFixCount = 0;
            continue;
          }
        } else {
          // Recheck several times before declaring unresponsive
          let fails = 0;
          for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 8000));
            if (await checkHealth(dep.port)) break;
            fails++;
          }
          if (fails < 4) continue;
        }
      } else {
        continue;
      }
    }

    // Container crashed or app is unresponsive
    autoFixCount++;
    addLog(deploymentId, "system", `Auto-fix attempt ${autoFixCount}/${MAX_AUTO_FIXES}`);

    const newId = await autoFixAndRedeploy(
      project,
      deploymentId,
      status === "running" ? "App unresponsive" : "Container crashed"
    );

    if (!newId) return; // Fix failed, stop monitoring
    currentContainerId = newId;
    checkCount = 0; // Reset for grace period after fix
  }

  if (autoFixCount >= MAX_AUTO_FIXES) {
    addLog(deploymentId, "system", `Reached max auto-fix attempts (${MAX_AUTO_FIXES}). Manual intervention needed.`);
    updateStatus(deploymentId, "failed", { error: "Crashed repeatedly, auto-fix exhausted" });
  }
}

// Stop a deployment
router.post("/deployments/:id/stop", async (req: Request, res: Response) => {
  const db = getDb();
  const deployment = db.prepare("SELECT * FROM deployments WHERE id = ?").get(req.params.id) as Deployment | undefined;
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.container_id) {
    await stopContainer(deployment.container_id);
    if (deployment.port) releasePort(deployment.port);
  }

  db.prepare("UPDATE deployments SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?").run(deployment.id);
  reloadCaddyConfig().catch((err) => console.warn("Caddy reload failed:", err));
  res.json({ ok: true });
});

// Restart a stopped deployment
router.post("/deployments/:id/start", async (req: Request, res: Response) => {
  const db = getDb();
  const deployment = db.prepare("SELECT * FROM deployments WHERE id = ?").get(req.params.id) as Deployment | undefined;
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (!deployment.docker_image_id) {
    res.status(400).json({ error: "No image to start — redeploy instead" });
    return;
  }

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(deployment.project_id) as Project | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const restartConfig = detectProjectConfig(project.source_path);

    // Run build if needed (e.g. Next.js)
    if (restartConfig.buildCommand && restartConfig.needsMoreMemory) {
      const { DevContainer } = await import("../services/generator.js");
      const bc = new DevContainer(project.source_path);
      bc.memoryOverride = 2048 * 1024 * 1024;
      try { await bc.exec(restartConfig.buildCommand, () => {}); } finally { await bc.cleanup(); }
    }

    const envVars = getEnvVarsForDeploy(project.id);
    const { containerId, hostPort } = await deployFromVolume(
      project.source_path, deployment.id, restartConfig.appPort, restartConfig.startCommand, envVars, project.slug
    );

    db.prepare("UPDATE deployments SET status = 'running', container_id = ?, port = ?, stopped_at = NULL WHERE id = ?")
      .run(containerId, hostPort, deployment.id);

    addLog(deployment.id, "system", `Restarted on port ${hostPort}`);
    reloadCaddyConfig().catch((err) => console.warn("Caddy reload failed:", err));
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
