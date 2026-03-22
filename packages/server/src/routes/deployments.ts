import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { Project, Deployment } from "../types.js";
import { generateProject, modifyProject, writeProjectFiles, readProjectFiles } from "../services/generator.js";
import { buildWithRetry } from "../services/builder.js";
import { deployContainer, stopContainer, releasePort } from "../services/deployer.js";
import { getEnvVarsForDeploy } from "./envvars.js";

const router = Router();

function addLog(deploymentId: string, stream: string, message: string) {
  const db = getDb();
  db.prepare("INSERT INTO logs (deployment_id, stream, message) VALUES (?, ?, ?)").run(deploymentId, stream, message);
}

function updateStatus(deploymentId: string, status: string, extra: Record<string, unknown> = {}) {
  const db = getDb();
  const sets = ["status = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
  const values = [status, ...Object.values(extra), deploymentId];
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

async function runPipeline(project: Project, deploymentId: string, prompt?: string) {
  const db = getDb();

  try {
    // Step 1: Generate or modify code with Claude
    updateStatus(deploymentId, "generating");
    addLog(deploymentId, "system", "Claude is analyzing your request...");

    const existingFiles = readProjectFiles(project.source_path);
    const hasExistingFiles = Object.keys(existingFiles).length > 0;

    // Heartbeat so user knows it's still working
    const heartbeatMessages = [
      "Choosing tech stack and framework...",
      "Writing application code...",
      "Setting up project structure...",
      "Generating configuration files...",
      "Creating Dockerfile...",
      "Finalizing project...",
      "Almost done...",
    ];
    let heartbeatIdx = 0;
    const heartbeat = setInterval(() => {
      if (heartbeatIdx < heartbeatMessages.length) {
        addLog(deploymentId, "system", heartbeatMessages[heartbeatIdx]);
        heartbeatIdx++;
      } else {
        addLog(deploymentId, "system", "Still generating...");
      }
    }, 5000);

    let result;
    try {
      if (hasExistingFiles && prompt) {
        addLog(deploymentId, "system", "Reading existing project files...");
        addLog(deploymentId, "system", `Found ${Object.keys(existingFiles).length} existing files`);
        addLog(deploymentId, "system", "Sending code to Claude for modifications...");
        const chatHistory = db
          .prepare("SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC")
          .all(project.id) as Array<{ role: "user" | "assistant"; content: string }>;
        result = await modifyProject(existingFiles, chatHistory, prompt);
      } else {
        const description = prompt || project.description;
        if (!description) {
          throw new Error("No description provided. Tell Claude what to build.");
        }
        addLog(deploymentId, "system", `Project: ${description.slice(0, 200)}`);
        addLog(deploymentId, "system", "Claude is designing the architecture...");
        result = await generateProject(description);
      }
    } finally {
      clearInterval(heartbeat);
    }

    addLog(deploymentId, "system", `Claude generated ${result.files.length} files:`);
    for (const file of result.files) {
      addLog(deploymentId, "system", `  + ${file.path}`);
    }
    if (result.notes) {
      addLog(deploymentId, "system", `Notes: ${result.notes.slice(0, 300)}`);
    }

    // Save chat messages
    if (prompt) {
      db.prepare(
        "INSERT INTO chat_messages (project_id, deployment_id, role, content) VALUES (?, ?, 'user', ?)"
      ).run(project.id, deploymentId, prompt);
    }
    db.prepare(
      "INSERT INTO chat_messages (project_id, deployment_id, role, content) VALUES (?, ?, 'assistant', ?)"
    ).run(project.id, deploymentId, result.notes);

    // Step 2: Write files to disk
    addLog(deploymentId, "system", "Writing files to disk...");
    writeProjectFiles(project.source_path, result);
    addLog(deploymentId, "system", "All files written successfully");

    // Save dockerfile
    db.prepare("UPDATE deployments SET dockerfile = ? WHERE id = ?").run(result.dockerfile, deploymentId);

    // Step 3: Build Docker image
    updateStatus(deploymentId, "building");
    addLog(deploymentId, "system", "--- Starting Docker build ---");
    addLog(deploymentId, "system", "Pulling base image and installing dependencies...");
    addLog(deploymentId, "system", "This may take a minute on first build...");

    const imageTag = await buildWithRetry(
      project.slug,
      deploymentId,
      project.source_path,
      { dockerfile: result.dockerfile, dockerignore: result.dockerignore } as any
    );

    db.prepare("UPDATE deployments SET docker_image_id = ? WHERE id = ?").run(imageTag, deploymentId);

    // Step 4: Stop previous deployment if running
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

    // Step 5: Deploy container
    updateStatus(deploymentId, "deploying");
    addLog(deploymentId, "system", "Starting container...");

    // Detect port from Dockerfile EXPOSE
    const portMatch = result.dockerfile.match(/EXPOSE\s+(\d+)/);
    const appPort = portMatch ? parseInt(portMatch[1]) : 3000;

    const envVars = getEnvVarsForDeploy(project.id);
    const { containerId, hostPort } = await deployContainer(imageTag, deploymentId, appPort, envVars, project.slug);

    updateStatus(deploymentId, "running", {
      container_id: containerId,
      port: hostPort,
    });

    addLog(deploymentId, "system", `Deployed successfully! Running on port ${hostPort}`);
    addLog(deploymentId, "system", `Access your app at http://localhost:${hostPort}`);

    // Update project timestamp
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addLog(deploymentId, "system", `Deployment failed: ${message}`);
    updateStatus(deploymentId, "failed", { error: message });
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
  res.json({ ok: true });
});

export default router;
