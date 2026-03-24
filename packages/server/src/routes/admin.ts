import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../db/client.js";
import "../types.js";

const router = Router();

// Plan prices in cents (matching billing.ts)
const PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 1900,
  growth: 3900,
  team: 7900,
};

// Admin auth middleware — checks ADMIN_EMAILS env var
export function isAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(req.user.email.toLowerCase())) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}

// Check if current user is admin
router.get("/check", (req: Request, res: Response) => {
  if (!req.user) {
    res.json({ isAdmin: false });
    return;
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  res.json({ isAdmin: adminEmails.includes(req.user.email.toLowerCase()) });
});

// All routes below require admin auth
router.use("/stats", isAdmin);
router.use("/users", isAdmin);
router.use("/deployments", isAdmin);

// Admin emails to exclude from user counts
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
}

// GET /stats — dashboard overview
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const adminEmails = getAdminEmails();
    const excludeAdmins = adminEmails.length > 0
      ? `WHERE email NOT IN (${adminEmails.map(() => "?").join(",")})`
      : "";
    const andExcludeAdmins = adminEmails.length > 0
      ? `AND u.email NOT IN (${adminEmails.map(() => "?").join(",")})`
      : "";

    // User stats (excluding admins)
    const totalUsers = (db.prepare(`SELECT COUNT(*) as cnt FROM users ${excludeAdmins}`).get(...adminEmails) as { cnt: number }).cnt;
    const usersByPlan = db.prepare(
      `SELECT COALESCE(plan, 'free') as plan, COUNT(*) as cnt FROM users ${excludeAdmins} GROUP BY COALESCE(plan, 'free')`
    ).all(...adminEmails) as Array<{ plan: string; cnt: number }>;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString();

    const signupsToday = (db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE created_at >= ? ${adminEmails.length ? `AND email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(todayStr, ...adminEmails) as { cnt: number }).cnt;
    const signupsThisWeek = (db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE created_at >= ? ${adminEmails.length ? `AND email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(weekStr, ...adminEmails) as { cnt: number }).cnt;

    // Project stats (excluding admin projects)
    const totalProjects = (db.prepare(`SELECT COUNT(*) as cnt FROM projects p JOIN users u ON u.id = p.user_id WHERE 1=1 ${andExcludeAdmins}`).get(...adminEmails) as { cnt: number }).cnt;
    const activeProjects = (db.prepare(`SELECT COUNT(DISTINCT d.project_id) as cnt FROM deployments d JOIN projects p ON p.id = d.project_id JOIN users u ON u.id = p.user_id WHERE d.status = 'running' ${andExcludeAdmins}`).get(...adminEmails) as { cnt: number }).cnt;
    // Deployment stats
    const totalDeployments = (db.prepare("SELECT COUNT(*) as cnt FROM deployments").get() as { cnt: number }).cnt;
    const deploysToday = (db.prepare("SELECT COUNT(*) as cnt FROM deployments WHERE created_at >= ?").get(todayStr) as { cnt: number }).cnt;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStr = monthStart.toISOString();
    const deploysThisMonth = (db.prepare("SELECT COUNT(*) as cnt FROM deployments WHERE created_at >= ?").get(monthStr) as { cnt: number }).cnt;

    // Chat stats
    const chatsThisMonth = (db.prepare("SELECT COUNT(*) as cnt FROM chat_messages WHERE role = 'user' AND created_at >= ?").get(monthStr) as { cnt: number }).cnt;

    // Docker container count
    let containersRunning = 0;
    try {
      const Dockerode = (await import("dockerode")).default;
      const docker = new Dockerode();
      const containers = await docker.listContainers();
      containersRunning = containers.length;
    } catch {
      // Docker not available
    }

    // MRR estimate
    const planCounts: Record<string, number> = {};
    for (const row of usersByPlan) {
      planCounts[row.plan] = row.cnt;
    }
    let mrr = 0;
    for (const [plan, price] of Object.entries(PLAN_PRICES)) {
      mrr += (planCounts[plan] || 0) * price;
    }

    res.json({
      users: {
        total: totalUsers,
        byPlan: planCounts,
        signupsToday,
        signupsThisWeek,
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
      },
      deployments: {
        total: totalDeployments,
        today: deploysToday,
        thisMonth: deploysThisMonth,
      },
      chatsThisMonth,
      containersRunning,
      mrr, // in cents
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /users — list all users
router.get("/users", (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStr = monthStart.toISOString();

    const adminEmails = getAdminEmails();
    const adminFilter = adminEmails.length > 0
      ? `WHERE u.email NOT IN (${adminEmails.map(() => "?").join(",")})`
      : "";

    const users = db.prepare(`
      SELECT
        u.id, u.email, u.plan, u.email_verified, u.created_at,
        (SELECT COUNT(*) FROM projects WHERE user_id = u.id) as project_count,
        (SELECT COUNT(*) FROM deployments d JOIN projects p ON p.id = d.project_id WHERE p.user_id = u.id AND d.created_at >= ?) as deploys_this_month
      FROM users u
      ${adminFilter}
      ORDER BY u.created_at DESC
    `).all(monthStr, ...adminEmails) as Array<{
      id: string;
      email: string;
      plan: string;
      email_verified: number;
      created_at: string;
      project_count: number;
      deploys_this_month: number;
    }>;

    res.json(users);
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /users/:id/plan — change user plan
router.post("/users/:id/plan", (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    const validPlans = ["free", "pro", "growth", "team"];
    if (!validPlans.includes(plan)) {
      res.status(400).json({ error: "Invalid plan. Must be one of: " + validPlans.join(", ") });
      return;
    }

    const db = getDb();
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, req.params.id);
    res.json({ ok: true, plan });
  } catch (err) {
    console.error("Admin change plan error:", err);
    res.status(500).json({ error: "Failed to change plan" });
  }
});

// DELETE /users/:id — delete user and all their data
router.delete("/users/:id", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // CASCADE will handle projects, deployments, etc.
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// GET /deployments — recent deployments
router.get("/deployments", (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const deployments = db.prepare(`
      SELECT d.id, d.status, d.created_at, p.name as project_name, p.slug as project_slug
      FROM deployments d
      JOIN projects p ON p.id = d.project_id
      ORDER BY d.created_at DESC
      LIMIT 50
    `).all() as Array<{
      id: string;
      status: string;
      created_at: string;
      project_name: string;
      project_slug: string;
    }>;

    res.json(deployments);
  } catch (err) {
    console.error("Admin deployments error:", err);
    res.status(500).json({ error: "Failed to fetch deployments" });
  }
});

export default router;
