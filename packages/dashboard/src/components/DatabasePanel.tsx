import { useState, useEffect } from "react";
import { api, DatabaseInfo } from "../api/client";

const styles = {
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    background: "#0a0a0f",
    padding: "0.75rem",
  },
  btn: {
    padding: "0.5rem 1rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  dangerBtn: {
    padding: "0.4rem 0.8rem",
    background: "#450a0a",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  statusDot: (running: boolean) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: running ? "#34d399" : "#666",
  }),
  label: {
    fontSize: "0.75rem",
    color: "#666",
    marginBottom: "0.15rem",
  },
  value: {
    fontSize: "0.85rem",
    color: "#e0e0e0",
    fontFamily: "'JetBrains Mono', monospace",
    background: "#12121a",
    padding: "0.4rem 0.6rem",
    borderRadius: "0.35rem",
    border: "1px solid #1e1e30",
    marginBottom: "0.75rem",
    wordBreak: "break-all" as const,
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.75rem",
  },
  empty: {
    textAlign: "center" as const,
    padding: "1.5rem",
  },
  emptyText: {
    color: "#888",
    fontSize: "0.9rem",
    marginBottom: "1rem",
  },
};

export default function DatabasePanel({ projectId }: { projectId: string }) {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [connString, setConnString] = useState<string | null>(null);

  useEffect(() => {
    api.getDatabase(projectId).then(setDbInfo);
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await api.createDatabase(projectId);
      setConnString(result.connectionString);
      api.getDatabase(projectId).then(setDbInfo);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create database");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this database? All data will be lost.")) return;
    try {
      await api.deleteDatabase(projectId);
      setDbInfo(null);
      setConnString(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete database");
    }
  };

  if (dbInfo === undefined) return <div style={styles.container}>Loading...</div>;

  if (!dbInfo) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <div style={styles.emptyText}>No database attached to this project</div>
          <button style={styles.btn} onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create PostgreSQL Database"}
          </button>
          <div style={styles.hint}>
            Creates a PostgreSQL 16 database and automatically sets DATABASE_URL in your env vars.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.status}>
        <div style={styles.statusDot(dbInfo.status === "running")} />
        <span style={{ fontSize: "0.85rem", color: dbInfo.status === "running" ? "#34d399" : "#666" }}>
          PostgreSQL {dbInfo.status === "running" ? "Running" : dbInfo.status}
        </span>
      </div>

      <div style={styles.label}>Database</div>
      <div style={styles.value}>{dbInfo.dbName}</div>

      <div style={styles.label}>User</div>
      <div style={styles.value}>{dbInfo.user}</div>

      <div style={styles.label}>Internal Host</div>
      <div style={styles.value}>{dbInfo.host}:5432</div>

      <div style={styles.label}>External Port</div>
      <div style={styles.value}>{dbInfo.port}</div>

      <div style={styles.label}>Connection String (DATABASE_URL)</div>
      <div style={styles.value}>{connString || dbInfo.connectionString}</div>

      <div style={styles.hint}>
        DATABASE_URL is automatically set in your env vars. Redeploy to use it.
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button style={styles.dangerBtn} onClick={handleDelete}>Delete Database</button>
      </div>
    </div>
  );
}
