import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { sendVerificationEmail, sendWelcomeEmail, notifyNewSignup } from "../services/email.js";
import "../types.js";

const router = Router();

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  credits: number;
  stripe_customer_id: string | null;
  created_at: string;
}

// Signup
router.post("/auth/signup", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const id = nanoid(12);
  const hashed = await bcrypt.hash(password, 10);
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code

  db.prepare("INSERT INTO users (id, email, password, name, credits, email_verified, verification_code) VALUES (?, ?, ?, ?, 3, 0, ?)").run(
    id, email.toLowerCase().trim(), hashed, name || "", verificationCode
  );

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, id, expiresAt);

  db.prepare("INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, 3, 'signup', 'Welcome bonus')").run(id);

  // Send verification email (falls back to console.log if RESEND_API_KEY not set)
  sendVerificationEmail(email.toLowerCase().trim(), verificationCode);
  notifyNewSignup(email.toLowerCase().trim());

  res.json({
    token: sessionId,
    user: { id, email, name: name || "", credits: 3, email_verified: false },
  });
});

// Verify email
router.post("/auth/verify", (req: Request, res: Response) => {
  const { code } = req.body;
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const db = getDb();
  const userData = db.prepare("SELECT verification_code, email_verified FROM users WHERE id = ?").get(user.id) as { verification_code: string | null; email_verified: number } | undefined;

  if (userData?.email_verified) {
    res.json({ ok: true, message: "Already verified" });
    return;
  }

  if (!code || code !== userData?.verification_code) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }

  db.prepare("UPDATE users SET email_verified = 1, verification_code = NULL WHERE id = ?").run(user.id);
  sendWelcomeEmail(user.email);
  res.json({ ok: true });
});

// Resend verification code
router.post("/auth/resend-code", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const db = getDb();
  const userData = db.prepare("SELECT email, email_verified, verification_code FROM users WHERE id = ?").get(user.id) as { email: string; email_verified: number; verification_code: string | null } | undefined;

  if (userData?.email_verified) {
    res.json({ ok: true, message: "Already verified" });
    return;
  }

  // Generate a new code
  const newCode = Math.floor(100000 + Math.random() * 900000).toString();
  db.prepare("UPDATE users SET verification_code = ? WHERE id = ?").run(newCode, user.id);
  sendVerificationEmail(userData!.email, newCode);

  res.json({ ok: true, message: "Verification code sent" });
});

// Login
router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim()) as User | undefined;
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, user.id, expiresAt);

  res.json({
    token: sessionId,
    user: { id: user.id, email: user.email, name: user.name, credits: user.credits },
  });
});

// Get current user
router.get("/auth/me", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, credits: user.credits, email_verified: !!user.email_verified });
});

// Logout
router.post("/auth/logout", (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    const db = getDb();
    db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
  }
  res.json({ ok: true });
});

// Middleware: attach user to request if authenticated
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Support token via Authorization header or ?token= query param (for SSE/EventSource)
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.query.token as string);
  if (!token) { next(); return; }

  const db = getDb();
  const session = db.prepare(
    "SELECT s.user_id, s.expires_at FROM sessions s WHERE s.id = ?"
  ).get(token) as { user_id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at) < new Date()) {
    next();
    return;
  }

  const user = db.prepare("SELECT id, email, name, credits, email_verified FROM users WHERE id = ?").get(session.user_id) as Request["user"];
  req.user = user;
  next();
}

// Middleware: require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Middleware: require auth + verify user owns the project referenced by :id or :projectId
export function requireProjectOwner(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const projectId = req.params.id || req.params.projectId;
  if (!projectId) {
    next();
    return;
  }

  const db = getDb();
  const project = db.prepare("SELECT user_id FROM projects WHERE id = ?").get(projectId) as { user_id: string | null } | undefined;

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Allow access if project has no owner (legacy) or user is the owner
  if (project.user_id && project.user_id !== user.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  next();
}

// Middleware: require auth + verify user owns the deployment referenced by :id (via its project)
export function requireDeploymentOwner(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const deploymentId = req.params.id;
  if (!deploymentId) {
    next();
    return;
  }

  const db = getDb();
  const dep = db.prepare(
    "SELECT d.project_id, p.user_id FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.id = ?"
  ).get(deploymentId) as { project_id: string; user_id: string | null } | undefined;

  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (dep.user_id && dep.user_id !== user.id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  next();
}

// Plan limits
const PLAN_LIMITS: Record<string, { deploys: number; projects: number; chats: number }> = {
  free:   { deploys: 20,   projects: 1,  chats: 1000 },
  pro:    { deploys: 100,  projects: 5,  chats: 5000 },
  growth: { deploys: 300,  projects: 20, chats: 15000 },
  team:   { deploys: 1000, projects: -1, chats: 50000 }, // -1 = unlimited
};

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// Check if user can deploy (plan-based + email verification)
export function canDeploy(userId: string): { allowed: boolean; reason?: string } {
  const db = getDb();
  const user = db.prepare("SELECT plan, email_verified FROM users WHERE id = ?").get(userId) as { plan: string; email_verified: number } | undefined;
  if (!user) return { allowed: false, reason: "User not found" };
  if (!user.email_verified) return { allowed: false, reason: "Please verify your email before deploying" };

  const limits = getPlanLimits(user.plan);

  // Count deploys this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const deploysThisMonth = db.prepare(
    "SELECT COUNT(*) as cnt FROM deployments d JOIN projects p ON p.id = d.project_id WHERE p.user_id = ? AND d.created_at >= ?"
  ).get(userId, monthStart.toISOString()) as { cnt: number };

  if (deploysThisMonth.cnt >= limits.deploys) {
    return { allowed: false, reason: `Monthly deploy limit reached (${limits.deploys}). Upgrade your plan for more.` };
  }

  return { allowed: true };
}

// Check if user can create a project (plan-based + email verification)
export function canCreateProject(userId: string): { allowed: boolean; reason?: string } {
  const db = getDb();
  const user = db.prepare("SELECT plan, email_verified FROM users WHERE id = ?").get(userId) as { plan: string; email_verified: number } | undefined;
  if (!user) return { allowed: false, reason: "User not found" };
  if (!user.email_verified) return { allowed: false, reason: "Please verify your email before creating a project" };

  const limits = getPlanLimits(user.plan);
  if (limits.projects === -1) return { allowed: true };

  const projectCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM projects WHERE user_id = ?"
  ).get(userId) as { cnt: number };

  if (projectCount.cnt >= limits.projects) {
    return { allowed: false, reason: `Project limit reached (${limits.projects}). Upgrade your plan for more.` };
  }

  return { allowed: true };
}

// Check if user can chat (plan-based)
export function canChat(userId: string): { allowed: boolean; reason?: string } {
  const db = getDb();
  const user = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string } | undefined;
  if (!user) return { allowed: false, reason: "User not found" };

  const limits = getPlanLimits(user.plan);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const chatsThisMonth = db.prepare(
    "SELECT COUNT(*) as cnt FROM chat_messages cm JOIN projects p ON p.id = cm.project_id WHERE p.user_id = ? AND cm.role = 'user' AND cm.created_at >= ?"
  ).get(userId, monthStart.toISOString()) as { cnt: number };

  if (chatsThisMonth.cnt >= limits.chats) {
    return { allowed: false, reason: `Monthly chat limit reached (${limits.chats.toLocaleString()}). Upgrade your plan for more.` };
  }

  return { allowed: true };
}

// Legacy — keep for backward compat
export function deductCredit(userId: string, _description: string): boolean {
  const result = canDeploy(userId);
  return result.allowed;
}

export function addCredits(userId: string, amount: number, type: string, description: string) {
  const db = getDb();
  db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(amount, userId);
  db.prepare("INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)").run(userId, amount, type, description);
}

export default router;
