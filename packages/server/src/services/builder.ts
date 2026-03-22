import Dockerode from "dockerode";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getDb } from "../db/client.js";
import { claudeChat } from "./claude.js";
import { config } from "../config.js";
import { GenerationResult } from "../types.js";

const execFileAsync = promisify(execFile);

const docker = new Dockerode();

function addLog(deploymentId: string, stream: string, message: string) {
  const db = getDb();
  db.prepare(
    "INSERT INTO logs (deployment_id, stream, message) VALUES (?, ?, ?)"
  ).run(deploymentId, stream, message);
}

export async function buildImage(
  projectSlug: string,
  deploymentId: string,
  sourcePath: string,
  dockerfile: string,
  dockerignore: string
): Promise<string> {
  // Write Dockerfile and .dockerignore to source directory
  fs.writeFileSync(path.join(sourcePath, "Dockerfile"), dockerfile);
  fs.writeFileSync(path.join(sourcePath, ".dockerignore"), dockerignore);

  const tag = `claude-server/${projectSlug}:${deploymentId}`;

  addLog(deploymentId, "system", `Building image: ${tag}`);

  const stream = await docker.buildImage(
    {
      context: sourcePath,
      src: ["."],
    },
    { t: tag }
  );

  // Follow the build output
  return new Promise<string>((resolve, reject) => {
    let lastError = "";

    docker.modem.followProgress(
      stream,
      (err, output) => {
        if (err) {
          addLog(deploymentId, "system", `Build error: ${err.message}`);
          reject(err);
          return;
        }

        // Check for build errors in the output
        const errorLine = output?.find((o: { error?: string }) => o.error);
        if (errorLine) {
          addLog(deploymentId, "system", `Build failed: ${errorLine.error}`);
          reject(new Error(errorLine.error));
          return;
        }

        addLog(deploymentId, "system", "Image built successfully");
        resolve(tag);
      },
      (event: { stream?: string; error?: string }) => {
        if (event.stream) {
          const line = event.stream.trim();
          if (line) {
            addLog(deploymentId, "system", line);
          }
        }
        if (event.error) {
          lastError = event.error;
        }
      }
    );
  });
}

// Pre-build: fix package.json versions — only wildcard on retry
function preBuildFix(sourcePath: string, deploymentId: string, wildcardVersions: boolean): void {
  const pkgPath = path.join(sourcePath, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    let fixed = false;

    if (wildcardVersions) {
      // Retry mode: replace all versions with * to bypass version resolution errors
      for (const depType of ["dependencies", "devDependencies"]) {
        if (pkg[depType]) {
          for (const [name, version] of Object.entries(pkg[depType])) {
            if (typeof version === "string" && !version.startsWith("*")) {
              pkg[depType][name] = "*";
              fixed = true;
            }
          }
        }
      }
      if (fixed) {
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        addLog(deploymentId, "system", "Wildcarded all dependency versions for retry");
      }
    }
  } catch {
    // Skip if we can't parse package.json
  }
}

export async function buildWithRetry(
  projectSlug: string,
  deploymentId: string,
  sourcePath: string,
  analysis: Pick<GenerationResult, "dockerfile" | "dockerignore">
): Promise<string> {
  const db = getDb();
  let dockerfile = analysis.dockerfile;
  let dockerignore = analysis.dockerignore;
  let lastError = "";

  // Always ensure Dockerfile uses "npm install" not "npm ci"
  dockerfile = dockerfile.replace(/npm ci\b[^\n]*/g, "npm install --production");

  for (let attempt = 1; attempt <= config.maxBuildRetries; attempt++) {
    try {
      addLog(deploymentId, "system", `Build attempt ${attempt}/${config.maxBuildRetries}`);
      return await buildImage(projectSlug, deploymentId, sourcePath, dockerfile, dockerignore);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      addLog(deploymentId, "system", `Build attempt ${attempt} failed: ${lastError}`);

      if (attempt < config.maxBuildRetries) {
        // Check build logs for dependency errors (the thrown error is generic, details are in logs)
        const recentLogs = db.prepare(
          "SELECT message FROM logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 30"
        ).all(deploymentId) as Array<{ message: string }>;
        const logText = recentLogs.map(l => l.message).join("\n");

        const isDepError = logText.includes("ETARGET") || logText.includes("notarget") ||
          logText.includes("ERESOLVE") || logText.includes("npm error code E");

        if (isDepError) {
          // Wildcard all versions and bust Docker cache with a comment
          addLog(deploymentId, "system", "Dependency error — wildcarding versions for retry...");
          preBuildFix(sourcePath, deploymentId, true);
          dockerfile = dockerfile.replace(/npm ci\b[^\n]*/g, "npm install --production");
          dockerfile = dockerfile.replace(/npm install\s+--only=production/g, "npm install --production");
          // Add a unique comment to bust Docker layer cache
          dockerfile = dockerfile.replace(
            /(RUN npm install)/,
            `# retry-${attempt}\n$1`
          );
        } else {
          addLog(deploymentId, "system", "Asking Claude to fix the build error...");

          const fileTree = fs.readdirSync(sourcePath, { recursive: true }) as string[];

          const response = await claudeChat(
            "You are a Docker expert. Fix the Dockerfile based on the build error. IMPORTANT: Always use 'npm install' NOT 'npm ci' (there is no lockfile). Return ONLY the corrected Dockerfile content, nothing else.",
            [
              {
                role: "user",
                content: `The Docker build failed with this error:\n\`\`\`\n${lastError}\n\`\`\`\n\nBuild logs:\n\`\`\`\n${logText.slice(0, 2000)}\n\`\`\`\n\nThe Dockerfile was:\n\`\`\`dockerfile\n${dockerfile}\n\`\`\`\n\nThe project file tree is:\n\`\`\`\n${fileTree.slice(0, 100).join("\n")}\n\`\`\`\n\nPlease provide a fixed Dockerfile.`,
              },
            ]
          );

          const textBlock = response.content.find((b) => b.type === "text");
          if (textBlock && textBlock.type === "text") {
            const match = textBlock.text.match(/```(?:dockerfile)?\n([\s\S]*?)```/);
            dockerfile = match ? match[1].trim() : textBlock.text.trim();
            dockerfile = dockerfile.replace(/npm ci\b[^\n]*/g, "npm install --production");
            addLog(deploymentId, "system", "Claude generated a fixed Dockerfile");
          }
        }
      }
    }
  }

  throw new Error(`Build failed after ${config.maxBuildRetries} attempts: ${lastError}`);
}
