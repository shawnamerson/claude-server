import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db/client.js";
import { requireAuth, getPlanLimits } from "./auth.js";
import "../types.js";

const router = Router();

const PLANS = [
  { id: "free", name: "Free", price: 0, deploys: 10, projects: 1, chats: 50, features: ["1 project", "10 deploys/month", "50 AI chats/month", "PostgreSQL database", "Custom subdomain"] },
  { id: "starter", name: "Starter", price: 2900, deploys: 20, projects: 1, chats: 100, features: ["1 project", "20 deploys/month", "100 AI chats/month", "GitHub import", "Custom domains", "Cron jobs"] },
  { id: "pro", name: "Pro", price: 7900, deploys: 40, projects: 3, chats: 150, features: ["3 projects", "40 deploys/month", "150 AI chats/month", "Everything in Starter", "Priority support"] },
  { id: "business", name: "Business", price: 14900, deploys: 50, projects: 10, chats: 250, features: ["10 projects", "50 deploys/month", "250 AI chats/month", "Everything in Pro", "Dedicated support"] },
];

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Get plans
router.get("/billing/plans", (_req: Request, res: Response) => {
  res.json(PLANS);
});

// Get current user billing info
router.get("/billing/status", requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const user = req.user!;

  const userData = db.prepare("SELECT plan, stripe_subscription_id, plan_expires_at, credits FROM users WHERE id = ?").get(user.id) as { plan: string; stripe_subscription_id: string | null; plan_expires_at: string | null; credits: number } | undefined;

  const projectCount = db.prepare("SELECT COUNT(*) as cnt FROM projects WHERE user_id = ?").get(user.id) as { cnt: number };

  // Use monthly_usage table (survives project deletion)
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const usage = db.prepare("SELECT deploys, chats FROM monthly_usage WHERE user_id = ? AND month = ?").get(user.id, month) as { deploys: number; chats: number } | undefined;

  const plan = userData?.plan || "free";
  const limits = getPlanLimits(plan);

  res.json({
    plan,
    deploysThisMonth: usage?.deploys || 0,
    deployLimit: limits.deploys,
    projectCount: projectCount.cnt,
    projectLimit: limits.projects,
    chatsThisMonth: usage?.chats || 0,
    chatLimit: limits.chats,
    hasSubscription: !!userData?.stripe_subscription_id,
  });
});

// Create Stripe checkout for subscription
router.post("/billing/subscribe", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(500).json({ error: "Stripe is not configured" });
    return;
  }

  const { planId } = req.body;
  const plan = PLANS.find(p => p.id === planId);
  if (!plan || plan.price === 0) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const user = req.user!;
  const db = getDb();

  // Get or create Stripe customer
  let customerId = (db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(user.id) as { stripe_customer_id: string | null } | undefined)?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
  }

  const domain = process.env.DOMAIN || "localhost";
  const protocol = domain === "localhost" ? "http" : "https";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: `VibeStack ${plan.name}` },
        unit_amount: plan.price,
        recurring: { interval: "month" },
      },
      quantity: 1,
    }],
    metadata: { userId: user.id, planId: plan.id },
    success_url: `${protocol}://${domain}/projects?subscribed=${plan.id}`,
    cancel_url: `${protocol}://${domain}/projects`,
  });

  res.json({ url: session.url });
});

// Cancel subscription
router.post("/billing/cancel", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) { res.status(500).json({ error: "Stripe not configured" }); return; }

  const db = getDb();
  const user = req.user!;
  const userData = db.prepare("SELECT stripe_subscription_id FROM users WHERE id = ?").get(user.id) as { stripe_subscription_id: string | null } | undefined;

  if (!userData?.stripe_subscription_id) {
    res.status(400).json({ error: "No active subscription" });
    return;
  }

  await stripe.subscriptions.cancel(userData.stripe_subscription_id);
  db.prepare("UPDATE users SET plan = 'free', stripe_subscription_id = NULL, plan_expires_at = NULL WHERE id = ?").run(user.id);
  res.json({ ok: true });
});

// Stripe webhook
router.post("/billing/webhook", async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) { res.status(500).json({ error: "Stripe not configured" }); return; }

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      // req.body is a raw Buffer when express.raw() is used
      const body = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      const parsed = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
      event = parsed as Stripe.Event;
    }
  } catch (err) {
    console.error("Webhook verification failed:", err instanceof Error ? err.message : String(err));
    res.status(400).json({ error: "Webhook verification failed" });
    return;
  }

  const db = getDb();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;

    if (userId && planId && session.subscription) {
      db.prepare("UPDATE users SET plan = ?, stripe_subscription_id = ? WHERE id = ?")
        .run(planId, session.subscription, userId);
      console.log(`User ${userId} subscribed to ${planId}`);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    // Find user by subscription ID
    const user = db.prepare("SELECT id FROM users WHERE stripe_subscription_id = ?").get(sub.id) as { id: string } | undefined;
    if (user) {
      db.prepare("UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE id = ?").run(user.id);
      console.log(`User ${user.id} subscription cancelled`);
    }
  }

  res.json({ received: true });
});

export default router;
