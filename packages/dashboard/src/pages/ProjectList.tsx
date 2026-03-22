import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Project } from "../api/client";
import StatusBadge from "../components/StatusBadge";

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  title: { fontSize: "1.5rem", fontWeight: 600 },
  newBtn: {
    padding: "0.5rem 1.25rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1.25rem",
    textDecoration: "none",
    color: "inherit",
    transition: "border-color 0.2s",
  },
  cardName: { fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" },
  cardDesc: { fontSize: "0.85rem", color: "#888", marginBottom: "0.75rem" },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.8rem",
    color: "#666",
  },
  empty: {
    textAlign: "center" as const,
    color: "#666",
    padding: "4rem",
    fontSize: "1.1rem",
  },
};

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listProjects().then(setProjects).finally(() => setLoading(false));
    // Poll for status updates every 5 seconds
    const interval = setInterval(() => {
      api.listProjects().then(setProjects);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={styles.empty}>Loading...</div>;

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Projects</h1>
        <Link to="/new" style={styles.newBtn}>New Project</Link>
      </div>

      {projects.length === 0 ? (
        <div style={styles.empty}>
          No projects yet. Create one and tell Claude what to build.
        </div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <Link key={p.id} to={`/project/${p.id}`} style={styles.card}>
              <div style={styles.cardName}>{p.name}</div>
              <div style={styles.cardDesc}>
                {p.description?.slice(0, 100) || "No description"}
              </div>
              <div style={styles.cardFooter}>
                <StatusBadge status={p.latest_status || "none"} />
                {(p as any).total_cost_cents > 0 && (
                  <span>${((p as any).total_cost_cents / 100).toFixed(2)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
