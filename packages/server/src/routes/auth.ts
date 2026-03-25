import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail, notifyNewSignup } from "../services/email.js";
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
  const verificationCode = crypto.randomInt(100000, 999999).toString(); // 6-digit code

  db.prepare("INSERT INTO users (id, email, password, name, credits, email_verified, verification_code) VALUES (?, ?, ?, ?, 3, 0, ?)").run(
    id, email.toLowerCase().trim(), hashed, name || "", verificationCode
  );

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
  const newCode = crypto.randomInt(100000, 999999).toString();
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
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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
  const db = getDb();
  const userData = db.prepare("SELECT github_token FROM users WHERE id = ?").get(user.id) as { github_token: string | null } | undefined;
  res.json({ id: user.id, email: user.email, name: user.name, credits: user.credits, email_verified: !!user.email_verified, has_github_token: !!userData?.github_token });
});

// Save GitHub token on user account
router.post("/auth/github-token", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const { token } = req.body;
  const db = getDb();
  const { encrypt } = require("../services/encrypt.js");
  db.prepare("UPDATE users SET github_token = ? WHERE id = ?").run(encrypt(token), user.id);
  res.json({ ok: true });
});

// Delete GitHub token
router.delete("/auth/github-token", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const db = getDb();
  db.prepare("UPDATE users SET github_token = NULL WHERE id = ?").run(user.id);
  res.json({ ok: true });
});

// Forgot password — send reset code
router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: "Email is required" }); return; }

  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim()) as { id: string } | undefined;

  // Always return success to avoid email enumeration
  if (!user) { res.json({ ok: true }); return; }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
  db.prepare("UPDATE users SET reset_code = ?, reset_code_expires = ? WHERE id = ?").run(code, expires, user.id);

  await sendPasswordResetEmail(email.toLowerCase().trim(), code);
  res.json({ ok: true });
});

// Reset password — verify code and set new password
router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const { email, code, password } = req.body;
  if (!email || !code || !password) { res.status(400).json({ error: "Email, code, and new password are required" }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

  const db = getDb();
  const user = db.prepare("SELECT id, reset_code, reset_code_expires FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as { id: string; reset_code: string | null; reset_code_expires: string | null } | undefined;

  if (!user || !user.reset_code || user.reset_code !== code) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  if (user.reset_code_expires && new Date(user.reset_code_expires) < new Date()) {
    res.status(400).json({ error: "Reset code has expired. Please request a new one." });
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  db.prepare("UPDATE users SET password = ?, reset_code = NULL, reset_code_expires = NULL WHERE id = ?").run(hashed, user.id);

  res.json({ ok: true });
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

// Short-lived SSE tokens — maps sseToken -> userId, expires after 60s
const sseTokens = new Map<string, { userId: string; expires: number }>();

// Exchange session token for a short-lived SSE token (safe for query params)
router.post("/auth/sse-token", (req: Request, res: Response) => {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const sseToken = nanoid(32);
  sseTokens.set(sseToken, { userId: user.id, expires: Date.now() + 60000 }); // 60 seconds
  res.json({ token: sseToken });
});

// Clean up expired SSE tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of sseTokens) {
    if (val.expires < now) sseTokens.delete(key);
  }
}, 5 * 60 * 1000);

// Middleware: attach user to request if authenticated
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Support token via Authorization header or ?token= query param (for SSE/EventSource)
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.query.token as string);
  if (!token) { next(); return; }

  // Check if it's a short-lived SSE token first
  const sseEntry = sseTokens.get(token);
  if (sseEntry) {
    if (sseEntry.expires < Date.now()) {
      sseTokens.delete(token);
      next();
      return;
    }
    // SSE tokens are single-use for the connection lifetime — don't delete here
    // since SSE may reconnect with the same token within the 60s window
    const db = getDb();
    const user = db.prepare("SELECT id, email, name, credits, email_verified FROM users WHERE id = ?").get(sseEntry.userId) as Request["user"];
    req.user = user;
    next();
    return;
  }

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
  const project = db.prepare("SELECT user_id, team_id FROM projects WHERE id = ?").get(projectId) as { user_id: string | null; team_id: string | null } | undefined;

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Allow access if project has no owner (legacy) or user is the owner
  if (!project.user_id || project.user_id === user.id) {
    next();
    return;
  }

  // Allow access if the project belongs to a team the user is a member of
  if (project.team_id) {
    const membership = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(project.team_id, user.id);
    if (membership) {
      next();
      return;
    }
  }

  res.status(403).json({ error: "Access denied" });
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
    "SELECT d.project_id, p.user_id, p.team_id FROM deployments d JOIN projects p ON p.id = d.project_id WHERE d.id = ?"
  ).get(deploymentId) as { project_id: string; user_id: string | null; team_id: string | null } | undefined;

  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  // Allow if no owner (legacy) or user is the owner
  if (!dep.user_id || dep.user_id === user.id) {
    next();
    return;
  }

  // Allow if project belongs to a team the user is in
  if (dep.team_id) {
    const membership = db.prepare("SELECT id FROM team_members WHERE team_id = ? AND user_id = ?").get(dep.team_id, user.id);
    if (membership) {
      next();
      return;
    }
  }

  res.status(403).json({ error: "Access denied" });
}

// Plan limits
const PLAN_LIMITS: Record<string, { deploys: number; projects: number; chats: number }> = {
  free:     { deploys: 10,  projects: 1,  chats: 50 },
  starter:  { deploys: 20,  projects: 1,  chats: 100 },
  pro:      { deploys: 40,  projects: 3,  chats: 150 },
  business: { deploys: 50,  projects: 10, chats: 250 }, // -1 = unlimited
};

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// Get current month key (YYYY-MM)
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Get usage for a user this month
function getMonthlyUsage(userId: string): { deploys: number; chats: number } {
  const db = getDb();
  const month = currentMonth();
  const row = db.prepare("SELECT deploys, chats FROM monthly_usage WHERE user_id = ? AND month = ?").get(userId, month) as { deploys: number; chats: number } | undefined;
  return row || { deploys: 0, chats: 0 };
}

// Increment deploy or chat count for a user
export function incrementUsage(userId: string, type: "deploys" | "chats"): void {
  const db = getDb();
  const month = currentMonth();
  db.prepare(
    `INSERT INTO monthly_usage (user_id, month, ${type}) VALUES (?, ?, 1)
     ON CONFLICT(user_id, month) DO UPDATE SET ${type} = ${type} + 1`
  ).run(userId, month);
}

// Check if user can deploy (plan-based + email verification)
export function canDeploy(userId: string): { allowed: boolean; reason?: string } {
  const db = getDb();
  const user = db.prepare("SELECT plan, email_verified FROM users WHERE id = ?").get(userId) as { plan: string; email_verified: number } | undefined;
  if (!user) return { allowed: false, reason: "User not found" };
  if (!user.email_verified) return { allowed: false, reason: "Please verify your email before deploying" };

  const limits = getPlanLimits(user.plan);
  const usage = getMonthlyUsage(userId);

  if (limits.deploys >= 0 && usage.deploys >= limits.deploys) {
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
  const usage = getMonthlyUsage(userId);

  if (limits.chats >= 0 && usage.chats >= limits.chats) {
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
