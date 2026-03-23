import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { config } from "../config.js";
import { Project } from "../types.js";
import { readProjectFiles } from "../services/generator.js";
import { stopContainer, releasePort } from "../services/deployer.js";
import { deleteDatabase } from "../services/database.js";
import { canCreateProject } from "./auth.js";
import fs from "fs";

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// List projects for the current user
router.get("/", (req: Request, res: Response) => {
  const db = getDb();
  const user = req.user;

  // If authenticated, show only user's projects. Otherwise show unowned projects.
  const whereClause = user ? "WHERE p.user_id = ?" : "WHERE p.user_id IS NULL";
  const params = user ? [user.id] : [];

  const projects = db
    .prepare(
      `SELECT p.*,
        COALESCE(
          (SELECT d.status FROM deployments d WHERE d.project_id = p.id AND d.status = 'running' LIMIT 1),
          (SELECT d.status FROM deployments d WHERE d.project_id = p.id ORDER BY d.created_at DESC LIMIT 1)
        ) as latest_status,
        COALESCE(
          (SELECT d.port FROM deployments d WHERE d.project_id = p.id AND d.status = 'running' LIMIT 1),
          (SELECT d.port FROM deployments d WHERE d.project_id = p.id ORDER BY d.created_at DESC LIMIT 1)
        ) as latest_port,
        (SELECT COUNT(*) FROM deployments d WHERE d.project_id = p.id) as deploy_count,
        (SELECT COALESCE(SUM(d.cost_cents), 0) FROM deployments d WHERE d.project_id = p.id) as total_cost_cents
       FROM projects p ${whereClause} ORDER BY p.updated_at DESC`
    )
    .all(...params);
  res.json(projects);
});

// Get single project
router.get("/:id", (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Get files
  const files = readProjectFiles((project as Project).source_path);

  // Get total cost
  const costData = db.prepare(
    "SELECT COUNT(*) as deploys, COALESCE(SUM(input_tokens), 0) as total_input, COALESCE(SUM(output_tokens), 0) as total_output, COALESCE(SUM(cost_cents), 0) as total_cost_cents FROM deployments WHERE project_id = ?"
  ).get(req.params.id) as { deploys: number; total_input: number; total_output: number; total_cost_cents: number };

  res.json({ ...project, files, usage: costData });
});

// Create a new project (just name + description, no upload needed)
router.post("/", (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  // Check project limit
  const user = req.user;
  if (user) {
    const check = canCreateProject(user.id);
    if (!check.allowed) {
      res.status(402).json({ error: check.reason });
      return;
    }
  }

  const db = getDb();
  const id = nanoid(12);
  let slug = slugify(name);

  // Ensure unique slug (must be all lowercase for Docker)
  const existing = db.prepare("SELECT id FROM projects WHERE slug = ?").get(slug);
  if (existing) {
    slug = `${slug}-${nanoid(4).toLowerCase()}`;
  }

  const sourcePath = `${config.projectsDir}/${id}`;
  fs.mkdirSync(sourcePath, { recursive: true });

  const userId = req.user?.id || null;
  db.prepare(
    "INSERT INTO projects (id, user_id, name, slug, source_path, description) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, userId, name, slug, sourcePath, description || "");

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  res.status(201).json(project);
});

// Delete a project
router.delete("/:id", async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as Project | undefined;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Stop ALL containers for this project (not just 'running' — catch any state)
  const deployments = db
    .prepare("SELECT container_id, port FROM deployments WHERE project_id = ? AND container_id IS NOT NULL")
    .all(req.params.id) as Array<{ container_id: string; port: number }>;

  for (const dep of deployments) {
    try {
      await stopContainer(dep.container_id);
      if (dep.port) releasePort(dep.port);
    } catch (err) {
      console.warn(`Failed to stop container during project delete:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Stop the project's database container
  try {
    await deleteDatabase(req.params.id as string);
  } catch (err) {
    console.warn(`Failed to delete database during project delete:`, err instanceof Error ? err.message : String(err));
  }

  // Delete from DB (cascades to deployments, logs, chat)
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);

  // Remove source files
  fs.rmSync(project.source_path, { recursive: true, force: true });

  res.json({ ok: true });
});

export default router;
