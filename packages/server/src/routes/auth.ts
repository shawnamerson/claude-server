import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDb } from "../db/client.js";

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

  const id = nanoid(12);
  const hashed = await bcrypt.hash(password, 10);

  db.prepare("INSERT INTO users (id, email, password, name, credits) VALUES (?, ?, ?, ?, 3)").run(
    id, email.toLowerCase().trim(), hashed, name || ""
  );

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, id, expiresAt);

  // Log credit transaction
  db.prepare("INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, 3, 'signup', 'Welcome bonus')").run(id);

  res.json({
    token: sessionId,
    user: { id, email, name: name || "", credits: 3 },
  });
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
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, credits: user.credits });
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
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) { next(); return; }

  const db = getDb();
  const session = db.prepare(
    "SELECT s.user_id, s.expires_at FROM sessions s WHERE s.id = ?"
  ).get(token) as { user_id: string; expires_at: string } | undefined;

  if (!session || new Date(session.expires_at) < new Date()) {
    next();
    return;
  }

  const user = db.prepare("SELECT id, email, name, credits FROM users WHERE id = ?").get(session.user_id);
  (req as any).user = user;
  next();
}

// Middleware: require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Deduct credits for a deploy
export function deductCredit(userId: string, description: string): boolean {
  const db = getDb();
  const user = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as { credits: number } | undefined;
  if (!user || user.credits <= 0) return false;

  db.prepare("UPDATE users SET credits = credits - 1 WHERE id = ?").run(userId);
  db.prepare("INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, -1, 'deploy', ?)").run(userId, description);
  return true;
}

// Add credits
export function addCredits(userId: string, amount: number, type: string, description: string) {
  const db = getDb();
  db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(amount, userId);
  db.prepare("INSERT INTO credit_transactions (user_id, amount, type, description) VALUES (?, ?, ?, ?)").run(userId, amount, type, description);
}

export default router;
