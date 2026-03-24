import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, Team } from "../api/client";

const styles = {
  container: {
    padding: "1.5rem",
    maxWidth: "800px",
    margin: "0 auto",
    width: "100%",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  title: { fontSize: "1.5rem", fontWeight: 600 },
  card: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1.25rem",
    textDecoration: "none",
    color: "inherit",
    display: "block",
    marginBottom: "0.75rem",
    transition: "border-color 0.2s",
  },
  cardName: { fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.25rem", color: "#e0e0e0" },
  cardMeta: { fontSize: "0.8rem", color: "#888" },
  roleBadge: (role: string) => ({
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: "9999px",
    marginLeft: "0.5rem",
    background: role === "owner" ? "#7c3aed33" : role === "admin" ? "#2563eb33" : "#1e1e30",
    color: role === "owner" ? "#a78bfa" : role === "admin" ? "#60a5fa" : "#888",
  }),
  btn: {
    padding: "0.5rem 1.25rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  input: {
    padding: "0.5rem 0.75rem",
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.4rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    width: "250px",
  },
  createRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "1.5rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1rem",
  },
  empty: {
    textAlign: "center" as const,
    color: "#666",
    padding: "3rem",
    fontSize: "1rem",
  },
  pendingCard: {
    background: "#12121a",
    border: "1px dashed #7c3aed44",
    borderRadius: "0.75rem",
    padding: "1rem 1.25rem",
    marginBottom: "0.75rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
};

export default function TeamList() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Array<{ team_id: string; team_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const t = await api.listTeams();
      setTeams(t);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await api.createTeam(newName.trim());
      setNewName("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ color: "#888", padding: "2rem 0" }}>Loading teams...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Teams</h1>
      </div>

      <div style={styles.createRow}>
        <input
          style={styles.input}
          placeholder="New team name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <button style={styles.btn} onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "Creating..." : "Create Team"}
        </button>
      </div>

      {teams.length === 0 ? (
        <div style={styles.empty}>
          No teams yet. Create one to start collaborating.
        </div>
      ) : (
        teams.map((t) => (
          <Link key={t.id} to={`/team/${t.id}`} style={styles.card}>
            <div style={styles.cardName}>
              {t.name}
              <span style={styles.roleBadge(t.my_role || "member")}>{t.my_role}</span>
            </div>
            <div style={styles.cardMeta}>
              {t.member_count} member{t.member_count !== 1 ? "s" : ""} · Created {new Date(t.created_at).toLocaleDateString()}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
