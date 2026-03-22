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

  // Build context
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

  const filesContext = Object.entries(files)
    .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  // Get database info if available
  let dbContext = "";
  try {
    dbContext = await queryProjectDatabase(project.id);
  } catch {
    dbContext = "(No database)";
  }

  const systemPrompt = `You are a helpful AI assistant integrated into a cloud deployment platform. You have full context about the user's project, including their database schema and data.

Project: ${project.name}
Description: ${project.description}

## Current Project Files
${filesContext || "(No files generated yet)"}

## Latest Deployment
Status: ${latestDeployment?.status || "none"}
${latestDeployment?.error ? `Error: ${latestDeployment.error}` : ""}

## Recent Logs
\`\`\`
${logsContext || "(No logs)"}
\`\`\`

## Database
${dbContext}

Help the user understand their project, debug issues, suggest improvements, and answer questions. You can see the database tables, schema, and row counts above. If they want to make changes, explain what you'd change. For actual code changes, suggest they click "Apply & Deploy" with their modification request.`;

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
