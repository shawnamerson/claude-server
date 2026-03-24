import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { validateCron, matchesCron } from "../services/cron.js";
import { config } from "../config.js";

const router = Router();

interface CronJob {
  id: number;
  project_id: string;
  path: string;
  schedule: string;
  method: string;
  enabled: number;
  created_at: string;
}

// List cron jobs for a project (with last run info)
router.get("/projects/:id/cron", (req: Request, res: Response) => {
  const db = getDb();
  const jobs = db.prepare(`
    SELECT cj.*,
      (SELECT cl.status FROM cron_logs cl WHERE cl.cron_job_id = cj.id ORDER BY cl.id DESC LIMIT 1) as last_status,
      (SELECT cl.created_at FROM cron_logs cl WHERE cl.cron_job_id = cj.id ORDER BY cl.id DESC LIMIT 1) as last_run
    FROM cron_jobs cj
    WHERE cj.project_id = ?
    ORDER BY cj.created_at ASC
  `).all(req.params.id);
  res.json(jobs);
});

// Create a cron job
router.post("/projects/:id/cron", (req: Request, res: Response) => {
  const { path, schedule, method } = req.body;
  if (!path || !schedule) {
    res.status(400).json({ error: "path and schedule are required" });
    return;
  }

  if (!path.startsWith("/")) {
    res.status(400).json({ error: "path must start with /" });
    return;
  }

  const cronError = validateCron(schedule);
  if (cronError) {
    res.status(400).json({ error: `Invalid cron: ${cronError}` });
    return;
  }

  const httpMethod = (method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(httpMethod)) {
    res.status(400).json({ error: "method must be GET or POST" });
    return;
  }

  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO cron_jobs (project_id, path, schedule, method) VALUES (?, ?, ?, ?)`
    ).run(req.params.id, path, schedule, httpMethod);
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: "A cron job for this path already exists" });
      return;
    }
    throw err;
  }

  const jobs = db.prepare("SELECT * FROM cron_jobs WHERE project_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json(jobs);
});

// Update a cron job
router.put("/projects/:id/cron/:cronId", (req: Request, res: Response) => {
  const { path, schedule, method, enabled } = req.body;
  const db = getDb();

  const job = db.prepare("SELECT * FROM cron_jobs WHERE id = ? AND project_id = ?").get(req.params.cronId, req.params.id) as CronJob | undefined;
  if (!job) {
    res.status(404).json({ error: "Cron job not found" });
    return;
  }

  if (schedule) {
    const cronError = validateCron(schedule);
    if (cronError) {
      res.status(400).json({ error: `Invalid cron: ${cronError}` });
      return;
    }
  }

  if (path && !path.startsWith("/")) {
    res.status(400).json({ error: "path must start with /" });
    return;
  }

  db.prepare(
    "UPDATE cron_jobs SET path = ?, schedule = ?, method = ?, enabled = ? WHERE id = ?"
  ).run(
    path || job.path,
    schedule || job.schedule,
    (method || job.method).toUpperCase(),
    enabled !== undefined ? (enabled ? 1 : 0) : job.enabled,
    job.id
  );

  res.json({ ok: true });
});

// Delete a cron job
router.delete("/projects/:id/cron/:cronId", (req: Request, res: Response) => {
  const db = getDb();
  db.prepare("DELETE FROM cron_jobs WHERE id = ? AND project_id = ?").run(req.params.cronId, req.params.id);
  res.json({ ok: true });
});

// Get logs for a cron job
router.get("/projects/:id/cron/:cronId/logs", (req: Request, res: Response) => {
  const db = getDb();
  const logs = db.prepare(
    "SELECT * FROM cron_logs WHERE cron_job_id = ? ORDER BY id DESC LIMIT 50"
  ).all(req.params.cronId);
  res.json(logs);
});

// Manually trigger a cron job
router.post("/projects/:id/cron/:cronId/trigger", async (req: Request, res: Response) => {
  const db = getDb();
  const job = db.prepare("SELECT * FROM cron_jobs WHERE id = ? AND project_id = ?").get(req.params.cronId, req.params.id) as CronJob | undefined;
  if (!job) {
    res.status(404).json({ error: "Cron job not found" });
    return;
  }

  // Find running deployment
  const dep = db.prepare(`
    SELECT d.port FROM deployments d
    WHERE d.project_id = ? AND d.status = 'running' AND d.port IS NOT NULL
    ORDER BY d.created_at DESC LIMIT 1
  `).get(req.params.id) as { port: number } | undefined;

  if (!dep) {
    res.status(400).json({ error: "No running deployment — deploy first" });
    return;
  }

  const url = `http://${config.dockerHostIp}:${dep.port}${job.path}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(url, {
      method: job.method,
      signal: controller.signal,
      headers: { "User-Agent": "VibeStack-Cron/1.0" },
    });

    clearTimeout(timeout);
    const duration = Date.now() - start;

    db.prepare(
      "INSERT INTO cron_logs (cron_job_id, status, duration_ms) VALUES (?, ?, ?)"
    ).run(job.id, resp.status, duration);

    res.json({ ok: true, status: resp.status, duration_ms: duration });
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    db.prepare(
      "INSERT INTO cron_logs (cron_job_id, status, duration_ms, error) VALUES (?, NULL, ?, ?)"
    ).run(job.id, duration, msg);

    res.json({ ok: false, error: msg, duration_ms: duration });
  }
});

export default router;
