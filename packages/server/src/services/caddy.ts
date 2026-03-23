import { getDb } from "../db/client.js";
import { config } from "../config.js";
import fs from "fs";

interface CustomDomainRow {
  domain: string;
  project_id: string;
}

// Caddy runs in Docker — use service name for claude-server,
// and Docker gateway IP for project containers (they bind to host ports)
const MAIN_SERVER = "claude-server:3000";
const CONTAINER_HOST = "host.docker.internal";

// Validate that a string is a safe hostname (no Caddyfile injection)
function isSafeHostname(hostname: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(hostname);
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
  caddyfile += `    reverse_proxy ${MAIN_SERVER} {\n`;
  caddyfile += `        flush_interval -1\n`;
  caddyfile += `        transport http {\n`;
  caddyfile += `            read_timeout 0\n`;
  caddyfile += `        }\n`;
  caddyfile += `    }\n`;
  caddyfile += `}\n\n`;

  // Redirect www to root domain
  caddyfile += `www.${domain} {\n`;
  caddyfile += `    redir https://${domain}{uri} permanent\n`;
  caddyfile += `}\n\n`;

  // Subdomain routing: slug.domain -> container port via host
  // Strip framing restrictions so apps render in the dashboard preview iframe
  for (const [_projectId, { port, slug }] of projectPorts) {
    if (!isSafeHostname(slug)) {
      console.warn(`Skipping unsafe slug in Caddyfile: ${slug}`);
      continue;
    }
    caddyfile += `${slug}.${domain} {\n`;
    caddyfile += `    reverse_proxy ${CONTAINER_HOST}:${port}\n`;
    caddyfile += `    header -X-Frame-Options\n`;
    caddyfile += `    header -Content-Security-Policy\n`;
    caddyfile += `    header Content-Security-Policy "frame-ancestors 'self' ${domain} *.${domain}"\n`;
    caddyfile += `}\n\n`;
  }

  // Sleeping deployments: route to main server for wake-on-request
  const sleeping = db.prepare(`
    SELECT DISTINCT p.slug
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    WHERE d.status = 'sleeping'
  `).all() as Array<{ slug: string }>;

  for (const { slug } of sleeping) {
    // Skip if already has a running deployment route
    if ([...projectPorts.values()].some(p => p.slug === slug)) continue;
    if (!isSafeHostname(slug)) continue;
    caddyfile += `${slug}.${domain} {\n`;
    caddyfile += `    reverse_proxy ${MAIN_SERVER}\n`;
    caddyfile += `    header -X-Frame-Options\n`;
    caddyfile += `    header -Content-Security-Policy\n`;
    caddyfile += `    header Content-Security-Policy "frame-ancestors 'self' ${domain} *.${domain}"\n`;
    caddyfile += `}\n\n`;
  }

  // Custom domain routing
  for (const cd of customDomains) {
    const mapping = projectPorts.get(cd.project_id);
    if (mapping) {
      if (!isSafeHostname(cd.domain)) {
        console.warn(`Skipping unsafe custom domain in Caddyfile: ${cd.domain}`);
        continue;
      }
      caddyfile += `${cd.domain} {\n`;
      caddyfile += `    reverse_proxy ${CONTAINER_HOST}:${mapping.port}\n`;
      caddyfile += `    header -X-Frame-Options\n`;
      caddyfile += `    header -Content-Security-Policy\n`;
      caddyfile += `    header Content-Security-Policy "frame-ancestors 'self' ${domain} *.${domain}"\n`;
      caddyfile += `}\n\n`;
    }
  }

  return caddyfile;
}

export async function reloadCaddyConfig(): Promise<void> {
  const caddyfile = generateCaddyfile();
  const caddyfilePath = process.env.CADDYFILE_PATH || "./Caddyfile";

  fs.writeFileSync(caddyfilePath, caddyfile);
  console.log("Caddyfile updated —", caddyfile.split("\n").filter(l => l.includes("{")).length, "routes");
}
