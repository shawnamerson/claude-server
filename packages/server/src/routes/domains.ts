import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { reloadCaddyConfig } from "../services/caddy.js";

const router = Router();

interface CustomDomain {
  id: number;
  project_id: string;
  domain: string;
  verified: number;
}

// List domains for a project
router.get("/projects/:id/domains", (req: Request, res: Response) => {
  const db = getDb();
  const domains = db
    .prepare("SELECT * FROM custom_domains WHERE project_id = ? ORDER BY created_at")
    .all(req.params.id as string) as CustomDomain[];
  res.json(domains);
});

// Add a custom domain
router.post("/projects/:id/domains", async (req: Request, res: Response) => {
  const { domain } = req.body;
  if (!domain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  // Normalize domain
  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const db = getDb();

  // Check if domain is already used
  const existing = db.prepare("SELECT * FROM custom_domains WHERE domain = ?").get(cleanDomain) as CustomDomain | undefined;
  if (existing) {
    res.status(409).json({ error: "Domain already in use" });
    return;
  }

  db.prepare("INSERT INTO custom_domains (project_id, domain) VALUES (?, ?)").run(req.params.id as string, cleanDomain);

  // Reload Caddy to pick up the new domain
  try {
    await reloadCaddyConfig();
  } catch (err) {
    console.error("Failed to reload Caddy:", err);
  }

  res.json({
    ok: true,
    domain: cleanDomain,
    instructions: `Point your domain's DNS A record to this server's IP address. Caddy will automatically provision an HTTPS certificate.`,
  });
});

// Remove a custom domain
router.delete("/projects/:id/domains/:domainId", async (req: Request, res: Response) => {
  const db = getDb();
  db.prepare("DELETE FROM custom_domains WHERE id = ? AND project_id = ?").run(
    req.params.domainId as string,
    req.params.id as string
  );

  try {
    await reloadCaddyConfig();
  } catch (err) {
    console.error("Failed to reload Caddy:", err);
  }

  res.json({ ok: true });
});

export default router;
