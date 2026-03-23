import fs from "fs";
import path from "path";

/**
 * Analyze a cloned repo and generate an adaptation prompt for Claude
 * to make it deployable as a single self-contained service.
 * Returns null if the project doesn't need adaptation.
 */
export function getAdaptationPrompt(sourcePath: string): string | null {
  const issues: string[] = [];

  const hasClientDir = fs.existsSync(path.join(sourcePath, "client"));
  const hasServerDir = fs.existsSync(path.join(sourcePath, "server"));
  const hasSrcDir = fs.existsSync(path.join(sourcePath, "src"));
  const hasPublicDir = fs.existsSync(path.join(sourcePath, "public"));
  const hasVercelJson = fs.existsSync(path.join(sourcePath, "vercel.json"));
  const hasRailwayJson = fs.existsSync(path.join(sourcePath, "railway.json"));
  const hasNetlifyToml = fs.existsSync(path.join(sourcePath, "netlify.toml"));

  let pkg: any = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(sourcePath, "package.json"), "utf-8"));
  } catch {}

  let clientPkg: any = {};
  if (hasClientDir) {
    try {
      clientPkg = JSON.parse(fs.readFileSync(path.join(sourcePath, "client", "package.json"), "utf-8"));
    } catch {}
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...clientPkg.dependencies, ...clientPkg.devDependencies };

  // Detect: separate client/server that need consolidation
  if (hasClientDir && hasServerDir) {
    issues.push("This is a monorepo with separate client/ and server/ directories. The server needs to serve the built client files as static assets.");

    if (allDeps["vite"] || allDeps["@vitejs/plugin-react"]) {
      issues.push("The client uses Vite. After building (npm run build in client/), the output will be in client/dist/. The server must serve client/dist/ with express.static.");
    }
    if (allDeps["react"] || allDeps["react-dom"]) {
      issues.push("The client is a React SPA. The server needs a catch-all route that serves client/dist/index.html for any non-API route (for client-side routing).");
    }
  }

  // Detect: was hosted on a platform that serves frontend separately
  if (hasVercelJson || hasNetlifyToml) {
    issues.push("This project was configured for Vercel/Netlify which serves the frontend separately. The Express server must serve the built frontend files directly.");
  }
  if (hasRailwayJson) {
    issues.push("This project was deployed on Railway. It may need adaptation to serve both frontend and backend from a single process.");
  }

  // Detect: ESM imports in server
  if (hasServerDir) {
    try {
      const serverEntry = fs.readFileSync(path.join(sourcePath, "server", "index.js"), "utf-8");
      if (serverEntry.includes("import ") && !serverEntry.includes("require(")) {
        // Check if package.json has "type": "module"
        if (pkg.type !== "module") {
          issues.push('The server uses ESM imports but package.json is missing "type": "module". Add it.');
        }
      }
    } catch {}
  }

  // Detect: missing start script
  if (!pkg.scripts?.start && !pkg.scripts?.server) {
    if (hasServerDir) {
      issues.push('package.json is missing a "start" script. Add "start": "node server/index.js".');
    }
  }

  // Detect: environment variables referenced but not set
  const envVarsNeeded: string[] = [];
  try {
    const serverFiles = hasServerDir
      ? fs.readdirSync(path.join(sourcePath, "server")).filter(f => f.endsWith(".js") || f.endsWith(".ts"))
      : [];
    for (const file of serverFiles) {
      const content = fs.readFileSync(path.join(sourcePath, "server", file), "utf-8");
      const envMatches = content.match(/process\.env\.([A-Z_]+)/g);
      if (envMatches) {
        for (const match of envMatches) {
          const varName = match.replace("process.env.", "");
          if (!["PORT", "NODE_ENV", "DATABASE_URL"].includes(varName)) {
            envVarsNeeded.push(varName);
          }
        }
      }
    }
  } catch {}

  if (envVarsNeeded.length > 0) {
    const unique = [...new Set(envVarsNeeded)];
    issues.push(`The server references these environment variables that may need to be configured: ${unique.join(", ")}. Make the server start gracefully even if these are not set (use defaults or skip features).`);
  }

  if (issues.length === 0) return null;

  return `This project was imported from a GitHub repository and needs to be adapted to run as a single self-contained service on this platform.

CRITICAL REQUIREMENTS:
- Everything must run as a SINGLE process listening on process.env.PORT (default 3000)
- The server must serve the frontend static files directly (no separate hosting)
- The app must start even if optional environment variables are missing (graceful degradation)
- Do NOT rewrite the entire app. Make MINIMAL changes to make it work.

ISSUES TO FIX:
${issues.map(i => `- ${i}`).join("\n")}

INSTRUCTIONS:
1. Read ONLY the files that need changes (server entry point, package.json)
2. Make the minimal edits needed
3. Ensure the server serves static files from the client build directory
4. Add a catch-all route for SPA client-side routing (serve index.html for non-API routes)
5. Make sure the app doesn't crash if optional env vars are missing
6. Call done when finished`;
}
