import { getDb } from "../db/client.js";
import { config } from "../config.js";

interface CronJobRow {
  id: number;
  project_id: string;
  path: string;
  schedule: string;
  method: string;
  enabled: number;
  port: number;
  slug: string;
}

/**
 * Start the cron runner — ticks every 60 seconds and fires matching jobs.
 */
export function startCronRunner() {
  console.log("Cron runner started");
  // Tick immediately, then every 60s aligned to the minute
  const msUntilNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msUntilNextMinute);
}

async function tick() {
  const db = getDb();
  const now = new Date();

  // Get all enabled cron jobs with a running deployment
  const jobs = db.prepare(`
    SELECT cj.id, cj.project_id, cj.path, cj.schedule, cj.method, cj.enabled, d.port, p.slug
    FROM cron_jobs cj
    JOIN projects p ON p.id = cj.project_id
    JOIN deployments d ON d.project_id = p.id AND d.status = 'running' AND d.port IS NOT NULL
    WHERE cj.enabled = 1
    ORDER BY d.created_at DESC
  `).all() as CronJobRow[];

  // Dedupe — only latest deployment per project
  const seen = new Set<string>();
  const uniqueJobs = jobs.filter(j => {
    const key = `${j.project_id}:${j.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (const job of uniqueJobs) {
    if (matchesCron(job.schedule, now)) {
      fireRequest(job).catch(err => {
        console.warn(`Cron fire error for ${job.slug}${job.path}:`, err instanceof Error ? err.message : String(err));
      });
    }
  }
}

async function fireRequest(job: CronJobRow) {
  const url = `http://${config.dockerHostIp}:${job.port}${job.path}`;
  const start = Date.now();
  const db = getDb();

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

    console.log(`Cron ${job.slug}${job.path} → ${resp.status} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    db.prepare(
      "INSERT INTO cron_logs (cron_job_id, status, duration_ms, error) VALUES (?, NULL, ?, ?)"
    ).run(job.id, duration, msg);

    console.warn(`Cron ${job.slug}${job.path} failed: ${msg} (${duration}ms)`);
  }

  // Keep only last 100 logs per job
  db.prepare(
    "DELETE FROM cron_logs WHERE cron_job_id = ? AND id NOT IN (SELECT id FROM cron_logs WHERE cron_job_id = ? ORDER BY id DESC LIMIT 100)"
  ).run(job.id, job.id);
}

/**
 * Minimal 5-field cron expression matcher.
 * Supports: exact numbers, *, /step, and comma-separated values.
 * Fields: minute hour day-of-month month day-of-week
 */
export function matchesCron(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const values = [
    date.getUTCMinutes(),
    date.getUTCHours(),
    date.getUTCDate(),
    date.getUTCMonth() + 1,
    date.getUTCDay(),
  ];

  const ranges = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 6],   // day of week (0 = Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(fields[i], values[i], ranges[i][0], ranges[i][1])) {
      return false;
    }
  }
  return true;
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  // Comma-separated values
  const parts = field.split(",");
  for (const part of parts) {
    if (partMatches(part.trim(), value, min, max)) return true;
  }
  return false;
}

function partMatches(part: string, value: number, min: number, max: number): boolean {
  // */step
  if (part.startsWith("*/")) {
    const step = parseInt(part.slice(2));
    if (isNaN(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }

  // Wildcard
  if (part === "*") return true;

  // Range: 1-5
  if (part.includes("-")) {
    const [startStr, endStr] = part.split("-");
    const start = parseInt(startStr);
    const end = parseInt(endStr);
    if (isNaN(start) || isNaN(end)) return false;
    return value >= start && value <= end;
  }

  // Exact number
  const num = parseInt(part);
  if (isNaN(num)) return false;
  return value === num;
}

/**
 * Validate a cron expression. Returns null if valid, error message if not.
 */
export function validateCron(expr: string): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return "Must have exactly 5 fields: minute hour day month weekday";

  const names = ["Minute", "Hour", "Day", "Month", "Weekday"];
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

  for (let i = 0; i < 5; i++) {
    const parts = fields[i].split(",");
    for (const part of parts) {
      const p = part.trim();
      if (p === "*") continue;
      if (p.startsWith("*/")) {
        const step = parseInt(p.slice(2));
        if (isNaN(step) || step <= 0) return `${names[i]}: invalid step "${p}"`;
        continue;
      }
      if (p.includes("-")) {
        const [a, b] = p.split("-").map(Number);
        if (isNaN(a) || isNaN(b) || a < ranges[i][0] || b > ranges[i][1] || a > b) {
          return `${names[i]}: invalid range "${p}" (valid: ${ranges[i][0]}-${ranges[i][1]})`;
        }
        continue;
      }
      const n = parseInt(p);
      if (isNaN(n) || n < ranges[i][0] || n > ranges[i][1]) {
        return `${names[i]}: invalid value "${p}" (valid: ${ranges[i][0]}-${ranges[i][1]})`;
      }
    }
  }
  return null;
}
