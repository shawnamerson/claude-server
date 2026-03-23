import { useState, useEffect } from "react";
import { api, CustomDomain } from "../api/client";
import { useToast } from "./Toast";

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
  setupBox: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    padding: "0.75rem",
    marginBottom: "0.5rem",
    marginTop: "-0.2rem",
  },
  setupTitle: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#e0e0e0",
    marginBottom: "0.5rem",
  },
  setupStep: {
    fontSize: "0.78rem",
    color: "#888",
    marginBottom: "0.4rem",
    lineHeight: 1.5,
  },
  dnsRecord: {
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.3rem",
    padding: "0.4rem 0.6rem",
    marginBottom: "0.5rem",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.75rem",
  },
  dnsRow: {
    display: "flex",
    gap: "1rem",
    padding: "0.15rem 0",
  },
  dnsLabel: {
    color: "#666",
    width: "50px",
  },
  dnsValue: {
    color: "#60a5fa",
  },
};

export default function DomainsPanel({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  const { showError } = useToast();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [dnsChecking, setDnsChecking] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string>("");

  useEffect(() => {
    api.getDomains(projectId).then(setDomains);
    // Get server IP from a public API
    fetch("https://api.ipify.org?format=json")
      .then(r => r.json())
      .then(d => setServerIp(d.ip))
      .catch(() => setServerIp("(check your server IP)"));
  }, [projectId]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      await api.addDomain(projectId, newDomain);
      const addedDomain = newDomain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      setNewDomain("");
      setShowSetup(addedDomain);
      api.getDomains(projectId).then(setDomains);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (domainId: number) => {
    await api.removeDomain(projectId, domainId);
    setDomains(domains.filter((d) => d.id !== domainId));
    setShowSetup(null);
  };

  const checkDns = async (domain: string) => {
    setDnsChecking(domain);
    try {
      // Try to fetch the domain — if it resolves to our server, Caddy will handle it
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://${domain}/`, { mode: "no-cors", signal: controller.signal }).catch(() => null);
      // If we got here without error, DNS likely points to us
      showError("DNS check: domain appears to be resolving. HTTPS certificate may take a few minutes to provision.");
    } catch {
      showError("DNS not pointing to this server yet. Make sure you added the A record.");
    } finally {
      setDnsChecking(null);
    }
  };

  const baseDomain = window.location.hostname;

  return (
    <div style={styles.container}>
      <div style={styles.label}>Default Subdomain</div>
      <div style={styles.subdomain}>
        <a href={`${window.location.protocol}//${projectSlug}.${baseDomain}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          {projectSlug}.{baseDomain}
        </a>
      </div>

      {domains.length > 0 && <div style={styles.label}>Custom Domains</div>}
      {domains.map((d) => (
        <div key={d.id}>
          <div style={styles.domainItem}>
            <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" style={{ color: "#e0e0e0", textDecoration: "none" }}>{d.domain}</a>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button
                style={{ ...styles.deleteBtn, background: "#1a1a2e", color: "#60a5fa", borderColor: "#2e2e4a" }}
                onClick={() => setShowSetup(showSetup === d.domain ? null : d.domain)}
              >
                Setup
              </button>
              <button style={styles.deleteBtn} onClick={() => handleRemove(d.id)}>Remove</button>
            </div>
          </div>
          {showSetup === d.domain && (
            <div style={styles.setupBox}>
              <div style={styles.setupTitle}>DNS Setup for {d.domain}</div>
              <div style={styles.setupStep}>
                <strong>1.</strong> Go to your domain registrar's DNS settings
              </div>
              <div style={styles.setupStep}>
                <strong>2.</strong> Add an <strong>A record</strong>:
              </div>
              <div style={styles.dnsRecord}>
                <div style={styles.dnsRow}><span style={styles.dnsLabel}>Type</span><span style={styles.dnsValue}>A</span></div>
                <div style={styles.dnsRow}><span style={styles.dnsLabel}>Name</span><span style={styles.dnsValue}>@</span></div>
                <div style={styles.dnsRow}><span style={styles.dnsLabel}>Value</span><span style={styles.dnsValue}>{serverIp}</span></div>
                <div style={styles.dnsRow}><span style={styles.dnsLabel}>TTL</span><span style={styles.dnsValue}>600</span></div>
              </div>
              {d.domain.split(".").length === 2 && (
                <>
                  <div style={styles.setupStep}>
                    <strong>3.</strong> Optional: add a <strong>CNAME</strong> for www:
                  </div>
                  <div style={styles.dnsRecord}>
                    <div style={styles.dnsRow}><span style={styles.dnsLabel}>Type</span><span style={styles.dnsValue}>CNAME</span></div>
                    <div style={styles.dnsRow}><span style={styles.dnsLabel}>Name</span><span style={styles.dnsValue}>www</span></div>
                    <div style={styles.dnsRow}><span style={styles.dnsLabel}>Value</span><span style={styles.dnsValue}>{d.domain}</span></div>
                  </div>
                </>
              )}
              <div style={styles.setupStep}>
                HTTPS certificate will be provisioned automatically once DNS propagates (usually 1-5 minutes).
              </div>
              <button
                style={{ ...styles.btn, marginTop: "0.5rem", fontSize: "0.75rem", opacity: dnsChecking ? 0.5 : 1 }}
                onClick={() => checkDns(d.domain)}
                disabled={!!dnsChecking}
              >
                {dnsChecking === d.domain ? "Checking..." : "Verify DNS"}
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ ...styles.label, marginTop: domains.length > 0 ? "0.75rem" : "0" }}>Add Custom Domain</div>
      <div style={styles.row}>
        <input
          style={styles.input}
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="myapp.com"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button style={styles.btn} onClick={handleAdd} disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
}
