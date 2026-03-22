import { useState, useEffect } from "react";
import { api, CustomDomain } from "../api/client";

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
  subdomain: {
    fontSize: "0.85rem",
    color: "#34d399",
    marginBottom: "0.75rem",
    padding: "0.5rem 0.6rem",
    background: "#064e3b22",
    border: "1px solid #064e3b",
    borderRadius: "0.35rem",
    fontFamily: "'JetBrains Mono', monospace",
  },
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    marginBottom: "0.25rem",
    marginTop: "0.75rem",
  },
  row: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.5rem",
    alignItems: "center",
  },
  input: {
    flex: 1,
    padding: "0.4rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit",
  },
  btn: {
    padding: "0.4rem 0.7rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
    whiteSpace: "nowrap" as const,
  },
  deleteBtn: {
    padding: "0.3rem 0.5rem",
    background: "#450a0a",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  domainItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.4rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    marginBottom: "0.4rem",
    fontSize: "0.85rem",
    fontFamily: "'JetBrains Mono', monospace",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.5rem",
  },
};

export default function DomainsPanel({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getDomains(projectId).then(setDomains);
  }, [projectId]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      await api.addDomain(projectId, newDomain);
      setNewDomain("");
      api.getDomains(projectId).then(setDomains);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domainId: number) => {
    await api.removeDomain(projectId, domainId);
    setDomains(domains.filter((d) => d.id !== domainId));
  };

  const baseDomain = window.location.hostname;

  return (
    <div style={styles.container}>
      <div style={styles.label}>Default Subdomain</div>
      <div style={styles.subdomain}>
        {projectSlug}.{baseDomain}
      </div>

      <div style={styles.label}>Custom Domains</div>
      {domains.map((d) => (
        <div key={d.id} style={styles.domainItem}>
          <span style={{ color: "#e0e0e0" }}>{d.domain}</span>
          <button style={styles.deleteBtn} onClick={() => handleRemove(d.id)}>Remove</button>
        </div>
      ))}

      <div style={styles.row}>
        <input
          style={styles.input}
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="myapp.com"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button style={styles.btn} onClick={handleAdd} disabled={adding}>
          {adding ? "Adding..." : "Add Domain"}
        </button>
      </div>

      <div style={styles.hint}>
        Point your domain's A record to this server's IP. HTTPS is provisioned automatically.
      </div>
    </div>
  );
}
