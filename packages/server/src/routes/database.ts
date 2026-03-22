import { Router, Request, Response } from "express";
import { getDb } from "../db/client.js";
import { Project } from "../types.js";
import { createDatabase, deleteDatabase, getDatabaseInfo, getDatabaseSchema, executeQuery } from "../services/database.js";

const router = Router();

// Get database info for a project
router.get("/projects/:id/database", (req: Request, res: Response) => {
  const info = getDatabaseInfo(req.params.id as string);
  if (!info) {
    res.json(null);
    return;
  }
  // Don't expose password in GET — show masked version
  res.json({
    status: info.status,
    dbName: info.db_name,
    user: info.db_user,
    port: info.port,
    host: info.container_name,
    connectionString: `postgresql://${info.db_user}:****@${info.container_name}:5432/${info.db_name}`,
  });
});

// Create a database for a project
router.post("/projects/:id/database", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id as string) as Project | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const result = await createDatabase(project.id, project.slug);
    res.json({
      ok: true,
      dbName: result.dbName,
      user: result.user,
      port: result.port,
      host: result.host,
      connectionString: result.connectionString,
      message: "Database created. DATABASE_URL has been automatically added to your environment variables.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to create database: ${msg}` });
  }
});

// Delete a database
router.delete("/projects/:id/database", async (req: Request, res: Response) => {
  try {
    await deleteDatabase(req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Get database schema (tables, columns, row counts)
router.get("/projects/:id/database/schema", async (req: Request, res: Response) => {
  try {
    const schema = await getDatabaseSchema(req.params.id as string);
    res.json(schema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Execute a SQL query
router.post("/projects/:id/database/query", async (req: Request, res: Response) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== "string") {
    res.status(400).json({ error: "Missing sql parameter" });
    return;
  }
  if (sql.length > 10000) {
    res.status(400).json({ error: "Query too long (max 10,000 characters)" });
    return;
  }

  try {
    const result = await executeQuery(req.params.id as string, sql);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
