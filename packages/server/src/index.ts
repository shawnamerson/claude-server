import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { getDb, closeDb } from "./db/client.js";
import { errorHandler } from "./middleware/error.js";
import { initializePortTracking, cleanupStoppedContainers } from "./services/deployer.js";
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
import fs from "fs";

const app = express();

app.use(cors());
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
app.use("/api", logRoutes); // Log streaming before auth check — uses unguessable deployment IDs
app.use("/api/deployments/:id", requireDeploymentOwner); // Deployment-specific routes
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

  // Generate initial Caddy config
  reloadCaddyConfig().catch(() => console.log("Caddy not available yet — config will update on first deploy"));

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
