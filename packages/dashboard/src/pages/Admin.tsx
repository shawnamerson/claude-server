import { useState, useEffect, useCallback } from "react";

interface Stats {
  users: { total: number; byPlan: Record<string, number>; signupsToday: number; signupsThisWeek: number };
  projects: { total: number; active: number };
  deployments: { total: number; today: number; thisMonth: number };
  chatsThisMonth: number;
  containersRunning: number;
  mrr: number;
  apiCosts: { todayCents: number; monthCents: number; monthInputTokens: number; monthOutputTokens: number };
  events: {
    counts: Array<{ event: string; cnt: number }>;
    recent: Array<{ event: string; meta: string | null; created_at: string; email: string | null }>;
  };
  funnel: Array<{ step: string; count: number }>;
  analytics: {
    pvToday: number; pvMonth: number; uvToday: number; uvMonth: number;
    topPages: Array<{ path: string; views: number }>;
    topReferrers: Array<{ referrer: string; cnt: number }>;
    dailyViews: Array<{ day: string; views: number; visitors: number }>;
  };
}

interface AdminUser {
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
  server_cost_cents_month: number;
  total_cost_cents_month: number;
}

interface AdminDeployment {
  id: string;
  status: string;
  created_at: string;
  project_name: string;
  project_slug: string;
}

const COLORS = {
  bg: "#0a0a0f",
  card: "#12121a",
  border: "#1e1e30",
  text: "#e0e0e0",
  textMuted: "#888",
  accent: "#7c3aed",
};

const PLAN_COLORS: Record<string, string> = {
  free: "#6b7280",
  pro: "#3b82f6",
  growth: "#10b981",
  team: "#f59e0b",
};

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = (window as any).__authToken;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_COLORS: Record<string, string> = {
  running: "#10b981",

  building: "#f59e0b",
  deploying: "#f59e0b",
  pending: "#6b7280",
  generating: "#f59e0b",
  failed: "#ef4444",
  stopped: "#6b7280",
};

export default function Admin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [deployments, setDeployments] = useState<AdminDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, usersRes, deploysRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: getHeaders() }),
        fetch("/api/admin/users", { headers: getHeaders() }),
        fetch("/api/admin/deployments", { headers: getHeaders() }),
      ]);

      if (!statsRes.ok || !usersRes.ok || !deploysRes.ok) {
        setError("Failed to load admin data. Are you an admin?");
        setLoading(false);
        return;
      }

      setStats(await statsRes.json());
      setUsers(await usersRes.json());
      setDeployments(await deploysRes.json());
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const changePlan = async (userId: string, plan: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
      // Refresh stats
      const statsRes = await fetch("/api/admin/stats", { headers: getHeaders() });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      alert("Failed to change plan");
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This will remove all their projects and deployments.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      // Refresh stats
      const statsRes = await fetch("/api/admin/stats", { headers: getHeaders() });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {
      alert("Failed to delete user");
    }
  };

  if (loading) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted }}>
        Loading admin dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontSize: "1.1rem" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, padding: "2rem", overflowY: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
          <button
            onClick={fetchData}
            style={{ background: COLORS.accent, color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="vs-admin-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
            <StatCard label="Total Users" value={stats.users.total} sub={`+${stats.users.signupsToday} today, +${stats.users.signupsThisWeek} this week`} />
            <StatCard label="Active Projects" value={stats.projects.active} sub={`${stats.projects.total} total`} />
            <StatCard label="Deploys Today" value={stats.deployments.today} sub={`${stats.deployments.thisMonth} this month, ${stats.deployments.total} total`} />
            <StatCard label="MRR" value={`$${(stats.mrr / 100).toFixed(0)}`} sub={`${stats.containersRunning} containers, ${stats.chatsThisMonth} chats/mo`} />
            <StatCard label="API Costs" value={`$${(stats.apiCosts.monthCents / 100).toFixed(2)}`} sub={`$${(stats.apiCosts.todayCents / 100).toFixed(2)} today, ${((stats.apiCosts.monthInputTokens + stats.apiCosts.monthOutputTokens) / 1000000).toFixed(1)}M tokens`} />
          </div>
        )}

        {/* Plan breakdown */}
        {stats && (
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            {["free", "pro", "growth", "team"].map((plan) => (
              <span
                key={plan}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: "0.5rem",
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.8rem",
                  color: PLAN_COLORS[plan],
                }}
              >
                {plan}: {stats.users.byPlan[plan] || 0}
              </span>
            ))}
          </div>
        )}

        {/* Users Table */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "0.75rem", marginBottom: "2rem", overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, fontSize: "0.95rem" }}>
            Users ({users.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 1rem" }}>Email</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Plan</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Verified</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Projects</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Deploys</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Chats</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Containers</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>API cost</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Server cost</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Total/mo</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Joined</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "0.6rem 1rem", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <select
                        value={u.plan || "free"}
                        onChange={(e) => changePlan(u.id, e.target.value)}
                        style={{
                          background: "#1a1a2e",
                          color: PLAN_COLORS[u.plan || "free"],
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: "0.35rem",
                          padding: "0.2rem 0.4rem",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="growth">growth</option>
                        <option value="team">team</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", color: u.email_verified ? "#10b981" : "#ef4444" }}>
                      {u.email_verified ? "Yes" : "No"}
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>{u.project_count}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>{u.deploys_this_month}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>{u.chats_this_month}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>{u.running_containers}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: u.api_cost_cents_month > 0 ? "#f59e0b" : COLORS.textMuted }}>${(u.api_cost_cents_month / 100).toFixed(2)}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: u.server_cost_cents_month > 0 ? "#f59e0b" : COLORS.textMuted }}>${(u.server_cost_cents_month / 100).toFixed(2)}</td>
                    <td style={{ padding: "0.6rem 0.5rem", fontWeight: 600, color: u.total_cost_cents_month > 0 ? "#ef4444" : COLORS.textMuted }}>${(u.total_cost_cents_month / 100).toFixed(2)}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: COLORS.textMuted }}>{timeAgo(u.created_at)}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        style={{
                          background: "none",
                          border: "1px solid #ef444444",
                          color: "#ef4444",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.35rem",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversion Funnel */}
        {stats && stats.funnel && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "0.75rem", marginBottom: "2rem", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, fontSize: "0.95rem" }}>
              Conversion Funnel <span style={{ color: COLORS.textMuted, fontWeight: 400, fontSize: "0.8rem" }}>(this month)</span>
            </div>
            <div style={{ padding: "1rem 1.25rem" }}>
              {(() => {
                const max = Math.max(...stats.funnel.map(f => f.count), 1);
                return stats.funnel.map((step, i) => {
                  const prev = i > 0 ? stats.funnel[i - 1].count : step.count;
                  const rate = prev > 0 ? Math.round((step.count / prev) * 100) : 0;
                  const width = Math.max((step.count / max) * 100, 3);
                  return (
                    <div key={i} style={{ marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                        <span style={{ color: "#ccc" }}>{step.step}</span>
                        <span style={{ color: COLORS.textMuted }}>
                          {step.count}
                          {i > 0 && <span style={{ color: rate >= 50 ? "#34d399" : rate >= 20 ? "#f59e0b" : "#f87171", marginLeft: "0.5rem" }}>{rate}%</span>}
                        </span>
                      </div>
                      <div style={{ height: "20px", background: "#1a1a2e", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${width}%`, background: `linear-gradient(90deg, #7c3aed, ${i === stats.funnel.length - 1 ? "#34d399" : "#a78bfa"})`, borderRadius: "4px", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* User Events */}
        {stats && stats.events && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "0.75rem", marginBottom: "2rem", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, fontSize: "0.95rem" }}>
              User Events
            </div>
            <div style={{ padding: "1rem 1.25rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginBottom: "0.5rem" }}>Event Counts (this month)</div>
                {stats.events.counts.map((e, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.2rem 0", color: "#bbb" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}>{e.event}</span>
                    <span style={{ color: COLORS.textMuted }}>{e.cnt}</span>
                  </div>
                ))}
                {stats.events.counts.length === 0 && <div style={{ color: "#555", fontSize: "0.8rem" }}>No events yet</div>}
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginBottom: "0.5rem" }}>Recent Events</div>
                {stats.events.recent.slice(0, 10).map((e, i) => (
                  <div key={i} style={{ fontSize: "0.75rem", padding: "0.15rem 0", color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: "#bbb" }}>{e.event}</span>
                    {e.email && <span style={{ color: "#555" }}> {e.email.split("@")[0]}</span>}
                    <span style={{ color: "#444" }}> {new Date(e.created_at + "Z").toLocaleTimeString()}</span>
                  </div>
                ))}
                {stats.events.recent.length === 0 && <div style={{ color: "#555", fontSize: "0.8rem" }}>No events yet</div>}
              </div>
            </div>
          </div>
        )}

        {/* Analytics */}
        {stats && stats.analytics && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "0.75rem", marginBottom: "2rem", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, fontSize: "0.95rem" }}>
              Analytics
            </div>
            <div style={{ padding: "1rem 1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div><div style={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>Views Today</div><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.analytics.pvToday}</div></div>
                <div><div style={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>Visitors Today</div><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.analytics.uvToday}</div></div>
                <div><div style={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>Views This Month</div><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.analytics.pvMonth}</div></div>
                <div><div style={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>Visitors This Month</div><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.analytics.uvMonth}</div></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Daily chart */}
                <div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginBottom: "0.5rem" }}>Daily Views (last 30 days)</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "80px" }}>
                    {[...stats.analytics.dailyViews].reverse().map((d, i) => {
                      const max = Math.max(...stats.analytics.dailyViews.map(x => x.views), 1);
                      return (
                        <div key={i} title={`${d.day}: ${d.views} views, ${d.visitors} visitors`} style={{
                          flex: 1, background: "#7c3aed", borderRadius: "2px 2px 0 0", minHeight: "2px",
                          height: `${(d.views / max) * 100}%`,
                        }} />
                      );
                    })}
                  </div>
                </div>

                {/* Top pages + referrers */}
                <div>
                  <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginBottom: "0.5rem" }}>Top Pages</div>
                  {stats.analytics.topPages.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0", color: "#bbb" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</span>
                      <span style={{ color: COLORS.textMuted, marginLeft: "0.5rem", flexShrink: 0 }}>{p.views}</span>
                    </div>
                  ))}
                  {stats.analytics.topReferrers.length > 0 && (
                    <>
                      <div style={{ fontSize: "0.8rem", color: COLORS.textMuted, marginTop: "0.75rem", marginBottom: "0.5rem" }}>Top Referrers</div>
                      {stats.analytics.topReferrers.slice(0, 5).map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.15rem 0", color: "#bbb" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.referrer}</span>
                          <span style={{ color: COLORS.textMuted, marginLeft: "0.5rem", flexShrink: 0 }}>{r.cnt}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Deployments */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "0.75rem", overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600, fontSize: "0.95rem" }}>
            Recent Deployments
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "0.6rem 1rem" }}>Project</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Status</th>
                  <th style={{ padding: "0.6rem 0.5rem" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "0.6rem 1rem" }}>
                      {d.project_name}
                      <span style={{ color: COLORS.textMuted, marginLeft: "0.5rem", fontSize: "0.75rem" }}>{d.project_slug}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <span
                        style={{
                          background: (STATUS_COLORS[d.status] || "#6b7280") + "22",
                          color: STATUS_COLORS[d.status] || "#6b7280",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", color: COLORS.textMuted }}>{timeAgo(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "0.75rem",
        padding: "1.25rem",
      }}
    >
      <div style={{ color: COLORS.textMuted, fontSize: "0.8rem", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: COLORS.text }}>{value}</div>
      <div style={{ color: COLORS.textMuted, fontSize: "0.75rem", marginTop: "0.25rem" }}>{sub}</div>
    </div>
  );
}
