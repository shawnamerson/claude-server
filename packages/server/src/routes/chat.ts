import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { getClient } from "../services/claude.js";
import { readProjectFiles } from "../services/generator.js";
import { getRecentLogs } from "../services/logger.js";
import { queryProjectDatabase } from "../services/database.js";
import { Project, Deployment, ChatMessage } from "../types.js";
import { canChat } from "./auth.js";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import "../types.js";

const router = Router();

// Get chat history for a project
router.get("/projects/:projectId/chat", (req: Request, res: Response) => {
  const db = getDb();
  const messages = db
    .prepare("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC")
    .all(req.params.projectId);
  res.json(messages);
});

// Tools for chat Claude
const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file in the project. Use this to inspect code, configs, or any file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path (e.g., src/lib/auth.ts, package.json)" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "List all files in the project directory. Use this to understand the project structure.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "search_files",
    description: "Search for a string or pattern across all project files. Returns matching lines with file paths.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Text to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_logs",
    description: "Get recent container logs (stdout/stderr) from the running deployment.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: { type: "number", description: "Number of recent log lines to fetch (default 50)" },
      },
    },
  },
  {
    name: "query_database",
    description: "Get the database schema, tables, and row counts for the project's PostgreSQL database.",
    input_schema: { type: "object" as const, properties: {} },
  },
];

function createChatToolHandlers(sourcePath: string, projectId: string) {
  const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv", ".next", "dist", "pip_packages"]);
  const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".lock"]);

  function listFiles(dir: string, prefix = ""): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...listFiles(path.join(dir, entry.name), relPath));
      } else {
        results.push(relPath);
      }
    }
    return results;
  }

  return new Map<string, (input: any) => Promise<string>>([
    ["read_file", async (input: { path: string }) => {
      const resolved = path.resolve(sourcePath, input.path);
      if (!resolved.startsWith(path.resolve(sourcePath))) return "Error: path traversal not allowed";
      if (!fs.existsSync(resolved)) return `Error: file not found: ${input.path}`;
      if (SKIP_EXT.has(path.extname(input.path))) return "(binary file)";
      const content = fs.readFileSync(resolved, "utf-8");
      return content.length > 10000 ? content.slice(0, 10000) + "\n...(truncated)" : content;
    }],
    ["list_files", async () => {
      const files = listFiles(sourcePath);
      return files.length > 0 ? files.join("\n") : "(empty project)";
    }],
    ["search_files", async (input: { query: string }) => {
      const files = listFiles(sourcePath);
      const results: string[] = [];
      for (const file of files) {
        if (SKIP_EXT.has(path.extname(file))) continue;
        try {
          const content = fs.readFileSync(path.join(sourcePath, file), "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(input.query.toLowerCase())) {
              results.push(`${file}:${i + 1}: ${lines[i].trim()}`);
              if (results.length >= 30) return results.join("\n") + "\n...(more results truncated)";
            }
          }
        } catch {}
      }
      return results.length > 0 ? results.join("\n") : `No matches found for "${input.query}"`;
    }],
    ["get_logs", async (input: { lines?: number }) => {
      const db = getDb();
      const dep = db.prepare("SELECT id FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId) as { id: string } | undefined;
      if (!dep) return "(No deployments)";
      const logs = getRecentLogs(dep.id, input.lines || 50);
      return logs.reverse().map(l => `[${l.stream}] ${l.message}`).join("\n") || "(No logs)";
    }],
    ["query_database", async () => {
      try {
        return await queryProjectDatabase(projectId);
      } catch {
        return "(No database or database not accessible)";
      }
    }],
  ]);
}

// Chat with Claude about a project (SSE streaming with tools)
router.post("/projects/:projectId/chat", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.projectId) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { message } = req.body;
  if (!message) { res.status(400).json({ error: "Message is required" }); return; }

  const user = req.user;
  if (user) {
    const chatCheck = canChat(user.id);
    if (!chatCheck.allowed) { res.status(402).json({ error: chatCheck.reason }); return; }
  }

  db.prepare("INSERT INTO chat_messages (project_id, role, content) VALUES (?, 'user', ?)").run(project.id, message);

  // Lightweight context — just overview, Claude uses tools to dig deeper
  const fileList = Object.keys(readProjectFiles(project.source_path));
  const latestDeployment = db.prepare("SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(project.id) as Deployment | undefined;

  const { getEnvVarsForDeploy } = await import("./envvars.js");
  const allEnvVars = getEnvVarsForDeploy(project.id, project.slug);
  const envContext = allEnvVars.map(e => {
    const [k, ...v] = e.split("=");
    return `${k}=${k.includes("SECRET") || k.includes("PASSWORD") || k.includes("TOKEN") ? "***" : v.join("=")}`;
  }).join("\n");

  const domain = process.env.DOMAIN || "vibestack.build";
  const systemPrompt = `You are a senior full-stack developer integrated into VibeStack, a cloud deployment platform. You have tools to explore the project — USE THEM.

Project: ${project.name} (${project.slug})
URL: https://${project.slug}.${domain}
Files: ${fileList.length} files — ${fileList.slice(0, 20).join(", ")}${fileList.length > 20 ? "..." : ""}
Status: ${latestDeployment?.status || "no deployments"}${latestDeployment?.error ? ` — Error: ${latestDeployment.error}` : ""}

Environment Variables:
${envContext}

YOU HAVE TOOLS — use them:
- read_file: Read any project file to see the code
- list_files: See the full project structure
- search_files: Find where something is used across the codebase
- get_logs: See the latest container stdout/stderr logs
- query_database: See database tables, schema, and row counts

RULES:
- When the user asks about code, READ THE FILE first — don't guess from the file list.
- When something is broken, check get_logs FIRST, then read the relevant file.
- Be direct and concise. Diagnose, don't list possibilities.
- When you suggest code changes, tell the user to click "Apply & Deploy".
- The platform handles everything: builds, deploys, databases, env vars, SSL, domains.
- NEVER say you can't do something. NEVER tell the user to SSH or configure things manually.
- NEVER ask the user to refresh or check things — you have the tools to check yourself.`;

  const history = db.prepare("SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC").all(project.id) as ChatMessage[];
  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const handlers = createChatToolHandlers(project.source_path, project.id);

  // Stream response via SSE with tool support
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

  try {
    const client = getClient();
    let fullResponse = "";
    const MAX_TURNS = 10;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages,
        tools: CHAT_TOOLS,
      });

      const response = await stream.finalMessage();

      // Process response blocks
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
          res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}\n\n`);
        } else if (block.type === "tool_use") {
          toolUses.push({ id: block.id, name: block.name, input: block.input });
          // Show the user what we're doing
          const inp = block.input as Record<string, any>;
          const action = block.name === "read_file" ? `Reading ${inp.path}...`
            : block.name === "list_files" ? "Listing files..."
            : block.name === "search_files" ? `Searching for "${inp.query}"...`
            : block.name === "get_logs" ? "Checking logs..."
            : block.name === "query_database" ? "Checking database..."
            : `Using ${block.name}...`;
          res.write(`data: ${JSON.stringify({ type: "status", content: action })}\n\n`);
        }
      }

      // No tool calls — Claude is done
      if (toolUses.length === 0) break;

      // Execute tools and continue
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const tu of toolUses) {
        const handler = handlers.get(tu.name);
        if (!handler) {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `Unknown tool: ${tu.name}`, is_error: true });
          continue;
        }
        try {
          const result = await handler(tu.input);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        } catch (err) {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ${err instanceof Error ? err.message : String(err)}`, is_error: true });
        }
      }

      messages.push({ role: "user", content: results });
    }

    // Save the full text response
    if (fullResponse) {
      db.prepare("INSERT INTO chat_messages (project_id, role, content) VALUES (?, 'assistant', ?)").run(project.id, fullResponse);
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: "error", content: errMsg })}\n\n`);
    res.end();
  }
});

export default router;
