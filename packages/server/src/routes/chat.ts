import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { getClient, trackUsage } from "../services/claude.js";
import { readProjectFiles } from "../services/generator.js";
import { getRecentLogs } from "../services/logger.js";
import { queryProjectDatabase } from "../services/database.js";
import { Project, Deployment, ChatMessage } from "../types.js";
import { canChat, incrementUsage } from "./auth.js";
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
    name: "write_file",
    description: "Create or overwrite a file in the project. Use this to make code changes directly.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path (e.g., src/app.js, style.css)" },
        content: { type: "string", description: "Complete file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the project.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path to delete" },
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
  const changedFiles: string[] = [];

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

  const handlers = new Map<string, (input: any) => Promise<string>>([
    ["read_file", async (input: { path: string }) => {
      const resolved = path.resolve(sourcePath, input.path);
      if (!resolved.startsWith(path.resolve(sourcePath))) return "Error: path traversal not allowed";
      if (!fs.existsSync(resolved)) return `Error: file not found: ${input.path}`;
      if (SKIP_EXT.has(path.extname(input.path))) return "(binary file)";
      const content = fs.readFileSync(resolved, "utf-8");
      return content.length > 10000 ? content.slice(0, 10000) + "\n...(truncated)" : content;
    }],
    ["write_file", async (input: { path: string; content: string }) => {
      const resolved = path.resolve(sourcePath, input.path);
      if (!resolved.startsWith(path.resolve(sourcePath))) return "Error: path traversal not allowed";
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content);
      changedFiles.push(input.path);
      return `OK: wrote ${input.path} (${input.content.length} bytes)`;
    }],
    ["delete_file", async (input: { path: string }) => {
      const resolved = path.resolve(sourcePath, input.path);
      if (!resolved.startsWith(path.resolve(sourcePath))) return "Error: path traversal not allowed";
      if (!fs.existsSync(resolved)) return `File not found: ${input.path}`;
      fs.rmSync(resolved);
      changedFiles.push(input.path);
      return `Deleted: ${input.path}`;
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

  return { handlers, changedFiles };
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
  if (user) incrementUsage(user.id, "chats");

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
  const systemPrompt = `You are a senior full-stack developer integrated into VibeStack, a cloud deployment platform. You have tools to explore AND modify the project — USE THEM.

Project: ${project.name} (${project.slug})
URL: https://${project.slug}.${domain}
Files: ${fileList.length} files — ${fileList.slice(0, 20).join(", ")}${fileList.length > 20 ? "..." : ""}
Status: ${latestDeployment?.status || "no deployments"}${latestDeployment?.error ? ` — Error: ${latestDeployment.error}` : ""}

Environment Variables:
${envContext}

YOUR TOOLS:
- read_file: Read any project file to see the code
- write_file: Create or overwrite a file in the project
- delete_file: Delete a file from the project
- list_files: See the full project structure
- search_files: Find where something is used across the codebase
- get_logs: See the latest container stdout/stderr logs
- query_database: See database tables, schema, and row counts

YOUR ROLE:
You are a hands-on coding agent. You can read files, understand the codebase, and directly edit files to make changes. When the user asks for a change, DO IT — read the relevant files, then write the updated versions.

WORKFLOW for changes:
1. Read the file(s) you need to understand
2. Write the updated file(s) using write_file
3. Tell the user what you changed in 1-3 short sentences

IMPORTANT — uploaded files:
- Users upload images and assets into the project. These are real files on disk (e.g., in public/).
- Image files (.png, .jpg, .svg, etc.) cannot be read as text, but you can see them in list_files and reference them by path in code.
- When the user mentions uploaded images, list_files to find them, then wire them into the code.

RULES:
- When the user asks for changes, make them directly — don't just describe what you would do.
- ALWAYS use the write_file tool to make changes. NEVER output code blocks in your text response. If you catch yourself about to write code in your response, STOP and use write_file instead.
- Read files BEFORE editing them — don't guess at current contents.
- No emoji. Keep responses under 4 sentences.
- When something is broken, check get_logs FIRST.
- The platform handles builds, deploys, databases, env vars, SSL, domains.
- NEVER tell the user to SSH, configure things manually, or refresh.
- NEVER say "Let me copy" or "I'll modify" — just do it with the tools.
- For static sites, changes are live immediately after write_file. For container apps, the user may need to redeploy.`;

  // Limit history to last 10 messages — fewer to avoid old read-only patterns polluting context
  const history = db.prepare("SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 10").all(project.id) as ChatMessage[];
  history.reverse();
  // Strip old advisory patterns from history so they don't influence behavior
  const messages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.role === "assistant"
      ? m.content.replace(/Click .?Apply .?& .?Deploy.?[^.]*\./gi, "").replace(/I'?d (update|replace|change|fix|add|remove|modify)/gi, "I $1d").slice(0, 1500)
      : m.content,
  }));

  const { handlers, changedFiles } = createChatToolHandlers(project.source_path, project.id);

  // Stream response via SSE with tool support
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

  try {
    const client = getClient();
    let lastTurnText = "";
    const MAX_TURNS = 10;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let response: Anthropic.Message;
      for (let retry = 0; retry < 3; retry++) {
        try {
          const stream = client.messages.stream({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 16384,
            system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
            messages,
            tools: CHAT_TOOLS,
          });
          response = await stream.finalMessage();
          break;
        } catch (err: any) {
          if (err?.status === 429 && retry < 2) {
            await new Promise(r => setTimeout(r, (retry + 1) * 2000));
            continue;
          }
          throw err;
        }
      }
      trackUsage(null, response!, "claude-haiku-4-5-20251001");

      // Process response blocks
      const toolUses: Array<{ id: string; name: string; input: any }> = [];
      let turnText = "";

      for (const block of response!.content) {
        if (block.type === "text") {
          turnText += block.text;
        } else if (block.type === "tool_use") {
          toolUses.push({ id: block.id, name: block.name, input: block.input });
          // Show the user what we're doing
          const inp = block.input as Record<string, any>;
          const action = block.name === "read_file" ? `Reading ${inp.path}...`
            : block.name === "write_file" ? `Writing ${inp.path}...`
            : block.name === "delete_file" ? `Deleting ${inp.path}...`
            : block.name === "list_files" ? "Listing files..."
            : block.name === "search_files" ? `Searching for "${inp.query}"...`
            : block.name === "get_logs" ? "Checking logs..."
            : block.name === "query_database" ? "Checking database..."
            : `Using ${block.name}...`;
          res.write(`data: ${JSON.stringify({ type: "status", content: action })}\n\n`);
        }
      }

      // Only stream text from the final turn (no intermediate thinking)
      if (toolUses.length === 0) {
        // Check if model narrated instead of using tools — nudge it to act
        const narrating = /let me|I'll |I would |I'?d (update|replace|change|fix|add|modify)|```/i.test(turnText);
        if (narrating && turn === 0) {
          // Push it to actually use tools instead of narrating
          messages.push({ role: "assistant", content: response!.content });
          messages.push({ role: "user", content: "Don't describe the changes — use write_file to make them now." });
          continue;
        }
        // Final turn — stream this text to user
        if (turnText) {
          res.write(`data: ${JSON.stringify({ type: "text", content: turnText })}\n\n`);
          lastTurnText = turnText;
        }
        break;
      }

      // Intermediate turn — save text but don't stream it (it's just thinking)
      lastTurnText = turnText;

      // Execute tools and continue
      messages.push({ role: "assistant", content: response!.content });
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

    // Save only the final response text
    if (lastTurnText) {
      db.prepare("INSERT INTO chat_messages (project_id, role, content) VALUES (?, 'assistant', ?)").run(project.id, lastTurnText);
    }

    // Notify client about changed files so it can refresh the preview
    if (changedFiles.length > 0) {
      res.write(`data: ${JSON.stringify({ type: "files_changed", files: changedFiles })}\n\n`);
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
