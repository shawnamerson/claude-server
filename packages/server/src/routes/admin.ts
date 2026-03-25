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

    // Anthropic API costs (from api_usage table — covers both deploys and chats)
    const apiCostsThisMonth = (db.prepare("SELECT COALESCE(SUM(cost_cents), 0) as total FROM api_usage WHERE created_at >= ?").get(monthStr) as { total: number }).total;
    const apiCostsToday = (db.prepare("SELECT COALESCE(SUM(cost_cents), 0) as total FROM api_usage WHERE created_at >= ?").get(todayStr) as { total: number }).total;
    const apiTokensThisMonth = db.prepare("SELECT COALESCE(SUM(input_tokens), 0) as input, COALESCE(SUM(output_tokens), 0) as output FROM api_usage WHERE created_at >= ?").get(monthStr) as { input: number; output: number };
    // Fallback: also include legacy deployment costs not yet in api_usage
    const legacyCosts = (db.prepare("SELECT COALESCE(SUM(cost_cents), 0) as total FROM deployments WHERE created_at >= ? AND cost_cents > 0").get(monthStr) as { total: number }).total;
    const effectiveMonthCosts = Math.max(apiCostsThisMonth, legacyCosts);

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
      apiCosts: {
        todayCents: apiCostsToday,
        monthCents: effectiveMonthCosts,
        monthInputTokens: apiTokensThisMonth.input,
        monthOutputTokens: apiTokensThisMonth.output,
      },
      events: (() => {
        const eventCounts = db.prepare("SELECT event, COUNT(*) as cnt FROM user_events WHERE created_at >= ? GROUP BY event ORDER BY cnt DESC LIMIT 20").all(monthStr) as Array<{ event: string; cnt: number }>;
        const recentEvents = db.prepare("SELECT e.event, e.meta, e.created_at, u.email FROM user_events e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 20").all() as Array<{ event: string; meta: string | null; created_at: string; email: string | null }>;
        return { counts: eventCounts, recent: recentEvents };
      })(),
      funnel: (() => {
        const landed = (db.prepare("SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE path = '/' AND created_at >= ?").get(monthStr) as { cnt: number }).cnt;
        const viewedSignup = (db.prepare("SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE path = '/signup' AND created_at >= ?").get(monthStr) as { cnt: number }).cnt;
        const signedUp = (db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE created_at >= ? ${adminEmails.length ? `AND email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(monthStr, ...adminEmails) as { cnt: number }).cnt;
        const createdProject = (db.prepare(`SELECT COUNT(DISTINCT p.user_id) as cnt FROM projects p JOIN users u ON u.id = p.user_id WHERE p.created_at >= ? ${adminEmails.length ? `AND u.email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(monthStr, ...adminEmails) as { cnt: number }).cnt;
        const deployed = (db.prepare(`SELECT COUNT(DISTINCT p.user_id) as cnt FROM deployments d JOIN projects p ON p.id = d.project_id JOIN users u ON u.id = p.user_id WHERE d.created_at >= ? ${adminEmails.length ? `AND u.email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(monthStr, ...adminEmails) as { cnt: number }).cnt;
        const successfulDeploy = (db.prepare(`SELECT COUNT(DISTINCT p.user_id) as cnt FROM deployments d JOIN projects p ON p.id = d.project_id JOIN users u ON u.id = p.user_id WHERE d.status = 'running' AND d.created_at >= ? ${adminEmails.length ? `AND u.email NOT IN (${adminEmails.map(() => "?").join(",")})` : ""}`).get(monthStr, ...adminEmails) as { cnt: number }).cnt;
        return [
          { step: "Landed", count: landed },
          { step: "Viewed Signup", count: viewedSignup },
          { step: "Signed Up", count: signedUp },
          { step: "Created Project", count: createdProject },
          { step: "Deployed", count: deployed },
          { step: "Live App", count: successfulDeploy },
        ];
      })(),
      analytics: (() => {
        const pvToday = (db.prepare("SELECT COUNT(*) as cnt FROM page_views WHERE created_at >= ?").get(todayStr) as { cnt: number }).cnt;
        const pvMonth = (db.prepare("SELECT COUNT(*) as cnt FROM page_views WHERE created_at >= ?").get(monthStr) as { cnt: number }).cnt;
        const uvToday = (db.prepare("SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE created_at >= ?").get(todayStr) as { cnt: number }).cnt;
        const uvMonth = (db.prepare("SELECT COUNT(DISTINCT visitor_id) as cnt FROM page_views WHERE created_at >= ?").get(monthStr) as { cnt: number }).cnt;
        const topPages = db.prepare("SELECT path, COUNT(*) as views FROM page_views WHERE created_at >= ? GROUP BY path ORDER BY views DESC LIMIT 10").all(monthStr) as Array<{ path: string; views: number }>;
        const topReferrers = db.prepare("SELECT referrer, COUNT(*) as cnt FROM page_views WHERE created_at >= ? AND referrer != '' AND referrer IS NOT NULL GROUP BY referrer ORDER BY cnt DESC LIMIT 10").all(monthStr) as Array<{ referrer: string; cnt: number }>;
        const dailyViews = db.prepare("SELECT date(created_at) as day, COUNT(*) as views, COUNT(DISTINCT visitor_id) as visitors FROM page_views WHERE created_at >= ? GROUP BY date(created_at) ORDER BY day DESC LIMIT 30").all(monthStr) as Array<{ day: string; views: number; visitors: number }>;
        return { pvToday, pvMonth, uvToday, uvMonth, topPages, topReferrers, dailyViews };
      })(),
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /users — list all users
router.get("/users", async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStr = monthStart.toISOString();
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const adminEmails = getAdminEmails();
    const adminFilter = adminEmails.length > 0
      ? `WHERE u.email NOT IN (${adminEmails.map(() => "?").join(",")})`
      : "";

    const users = db.prepare(`
      SELECT
        u.id, u.email, u.plan, u.email_verified, u.created_at,
        (SELECT COUNT(*) FROM projects WHERE user_id = u.id) as project_count,
        COALESCE((SELECT deploys FROM monthly_usage WHERE user_id = u.id AND month = ?), 0) as deploys_this_month,
        COALESCE((SELECT chats FROM monthly_usage WHERE user_id = u.id AND month = ?), 0) as chats_this_month,
        COALESCE((SELECT SUM(d2.cost_cents) FROM deployments d2
          JOIN projects p2 ON d2.project_id = p2.id
          WHERE p2.user_id = u.id AND d2.created_at >= ?), 0) as api_cost_cents_month,
        COALESCE((SELECT SUM(d3.cost_cents) FROM deployments d3
          JOIN projects p3 ON d3.project_id = p3.id
          WHERE p3.user_id = u.id), 0) as api_cost_cents_total,
        (SELECT COUNT(*) FROM deployments d4
          JOIN projects p4 ON d4.project_id = p4.id
          WHERE p4.user_id = u.id AND d4.status = 'running' AND d4.container_id IS NOT NULL) as running_containers
      FROM users u
      ${adminFilter}
      ORDER BY u.created_at DESC
    `).all(currentMonth, currentMonth, monthStr, ...adminEmails) as Array<{
      id: string;
      email: string;
      plan: string;
      email_verified: number;
      created_at: string;
      project_count: number;
      deploys_this_month: number;
      chats_this_month: number;
      api_cost_cents_month: number;
      api_cost_cents_total: number;
      running_containers: number;
    }>;

    // Calculate server cost share weighted by actual memory usage
    const SERVER_COST_CENTS = 999;
    const memoryByUser = new Map<string, number>();

    try {
      const Dockerode = (await import("dockerode")).default;
      const docker = new Dockerode();

      // Get memory usage for all running app containers
      const containers = await docker.listContainers({
        filters: { label: ["claude-server=true", "claude-server.deployment"] },
      });

      for (const c of containers) {
        const depId = c.Labels["claude-server.deployment"];
        if (!depId) continue;

        // Look up which user owns this deployment
        const dep = db.prepare(
          "SELECT p.user_id FROM deployments d JOIN projects p ON d.project_id = p.id WHERE d.id = ?"
        ).get(depId) as { user_id: string } | undefined;
        if (!dep) continue;

        try {
          const stats = await docker.getContainer(c.Id).stats({ stream: false });
          const memBytes = stats.memory_stats?.usage || 0;
          memoryByUser.set(dep.user_id, (memoryByUser.get(dep.user_id) || 0) + memBytes);
        } catch {
          // Container may have stopped between list and stats
        }
      }
    } catch {
      // Docker not available — fall back to even split
    }

    const totalMemory = Array.from(memoryByUser.values()).reduce((sum, m) => sum + m, 0) || 1;

    const usersWithCost = users.map(u => {
      const userMemory = memoryByUser.get(u.id) || 0;
      const memoryShare = userMemory / totalMemory;
      const serverCost = u.running_containers > 0 ? Math.round(memoryShare * SERVER_COST_CENTS) : 0;
      return {
        ...u,
        memory_mb: Math.round(userMemory / 1024 / 1024),
        server_cost_cents_month: serverCost,
        total_cost_cents_month: u.api_cost_cents_month + serverCost,
      };
    });

    res.json(usersWithCost);
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
