import fs from "fs";
import path from "path";
import { claudeChat } from "./claude.js";
import { GenerationResult, GeneratedFile } from "../types.js";
import Anthropic from "@anthropic-ai/sdk";

const PLAN_TOOL: Anthropic.Tool = {
  name: "submit_plan",
  description: "Submit a phased build plan for the project",
  input_schema: {
    type: "object" as const,
    properties: {
      phases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Phase name (e.g., 'Landing Page', 'Search & Filters')" },
            description: { type: "string", description: "What to build in this phase — be specific" },
          },
          required: ["name", "description"],
        },
        description: "Ordered list of build phases, each building on the previous",
      },
    },
    required: ["phases"],
  },
};

export interface BuildPhase {
  name: string;
  description: string;
}

export async function planProject(description: string): Promise<BuildPhase[]> {
  const response = await claudeChat(
    `You are an expert software architect. Break down the user's project into 3-5 build phases.

Rules:
- Phase 1 should always be a working landing page / homepage with navigation and basic styling
- Each subsequent phase adds one major feature area
- Each phase must result in a fully working, deployable application
- Later phases build on top of earlier ones
- Keep it practical — 3-5 phases max
- Be specific about what each phase includes

Call the submit_plan tool with your phases.`,
    [{ role: "user", content: `Plan the build phases for: ${description}` }],
    [PLAN_TOOL]
  );

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_plan") {
      const input = block.input as { phases: BuildPhase[] };
      return input.phases;
    }
  }

  // Fallback — single phase
  return [{ name: "Full Build", description: description }];
}

const GENERATE_TOOL: Anthropic.Tool = {
  name: "submit_project",
  description: "Submit the generated project files including all source code, Dockerfile, and .dockerignore",
  input_schema: {
    type: "object" as const,
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative file path (e.g., src/index.ts, package.json)" },
            content: { type: "string", description: "Complete file content" },
          },
          required: ["path", "content"],
        },
        description: "All project files to generate",
      },
      dockerfile: { type: "string", description: "Complete Dockerfile content" },
      dockerignore: { type: "string", description: "Complete .dockerignore content" },
      notes: { type: "string", description: "Notes about the generated project, how to use it, what it does" },
    },
    required: ["files", "dockerfile", "dockerignore", "notes"],
  },
};

const SYSTEM_PROMPT = `You are an expert full-stack developer and DevOps engineer. The user will describe an application they want built. You must generate a WORKING MVP project — all source files, config files, Dockerfile, and .dockerignore — ready to be built and deployed as a Docker container.

CRITICAL RULES:
- Build a focused MVP — the core features that make the app work. Keep it simple and functional.
- For web apps: use a SINGLE Node.js server that serves both the API and frontend HTML.
- The app MUST listen on a port (use the PORT env var, default to 3000).
- Include a proper package.json with all dependencies listed.
- If the user mentions a database and DATABASE_URL is available, use PostgreSQL. Otherwise use SQLite or in-memory storage.

JAVASCRIPT/HTML RULES — VERY IMPORTANT:
- NEVER put HTML directly inside JavaScript template literals (backticks). This causes syntax errors.
- Instead, serve HTML from SEPARATE .html files in a "public" folder using express.static.
- Put CSS in separate .css files in the public folder.
- Put client-side JavaScript in separate .js files in the public folder.
- The server.js should ONLY contain the Express server, API routes, and data logic.
- Use res.sendFile() to serve the main HTML page, NOT res.send() with template literals containing HTML.
- Example structure:
  - server.js (Express API only)
  - public/index.html (HTML)
  - public/style.css (CSS)
  - public/app.js (client-side JS)
- In server.js: app.use(express.static('public')) and app.get('/', (req, res) => res.sendFile('index.html', { root: 'public' }))

Dockerfile rules:
- Use node:20-alpine as the base image
- Use "npm install" NOT "npm ci" (there is no lockfile)
- COPY the public folder: COPY public/ public/
- Set WORKDIR, EXPOSE, and CMD properly
- Keep it simple — no multi-stage builds unless truly needed

Other rules:
- Generate a .dockerignore that excludes .git, node_modules, etc.
- Make the application functional — not a skeleton or placeholder. Include sample data if appropriate.
- Include a health check endpoint at GET /health.

IMPORTANT for the "notes" field:
- Do NOT include instructions on how to run, build, or deploy the app. The platform handles that automatically.
- Only describe what the app does and what features are included.
- Keep notes brief — 2-3 sentences max.

You MUST call the submit_project tool with all generated files.`;

const MODIFY_SYSTEM_PROMPT = `You are an expert full-stack developer. The user has an existing project and wants to modify it. You will receive the current project files and the user's requested changes.

Generate the COMPLETE updated project — include ALL files, even ones that haven't changed. This ensures the project stays complete and buildable.

IMPORTANT: NEVER put HTML inside JavaScript template literals (backticks) — this causes syntax errors. Keep HTML in separate .html files in the public folder, CSS in .css files, and client-side JS in .js files. The server.js should only contain Express API routes and serve static files with express.static('public').

You MUST call the submit_project tool with the complete set of files, the updated Dockerfile, and .dockerignore.`;

export async function generateProject(description: string): Promise<GenerationResult> {
  const response = await claudeChat(
    SYSTEM_PROMPT,
    [{ role: "user", content: `Build me this application:\n\n${description}` }],
    [GENERATE_TOOL]
  );

  return extractResult(response);
}

export async function modifyProject(
  currentFiles: Record<string, string>,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  modification: string
): Promise<GenerationResult> {
  const filesContext = Object.entries(currentFiles)
    .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = [
    ...chatHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    {
      role: "user" as const,
      content: `Here are the current project files:\n\n${filesContext}\n\nPlease make these changes:\n\n${modification}`,
    },
  ];

  const response = await claudeChat(MODIFY_SYSTEM_PROMPT, messages, [GENERATE_TOOL]);
  return extractResult(response);
}

function extractResult(response: Anthropic.Message): GenerationResult {
  console.log("Claude response blocks:", response.content.map(b => b.type));

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_project") {
      const input = block.input as {
        files: GeneratedFile[];
        dockerfile: string;
        dockerignore: string;
        notes: string;
      };

      // Validate the result
      if (!input.files || !Array.isArray(input.files)) {
        console.error("Invalid tool result - missing files:", JSON.stringify(input).slice(0, 500));
        throw new Error("Claude returned an invalid response (no files). Please try again.");
      }

      console.log(`Claude generated ${input.files.length} files`);
      return input;
    }
  }

  // Log what we got for debugging
  const textBlocks = response.content.filter(b => b.type === "text");
  if (textBlocks.length > 0) {
    console.error("Claude responded with text instead of tool call:",
      (textBlocks[0] as { text: string }).text.slice(0, 500));
  }

  throw new Error("Claude did not generate the project. Please try again.");
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
