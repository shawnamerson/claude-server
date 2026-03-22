import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { config } from "../config.js";
import { Project } from "../types.js";
import { readProjectFiles } from "../services/generator.js";
import { stopContainer, releasePort } from "../services/deployer.js";
import fs from "fs";

const router = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// List all projects
router.get("/", (_req: Request, res: Response) => {
  const db = getDb();
  const projects = db
    .prepare(
      `SELECT p.*,
        (SELECT d.status FROM deployments d WHERE d.project_id = p.id ORDER BY d.created_at DESC LIMIT 1) as latest_status,
        (SELECT d.port FROM deployments d WHERE d.project_id = p.id ORDER BY d.created_at DESC LIMIT 1) as latest_port
       FROM projects p ORDER BY p.updated_at DESC`
    )
    .all();
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

  res.json({ ...project, files });
});

// Create a new project (just name + description, no upload needed)
router.post("/", (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
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

  const userId = (req as any).user?.id || null;
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

  // Stop all running containers
  const deployments = db
    .prepare("SELECT * FROM deployments WHERE project_id = ? AND container_id IS NOT NULL AND status = 'running'")
    .all(req.params.id) as Array<{ container_id: string; port: number }>;

  for (const dep of deployments) {
    try {
      await stopContainer(dep.container_id);
      if (dep.port) releasePort(dep.port);
    } catch {
      // Container may already be gone
    }
  }

  // Delete from DB (cascades to deployments, logs, chat)
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);

  // Remove source files
  fs.rmSync(project.source_path, { recursive: true, force: true });

  res.json({ ok: true });
});

export default router;
