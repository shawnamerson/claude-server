import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getDb, closeDb } from "./db/client.js";
import { errorHandler } from "./middleware/error.js";
import { initializePortTracking } from "./services/deployer.js";
import projectRoutes from "./routes/projects.js";
import deploymentRoutes from "./routes/deployments.js";
import logRoutes from "./routes/logs.js";
import chatRoutes from "./routes/chat.js";
import fileRoutes from "./routes/files.js";
import envRoutes from "./routes/envvars.js";
import githubRoutes from "./routes/github.js";
import databaseRoutes from "./routes/database.js";
import proxyRoutes from "./routes/proxy.js";
import { initializeDbPortTracking } from "./services/database.js";
import fs from "fs";

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/projects", projectRoutes);
app.use("/api", deploymentRoutes);
app.use("/api", logRoutes);
app.use("/api", chatRoutes);
app.use("/api", fileRoutes);
app.use("/api", envRoutes);
app.use("/api", githubRoutes);
app.use("/api", databaseRoutes);

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

  // Track existing container ports
  await initializePortTracking();
  await initializeDbPortTracking();

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
