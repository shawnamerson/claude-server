import { getDb } from "../db/client.js";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

interface CustomDomainRow {
  domain: string;
  project_id: string;
}

export function generateCaddyfile(): string {
  const db = getDb();
  const domain = config.domain;

  // Get all running deployments with their ports
  const deployments = db.prepare(`
    SELECT d.project_id, d.port, p.slug
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    WHERE d.status = 'running' AND d.port IS NOT NULL
    ORDER BY d.created_at DESC
  `).all() as Array<{ project_id: string; port: number; slug: string }>;

  // Dedupe — only latest running deployment per project
  const projectPorts = new Map<string, { port: number; slug: string }>();
  for (const dep of deployments) {
    if (!projectPorts.has(dep.project_id)) {
      projectPorts.set(dep.project_id, { port: dep.port, slug: dep.slug });
    }
  }

  // Get custom domains
  const customDomains = db.prepare("SELECT domain, project_id FROM custom_domains").all() as CustomDomainRow[];

  let caddyfile = "";

  // Main dashboard
  caddyfile += `${domain} {\n`;
  caddyfile += `    reverse_proxy localhost:3000 {\n`;
  caddyfile += `        flush_interval -1\n`;
  caddyfile += `        transport http {\n`;
  caddyfile += `            read_timeout 0\n`;
  caddyfile += `        }\n`;
  caddyfile += `    }\n`;
  caddyfile += `}\n\n`;

  // Subdomain routing: slug.domain -> container port
  for (const [_projectId, { port, slug }] of projectPorts) {
    caddyfile += `${slug}.${domain} {\n`;
    caddyfile += `    reverse_proxy localhost:${port}\n`;
    caddyfile += `}\n\n`;
  }

  // Custom domain routing
  for (const cd of customDomains) {
    const mapping = projectPorts.get(cd.project_id);
    if (mapping) {
      caddyfile += `${cd.domain} {\n`;
      caddyfile += `    reverse_proxy localhost:${mapping.port}\n`;
      caddyfile += `}\n\n`;
    }
  }

  return caddyfile;
}

export async function reloadCaddyConfig(): Promise<void> {
  const caddyfile = generateCaddyfile();

  // Write the Caddyfile to the shared volume
  const caddyfilePath = path.resolve(process.env.CADDYFILE_PATH || "/app/Caddyfile");
  fs.writeFileSync(caddyfilePath, caddyfile);
  console.log("Caddyfile updated with", caddyfile.split("\n").filter(l => l.includes("{")).length, "routes");

  // Reload Caddy via its admin API
  try {
    const resp = await fetch("http://caddy:2019/adapt", {
      method: "POST",
      headers: { "Content-Type": "text/caddyfile" },
      body: caddyfile,
    });
    if (resp.ok) {
      const jsonConfig = await resp.json();
      await fetch("http://caddy:2019/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonConfig),
      });
      console.log("Caddy reloaded via admin API");
    }
  } catch (err) {
    console.error("Caddy reload via API failed (will pick up on next restart):", err);
  }
}
