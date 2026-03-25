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

  // Get all running deployments
  const deployments = db.prepare(`
    SELECT d.project_id, d.port, d.deploy_type, d.static_dir, p.slug
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    WHERE d.status = 'running' AND (d.port IS NOT NULL OR d.deploy_type = 'static')
    ORDER BY d.created_at DESC
  `).all() as Array<{ project_id: string; port: number | null; deploy_type: string; static_dir: string | null; slug: string }>;

  // Dedupe — only latest running deployment per project
  const projectRoutes = new Map<string, { port: number | null; slug: string; deployType: string; staticDir: string | null; projectId: string }>();
  for (const dep of deployments) {
    if (!projectRoutes.has(dep.project_id)) {
      projectRoutes.set(dep.project_id, { port: dep.port, slug: dep.slug, deployType: dep.deploy_type, staticDir: dep.static_dir, projectId: dep.project_id });
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

  // Common headers to strip framing restrictions for dashboard preview iframe
  const frameHeaders = [
    `    header -X-Frame-Options`,
    `    header -Content-Security-Policy`,
    `    header -Cross-Origin-Opener-Policy`,
    `    header -Cross-Origin-Resource-Policy`,
    `    header -Cross-Origin-Embedder-Policy`,
    `    header Content-Security-Policy "frame-ancestors 'self' ${domain} *.${domain}"`,
  ].join("\n");

  // Subdomain routing
  for (const [_projectId, { port, slug, deployType, staticDir, projectId }] of projectRoutes) {
    if (!isSafeHostname(slug)) {
      console.warn(`Skipping unsafe slug in Caddyfile: ${slug}`);
      continue;
    }
    caddyfile += `${slug}.${domain} {\n`;
    if (deployType === "static" && staticDir) {
      // Serve files directly from project directory — no container needed
      caddyfile += `    root * /srv/data/projects/${projectId}/${staticDir}\n`;
      caddyfile += `    try_files {path} /index.html\n`;
      caddyfile += `    file_server\n`;
    } else if (port) {
      caddyfile += `    reverse_proxy ${CONTAINER_HOST}:${port}\n`;
    }
    caddyfile += `${frameHeaders}\n`;
    caddyfile += `}\n\n`;
  }

  // Custom domain routing
  for (const cd of customDomains) {
    const mapping = projectRoutes.get(cd.project_id);
    if (mapping) {
      if (!isSafeHostname(cd.domain)) {
        console.warn(`Skipping unsafe custom domain in Caddyfile: ${cd.domain}`);
        continue;
      }
      caddyfile += `${cd.domain} {\n`;
      if (mapping.deployType === "static" && mapping.staticDir) {
        caddyfile += `    root * /srv/data/projects/${mapping.projectId}/${mapping.staticDir}\n`;
        caddyfile += `    try_files {path} /index.html\n`;
        caddyfile += `    file_server\n`;
      } else if (mapping.port) {
        caddyfile += `    reverse_proxy ${CONTAINER_HOST}:${mapping.port}\n`;
      }
      caddyfile += `${frameHeaders}\n`;
      caddyfile += `}\n\n`;

      // Auto-redirect www variant to bare domain
      if (!cd.domain.startsWith("www.")) {
        const wwwDomain = `www.${cd.domain}`;
        if (isSafeHostname(wwwDomain)) {
          caddyfile += `${wwwDomain} {\n`;
          caddyfile += `    redir https://${cd.domain}{uri} permanent\n`;
          caddyfile += `}\n\n`;
        }
      }
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
