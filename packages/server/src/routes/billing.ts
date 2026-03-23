import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db/client.js";
import { requireAuth, getPlanLimits } from "./auth.js";
import "../types.js";

const router = Router();

const PLANS = [
  { id: "free", name: "Free", price: 0, deploys: 10, projects: 3, features: ["3 projects", "10 deploys/month", "Community support"] },
  { id: "pro", name: "Pro", price: 1900, deploys: 100, projects: -1, features: ["Unlimited projects", "100 deploys/month", "Custom domains", "Priority builds"] },
  { id: "team", name: "Team", price: 4900, deploys: 500, projects: -1, features: ["Everything in Pro", "500 deploys/month", "Database backups", "Team sharing"] },
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

  // Count deploys this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const deploysThisMonth = db.prepare(
    "SELECT COUNT(*) as cnt FROM deployments d JOIN projects p ON p.id = d.project_id WHERE p.user_id = ? AND d.created_at >= ?"
  ).get(user.id, monthStart.toISOString()) as { cnt: number };

  const projectCount = db.prepare("SELECT COUNT(*) as cnt FROM projects WHERE user_id = ?").get(user.id) as { cnt: number };

  const plan = userData?.plan || "free";
  const limits = getPlanLimits(plan);

  res.json({
    plan,
    deploysThisMonth: deploysThisMonth.cnt,
    deployLimit: limits.deploys,
    projectCount: projectCount.cnt,
    projectLimit: limits.projects,
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
        product_data: { name: `JustVibe ${plan.name}` },
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
      event = stripe.webhooks.constructEvent(JSON.stringify(req.body), sig, webhookSecret);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch {
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
