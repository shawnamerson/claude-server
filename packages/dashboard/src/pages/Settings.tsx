import { useState, useEffect } from "react";
import { useToast } from "../components/Toast";

const styles = {
  container: { maxWidth: "600px", padding: "0.5rem 1.5rem" },
  title: { fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" },
  section: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" },
  sectionTitle: { fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" },
  label: { fontSize: "0.85rem", color: "#aaa", marginBottom: "0.25rem" },
  input: { width: "100%", padding: "0.6rem 0.75rem", background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: "0.35rem", color: "#e0e0e0", fontSize: "0.9rem", outline: "none", fontFamily: "inherit" },
  row: { display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" },
  btn: { padding: "0.5rem 1rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.85rem" },
  dangerBtn: { padding: "0.5rem 1rem", background: "#450a0a", color: "#f87171", border: "1px solid #7f1d1d", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.85rem" },
  hint: { fontSize: "0.8rem", color: "#555", marginTop: "0.5rem", lineHeight: 1.5 },
  saved: { fontSize: "0.85rem", color: "#34d399" },
};

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = (window as any).__authToken;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function Settings() {
  const { showError, showSuccess } = useToast();
  const [githubToken, setGithubToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { headers: getHeaders() })
      .then(r => r.json())
      .then(data => { if (data.has_github_token) setHasToken(true); })
      .catch(() => {});
  }, []);

  const saveToken = async () => {
    if (!githubToken.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/github-token", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ token: githubToken }),
      });
      if (!res.ok) throw new Error("Failed");
      setHasToken(true);
      setGithubToken("");
      showSuccess("GitHub token saved");
    } catch {
      showError("Failed to save token");
    } finally {
      setSaving(false);
    }
  };

  const removeToken = async () => {
    try {
      await fetch("/api/auth/github-token", { method: "DELETE", headers: getHeaders() });
      setHasToken(false);
      showSuccess("GitHub token removed");
    } catch {
      showError("Failed to remove token");
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Settings</h1>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>GitHub</div>
        {hasToken ? (
          <>
            <div style={styles.saved}>Personal Access Token is saved</div>
            <div style={styles.hint}>Your token is used automatically when connecting private repos to any project.</div>
            <div style={styles.row}>
              <input
                style={styles.input}
                type="password"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="Paste new token to replace"
              />
              {githubToken && (
                <button style={styles.btn} onClick={saveToken} disabled={saving}>
                  {saving ? "..." : "Update"}
                </button>
              )}
            </div>
            <div style={{ marginTop: "1rem" }}>
              <button style={styles.dangerBtn} onClick={removeToken}>Remove token</button>
            </div>
          </>
        ) : (
          <>
            <div style={styles.label}>Personal Access Token</div>
            <div style={styles.row}>
              <input
                style={styles.input}
                type="password"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
              />
              <button style={styles.btn} onClick={saveToken} disabled={saving || !githubToken.trim()}>
                {saving ? "..." : "Save"}
              </button>
            </div>
            <div style={styles.hint}>
              Create a <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style={{ color: "#7c3aed" }}>Personal Access Token</a> with <strong>repo</strong> scope. Save it here and it'll be used for all private repo connections across your projects.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
