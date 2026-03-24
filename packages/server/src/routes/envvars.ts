import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import crypto from "crypto";
import { encrypt, decrypt } from "../services/encrypt.js";

const router = Router();

interface EnvVar {
  id: number;
  project_id: string;
  key: string;
  value: string;
}

// List env vars for a project (decrypt values for display)
router.get("/projects/:id/env", (req: Request, res: Response) => {
  const db = getDb();
  const vars = db
    .prepare("SELECT * FROM env_vars WHERE project_id = ? ORDER BY key")
    .all(req.params.id as string) as EnvVar[];
  res.json(vars.map(v => ({ ...v, value: decrypt(v.value) || "" })));
});

// Set an env var (upsert, encrypt value)
router.post("/projects/:id/env", (req: Request, res: Response) => {
  const { key, value } = req.body;
  if (!key || typeof value !== "string") {
    res.status(400).json({ error: "key and value are required" });
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO env_vars (project_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value`
  ).run(req.params.id as string, key, encrypt(value));

  const vars = db
    .prepare("SELECT * FROM env_vars WHERE project_id = ? ORDER BY key")
    .all(req.params.id as string) as EnvVar[];
  res.json(vars.map(v => ({ ...v, value: decrypt(v.value) || "" })));
});

// Delete an env var
router.delete("/projects/:id/env/:key", (req: Request, res: Response) => {
  const db = getDb();
  db.prepare("DELETE FROM env_vars WHERE project_id = ? AND key = ?")
    .run(req.params.id as string, req.params.key as string);
  res.json({ ok: true });
});

// Helper: get env vars as array of "KEY=VALUE" strings for Docker
// Auto-maps DATABASE_URL to common aliases (Prisma/Vercel conventions)
export function getEnvVarsForDeploy(projectId: string, projectSlug?: string): string[] {
  const db = getDb();
  const vars = db
    .prepare("SELECT key, value FROM env_vars WHERE project_id = ?")
    .all(projectId) as Array<{ key: string; value: string }>;

  // Decrypt values for deployment
  const envMap = new Map(vars.map(v => [v.key, decrypt(v.value) || v.value]));

  // Auto-map DATABASE_URL to Prisma/Vercel-style env vars if not explicitly set
  const dbUrl = envMap.get("DATABASE_URL");
  if (dbUrl) {
    if (!envMap.has("POSTGRES_PRISMA_URL")) envMap.set("POSTGRES_PRISMA_URL", dbUrl);
    if (!envMap.has("POSTGRES_URL_NON_POOLING")) envMap.set("POSTGRES_URL_NON_POOLING", dbUrl);
    if (!envMap.has("POSTGRES_URL")) envMap.set("POSTGRES_URL", dbUrl);
  }

  // Auto-set NextAuth env vars for Next.js projects
  const domain = process.env.DOMAIN || "vibestack.build";
  if (projectSlug) {
    if (!envMap.has("NEXTAUTH_URL")) envMap.set("NEXTAUTH_URL", `https://${projectSlug}.${domain}`);
    if (!envMap.has("NEXT_PUBLIC_APP_URL")) envMap.set("NEXT_PUBLIC_APP_URL", `https://${projectSlug}.${domain}`);
  }
  if (!envMap.has("NEXTAUTH_SECRET")) envMap.set("NEXTAUTH_SECRET", crypto.randomBytes(32).toString("hex"));

  return Array.from(envMap.entries()).map(([k, v]) => `${k}=${v}`);
}

export default router;
