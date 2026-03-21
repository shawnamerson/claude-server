import Dockerode from "dockerode";
import fs from "fs";
import path from "path";
import { getDb } from "../db/client.js";
import { claudeChat } from "./claude.js";
import { config } from "../config.js";
import { GenerationResult } from "../types.js";

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

export async function buildWithRetry(
  projectSlug: string,
  deploymentId: string,
  sourcePath: string,
  analysis: Pick<GenerationResult, "dockerfile" | "dockerignore">
): Promise<string> {
  let dockerfile = analysis.dockerfile;
  let dockerignore = analysis.dockerignore;
  let lastError = "";

  for (let attempt = 1; attempt <= config.maxBuildRetries; attempt++) {
    try {
      addLog(deploymentId, "system", `Build attempt ${attempt}/${config.maxBuildRetries}`);
      return await buildImage(projectSlug, deploymentId, sourcePath, dockerfile, dockerignore);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      addLog(deploymentId, "system", `Build attempt ${attempt} failed: ${lastError}`);

      if (attempt < config.maxBuildRetries) {
        // Ask Claude to fix the Dockerfile
        addLog(deploymentId, "system", "Asking Claude to fix the Dockerfile...");

        const fileTree = fs.readdirSync(sourcePath, { recursive: true }) as string[];

        const response = await claudeChat(
          "You are a Docker expert. Fix the Dockerfile based on the build error. Return ONLY the corrected Dockerfile content, nothing else.",
          [
            {
              role: "user",
              content: `The Docker build failed with this error:\n\`\`\`\n${lastError}\n\`\`\`\n\nThe Dockerfile was:\n\`\`\`dockerfile\n${dockerfile}\n\`\`\`\n\nThe project file tree is:\n\`\`\`\n${fileTree.slice(0, 100).join("\n")}\n\`\`\`\n\nPlease provide a fixed Dockerfile.`,
            },
          ]
        );

        const textBlock = response.content.find((b) => b.type === "text");
        if (textBlock && textBlock.type === "text") {
          // Extract Dockerfile from potential markdown code blocks
          const match = textBlock.text.match(/```(?:dockerfile)?\n([\s\S]*?)```/);
          dockerfile = match ? match[1].trim() : textBlock.text.trim();
          addLog(deploymentId, "system", "Claude generated a fixed Dockerfile");
        }
      }
    }
  }

  throw new Error(`Build failed after ${config.maxBuildRetries} attempts: ${lastError}`);
}
