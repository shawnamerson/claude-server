import fs from "fs";
import path from "path";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import Dockerode from "dockerode";
import { claudeAgentLoop, ToolHandler } from "./claude.js";
import { GenerationResult } from "../types.js";
import Anthropic from "@anthropic-ai/sdk";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const docker = new Dockerode();

// --- Agentic tools ---

const WRITE_FILES_TOOL: Anthropic.Tool = {
  name: "write_files",
  description: "Create or overwrite multiple files at once. Write ALL files in a single call for speed.",
  input_schema: {
    type: "object" as const,
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path (e.g., server.js, public/index.html)" },
            content: { type: "string", description: "Complete file content" },
          },
          required: ["path", "content"],
        },
      },
    },
    required: ["files"],
  },
};

const DONE_TOOL: Anthropic.Tool = {
  name: "done",
  description: "Call this when all files are written. The project should be complete and ready to deploy.",
  input_schema: {
    type: "object" as const,
    properties: {
      notes: { type: "string", description: "Brief description of what the app does (2-3 sentences)" },
    },
    required: ["notes"],
  },
};

// Fast tools for new projects — write + done only
const FAST_TOOLS: Anthropic.Tool[] = [WRITE_FILES_TOOL, DONE_TOOL];

// Full tools for modifications — includes read, delete, run
const FULL_TOOLS: Anthropic.Tool[] = [
  WRITE_FILES_TOOL,
  {
    name: "read_file",
    description: "Read the contents of an existing file in the project.",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string", description: "Relative file path to read" } },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "List all files currently in the project directory.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "delete_file",
    description: "Delete a file from the project.",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string", description: "Relative file path to delete" } },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description: "Run a shell command in the project directory inside a Node.js container. Use for testing: node -c server.js, npm install, etc. Times out after 12 seconds.",
    input_schema: {
      type: "object" as const,
      properties: { command: { type: "string", description: "Shell command to run" } },
      required: ["command"],
    },
  },
  DONE_TOOL,
];

const SYSTEM_PROMPT = `You are an expert full-stack developer. Build projects using the provided tools.

IMPORTANT: Be fast. Write ALL files in as few turns as possible using write_files. Batch everything together.

WORKFLOW:
1. First turn: write package.json, server.js, and ALL frontend files (HTML, CSS, JS) together in ONE write_files call
2. Second turn: write Dockerfile + .dockerignore, then call done immediately

Do NOT run commands for new projects — just write the files correctly and call done. The platform will test and deploy automatically.

CHOOSE THE RIGHT ARCHITECTURE based on what the user describes:
- For simple sites (landing pages, portfolios, blogs): Express serving static HTML/CSS/JS from public/ folder
- For web apps with a backend (CRUD apps, marketplaces, dashboards): Express API + vanilla HTML/CSS/JS in public/
- For complex interactive UIs (real-time apps, rich SPAs): Express API + React with Vite (src/App.jsx, build to dist/)
Use your judgment — pick the simplest architecture that fits the requirements.

RULES:
- NEVER put HTML inside JavaScript template literals — use separate .html files in public/ or React components.
- The app MUST listen on process.env.PORT (default 3000).
- Include a GET /health endpoint.
- If the app needs data persistence, ALWAYS use PostgreSQL via process.env.DATABASE_URL with the "pg" npm package. Create tables on startup with CREATE TABLE IF NOT EXISTS. NEVER use SQLite, JSON files, or in-memory storage.
- Make the app functional with real features, not a skeleton. Include sample data if appropriate.

PACKAGE.JSON:
- List all dependencies with version "*" (the platform resolves versions).
- Include a "start" script.

DOCKERFILE:
- Use claude-server/base:latest as the base image (node:20-alpine with pre-installed packages: express, cors, pg, bcryptjs, jsonwebtoken, uuid, dotenv, multer, cookie-parser, compression, morgan, helmet, express-rate-limit, ws, socket.io, axios, node-fetch, dayjs, marked, sanitize-html, sharp).
- WORKDIR is already /app with node_modules at /app/node_modules.
- Only run "npm install" if you need packages NOT in the base image. If all deps are pre-installed, skip it.
- COPY source files, set EXPOSE and CMD properly.

.DOCKERIGNORE:
- Exclude: node_modules, .git, *.md

Call "done" with a brief note about what the app does when finished.`;

const MODIFY_SYSTEM_PROMPT = `You are an expert full-stack developer. Modify an existing project using the provided tools.

WORKFLOW:
1. Use list_files to see what exists
2. Use read_file to inspect files you need to change
3. Use write_files to update or create files
4. Use run_command to test your changes (e.g., "node -c server.js" for syntax check)
5. Use delete_file to remove files no longer needed
6. Make sure the Dockerfile and .dockerignore are up to date
7. Call "done" when finished

If any test reveals an error, fix it before calling done.

RULES:
- Only modify files that need to change. Don't rewrite files that are fine.
- NEVER put HTML inside JavaScript template literals — use separate .html files.
- For data persistence, use PostgreSQL via process.env.DATABASE_URL.
- Keep the app listening on process.env.PORT (default 3000).
- Ensure the Dockerfile is correct for the updated project.

Call "done" with a brief note about what you changed.`;

// --- Tool handlers that operate on the project directory ---

function createToolHandlers(
  sourcePath: string,
  onLog: (message: string) => void,
  devContainer: DevContainer
): ToolHandler[] {
  // Ensure directory exists
  if (!fs.existsSync(sourcePath)) {
    fs.mkdirSync(sourcePath, { recursive: true });
  }

  return [
    {
      name: "write_files",
      execute: async (input: { files: Array<{ path: string; content: string }> }) => {
        if (!input.files || !Array.isArray(input.files)) {
          return "Error: files must be an array";
        }
        const results: string[] = [];
        for (const file of input.files) {
          const resolved = path.resolve(sourcePath, file.path);
          if (!resolved.startsWith(path.resolve(sourcePath))) {
            results.push(`Skipped ${file.path}: path traversal not allowed`);
            continue;
          }
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, file.content);
          onLog(`  + ${file.path} (${file.content.length} bytes)`);
          results.push(`OK: ${file.path}`);
        }
        return results.join("\n");
      },
    },
    {
      name: "read_file",
      execute: async (input: { path: string }) => {
        const resolved = path.resolve(sourcePath, input.path);
        if (!resolved.startsWith(path.resolve(sourcePath))) {
          return "Error: path traversal not allowed";
        }
        if (!fs.existsSync(resolved)) {
          return `Error: file not found: ${input.path}`;
        }
        return fs.readFileSync(resolved, "utf-8");
      },
    },
    {
      name: "list_files",
      execute: async () => {
        const files = listFiles(sourcePath);
        if (files.length === 0) return "(empty project)";
        return files.join("\n");
      },
    },
    {
      name: "delete_file",
      execute: async (input: { path: string }) => {
        const resolved = path.resolve(sourcePath, input.path);
        if (!resolved.startsWith(path.resolve(sourcePath))) {
          return "Error: path traversal not allowed";
        }
        if (fs.existsSync(resolved)) {
          fs.rmSync(resolved);
          onLog(`  - ${input.path} (deleted)`);
          return `Deleted: ${input.path}`;
        }
        return `File not found: ${input.path}`;
      },
    },
    {
      name: "run_command",
      execute: async (input: { command: string }) => {
        onLog(`$ ${input.command}`);
        try {
          return await devContainer.exec(input.command, onLog);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onLog(`  Command error: ${msg}`);
          return `Error: ${msg}`;
        }
      },
    },
    {
      name: "done",
      execute: async (input: { notes: string }) => {
        onLog(`Notes: ${input.notes}`);
        return "Project complete";
      },
    },
  ];
}

/**
 * Persistent dev container for a project. Created on first command,
 * reused for subsequent commands, cleaned up when done.
 */
// Clean up any orphaned dev containers from previous runs
export async function cleanupOrphanedDevContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true, filters: { name: ["claude-dev-"] } });
    for (const c of containers) {
      try {
        const container = docker.getContainer(c.Id);
        await container.stop({ t: 1 }).catch(() => {});
        await container.remove({ force: true });
        console.log(`Cleaned up orphaned dev container: ${c.Names[0]}`);
      } catch {}
    }
  } catch {}
}

class DevContainer {
  private container: Dockerode.Container | null = null;
  private workDir: string;
  private sourcePath: string;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
    const relativeToData = sourcePath.replace(/^\/app\/data\//, "");
    this.workDir = `/data/${relativeToData}`;
  }

  async ensureRunning(): Promise<void> {
    if (this.container) {
      // Check if still running
      try {
        const info = await this.container.inspect();
        if (info.State.Running) return;
      } catch {
        this.container = null;
      }
    }

    const containerName = `claude-dev-${Date.now()}`;
    this.container = await docker.createContainer({
      Image: "claude-server/base:latest",
      name: containerName,
      Cmd: ["sleep", "600"], // Keep alive for 10 minutes
      WorkingDir: this.workDir,
      HostConfig: {
        Binds: [`claude-server_app-data:/data:rw`],
        Memory: 256 * 1024 * 1024,
        CpuQuota: 50000,
        CpuPeriod: 100000,
      },
      NetworkingConfig: {
        EndpointsConfig: { "claude-server-network": {} },
      },
    });
    await this.container.start();
  }

  async exec(command: string, onLog: (msg: string) => void): Promise<string> {
    await this.ensureRunning();

    // Wrap command with timeout to ensure it exits
    const wrappedCmd = `timeout 12 sh -c ${JSON.stringify(command)} 2>&1; echo "::EXIT_CODE::$?"`;

    const exec = await this.container!.exec({
      Cmd: ["sh", "-c", wrappedCmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: this.workDir,
    });

    const stream = await exec.start({});

    let output = "";
    try {
      output = await Promise.race([
        streamToString(stream),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("(command timed out)"), 15000)
        ),
      ]);
    } catch {
      output = "(command failed)";
    }

    // Extract exit code from output
    const exitMatch = output.match(/::EXIT_CODE::(\d+)\s*$/);
    if (exitMatch) {
      const code = parseInt(exitMatch[1]);
      output = output.replace(/::EXIT_CODE::\d+\s*$/, "").trim();
      if (code !== 0) {
        onLog(`  Exit code: ${code}`);
      }
    }

    const truncated = output.length > 3000 ? output.slice(-3000) + "\n...(truncated)" : output;
    return truncated || "(no output)";
  }

  async cleanup(): Promise<void> {
    if (this.container) {
      try { await this.container.stop({ t: 1 }); } catch {}
      try { await this.container.remove({ force: true }); } catch {}
      this.container = null;
    }
  }
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => {
      // Skip 8-byte Docker multiplex header per frame
      if (chunk.length > 8) {
        chunks.push(chunk.subarray(8));
      }
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8").trim()));
    stream.on("error", reject);
  });
}

function listFiles(dir: string, prefix = ""): string[] {
  const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv"]);
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

// --- Public API ---

export async function generateProject(
  sourcePath: string,
  description: string,
  onLog: (message: string) => void,
): Promise<GenerationResult> {
  // Clean directory for fresh generation
  if (fs.existsSync(sourcePath)) {
    const entries = fs.readdirSync(sourcePath);
    for (const entry of entries) {
      if (entry === ".git") continue;
      fs.rmSync(path.join(sourcePath, entry), { recursive: true, force: true });
    }
  }

  // No dev container for new projects — fast path: write files + done
  const dummyDevContainer = new DevContainer(sourcePath);
  const handlers = createToolHandlers(sourcePath, onLog, dummyDevContainer);

  onLog("Claude is building your app...");

  const notes = await claudeAgentLoop(
    SYSTEM_PROMPT,
    `Build me this application:\n\n${description}`,
    FAST_TOOLS,
    handlers,
    {
      maxTurns: 10,
      onText: (text) => {
        const trimmed = text.trim();
        if (trimmed) onLog(`Claude: ${trimmed.slice(0, 500)}`);
      },
      onToolUse: (name, input) => {
        if (name === "write_files") {
          const count = input.files?.length || 0;
          onLog(`Writing ${count} file${count !== 1 ? "s" : ""}...`);
        }
      },
    }
  );

  return collectResult(sourcePath, notes);
}

export async function modifyProject(
  sourcePath: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  modification: string,
  onLog: (message: string) => void,
): Promise<GenerationResult> {
  const devContainer = new DevContainer(sourcePath);
  const handlers = createToolHandlers(sourcePath, onLog, devContainer);

  // Build context about existing files
  const existingFiles = listFiles(sourcePath);
  const fileList = existingFiles.length > 0
    ? `\n\nExisting project files:\n${existingFiles.join("\n")}`
    : "\n\n(Empty project)";

  const historyContext = chatHistory.length > 0
    ? `\n\nPrevious conversation:\n${chatHistory.map(m => `${m.role}: ${m.content}`).join("\n")}`
    : "";

  onLog("Claude is modifying your app...");

  try {
    const notes = await claudeAgentLoop(
      MODIFY_SYSTEM_PROMPT,
      `${modification}${fileList}${historyContext}`,
      FULL_TOOLS,
      handlers,
      {
        maxTurns: 30,
        onText: (text) => {
          const trimmed = text.trim();
          if (trimmed) onLog(`Claude: ${trimmed.slice(0, 500)}`);
        },
        onToolUse: (name, input) => {
          if (name === "write_files") {
            const count = input.files?.length || 0;
            onLog(`Writing ${count} file${count !== 1 ? "s" : ""}...`);
          } else if (name === "run_command") {
            onLog(`Running: ${input.command}`);
          } else if (name === "read_file") {
            onLog(`Reading ${input.path}...`);
          } else if (name === "delete_file") {
            onLog(`Deleting ${input.path}...`);
          }
        },
      }
    );

    return collectResult(sourcePath, notes);
  } finally {
    await devContainer.cleanup();
  }
}

/**
 * Collect files from disk into a GenerationResult.
 * The agent has already written everything — we just read it back.
 */
function collectResult(sourcePath: string, notes: string): GenerationResult {
  const files: Array<{ path: string; content: string }> = [];
  let dockerfile = "";
  let dockerignore = "";

  const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".lock"]);

  function walk(dir: string, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.name === "Dockerfile") {
        dockerfile = fs.readFileSync(fullPath, "utf-8");
      } else if (entry.name === ".dockerignore") {
        dockerignore = fs.readFileSync(fullPath, "utf-8");
      } else {
        if (SKIP_EXT.has(path.extname(entry.name))) continue;
        try {
          files.push({ path: relPath, content: fs.readFileSync(fullPath, "utf-8") });
        } catch {
          // skip unreadable
        }
      }
    }
  }

  if (fs.existsSync(sourcePath)) {
    walk(sourcePath);
  }

  // Fallback if Claude forgot Dockerfile
  if (!dockerfile) {
    dockerfile = `FROM claude-server/base:latest\nWORKDIR /app\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]\n`;
  }
  if (!dockerignore) {
    dockerignore = "node_modules\n.git\n*.md\n";
  }

  return { files, dockerfile, dockerignore, notes };
}

// Keep readProjectFiles and writeProjectFiles for backward compat

export function readProjectFiles(sourcePath: string): Record<string, string> {
  const files: Record<string, string> = {};

  const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv", "Dockerfile", ".dockerignore"]);
  const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".lock"]);

  function walk(dir: string, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath);
      } else {
        if (SKIP_EXT.has(path.extname(entry.name))) continue;
        try {
          files[relPath] = fs.readFileSync(path.join(dir, entry.name), "utf-8");
        } catch {
          // skip unreadable
        }
      }
    }
  }

  if (fs.existsSync(sourcePath)) {
    walk(sourcePath);
  }
  return files;
}

export function writeProjectFiles(sourcePath: string, result: GenerationResult): void {
  // Clean the directory first (except .git if it exists)
  if (fs.existsSync(sourcePath)) {
    const entries = fs.readdirSync(sourcePath);
    for (const entry of entries) {
      if (entry === ".git") continue;
      const fullPath = path.join(sourcePath, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(sourcePath, { recursive: true });
  }

  // Write all generated files
  for (const file of result.files) {
    const filePath = path.join(sourcePath, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content);
  }

  // Write Dockerfile and .dockerignore
  fs.writeFileSync(path.join(sourcePath, "Dockerfile"), result.dockerfile);
  fs.writeFileSync(path.join(sourcePath, ".dockerignore"), result.dockerignore);
}
