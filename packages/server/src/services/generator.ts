import fs from "fs";
import path from "path";
import { claudeChat } from "./claude.js";
import { GenerationResult, GeneratedFile } from "../types.js";
import Anthropic from "@anthropic-ai/sdk";

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

const SYSTEM_PROMPT = `You are an expert full-stack developer and DevOps engineer. The user will describe an application they want built. You must generate the COMPLETE project — every source file, config file, Dockerfile, and .dockerignore — ready to be built and deployed as a Docker container.

Guidelines:
- Generate ALL files needed for a working application. Do not skip any file.
- Use modern best practices for the chosen language/framework.
- Include a proper package.json / requirements.txt / go.mod as needed.
- The app MUST listen on a port (use the PORT env var, default to 3000).
- Generate an optimized Dockerfile:
  - Use multi-stage builds for compiled languages
  - Use slim/alpine base images
  - Copy dependency files first for layer caching
  - IMPORTANT: Use "npm install" NOT "npm ci" (there is no lockfile)
  - Set proper WORKDIR, EXPOSE, and CMD
  - Use non-root user for security
- Generate a .dockerignore that excludes .git, node_modules, etc.
- Make the application functional and complete — not a skeleton or placeholder.
- If the user asks for an API, include proper routes, error handling, and a health check endpoint.
- If the user asks for a web app, include both frontend and backend code.

You MUST call the submit_project tool with all generated files. Every single file must be included.`;

const MODIFY_SYSTEM_PROMPT = `You are an expert full-stack developer. The user has an existing project and wants to modify it. You will receive the current project files and the user's requested changes.

Generate the COMPLETE updated project — include ALL files, even ones that haven't changed. This ensures the project stays complete and buildable.

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
