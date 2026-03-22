import { GenerationResult } from "../types.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

/**
 * Validate generated project files before attempting a Docker build.
 * Returns a list of issues — errors should block the build, warnings are logged.
 */
export function validateProject(result: GenerationResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(result.files.map(f => f.path));

  // 1. Check package.json is valid JSON
  const pkgFile = result.files.find(f => f.path === "package.json");
  let pkg: any = null;
  if (pkgFile) {
    try {
      pkg = JSON.parse(pkgFile.content);
    } catch (e) {
      issues.push({ severity: "error", message: `package.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
    }

    // Check that start script exists
    if (pkg && !pkg.scripts?.start) {
      issues.push({ severity: "warning", message: "package.json has no start script — Dockerfile CMD may fail" });
    }

    // Check entry point file exists
    if (pkg?.main && !filePaths.has(pkg.main)) {
      issues.push({ severity: "warning", message: `package.json main "${pkg.main}" not found in generated files` });
    }
  } else {
    // No package.json — might be a non-Node project, that's OK
  }

  // 2. Validate Dockerfile
  if (!result.dockerfile || result.dockerfile.trim().length === 0) {
    issues.push({ severity: "error", message: "Dockerfile is empty" });
  } else {
    const df = result.dockerfile;

    // Check for FROM
    if (!/^FROM\s+/m.test(df)) {
      issues.push({ severity: "error", message: "Dockerfile has no FROM instruction" });
    }

    // Check for EXPOSE
    if (!/EXPOSE\s+\d+/.test(df)) {
      issues.push({ severity: "warning", message: "Dockerfile has no EXPOSE — port detection will default to 3000" });
    }

    // Check for CMD or ENTRYPOINT
    if (!/^(CMD|ENTRYPOINT)\s+/m.test(df)) {
      issues.push({ severity: "error", message: "Dockerfile has no CMD or ENTRYPOINT — container won't start" });
    }

    // Check COPY references exist
    const copyMatches = df.matchAll(/^COPY\s+(?!--from)(\S+)/gm);
    for (const match of copyMatches) {
      const src = match[1];
      // Skip standard patterns
      if (src === "." || src === "./" || src === "package*.json" || src === "package.json") continue;
      // Check if the source directory/file exists in generated files
      const srcClean = src.replace(/\/$/, "");
      const exists = [...filePaths].some(f => f === srcClean || f.startsWith(srcClean + "/"));
      if (!exists) {
        issues.push({ severity: "warning", message: `Dockerfile COPYs "${src}" but no matching files were generated` });
      }
    }

    // Warn about npm ci
    if (/npm ci\b/.test(df)) {
      issues.push({ severity: "warning", message: "Dockerfile uses 'npm ci' but there's no lockfile — should use 'npm install'" });
    }
  }

  // 3. Check for empty files
  for (const file of result.files) {
    if (!file.content || file.content.trim().length === 0) {
      issues.push({ severity: "warning", message: `File "${file.path}" is empty` });
    }
    if (file.path.startsWith("/") || file.path.includes("..")) {
      issues.push({ severity: "error", message: `File "${file.path}" has an unsafe path` });
    }
  }

  // 4. Check EXPOSE port matches what the server listens on
  const exposeMatch = result.dockerfile.match(/EXPOSE\s+(\d+)/);
  if (exposeMatch && pkgFile) {
    const exposePort = exposeMatch[1];
    // Look for hardcoded port in server files that doesn't match
    const serverFiles = result.files.filter(f =>
      f.path.match(/server\.(js|ts)$/) || f.path.match(/index\.(js|ts)$/) || f.path.match(/app\.(js|ts)$/)
    );
    for (const sf of serverFiles) {
      // Check for hardcoded listen port that doesn't use PORT env var
      const listenMatch = sf.content.match(/\.listen\(\s*(\d{4,5})\s*[,)]/);
      if (listenMatch && listenMatch[1] !== exposePort && !sf.content.includes("process.env.PORT")) {
        issues.push({
          severity: "warning",
          message: `${sf.path} listens on hardcoded port ${listenMatch[1]} but Dockerfile EXPOSEs ${exposePort} — should use process.env.PORT`,
        });
      }
    }
  }

  return issues;
}

/**
 * Auto-fix common issues in the generation result.
 * Mutates the result in place. Returns list of fixes applied.
 */
export function autoFixProject(result: GenerationResult): string[] {
  const fixes: string[] = [];

  // Fix npm ci -> npm install in Dockerfile
  if (/npm ci\b/.test(result.dockerfile)) {
    result.dockerfile = result.dockerfile.replace(/npm ci\b[^\n]*/g, "npm install --production");
    fixes.push("Replaced npm ci with npm install in Dockerfile");
  }

  // Ensure server files use process.env.PORT
  const serverFiles = result.files.filter(f =>
    f.path.match(/server\.(js|ts)$/) || f.path.match(/index\.(js|ts)$/) || f.path.match(/app\.(js|ts)$/)
  );
  for (const sf of serverFiles) {
    // Replace hardcoded .listen(XXXX) with .listen(process.env.PORT || XXXX)
    const hardcoded = sf.content.match(/\.listen\(\s*(\d{4,5})\s*([,)])/);
    if (hardcoded && !sf.content.includes("process.env.PORT")) {
      sf.content = sf.content.replace(
        /\.listen\(\s*(\d{4,5})\s*([,)])/,
        `.listen(process.env.PORT || $1$2`
      );
      fixes.push(`${sf.path}: Added process.env.PORT fallback`);
    }
  }

  // Ensure health endpoint exists in main server file
  const mainServer = serverFiles[0];
  if (mainServer && !mainServer.content.includes("/health")) {
    // Add health endpoint before the listen call
    const listenIdx = mainServer.content.lastIndexOf(".listen(");
    if (listenIdx > -1) {
      const insertion = `\n// Health check\napp.get('/health', (req, res) => res.json({ status: 'ok' }));\n\n`;
      mainServer.content = mainServer.content.slice(0, listenIdx) + insertion + mainServer.content.slice(listenIdx);
      fixes.push(`${mainServer.path}: Added /health endpoint`);
    }
  }

  return fixes;
}
