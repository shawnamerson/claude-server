import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api, TeamDetail, Project } from "../api/client";

const styles = {
  container: {
    padding: "1.5rem",
    maxWidth: "800px",
    margin: "0 auto",
    width: "100%",
  },
  backLink: {
    color: "#888",
    textDecoration: "none",
    fontSize: "0.85rem",
    marginBottom: "1rem",
    display: "inline-block",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    marginBottom: "0.25rem",
  },
  subtitle: {
    color: "#888",
    fontSize: "0.85rem",
    marginBottom: "2rem",
  },
  section: {
    marginBottom: "2rem",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    marginBottom: "1rem",
    color: "#e0e0e0",
  },
  card: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1rem",
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.6rem 0",
    borderBottom: "1px solid #1e1e30",
  },
  memberInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  memberEmail: {
    fontSize: "0.9rem",
    color: "#e0e0e0",
  },
  roleBadge: (role: string) => ({
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: "9999px",
    background: role === "owner" ? "#7c3aed33" : role === "admin" ? "#2563eb33" : "#1e1e30",
    color: role === "owner" ? "#a78bfa" : role === "admin" ? "#60a5fa" : "#888",
  }),
  btn: {
    padding: "0.4rem 0.85rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.4rem",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 500,
  },
  btnDanger: {
    padding: "0.35rem 0.7rem",
    background: "transparent",
    color: "#f87171",
    border: "1px solid #f8717133",
    borderRadius: "0.4rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  btnSmall: {
    padding: "0.25rem 0.5rem",
    background: "#1e1e30",
    color: "#888",
    border: "1px solid #2a2a40",
    borderRadius: "0.3rem",
    cursor: "pointer",
    fontSize: "0.7rem",
  },
  input: {
    padding: "0.5rem 0.75rem",
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.4rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    flex: 1,
  },
  inputRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  inviteRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0",
    borderBottom: "1px solid #1e1e30",
  },
  inviteEmail: {
    fontSize: "0.85rem",
    color: "#888",
  },
  select: {
    padding: "0.5rem 0.75rem",
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.4rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    flex: 1,
  },
  error: {
    color: "#f87171",
    fontSize: "0.8rem",
    marginTop: "0.5rem",
  },
  success: {
    color: "#34d399",
    fontSize: "0.8rem",
    marginTop: "0.5rem",
  },
};

export default function TeamSettings() {
  const { teamId } = useParams<{ teamId: string }>();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [transferProjectId, setTransferProjectId] = useState("");
  const [transferMsg, setTransferMsg] = useState("");

  const load = async () => {
    if (!teamId) return;
    try {
      const [t, p] = await Promise.all([api.getTeam(teamId), api.listProjects()]);
      setTeam(t);
      // Only show personal projects (not already in a team) for transfer
      setProjects(p.filter((proj: any) => !proj.team_id));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [teamId]);

  const handleInvite = async () => {
    if (!teamId || !inviteEmail.trim()) return;
    setInviteError("");
    setInviteSuccess("");
    try {
      await api.inviteToTeam(teamId, inviteEmail.trim());
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!teamId) return;
    if (!confirm("Remove this member from the team?")) return;
    try {
      await api.removeTeamMember(teamId, userId);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!teamId) return;
    try {
      await api.changeTeamRole(teamId, userId, newRole);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!teamId) return;
    try {
      await api.cancelTeamInvite(teamId, inviteId);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel invite");
    }
  };

  const handleTransfer = async () => {
    if (!teamId || !transferProjectId) return;
    setTransferMsg("");
    try {
      await api.transferProject(transferProjectId, teamId);
      setTransferMsg("Project transferred successfully");
      setTransferProjectId("");
      load();
    } catch (err) {
      setTransferMsg(err instanceof Error ? err.message : "Failed to transfer");
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ color: "#888", padding: "2rem 0" }}>Loading team...</div>
      </div>
    );
  }

  if (!team) {
    return (
      <div style={styles.container}>
        <div style={{ color: "#f87171", padding: "2rem 0" }}>Team not found or access denied.</div>
        <Link to="/projects" style={styles.backLink}>Back to projects</Link>
      </div>
    );
  }

  const isOwner = team.my_role === "owner";
  const isAdmin = team.my_role === "admin";
  const canManage = isOwner || isAdmin;

  return (
    <div style={styles.container}>
      <Link to="/projects" style={styles.backLink}>← Back to projects</Link>
      <h1 style={styles.title}>{team.name}</h1>
      <p style={styles.subtitle}>Team settings · {team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>

      {/* Members */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Members</h2>
        <div style={styles.card}>
          {team.members.map((m, i) => (
            <div key={m.user_id} style={{ ...styles.memberRow, borderBottom: i === team.members.length - 1 ? "none" : "1px solid #1e1e30" }}>
              <div style={styles.memberInfo}>
                <span style={styles.memberEmail}>{m.email}</span>
                <span style={styles.roleBadge(m.role)}>{m.role}</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {isOwner && m.role !== "owner" && (
                  <>
                    <select
                      style={{ ...styles.btnSmall, appearance: "auto" as any }}
                      value={m.role}
                      onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <button style={styles.btnDanger} onClick={() => handleRemoveMember(m.user_id)}>Remove</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite */}
      {canManage && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Invite Member</h2>
          <div style={styles.card}>
            <div style={styles.inputRow}>
              <input
                style={styles.input}
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <button style={styles.btn} onClick={handleInvite}>Invite</button>
            </div>
            {inviteError && <div style={styles.error}>{inviteError}</div>}
            {inviteSuccess && <div style={styles.success}>{inviteSuccess}</div>}
          </div>
        </div>
      )}

      {/* Pending Invites */}
      {canManage && team.invites.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Pending Invites</h2>
          <div style={styles.card}>
            {team.invites.map((inv, i) => (
              <div key={inv.id} style={{ ...styles.inviteRow, borderBottom: i === team.invites.length - 1 ? "none" : "1px solid #1e1e30" }}>
                <div>
                  <span style={styles.inviteEmail}>{inv.email}</span>
                  <span style={{ fontSize: "0.7rem", color: "#555", marginLeft: "0.5rem" }}>invited by {inv.invited_by_email}</span>
                </div>
                <button style={styles.btnDanger} onClick={() => handleCancelInvite(inv.id)}>Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer Project */}
      {canManage && projects.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Transfer Project to Team</h2>
          <div style={styles.card}>
            <div style={styles.inputRow}>
              <select
                style={styles.select}
                value={transferProjectId}
                onChange={(e) => setTransferProjectId(e.target.value)}
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button style={styles.btn} onClick={handleTransfer} disabled={!transferProjectId}>Transfer to team</button>
            </div>
            {transferMsg && <div style={{ ...styles.success, color: transferMsg.includes("Failed") ? "#f87171" : "#34d399" }}>{transferMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
