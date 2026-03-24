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
  const hasVercelJson = fs.existsSync(path.join(sourcePath, "vercel.json"));
  const hasRailwayJson = fs.existsSync(path.join(sourcePath, "railway.json"));
  const hasNetlifyToml = fs.existsSync(path.join(sourcePath, "netlify.toml"));
  const hasDockerCompose = fs.existsSync(path.join(sourcePath, "docker-compose.yml")) || fs.existsSync(path.join(sourcePath, "docker-compose.yaml"));
  const hasProcfile = fs.existsSync(path.join(sourcePath, "Procfile"));

  // Detect project type
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
  const scripts = pkg.scripts || {};

  // --- Python projects ---
  const hasRequirements = fs.existsSync(path.join(sourcePath, "requirements.txt"));
  const hasPyproject = fs.existsSync(path.join(sourcePath, "pyproject.toml"));
  const hasAppPy = fs.existsSync(path.join(sourcePath, "app.py"));
  const hasMainPy = fs.existsSync(path.join(sourcePath, "main.py"));
  const isPython = hasRequirements || hasPyproject || hasAppPy || hasMainPy;

  if (isPython) {
    // Detect framework
    let framework = "unknown";
    for (const f of [
      hasRequirements ? path.join(sourcePath, "requirements.txt") : null,
      hasAppPy ? path.join(sourcePath, "app.py") : null,
      hasMainPy ? path.join(sourcePath, "main.py") : null,
    ].filter(Boolean) as string[]) {
      try {
        const content = fs.readFileSync(f, "utf-8").toLowerCase();
        if (content.includes("fastapi")) { framework = "fastapi"; break; }
        if (content.includes("flask")) { framework = "flask"; break; }
        if (content.includes("django")) { framework = "django"; break; }
      } catch {}
    }

    // Check for PORT binding
    const pyEntry = hasAppPy ? path.join(sourcePath, "app.py") : hasMainPy ? path.join(sourcePath, "main.py") : null;
    if (pyEntry) {
      try {
        const content = fs.readFileSync(pyEntry, "utf-8");
        if (framework === "flask" && content.includes("app.run(") && !content.includes("os.environ")) {
          issues.push('Flask app.run() does not use the PORT environment variable. Change to: app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)))');
        }
        if (!content.includes("0.0.0.0") && (content.includes("app.run(") || content.includes("uvicorn.run("))) {
          issues.push('The app may only be listening on localhost. It must bind to 0.0.0.0 to be reachable inside the container.');
        }
      } catch {}
    }

    if (framework === "django") {
      issues.push("This is a Django project. It needs gunicorn to run in production. Ensure ALLOWED_HOSTS includes '*' or the deployment domain, and STATIC_ROOT is configured for collectstatic.");
    }

    if (hasProcfile) {
      issues.push("This project has a Procfile (Heroku-style). Adapt the start command to use the PORT environment variable and bind to 0.0.0.0.");
    }

    if (hasDockerCompose) {
      issues.push("This project has docker-compose.yml — it may use multiple services. Everything must be consolidated into a single process for this platform.");
    }

    // Scan for env vars in Python files
    const envVars = scanPythonEnvVars(sourcePath);
    if (envVars.length > 0) {
      issues.push(`The app references these environment variables: ${envVars.join(", ")}. Make the app start gracefully if these are not set.`);
    }

    if (issues.length === 0) return null;

    return `This Python project was imported from GitHub and needs to be adapted to run on this platform.

CRITICAL REQUIREMENTS:
- The app must listen on os.environ.get("PORT", "3000"), bound to 0.0.0.0
- The app must start even if optional environment variables are missing (graceful degradation)
- Do NOT rewrite the entire app. Make MINIMAL changes to make it work.
- For database: use os.environ.get("DATABASE_URL") with psycopg2 or SQLAlchemy. Wrap in try/except.

ISSUES TO FIX:
${issues.map(i => `- ${i}`).join("\n")}

INSTRUCTIONS:
1. Read ONLY the files that need changes
2. Make the minimal edits needed
3. Call done when finished`;
  }

  // --- Next.js projects ---
  if (allDeps["next"]) {
    // Next.js projects generally "just work" with our build pipeline.
    // Only flag issues if there are real problems.
    if (hasDockerCompose) {
      issues.push("This project has docker-compose.yml — this platform handles Docker automatically. Remove any multi-service dependencies or make them optional.");
    }
    if (!scripts.build) {
      issues.push('package.json is missing a "build" script. Add "build": "next build".');
    }
    if (!scripts.start) {
      issues.push('package.json is missing a "start" script. Add "start": "next start".');
    }

    if (issues.length === 0) return null;

    return `This Next.js project was imported from GitHub and needs minor fixes to deploy.

CRITICAL REQUIREMENTS:
- The app must work with "npm run build" followed by "npm start"
- It must listen on process.env.PORT (default 3000) — Next.js does this by default
- Do NOT rewrite the app. Make MINIMAL changes.

ISSUES TO FIX:
${issues.map(i => `- ${i}`).join("\n")}

INSTRUCTIONS:
1. Read ONLY the files that need changes (likely just package.json or next.config)
2. Make the minimal edits
3. Call done when finished`;
  }

  // --- SvelteKit projects ---
  if (allDeps["@sveltejs/kit"]) {
    if (!allDeps["@sveltejs/adapter-node"]) {
      issues.push("This SvelteKit project needs @sveltejs/adapter-node for production. Add it as a dependency and configure svelte.config.js to use it instead of adapter-auto or adapter-static.");
    }
    if (!scripts.build) {
      issues.push('package.json is missing a "build" script. Add "build": "vite build".');
    }

    if (issues.length === 0) return null;

    return `This SvelteKit project was imported from GitHub and needs adaptation for this platform.

CRITICAL REQUIREMENTS:
- Must use @sveltejs/adapter-node for production deployment
- The app must work with "npm run build" followed by "node build"
- Do NOT rewrite the app. Make MINIMAL changes.

ISSUES TO FIX:
${issues.map(i => `- ${i}`).join("\n")}

INSTRUCTIONS:
1. Read ONLY svelte.config.js and package.json
2. Switch to adapter-node and ensure build/start scripts exist
3. Call done when finished`;
  }

  // --- TypeScript projects (no framework detected) ---
  if (allDeps["typescript"] && !allDeps["next"] && !allDeps["@sveltejs/kit"]) {
    if (!scripts.build) {
      issues.push('TypeScript project is missing a "build" script. Add "build": "tsc" or the appropriate build command.');
    }
    if (!scripts.start) {
      issues.push('TypeScript project is missing a "start" script. Add one that runs the compiled output (e.g., "start": "node dist/index.js").');
    }
  }

  // --- Monorepo: separate client/server ---
  if (hasClientDir && hasServerDir) {
    issues.push("This is a monorepo with separate client/ and server/ directories. The server needs to serve the built client files as static assets.");

    if (allDeps["vite"] || allDeps["@vitejs/plugin-react"]) {
      issues.push("The client uses Vite. After building (npm run build in client/), the output will be in client/dist/. The server must serve client/dist/ with express.static.");
    }
    if (allDeps["react"] || allDeps["react-dom"]) {
      issues.push("The client is a React SPA. The server needs a catch-all route that serves client/dist/index.html for any non-API route (for client-side routing).");
    }
  }

  // --- Platform-specific configs ---
  if (hasVercelJson || hasNetlifyToml) {
    issues.push("This project was configured for Vercel/Netlify which serves the frontend separately. The server must serve the built frontend files directly.");
  }
  if (hasRailwayJson) {
    issues.push("This project was deployed on Railway. It may need adaptation to serve both frontend and backend from a single process.");
  }
  if (hasDockerCompose && !isPython) {
    issues.push("This project has docker-compose.yml — everything must run as a single process on this platform.");
  }

  // --- ESM imports in server ---
  if (hasServerDir) {
    try {
      const serverEntry = fs.readFileSync(path.join(sourcePath, "server", "index.js"), "utf-8");
      if (serverEntry.includes("import ") && !serverEntry.includes("require(")) {
        if (pkg.type !== "module") {
          issues.push('The server uses ESM imports but package.json is missing "type": "module". Add it.');
        }
      }
    } catch {}
  }

  // --- Missing start script ---
  if (!scripts.start && !scripts.server && Object.keys(pkg).length > 0) {
    const hasServerJs = fs.existsSync(path.join(sourcePath, "server.js"));
    const hasIndexJs = fs.existsSync(path.join(sourcePath, "index.js"));
    if (hasServerDir) {
      issues.push('package.json is missing a "start" script. Add "start": "node server/index.js".');
    } else if (hasServerJs) {
      issues.push('package.json is missing a "start" script. Add "start": "node server.js".');
    } else if (hasIndexJs) {
      issues.push('package.json is missing a "start" script. Add "start": "node index.js".');
    }
  }

  // --- Scan for env vars in Node.js files ---
  const envVars = scanNodeEnvVars(sourcePath, hasServerDir);
  if (envVars.length > 0) {
    issues.push(`The server references these environment variables that may need to be configured: ${envVars.join(", ")}. Make the server start gracefully even if these are not set.`);
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

function scanNodeEnvVars(sourcePath: string, hasServerDir: boolean): string[] {
  const envVars: string[] = [];
  const IGNORE = new Set(["PORT", "NODE_ENV", "DATABASE_URL", "npm_"]);

  try {
    const dirs = hasServerDir ? [path.join(sourcePath, "server")] : [sourcePath];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".js") || f.endsWith(".ts"));
      for (const file of files.slice(0, 10)) { // limit to avoid scanning huge repos
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const matches = content.match(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
        if (matches) {
          for (const m of matches) {
            const name = m.replace("process.env.", "");
            if (!IGNORE.has(name) && !name.startsWith("npm_")) envVars.push(name);
          }
        }
      }
    }
  } catch {}

  return [...new Set(envVars)];
}

function scanPythonEnvVars(sourcePath: string): string[] {
  const envVars: string[] = [];
  const IGNORE = new Set(["PORT", "DATABASE_URL", "NODE_ENV", "PYTHONPATH", "DEBUG"]);

  try {
    const files = fs.readdirSync(sourcePath).filter(f => f.endsWith(".py")).slice(0, 10);
    for (const file of files) {
      const content = fs.readFileSync(path.join(sourcePath, file), "utf-8");
      // Match os.environ.get("KEY") and os.environ["KEY"] and os.getenv("KEY")
      const patterns = [
        /os\.environ\.get\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
        /os\.environ\[["']([A-Z_][A-Z0-9_]*)["']\]/g,
        /os\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
      ];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (!IGNORE.has(match[1])) envVars.push(match[1]);
        }
      }
    }
  } catch {}

  return [...new Set(envVars)];
}
