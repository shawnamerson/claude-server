import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api, Project, Deployment } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LogViewer from "../components/LogViewer";
import ChatPanel from "../components/ChatPanel";
import FileViewer from "../components/FileViewer";
import EnvVarsPanel from "../components/EnvVarsPanel";
import GitHubPanel from "../components/GitHubPanel";
import DatabasePanel from "../components/DatabasePanel";
import DomainsPanel from "../components/DomainsPanel";
import CronPanel from "../components/CronPanel";

type SideTab = "chat" | "logs" | "files" | "env" | "database" | "domains" | "github" | "cron";

const styles = {
  page: {
    display: "flex",
    flex: 1,
    width: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  // Left sidebar — chat + tabs
  sidebar: {
    width: "380px",
    minWidth: "380px",
    display: "flex",
    flexDirection: "column" as const,
    borderRight: "1px solid #1e1e30",
    background: "#0d0d14",
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    borderBottom: "1px solid #1e1e30",
    flexShrink: 0,
  },
  projectName: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#e0e0e0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  headerActions: {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    flexShrink: 0,
  },
  smallBtn: (color: string, bg: string, border: string) => ({
    padding: "0.2rem 0.5rem",
    background: bg,
    color: color,
    border: `1px solid ${border}`,
    borderRadius: "0.3rem",
    cursor: "pointer",
    fontSize: "0.7rem",
  }),
  tabs: {
    display: "flex",
    flexShrink: 0,
    borderBottom: "1px solid #1e1e30",
    overflow: "auto",
  },
  tab: (active: boolean) => ({
    padding: "0.4rem 0.6rem",
    background: "none",
    color: active ? "#e0e0e0" : "#555",
    border: "none",
    borderBottom: active ? "2px solid #7c3aed" : "2px solid transparent",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: active ? 600 : 400,
    whiteSpace: "nowrap" as const,
  }),
  sidebarContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
    overflow: "hidden",
  },
  // Right side — preview
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
    overflow: "hidden",
    background: "#08080c",
  },
  previewBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.4rem 0.75rem",
    borderBottom: "1px solid #1e1e30",
    flexShrink: 0,
    background: "#0d0d14",
  },
  urlBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flex: 1,
    minWidth: 0,
  },
  urlInput: {
    flex: 1,
    padding: "0.3rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.3rem",
    color: "#60a5fa",
    fontSize: "0.8rem",
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  refreshBtn: {
    padding: "0.3rem 0.6rem",
    background: "#1a1a2e",
    color: "#aaa",
    border: "1px solid #2e2e4a",
    borderRadius: "0.3rem",
    cursor: "pointer",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  openBtn: {
    padding: "0.3rem 0.6rem",
    background: "#1a1a2e",
    color: "#60a5fa",
    border: "1px solid #2e2e4a",
    borderRadius: "0.3rem",
    cursor: "pointer",
    fontSize: "0.75rem",
    textDecoration: "none",
    flexShrink: 0,
  },
  preview: {
    flex: 1,
    overflow: "hidden",
    background: "#0a0a0f",
  },
  previewIframe: {
    width: "100%",
    height: "100%",
    border: "none",
  },
  previewEmpty: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    color: "#555",
    fontSize: "0.9rem",
  },
  previewSpinner: {
    color: "#7c3aed",
    fontSize: "0.85rem",
  },
};

const spinnerKeyframes = document.createElement("style");
spinnerKeyframes.textContent = `@keyframes pvSpin { to { transform: rotate(360deg); } }`;
if (typeof document !== "undefined" && !document.getElementById("pv-spin-style")) {
  spinnerKeyframes.id = "pv-spin-style";
  document.head.appendChild(spinnerKeyframes);
}
const spinnerStyle: React.CSSProperties = { width: 28, height: 28, border: "3px solid #1e1e30", borderTop: "3px solid #7c3aed", borderRadius: "50%", animation: "pvSpin 0.8s linear infinite" };
const previewContainerStyle = { ...styles.preview, position: "relative" as const };
const previewIframeStyle = { ...styles.previewIframe, position: "absolute" as const, top: 0, left: 0 };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(searchParams.get("dep"));
  const [sideTab, setSideTab] = useState<SideTab>((searchParams.get("tab") as SideTab) || "chat");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const lastRunningIdRef = useRef<string | null>(null);
  const wasDeployingRef = useRef(false);
  const runningDep = deployments.find((d) => d.status === "running");

  const reloadPreview = useCallback(() => {
    setPreviewKey(k => k + 1);
  }, []);

  // (new-deploy retry effect moved below previewUrl declaration)

  const refresh = useCallback(() => {
    if (!id) return;
    api.getProject(id).then(setProject);
    api.listDeployments(id).then((deps) => {
      setDeployments(deps);
      if (deps.length > 0) {
        setSelectedDeployment((prev) => prev || deps[0].id);
      }
    });
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      api.listDeployments(id).then((deps) => {
        setDeployments(deps);
        if (deps.length > 0) {
          const latest = deps[0];
          const isActive = ["pending", "generating", "building", "deploying"].includes(latest.status);
          setSelectedDeployment((prev) => {
            if (!prev) return latest.id;
            if (isActive && prev !== latest.id) return latest.id;
            return prev;
          });
        }
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  const handleStop = async (depId: string) => {
    await api.stopDeployment(depId);
    refresh();
  };

  const handleStart = async (depId: string) => {
    await api.startDeployment(depId);
    refresh();
  };

  const handleDelete = async () => {
    if (!id) return;
    await api.deleteProject(id);
    navigate("/projects");
  };

  const deleteModal = showDeleteModal && (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000,
      animation: "fadeIn 0.15s ease",
    }} onClick={() => setShowDeleteModal(false)}>
      <div style={{
        background: "#12121a", border: "1px solid #1e1e30",
        borderRadius: "0.75rem", padding: "1.5rem", maxWidth: "400px", width: "90%",
        animation: "scaleIn 0.2s ease",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Delete Project</div>
        <div style={{ color: "#888", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          Are you sure you want to delete <strong style={{ color: "#e0e0e0" }}>{project?.name}</strong>? This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            style={{ padding: "0.5rem 1rem", background: "#1a1a2e", color: "#aaa", border: "1px solid #2e2e4a", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}
            onClick={() => setShowDeleteModal(false)}
          >Cancel</button>
          <button
            style={{ padding: "0.5rem 1rem", background: "#dc2626", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem" }}
            onClick={() => { setShowDeleteModal(false); handleDelete(); }}
          >Delete</button>
        </div>
      </div>
    </div>
  );

  const isDeploying = deployments.some((d) => ["pending", "generating", "building", "deploying"].includes(d.status));
  const currentDep = deployments.find(d => d.status === "running") || deployments[0];
  const [customDomain, setCustomDomain] = useState<string | null>(null);

  useEffect(() => {
    if (project?.id) {
      api.getDomains(project.id).then(domains => {
        if (domains.length > 0) setCustomDomain(domains[0].domain);
      });
    }
  }, [project?.id]);

  const previewUrl = useMemo(
    () => {
      if (customDomain) return `https://${customDomain}`;
      return project ? `${window.location.protocol}//${project.slug}.${window.location.hostname}` : "";
    },
    [project?.slug, customDomain]
  );
  const hasRunningDep = !!runningDep;

  // Track if we saw a deploy in progress
  useEffect(() => {
    if (isDeploying) wasDeployingRef.current = true;
  }, [isDeploying]);

  // When a new deployment starts running, poll health then show preview
  useEffect(() => {
    const runningId = runningDep?.id || null;
    if (!runningId) return;

    if (runningId !== lastRunningIdRef.current) {
      lastRunningIdRef.current = runningId;

      // If we never saw a deploy in progress, this is an existing app — show immediately
      if (!wasDeployingRef.current) {
        setPreviewReady(true);
        return;
      }
      wasDeployingRef.current = false;

      // New deploy — poll until app is reachable via its public URL (includes SSL check)
      setPreviewReady(false);
      let cancelled = false;

      const poll = async () => {
        const authToken = (window as any).__authToken;
        const publicUrl = project ? `${window.location.protocol}//${project.slug}.${window.location.hostname}` : "";

        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          if (cancelled) return;

          // First check internal health (app is running)
          try {
            const res = await fetch(`/api/app-health/${project?.slug}`, {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
            });
            const data = await res.json();
            if (!data.ok) continue;
          } catch { continue; }

          // Then check the actual public URL (Caddy + SSL ready)
          if (publicUrl) {
            try {
              const res = await fetch(publicUrl, { mode: "no-cors" });
              // no-cors returns opaque response — if it doesn't throw, SSL is working
              setPreviewReady(true);
              setPreviewKey(k => k + 1);
              return;
            } catch {
              // SSL not ready yet — keep polling
              continue;
            }
          }

          // Fallback if no public URL
          setPreviewReady(true);
          setPreviewKey(k => k + 1);
          return;
        }
        // Give up after 60s — show it anyway
        setPreviewReady(true);
        setPreviewKey(k => k + 1);
      };
      poll();
      return () => { cancelled = true; };
    }
  }, [runningDep?.id, project?.slug]);

  if (!project) return <div style={{ padding: "2rem", color: "#666" }}>Loading...</div>;

  return (
    <div style={styles.page}>
      {/* Left sidebar */}
      <div style={styles.sidebar}>
        {/* Header */}
        <div style={styles.sidebarHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
            <div style={styles.projectName}>{project.name}</div>
            {currentDep && <StatusBadge status={currentDep.status} />}
          </div>
          <div style={styles.headerActions}>
            {currentDep?.status === "running" && (
              <button style={styles.smallBtn("#f59e0b", "#1a1a2e", "#92400e")} onClick={() => handleStop(currentDep.id)}>Stop</button>
            )}
            {(currentDep?.status === "stopped" || currentDep?.status === "failed") && currentDep?.dockerfile && (
              <button style={styles.smallBtn("#34d399", "#1a1a2e", "#064e3b")} onClick={() => handleStart(currentDep.id)}>Start</button>
            )}
            <button style={styles.smallBtn("#f87171", "#450a0a", "#7f1d1d")} onClick={() => setShowDeleteModal(true)}>Delete</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(["chat", "logs", "files", "env", "database", "domains", "github", "cron"] as SideTab[]).map((tab) => (
            <button key={tab} style={styles.tab(sideTab === tab)} onClick={() => setSideTab(tab)}>
              {{ chat: "Chat", logs: "Logs", files: "Files", env: "Env", database: "DB", domains: "Domains", github: "Git", cron: "Cron" }[tab]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={styles.sidebarContent}>
          {sideTab === "chat" && (
            <ChatPanel projectId={project.id} deploying={isDeploying} deployStatus={currentDep?.status} deploymentId={selectedDeployment} onDeploy={async (prompt) => {
              if (!id) return;
              const dep = await api.deploy(id, prompt);
              setSelectedDeployment(dep.id);
              refresh();
            }} />
          )}
          <div style={{ display: sideTab === "logs" ? "flex" : "none", flex: 1, minHeight: 0, flexDirection: "column" }}>
            <LogViewer deploymentId={selectedDeployment} />
          </div>
          {/* Files tab renders in main area instead */}
          {sideTab === "env" && <EnvVarsPanel projectId={project.id} />}
          {sideTab === "database" && <DatabasePanel projectId={project.id} />}
          {sideTab === "domains" && <DomainsPanel projectId={project.id} projectSlug={project.slug} />}
          {sideTab === "github" && <GitHubPanel projectId={project.id} onDeploy={refresh} />}
          {sideTab === "cron" && <CronPanel projectId={project.id} />}
        </div>
      </div>

      {/* Main area — Preview or File Editor */}
      <div style={styles.main}>
        {sideTab === "files" ? (
          <FileViewer projectId={project.id} />
        ) : (
        <>
        {/* URL bar */}
        <div style={styles.previewBar}>
          {hasRunningDep ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
              <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontSize: "0.8rem", fontFamily: "'JetBrains Mono', monospace", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{previewUrl.replace(/^https?:\/\//, "")}</a>
              <button onClick={reloadPreview} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "0.85rem", padding: "0.15rem", lineHeight: 1, flexShrink: 0 }} title="Refresh preview">&#x21bb;</button>
            </div>
          ) : (
            <span style={{ color: "#444", fontSize: "0.8rem" }}>Deploy to see preview</span>
          )}
        </div>

        {/* Preview iframe or placeholder */}
        {isDeploying ? (
          <div style={styles.previewEmpty}>
            <div style={spinnerStyle} />
            <div style={styles.previewSpinner}>Building your app...</div>
            <div style={{ fontSize: "0.8rem", color: "#444" }}>Watch the Chat tab for progress</div>
          </div>
        ) : hasRunningDep && previewReady ? (
          <div ref={previewContainerRef} style={previewContainerStyle}>
            <iframe
              key={previewKey}
              src={previewUrl}
              style={previewIframeStyle}
              title="App Preview"
            />
          </div>
        ) : hasRunningDep && !previewReady ? (
          <div style={styles.previewEmpty}>
            <div style={spinnerStyle} />
            <div style={styles.previewSpinner}>Starting your app...</div>
          </div>
        ) : (
          <div style={styles.previewEmpty}>
            <div>No app running</div>
            <div style={{ fontSize: "0.8rem", color: "#444" }}>Use the Chat tab to describe what you want to build</div>
          </div>
        )}
        </>
        )}
      </div>

      {deleteModal}
    </div>
  );
}
