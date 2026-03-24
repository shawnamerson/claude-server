import { getDb } from "../db/client.js";
import { stopContainer, deployFromVolume } from "./deployer.js";
import { getEnvVarsForDeploy } from "../routes/envvars.js";
import { reloadCaddyConfig } from "./caddy.js";
import { detectProjectConfig } from "./project-detect.js";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Slugs that should never sleep (e.g. landing page demo)
const NEVER_SLEEP = new Set((process.env.NEVER_SLEEP_SLUGS || "").split(",").map(s => s.trim()).filter(Boolean));

// Track last request time per project slug
const lastActivity = new Map<string, number>();

export function recordActivity(slug: string) {
  lastActivity.set(slug, Date.now());
}

export async function sleepIdleContainers(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const running = db.prepare(`
    SELECT d.id, d.container_id, d.port, d.project_id, p.slug, p.source_path
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    WHERE d.status = 'running' AND d.container_id IS NOT NULL
    ORDER BY d.created_at DESC
  `).all() as Array<{
    id: string;
    container_id: string;
    port: number;
    project_id: string;
    slug: string;
    source_path: string;
  }>;

  // Dedupe — only latest running deployment per project
  const seen = new Set<string>();
  const deployments = running.filter(d => {
    if (seen.has(d.project_id)) return false;
    seen.add(d.project_id);
    return true;
  });

  let slept = 0;
  for (const dep of deployments) {
    // Never sleep the demo project
    if (NEVER_SLEEP.has(dep.slug)) continue;

    const lastReq = lastActivity.get(dep.slug) || 0;
    const idle = now - lastReq;

    // Skip if active recently or if we never saw a request (give benefit of doubt for first 30 min)
    if (lastReq === 0) {
      // First time seeing this — start tracking from now
      lastActivity.set(dep.slug, now);
      continue;
    }

    if (idle < IDLE_TIMEOUT_MS) continue;

    try {
      console.log(`Sleeping idle container: ${dep.slug} (idle ${Math.round(idle / 60000)}min)`);
      await stopContainer(dep.container_id);
      db.prepare("UPDATE deployments SET status = 'sleeping', stopped_at = datetime('now') WHERE id = ?").run(dep.id);
      slept++;
    } catch (err) {
      console.warn(`Failed to sleep ${dep.slug}:`, err instanceof Error ? err.message : String(err));
    }
  }

  if (slept > 0) {
    reloadCaddyConfig().catch(() => {});
    console.log(`Slept ${slept} idle container(s)`);
  }
}

export async function wakeContainer(slug: string): Promise<{ port: number } | null> {
  const db = getDb();

  // Find the sleeping deployment for this slug
  const dep = db.prepare(`
    SELECT d.id, d.project_id, p.slug, p.source_path
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    WHERE p.slug = ? AND d.status = 'sleeping'
    ORDER BY d.created_at DESC
    LIMIT 1
  `).get(slug) as { id: string; project_id: string; slug: string; source_path: string } | undefined;

  if (!dep) return null;

  console.log(`Waking container: ${slug}`);
  recordActivity(slug);

  try {
    const wakeConfig = detectProjectConfig(dep.source_path);

    // Run build if needed (e.g. Next.js — .next might not exist after sleep)
    if (wakeConfig.buildCommand && wakeConfig.needsMoreMemory) {
      const { DevContainer } = await import("../services/generator.js");
      const bc = new DevContainer(dep.source_path);
      bc.memoryOverride = 2048 * 1024 * 1024;
      try { await bc.exec(wakeConfig.buildCommand, () => {}); } finally { await bc.cleanup(); }
    }

    const envVars = getEnvVarsForDeploy(dep.project_id);
    const { containerId, hostPort } = await deployFromVolume(
      dep.source_path, dep.id, wakeConfig.appPort, wakeConfig.startCommand, envVars, dep.slug
    );

    db.prepare("UPDATE deployments SET status = 'running', container_id = ?, port = ?, stopped_at = NULL WHERE id = ?")
      .run(containerId, hostPort, dep.id);

    reloadCaddyConfig().catch((err) => console.warn("Caddy reload after wake failed:", err));

    return { port: hostPort };
  } catch (err) {
    console.error(`Failed to wake ${slug}:`, err instanceof Error ? err.message : String(err));
    db.prepare("UPDATE deployments SET status = 'failed', error = ? WHERE id = ?")
      .run(`Wake failed: ${err instanceof Error ? err.message : String(err)}`, dep.id);
    return null;
  }
}
