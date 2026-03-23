import { useState, useEffect } from "react";
import { api } from "../api/client";
import { useToast } from "../components/Toast";

const s = {
  page: { maxWidth: "800px", padding: "0.5rem 1.5rem" },
  title: { fontSize: "1.3rem", fontWeight: 700, marginBottom: "1.5rem" },
  statusCard: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" },
  statusRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" },
  statusLabel: { color: "#888", fontSize: "0.85rem" },
  statusValue: { color: "#e0e0e0", fontSize: "0.85rem", fontWeight: 600 },
  planBadge: (active: boolean) => ({ display: "inline-block", padding: "0.2rem 0.6rem", background: active ? "#7c3aed20" : "#1a1a2e", color: active ? "#a78bfa" : "#666", borderRadius: "9999px", fontSize: "0.8rem", fontWeight: 600 }),
  progressBar: { height: "6px", background: "#1e1e30", borderRadius: "3px", marginTop: "0.25rem", marginBottom: "0.75rem" },
  progressFill: (pct: number) => ({ height: "100%", background: pct > 80 ? "#f59e0b" : "#7c3aed", borderRadius: "3px", width: `${Math.min(pct, 100)}%`, transition: "width 0.3s" }),
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" },
  card: (current: boolean) => ({ background: "#12121a", border: `1px solid ${current ? "#7c3aed" : "#1e1e30"}`, borderRadius: "0.75rem", padding: "1.5rem", position: "relative" as const }),
  cardName: { fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" },
  cardPrice: { fontSize: "1.8rem", fontWeight: 800, color: "#e0e0e0", marginBottom: "0.15rem" },
  cardPer: { fontSize: "0.8rem", color: "#666", marginBottom: "1rem" },
  featureList: { listStyle: "none", padding: 0, margin: "0 0 1.25rem 0" },
  feature: { padding: "0.25rem 0", fontSize: "0.85rem", color: "#aaa" },
  btn: (primary: boolean) => ({ width: "100%", padding: "0.6rem", background: primary ? "#7c3aed" : "transparent", color: primary ? "#fff" : "#888", border: primary ? "none" : "1px solid #1e1e30", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }),
  currentBadge: { position: "absolute" as const, top: "-8px", right: "12px", background: "#7c3aed", color: "#fff", padding: "0.15rem 0.5rem", borderRadius: "9999px", fontSize: "0.7rem", fontWeight: 600 },
};

export default function Billing() {
  const { showError } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getBillingStatus(), api.getBillingPlans()])
      .then(([s, p]) => { setStatus(s); setPlans(p); })
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId: string) => {
    try {
      const { url } = await api.subscribe(planId);
      window.location.href = url;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll be downgraded to Free at the end of the billing period.")) return;
    try {
      await api.cancelSubscription();
      setStatus((s: any) => ({ ...s, plan: "free", hasSubscription: false }));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  if (loading) return <div style={{ color: "#666", padding: "2rem" }}>Loading...</div>;

  const deployPct = status ? (status.deploysThisMonth / status.deployLimit) * 100 : 0;

  return (
    <div style={s.page}>
      <h1 style={s.title}>Billing</h1>

      {status && (
        <div style={s.statusCard}>
          <div style={s.statusRow}>
            <span style={s.statusLabel}>Current plan</span>
            <span style={s.planBadge(true)}>{status.plan.charAt(0).toUpperCase() + status.plan.slice(1)}</span>
          </div>
          <div style={s.statusRow}>
            <span style={s.statusLabel}>Deploys this month</span>
            <span style={s.statusValue}>{status.deploysThisMonth} / {status.deployLimit}</span>
          </div>
          <div style={s.progressBar}>
            <div style={s.progressFill(deployPct)} />
          </div>
          <div style={s.statusRow}>
            <span style={s.statusLabel}>Projects</span>
            <span style={s.statusValue}>{status.projectCount}{status.projectLimit > 0 ? ` / ${status.projectLimit}` : ""}</span>
          </div>
        </div>
      )}

      <div style={s.grid}>
        {plans.map(plan => {
          const isCurrent = status?.plan === plan.id;
          return (
            <div key={plan.id} style={s.card(isCurrent)}>
              {isCurrent && <div style={s.currentBadge}>Current</div>}
              <div style={s.cardName}>{plan.name}</div>
              <div style={s.cardPrice}>{plan.price === 0 ? "Free" : `$${plan.price / 100}`}</div>
              <div style={s.cardPer}>{plan.price > 0 ? "per month" : "forever"}</div>
              <ul style={s.featureList}>
                {plan.features.map((f: string, i: number) => (
                  <li key={i} style={s.feature}>+ {f}</li>
                ))}
              </ul>
              {isCurrent ? (
                status.hasSubscription ? (
                  <button style={s.btn(false)} onClick={handleCancel}>Cancel plan</button>
                ) : (
                  <button style={s.btn(false)} disabled>Current plan</button>
                )
              ) : plan.price > 0 ? (
                <button style={s.btn(true)} onClick={() => handleSubscribe(plan.id)}>
                  Upgrade to {plan.name}
                </button>
              ) : (
                <button style={s.btn(false)} disabled>Free tier</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
