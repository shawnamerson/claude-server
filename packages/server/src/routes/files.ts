import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { getDb } from "../db/client.js";
import { Project } from "../types.js";

const router = Router();

// Get file tree for a project
router.get("/projects/:id/files", (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id as string) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const tree = walkTree(project.source_path);
  res.json(tree);
});

// Read a single file
router.get("/projects/:id/files/*", (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id as string) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Extract file path from the wildcard — everything after /files/
  const url = req.originalUrl;
  const filesPrefix = `/api/projects/${req.params.id}/files/`;
  const filePath = decodeURIComponent(url.slice(url.indexOf(filesPrefix) + filesPrefix.length));
  if (!filePath) { res.status(400).json({ error: "File path required" }); return; }

  const fullPath = path.join(project.source_path, filePath);

  // Prevent directory traversal
  if (!fullPath.startsWith(project.source_path)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    res.json({ path: filePath, content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Update a single file
router.put("/projects/:id/files/*", (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id as string) as Project | undefined;
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const url = req.originalUrl;
  const filesPrefix = `/api/projects/${req.params.id}/files/`;
  const filePath = decodeURIComponent(url.slice(url.indexOf(filesPrefix) + filesPrefix.length));
  if (!filePath) { res.status(400).json({ error: "File path required" }); return; }

  const { content } = req.body;
  if (typeof content !== "string") {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const fullPath = path.join(project.source_path, filePath);
  if (!fullPath.startsWith(project.source_path)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);

  res.json({ ok: true });
});

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv", "dist", "build", ".cache"]);

function walkTree(dir: string, prefix = ""): FileNode[] {
  const nodes: FileNode[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })) {
      if (SKIP.has(entry.name)) continue;
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children: walkTree(path.join(dir, entry.name), relPath),
        });
      } else {
        nodes.push({ name: entry.name, path: relPath, type: "file" });
      }
    }
  } catch { /* skip */ }
  return nodes;
}

export default router;
