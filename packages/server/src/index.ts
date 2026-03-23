import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { getDb, closeDb } from "./db/client.js";
import { errorHandler } from "./middleware/error.js";
import { initializePortTracking, cleanupStoppedContainers, cleanupOrphanedContainers, reconcilePorts } from "./services/deployer.js";
import projectRoutes from "./routes/projects.js";
import deploymentRoutes from "./routes/deployments.js";
import logRoutes from "./routes/logs.js";
import chatRoutes from "./routes/chat.js";
import fileRoutes from "./routes/files.js";
import envRoutes from "./routes/envvars.js";
import githubRoutes from "./routes/github.js";
import databaseRoutes from "./routes/database.js";
import domainRoutes from "./routes/domains.js";
import proxyRoutes from "./routes/proxy.js";
import authRoutes, { authMiddleware, requireProjectOwner, requireDeploymentOwner } from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import { initializeDbPortTracking } from "./services/database.js";
import { reloadCaddyConfig } from "./services/caddy.js";
import { cleanupOrphanedDevContainers } from "./services/generator.js";
import { backupAllDatabases } from "./services/backups.js";
import { sleepIdleContainers } from "./services/sleep.js";
import fs from "fs";

const app = express();

// Trust proxy — we're behind Caddy reverse proxy
app.set("trust proxy", 1);

// CORS — restrict to configured domain in production
const domain = process.env.DOMAIN || "localhost";
const corsOrigins = domain === "localhost"
  ? true // Allow all origins in development
  : [`https://${domain}`, `http://${domain}`, new RegExp(`https://.*\\.${domain.replace(/\./g, "\\.")}$`)];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts. Try again in 15 minutes." } });
const deployLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Too many deploys. Wait a minute." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: "Too many requests. Slow down." } });

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/projects/*/deploy", deployLimiter);
app.use("/api", apiLimiter);

// Auth middleware — attaches user to request if token present
app.use(authMiddleware);

// API routes — public
app.use("/api", authRoutes);
app.use("/api", billingRoutes);

// API routes — project-scoped (require auth + ownership)
app.use("/api/projects", projectRoutes); // list/create don't need ownership; individual routes do
app.use("/api/projects/:id", requireProjectOwner); // All sub-routes of /projects/:id
app.use("/api/projects/:projectId", requireProjectOwner); // All sub-routes of /projects/:projectId
app.use("/api/deployments/:id", requireDeploymentOwner); // Deployment-specific routes (including log streaming)
app.use("/api", logRoutes);
app.use("/api", deploymentRoutes);
app.use("/api", chatRoutes);
app.use("/api", fileRoutes);
app.use("/api", envRoutes);
app.use("/api", githubRoutes);
app.use("/api", databaseRoutes);
app.use("/api", domainRoutes);

// Wake-on-request: if a sleeping app's subdomain hits this server, wake it
app.use(async (req, res, next) => {
  const host = req.hostname;
  const domain = process.env.DOMAIN || "localhost";
  if (!host.endsWith(`.${domain}`) || host === domain) return next();

  const slug = host.replace(`.${domain}`, "");
  if (!slug || slug.includes(".")) return next();

  // Check if this slug has a sleeping deployment
  const db = getDb();
  const sleeping = db.prepare(`
    SELECT d.id FROM deployments d JOIN projects p ON p.id = d.project_id
    WHERE p.slug = ? AND d.status = 'sleeping' LIMIT 1
  `).get(slug) as { id: string } | undefined;

  if (!sleeping) return next();

  // Wake the container and show a loading page
  const { wakeContainer } = await import("./services/sleep.js");
  res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Waking up...</title>
    <style>body{margin:0;background:#0a0a12;color:#e0e0e0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem}
    .spin{width:32px;height:32px;border:3px solid #1e1e30;border-top:3px solid #7c3aed;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
    <meta http-equiv="refresh" content="5"></head><body><div class="spin"></div><div>Waking up your app...</div><div style="color:#666;font-size:0.85rem">This page will refresh automatically</div></body></html>`);

  // Wake in background
  wakeContainer(slug).catch(err => console.error(`Wake failed for ${slug}:`, err));
});

// Proxy to deployed containers (must be before static files)
app.use(proxyRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In production, serve the dashboard's built static files
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDist = path.resolve(__dirname, "..", "..", "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  // SPA fallback — serve index.html for non-API routes
  app.get("*", (_req, res, next) => {
    if (_req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dashboardDist, "index.html"));
  });
}

// Error handler
app.use(errorHandler);

async function start() {
  // Ensure data directories exist
  fs.mkdirSync(config.projectsDir, { recursive: true });
  fs.mkdirSync(config.buildsDir, { recursive: true });

  // Initialize database
  getDb();
  console.log("Database initialized");

  // Track existing container ports and clean up orphans
  await initializePortTracking();
  await initializeDbPortTracking();
  await cleanupOrphanedDevContainers();
  await cleanupStoppedContainers();
  await cleanupOrphanedContainers();

  // Recover stuck deployments from previous server run
  const db = getDb();
  const stuck = db.prepare(
    "SELECT id FROM deployments WHERE status IN ('pending', 'generating', 'building', 'deploying')"
  ).all() as Array<{ id: string }>;
  if (stuck.length > 0) {
    db.prepare(
      "UPDATE deployments SET status = 'failed', error = 'Server restarted during deployment' WHERE status IN ('pending', 'generating', 'building', 'deploying')"
    ).run();
    console.log(`Recovered ${stuck.length} stuck deployment(s)`);
  }

  // Check "running" deployments whose containers are gone
  const running = db.prepare(
    "SELECT id, container_id FROM deployments WHERE status = 'running' AND container_id IS NOT NULL"
  ).all() as Array<{ id: string; container_id: string }>;
  for (const dep of running) {
    try {
      const Dockerode = (await import("dockerode")).default;
      const docker = new Dockerode();
      const info = await docker.getContainer(dep.container_id).inspect();
      if (!info.State.Running) throw new Error("not running");
    } catch {
      db.prepare("UPDATE deployments SET status = 'stopped', stopped_at = datetime('now') WHERE id = ?").run(dep.id);
      console.log(`Marked orphaned deployment ${dep.id} as stopped`);
    }
  }

  // Generate initial Caddy config
  reloadCaddyConfig().catch(() => console.log("Caddy not available yet — config will update on first deploy"));

  // Every 5 minutes: reconcile ports, clean up orphans, sleep idle containers
  setInterval(() => {
    reconcilePorts().catch((err) => console.warn("Port reconciliation error:", err));
    cleanupOrphanedContainers().catch((err) => console.warn("Orphan cleanup error:", err));
    sleepIdleContainers().catch((err) => console.warn("Sleep check error:", err));
  }, 5 * 60 * 1000);

  // Daily database backups at 3am UTC
  function scheduleBackup() {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setUTCHours(3, 0, 0, 0);
    if (next3am <= now) next3am.setUTCDate(next3am.getUTCDate() + 1);
    const delay = next3am.getTime() - now.getTime();
    setTimeout(() => {
      backupAllDatabases().catch((err) => console.error("Backup error:", err));
      setInterval(() => {
        backupAllDatabases().catch((err) => console.error("Backup error:", err));
      }, 24 * 60 * 60 * 1000);
    }, delay);
    console.log(`Database backups scheduled — next at ${next3am.toISOString()}`);
  }
  scheduleBackup();

  app.listen(config.port, () => {
    console.log(`Claude Server running on http://localhost:${config.port}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  closeDb();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  closeDb();
  process.exit(0);
});

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
