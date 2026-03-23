import { useState, useEffect, useRef } from "react";
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
  copyBtn: {
    marginLeft: "0.5rem",
    padding: "0.1rem 0.4rem",
    background: "#1a1a2e",
    color: "#888",
    border: "1px solid #2e2e4a",
    borderRadius: "0.25rem",
    cursor: "pointer",
    fontSize: "0.65rem",
    fontFamily: "inherit",
  },
};

export default function DomainsPanel({ projectId, projectSlug }: { projectId: string; projectSlug: string }) {
  const { showError } = useToast();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [dnsChecking, setDnsChecking] = useState<string | null>(null);
  const [dnsVerified, setDnsVerified] = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string>("");

  useEffect(() => {
    api.getDomains(projectId).then(setDomains);
    // Get server IP from our backend
    fetch("/api/server-ip", { headers: { Authorization: `Bearer ${(window as any).__authToken}` } })
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

  const checkDnsOnce = async (domain: string): Promise<boolean> => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 6000);
      await fetch(`https://${domain}/`, { mode: "no-cors", signal: controller.signal });
      return true;
    } catch {
      try {
        const controller2 = new AbortController();
        setTimeout(() => controller2.abort(), 5000);
        await fetch(`http://${domain}/`, { mode: "no-cors", signal: controller2.signal });
        return true;
      } catch {
        return false;
      }
    }
  };

  // Poll DNS until verified
  const dnsPollingRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const startDnsPolling = (domain: string) => {
    if (dnsPollingRef.current.has(domain)) return;
    setDnsChecking(domain);

    const poll = setInterval(async () => {
      const ok = await checkDnsOnce(domain);
      if (ok) {
        clearInterval(poll);
        dnsPollingRef.current.delete(domain);
        setDnsVerified(prev => new Set(prev).add(domain));
        setDnsChecking(prev => prev === domain ? null : prev);
      }
    }, 10000);

    dnsPollingRef.current.set(domain, poll);

    // Also check immediately
    checkDnsOnce(domain).then(ok => {
      if (ok) {
        clearInterval(poll);
        dnsPollingRef.current.delete(domain);
        setDnsVerified(prev => new Set(prev).add(domain));
        setDnsChecking(prev => prev === domain ? null : prev);
      }
    });
  };

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      dnsPollingRef.current.forEach(interval => clearInterval(interval));
    };
  }, []);

  // Auto-start polling for newly added domains
  useEffect(() => {
    if (showSetup && !dnsVerified.has(showSetup)) {
      startDnsPolling(showSetup);
    }
  }, [showSetup]);

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
                <div style={styles.dnsRow}><span style={styles.dnsLabel}>Value</span><span style={styles.dnsValue}>{serverIp}</span><button style={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(serverIp); }}>Copy</button></div>
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
              {dnsVerified.has(d.domain) ? (
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem", color: "#34d399", fontSize: "0.78rem", fontWeight: 600 }}>
                  <span style={{ fontSize: "1rem" }}>&#10003;</span> DNS Verified — HTTPS active
                </div>
              ) : dnsChecking === d.domain ? (
                <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "#f59e0b", fontSize: "0.78rem" }}>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid #1e1e30", borderTop: "2px solid #f59e0b", borderRadius: "50%", animation: "pvSpin 0.8s linear infinite" }} />
                  Waiting for DNS to propagate...
                </div>
              ) : (
                <button
                  style={{ ...styles.btn, marginTop: "0.5rem", fontSize: "0.75rem" }}
                  onClick={() => startDnsPolling(d.domain)}
                >
                  Verify DNS
                </button>
              )}
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
