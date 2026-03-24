import fs from "fs";
import path from "path";

export interface ProjectConfig {
  /** Command to install deps and build (runs in dev container before deploy) */
  buildCommand: string | null;
  /** Command to start the app (runs in production container) */
  startCommand: string;
  /** The port the app listens on */
  appPort: number;
  /** Whether this project needs more memory for building */
  needsMoreMemory?: boolean;
}

/**
 * Analyze a project directory and determine the right build + start commands.
 */
export function detectProjectConfig(sourcePath: string): ProjectConfig {
  const pkgPath = path.join(sourcePath, "package.json");
  const hasServerJs = fs.existsSync(path.join(sourcePath, "server.js"));
  const hasServerDir = fs.existsSync(path.join(sourcePath, "server", "index.js"));
  const hasClientDir = fs.existsSync(path.join(sourcePath, "client", "package.json"));

  let pkg: any = {};
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {}
  }

  const scripts = pkg.scripts || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  let appPort = 3000;
  if (scripts.start && scripts.start.includes("5000")) appPort = 5000;
  if (scripts.start && scripts.start.includes("8080")) appPort = 8080;

  const installCmd = "npm install --prefer-offline --no-audit --no-fund 2>/dev/null";

  // --- Monorepo: has client/ with its own package.json ---
  if (hasClientDir) {
    const clientPkgPath = path.join(sourcePath, "client", "package.json");
    let clientPkg: any = {};
    try { clientPkg = JSON.parse(fs.readFileSync(clientPkgPath, "utf-8")); } catch {}

    const clientScripts = clientPkg.scripts || {};
    const hasBuild = !!clientScripts.build;

    const buildParts = [installCmd, "cd client && npm install --prefer-offline --no-audit --no-fund 2>/dev/null"];
    if (hasBuild) buildParts.push("npm run build; cd ..");
    else buildParts.push("cd ..");

    let startCmd = "npm start";
    if (hasServerDir) startCmd = "node server/index.js";
    else if (scripts.server) startCmd = "npm run server";
    else if (scripts.start) startCmd = "npm start";
    else if (hasServerJs) startCmd = "node server.js";

    return { buildCommand: buildParts.join(" && "), startCommand: startCmd, appPort };
  }

  // --- Next.js ---
  if (deps["next"]) {
    const hasPrisma = !!deps["@prisma/client"] || !!deps["prisma"];
    const prismaCmd = hasPrisma ? " && npx prisma generate" : "";
    const buildCmd = scripts.build ? "npm run build" : "npx next build";
    const startCmd = scripts.start || "npx next start";
    return {
      buildCommand: `${installCmd}${prismaCmd} && NODE_OPTIONS=--max-old-space-size=1536 ${buildCmd}`,
      startCommand: startCmd,
      appPort: 3000,
      needsMoreMemory: true, // 2GB for Next.js builds
    };
  }

  // --- Vite / React SPA (no server) ---
  if (deps["vite"] && !hasServerJs && !hasServerDir && !scripts.start?.includes("node")) {
    const buildCmd = scripts.build ? "npm run build" : "npx vite build";
    return {
      buildCommand: `${installCmd} && ${buildCmd}`,
      startCommand: "npx serve dist -l 3000 -s",
      appPort: 3000,
    };
  }

  // --- Has package.json with build + start scripts ---
  if (scripts.start && scripts.build) {
    return {
      buildCommand: `${installCmd} && npm run build`,
      startCommand: "npm start",
      appPort,
    };
  }

  // --- Has package.json with start script only ---
  if (scripts.start) {
    return {
      buildCommand: installCmd,
      startCommand: "npm start",
      appPort,
    };
  }

  // --- Simple server.js ---
  if (hasServerJs) {
    return { buildCommand: installCmd, startCommand: "node server.js", appPort: 3000 };
  }

  // --- server/index.js ---
  if (hasServerDir) {
    return { buildCommand: installCmd, startCommand: "node server/index.js", appPort: 3000 };
  }

  // --- Has index.js ---
  if (fs.existsSync(path.join(sourcePath, "index.js"))) {
    return { buildCommand: installCmd, startCommand: "node index.js", appPort: 3000 };
  }

  // --- Fallback ---
  return { buildCommand: installCmd, startCommand: "npm start", appPort: 3000 };
}
