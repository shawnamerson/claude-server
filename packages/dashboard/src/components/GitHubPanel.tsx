import { useState, useEffect } from "react";
import { api, GitHubConnection } from "../api/client";
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
  row: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
    alignItems: "center",
  },
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    marginBottom: "0.25rem",
  },
  input: {
    flex: 1,
    padding: "0.5rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit",
  },
  branchInput: {
    width: "100px",
  },
  btn: {
    padding: "0.4rem 0.8rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
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
  connected: {
    fontSize: "0.85rem",
    color: "#34d399",
    marginBottom: "0.5rem",
  },
  info: {
    fontSize: "0.8rem",
    color: "#888",
    marginBottom: "0.25rem",
    fontFamily: "'JetBrains Mono', monospace",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.5rem",
  },
};

export default function GitHubPanel({ projectId, onDeploy }: { projectId: string; onDeploy?: () => void }) {
  const { showError } = useToast();
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

  useEffect(() => {
    api.getGitHub(projectId).then(setConnection);
  }, [projectId]);

  const connect = async () => {
    if (!repoUrl.trim()) return;
    setLoading(true);
    try {
      const result = await api.connectGitHub(projectId, repoUrl, branch, githubToken || undefined);
      setWebhookSecret(result.webhookSecret);
      setConnection({ repoUrl, branch, webhookUrl: result.webhookUrl });
      setRepoUrl("");
      // Auto-deploy after cloning
      try {
        await api.deploy(projectId, "Deploy from GitHub repository");
        onDeploy?.();
      } catch {
        // Deploy might fail if no server.js etc — that's ok, user can iterate
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    await api.disconnectGitHub(projectId);
    setConnection(null);
    setWebhookSecret(null);
  };

  if (connection) {
    return (
      <div style={styles.container}>
        <div style={styles.connected}>Connected to GitHub</div>
        <div style={styles.info}>Repo: {connection.repoUrl}</div>
        <div style={styles.info}>Branch: {connection.branch}</div>
        <div style={styles.info}>Webhook: {connection.webhookUrl}</div>
        {webhookSecret && (
          <>
            <div style={{ ...styles.info, color: "#f59e0b", marginTop: "0.5rem" }}>
              Secret: {webhookSecret}
            </div>
            <div style={styles.hint}>
              Add this webhook URL and secret to your GitHub repo settings (Settings &gt; Webhooks). Select "Just the push event".
            </div>
          </>
        )}
        <div style={{ marginTop: "1rem" }}>
          <button style={styles.dangerBtn} onClick={disconnect}>Disconnect</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.label}>GitHub Repository URL</div>
      <div style={styles.row}>
        <input
          style={styles.input}
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
        />
      </div>
      <div style={styles.label}>Branch</div>
      <div style={styles.row}>
        <input
          style={{ ...styles.input, ...styles.branchInput }}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
        />
      </div>
      <div style={styles.label}>Personal Access Token <span style={{ color: "#555" }}>(optional — for private repos)</span></div>
      <div style={styles.row}>
        <input
          style={styles.input}
          type="password"
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
        />
      </div>
      <div style={styles.row}>
        <button style={styles.btn} onClick={connect} disabled={loading}>
          {loading ? "Connecting..." : "Connect & Clone"}
        </button>
      </div>
      <div style={styles.hint}>
        This will clone the repo and set up auto-deploy on push. For private repos, create a <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style={{ color: "#7c3aed" }}>Personal Access Token</a> with repo scope.
      </div>
    </div>
  );
}
