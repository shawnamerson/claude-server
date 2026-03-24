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
import teamRoutes from "./routes/teams.js";
import adminRoutes, { isAdmin } from "./routes/admin.js";
import { initializeDbPortTracking } from "./services/database.js";
import { reloadCaddyConfig } from "./services/caddy.js";
import { cleanupOrphanedDevContainers } from "./services/generator.js";
import { backupAllDatabases } from "./services/backups.js";

import seoRoutes, { prerenderMiddleware } from "./routes/seo.js";
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
// Stripe webhook needs raw body for signature verification
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts. Try again in 15 minutes." } });
const deployLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "Too many deploys. Wait a minute." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: "Too many requests. Slow down." } });

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/projects/*/deploy", deployLimiter);
app.use("/api", apiLimiter);

// SEO routes — sitemap, robots.txt, OG image (before auth)
app.use(seoRoutes);

// Auth middleware — attaches user to request if token present
app.use(authMiddleware);

// API routes — public
app.use("/api", authRoutes);
app.use("/api", billingRoutes);

// Admin routes — check endpoint is public (returns isAdmin: true/false), rest require admin auth
app.use("/api/admin", adminRoutes);

// Team routes
app.use("/api", teamRoutes);

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

// Proxy to deployed containers (must be before static files)
app.use(proxyRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Check if a deployed app is responding (for iframe preview)
app.get("/api/app-health/:slug", async (req, res) => {
  const db = getDb();
  const dep = db.prepare(`
    SELECT d.port FROM deployments d JOIN projects p ON p.id = d.project_id
    WHERE p.slug = ? AND d.status = 'running' AND d.port IS NOT NULL
    ORDER BY d.created_at DESC LIMIT 1
  `).get(req.params.slug) as { port: number } | undefined;
  if (!dep) { res.json({ ok: false }); return; }
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    await fetch(`http://${config.dockerHostIp}:${dep.port}/`, { signal: controller.signal });
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// DNS verification — check if a domain points to this server
app.get("/api/check-dns/:domain", async (req, res) => {
  const domain = req.params.domain as string;
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    res.json({ verified: false });
    return;
  }
  try {
    const dns = await import("dns");
    const { promisify } = await import("util");
    const resolve4 = promisify(dns.resolve4);
    const ips = await resolve4(domain);
    // Get server IP if not cached
    if (!cachedServerIp) {
      const r = await fetch("https://api.ipify.org?format=json");
      cachedServerIp = ((await r.json()) as { ip: string }).ip;
    }
    res.json({ verified: ips.includes(cachedServerIp), resolvedTo: ips, expected: cachedServerIp });
  } catch {
    res.json({ verified: false });
  }
});

// Server IP for DNS setup instructions
let cachedServerIp: string | null = null;
app.get("/api/server-ip", async (_req, res) => {
  if (!cachedServerIp) {
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      const data = await r.json() as { ip: string };
      cachedServerIp = data.ip;
    } catch {
      cachedServerIp = process.env.SERVER_IP || "unknown";
    }
  }
  res.json({ ip: cachedServerIp });
});

// In production, serve the dashboard's built static files
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDist = path.resolve(__dirname, "..", "..", "dashboard", "dist");
if (fs.existsSync(dashboardDist)) {
  // Serve prerendered HTML to search engine bots
  app.use(prerenderMiddleware);
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

  // Auto-resume deployments interrupted by server restart
  const db = getDb();
  const stuck = db.prepare(
    `SELECT d.id, d.project_id, d.status FROM deployments d
     WHERE d.status IN ('pending', 'generating', 'building', 'deploying')
     ORDER BY d.created_at DESC`
  ).all() as Array<{ id: string; project_id: string; status: string }>;

  if (stuck.length > 0) {
    // Only resume the latest deployment per project — mark older ones as failed
    const seenProjects = new Set<string>();
    const toResume: Array<{ id: string; project_id: string }> = [];
    const toFail: string[] = [];

    for (const dep of stuck) {
      if (seenProjects.has(dep.project_id)) {
        toFail.push(dep.id);
      } else {
        seenProjects.add(dep.project_id);
        toResume.push(dep);
      }
    }

    if (toFail.length > 0) {
      for (const id of toFail) {
        db.prepare("UPDATE deployments SET status = 'failed', error = 'Server restarted — superseded by newer deploy' WHERE id = ?").run(id);
      }
    }

    // Resume each interrupted deployment after server is fully started
    setTimeout(async () => {
      const { runPipeline } = await import("./routes/deployments.js");
      for (const dep of toResume) {
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(dep.project_id) as any;
        if (!project) {
          db.prepare("UPDATE deployments SET status = 'failed', error = 'Project not found' WHERE id = ?").run(dep.id);
          continue;
        }
        // Get the original prompt from chat history
        const lastChat = db.prepare(
          "SELECT content FROM chat_messages WHERE project_id = ? AND deployment_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1"
        ).get(project.id, dep.id) as { content: string } | undefined;

        console.log(`Auto-resuming deployment ${dep.id} for project ${project.slug}...`);
        db.prepare("UPDATE deployments SET status = 'pending' WHERE id = ?").run(dep.id);

        runPipeline(project, dep.id, lastChat?.content).catch((err) => {
          console.error(`Auto-resume failed for ${dep.id}:`, err);
          db.prepare("UPDATE deployments SET status = 'failed', error = ? WHERE id = ?")
            .run(err instanceof Error ? err.message : String(err), dep.id);
        });
      }
    }, 5000); // Wait 5s for server to be fully ready

    console.log(`Auto-resuming ${toResume.length} interrupted deployment(s), failed ${toFail.length} superseded`);
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

  // Every 5 minutes: reconcile ports, clean up orphans
  setInterval(() => {
    reconcilePorts().catch((err) => console.warn("Port reconciliation error:", err));
    cleanupOrphanedContainers().catch((err) => console.warn("Orphan cleanup error:", err));
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
