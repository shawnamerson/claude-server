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
  /** Runtime environment */
  runtime?: "node" | "python";
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

  const installCmd = "rm -f package-lock.json && npm install --no-audit --no-fund 2>/dev/null";

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

  // --- SvelteKit ---
  if (deps["@sveltejs/kit"]) {
    const buildCmd = scripts.build ? "npm run build" : "npx vite build";
    const startCmd = scripts.start || "node build";
    return {
      buildCommand: `${installCmd} && ${buildCmd}`,
      startCommand: startCmd,
      appPort: 3000,
      needsMoreMemory: true,
    };
  }

  // --- Next.js ---
  if (deps["next"]) {
    const hasPrisma = !!deps["@prisma/client"] || !!deps["prisma"];
    const prismaCmd = hasPrisma ? " && npx prisma generate" : "";
    const buildCmd = scripts.build ? "npm run build" : "npx next build";
    // Always use npm start (which resolves local binaries) or npx as fallback
    // Never use bare "next start" — it won't be in PATH in the production container
    const startCmd = scripts.start ? "npm start" : "npx next start";
    return {
      buildCommand: `NEXT_TELEMETRY_DISABLED=1 ${installCmd}${prismaCmd} && NODE_OPTIONS=--max-old-space-size=1536 ${buildCmd}`,
      startCommand: startCmd,
      appPort: 3000,
      needsMoreMemory: true, // 2GB for Next.js builds, 10 min timeout
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

  // --- Static site (HTML/CSS/JS only, no server) ---
  const hasIndexHtml = fs.existsSync(path.join(sourcePath, "index.html"));
  if (hasIndexHtml && !fs.existsSync(pkgPath)) {
    return {
      buildCommand: null,
      startCommand: "npx serve . -l 3000 -s",
      appPort: 3000,
    };
  }

  // --- Python ---
  const hasRequirements = fs.existsSync(path.join(sourcePath, "requirements.txt"));
  const hasPyproject = fs.existsSync(path.join(sourcePath, "pyproject.toml"));
  const hasAppPy = fs.existsSync(path.join(sourcePath, "app.py"));
  const hasMainPy = fs.existsSync(path.join(sourcePath, "main.py"));

  if (hasRequirements || hasPyproject || hasAppPy || hasMainPy) {
    // Detect framework from requirements or source files
    let framework: "fastapi" | "flask" | "unknown" = "unknown";
    const filesToScan: string[] = [];
    if (hasRequirements) filesToScan.push(path.join(sourcePath, "requirements.txt"));
    if (hasPyproject) filesToScan.push(path.join(sourcePath, "pyproject.toml"));
    if (hasAppPy) filesToScan.push(path.join(sourcePath, "app.py"));
    if (hasMainPy) filesToScan.push(path.join(sourcePath, "main.py"));

    for (const f of filesToScan) {
      try {
        const content = fs.readFileSync(f, "utf-8").toLowerCase();
        if (content.includes("fastapi")) { framework = "fastapi"; break; }
        if (content.includes("flask")) { framework = "flask"; break; }
      } catch {}
    }

    // Install pip packages into a local directory on the volume so they persist
    const pipInstall = hasRequirements
      ? "pip install --break-system-packages --target ./pip_packages -r requirements.txt 2>/dev/null"
      : hasPyproject
      ? "pip install --break-system-packages --target ./pip_packages -e . 2>/dev/null"
      : null;

    // Prepend pip_packages to PYTHONPATH so installed packages are found at runtime
    const pythonPathPrefix = "PYTHONPATH=/data/" + (hasRequirements || hasPyproject ? "$(pwd)/pip_packages:${PYTHONPATH:-}" : "");

    if (framework === "fastapi") {
      const entryModule = hasMainPy ? "main" : "app";
      return {
        buildCommand: pipInstall,
        startCommand: `${pythonPathPrefix} python -m uvicorn ${entryModule}:app --host 0.0.0.0 --port 3000`,
        appPort: 3000,
        runtime: "python",
      };
    }

    // Flask or unknown Python — use gunicorn
    const entryModule = hasAppPy ? "app" : "main";
    return {
      buildCommand: pipInstall,
      startCommand: `PYTHONPATH=./pip_packages:\${PYTHONPATH:-} python -m gunicorn --bind 0.0.0.0:3000 ${entryModule}:app`,
      appPort: 3000,
      runtime: "python",
    };
  }

  // --- Fallback ---
  return { buildCommand: installCmd, startCommand: "npm start", appPort: 3000 };
}
