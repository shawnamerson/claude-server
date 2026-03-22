import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { getDb } from "../db/client.js";
import { requireAuth, addCredits } from "./auth.js";

const router = Router();

const CREDIT_PLANS = [
  { id: "10_credits", credits: 10, price: 500, label: "$5 — 10 credits" },
  { id: "30_credits", credits: 30, price: 1200, label: "$12 — 30 credits" },
  { id: "100_credits", credits: 100, price: 3000, label: "$30 — 100 credits" },
];

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Get available credit plans
router.get("/billing/plans", (_req: Request, res: Response) => {
  res.json(CREDIT_PLANS);
});

// Get credit history
router.get("/billing/history", requireAuth, (req: Request, res: Response) => {
  const db = getDb();
  const user = (req as any).user;
  const transactions = db
    .prepare("SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(user.id);
  res.json(transactions);
});

// Create Stripe checkout session
router.post("/billing/checkout", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(500).json({ error: "Stripe is not configured" });
    return;
  }

  const { planId } = req.body;
  const plan = CREDIT_PLANS.find((p) => p.id === planId);
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const user = (req as any).user;
  const db = getDb();

  // Get or create Stripe customer
  let customerId = (db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(user.id) as any)?.stripe_customer_id;

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
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${plan.credits} Build Credits`,
            description: `${plan.credits} credits for deploying projects`,
          },
          unit_amount: plan.price,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: user.id,
      credits: String(plan.credits),
      planId: plan.id,
    },
    success_url: `${protocol}://${domain}/projects?purchased=true`,
    cancel_url: `${protocol}://${domain}/projects`,
  });

  res.json({ url: session.url });
});

// Stripe webhook — credits are added when payment succeeds
router.post("/billing/webhook", async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(500).json({ error: "Stripe not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(
        JSON.stringify(req.body),
        sig,
        webhookSecret
      );
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    res.status(400).json({ error: "Webhook verification failed" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || "0");

    if (userId && credits > 0) {
      addCredits(userId, credits, "purchase", `Purchased ${credits} credits`);
      console.log(`Added ${credits} credits to user ${userId}`);
    }
  }

  res.json({ received: true });
});

export default router;
