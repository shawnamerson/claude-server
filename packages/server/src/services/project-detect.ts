import fs from "fs";
import path from "path";

export interface ProjectConfig {
  /** Full command to install deps, build, and start */
  startCommand: string;
  /** The port the app listens on */
  appPort: number;
  /** Whether this project needs more memory (e.g. Next.js builds) */
  needsMoreMemory?: boolean;
}

/**
 * Analyze a project directory and determine the right build + start commands.
 * Handles: simple server.js, package.json scripts, monorepos with client builds, ESM, etc.
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
    } catch {
      // Invalid package.json — fall back to defaults
    }
  }

  const scripts = pkg.scripts || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Detect the port from common patterns
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

    // Install root deps + client deps + build client + start server
    const parts = [installCmd];
    parts.push("cd client && npm install --prefer-offline --no-audit --no-fund 2>/dev/null");
    if (hasBuild) parts.push("npm run build 2>/dev/null; cd ..");
    else parts.push("cd ..");

    // Determine server start
    if (hasServerDir) {
      parts.push("node server/index.js");
    } else if (scripts.server) {
      parts.push(`npm run server`);
    } else if (scripts.start) {
      parts.push("npm start");
    } else if (hasServerJs) {
      parts.push("node server.js");
    } else {
      parts.push("npm start");
    }

    return { startCommand: parts.join(" && "), appPort };
  }

  // --- Next.js ---
  if (deps["next"]) {
    const hasPrisma = !!deps["@prisma/client"] || !!deps["prisma"];
    const prismaCmd = hasPrisma ? " && npx prisma generate" : "";
    const buildCmd = scripts.build ? "npm run build" : "npx next build";
    const startCmd = scripts.start || "npx next start";
    return {
      startCommand: `${installCmd}${prismaCmd} && NODE_OPTIONS=--max-old-space-size=1024 ${buildCmd} && ${startCmd}`,
      appPort: 3000,
      needsMoreMemory: true,
    };
  }

  // --- Vite / React SPA (no server) ---
  if (deps["vite"] && !hasServerJs && !hasServerDir && !scripts.start?.includes("node")) {
    const buildCmd = scripts.build ? "npm run build 2>/dev/null" : "npx vite build 2>/dev/null";
    // Serve with a simple static server
    return {
      startCommand: `${installCmd} && ${buildCmd} && npx serve dist -l 3000 -s`,
      appPort: 3000,
    };
  }

  // --- Has package.json with start script ---
  if (scripts.start) {
    const parts = [installCmd];
    if (scripts.build) parts.push("npm run build 2>/dev/null");
    parts.push("npm start");
    return { startCommand: parts.join(" && "), appPort };
  }

  // --- Simple server.js ---
  if (hasServerJs) {
    return {
      startCommand: `${installCmd}; node server.js`,
      appPort: 3000,
    };
  }

  // --- server/index.js ---
  if (hasServerDir) {
    return {
      startCommand: `${installCmd}; node server/index.js`,
      appPort: 3000,
    };
  }

  // --- Has index.js ---
  if (fs.existsSync(path.join(sourcePath, "index.js"))) {
    return {
      startCommand: `${installCmd}; node index.js`,
      appPort: 3000,
    };
  }

  // --- Fallback: try npm start ---
  return {
    startCommand: `${installCmd} && npm start`,
    appPort: 3000,
  };
}
