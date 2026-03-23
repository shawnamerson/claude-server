import { useEffect, useState, useCallback, useRef } from "react";
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

type SideTab = "chat" | "logs" | "files" | "env" | "database" | "domains" | "github";

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
    background: "#fff",
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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(searchParams.get("dep"));
  const [sideTab, setSideTab] = useState<SideTab>("chat");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const lastRunningIdRef = useRef<string | null>(null);
  const runningDep = deployments.find((d) => d.status === "running");

  // When a NEW running deployment appears, refresh preview after delay
  useEffect(() => {
    const runningId = runningDep?.id || null;
    if (runningId && runningId !== lastRunningIdRef.current) {
      lastRunningIdRef.current = runningId;
      // Delay to let npm install + server start finish
      const timer = setTimeout(() => setPreviewKey(k => k + 1), 5000);
      return () => clearTimeout(timer);
    }
  }, [runningDep?.id]);

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

  if (!project) return <div style={{ padding: "2rem", color: "#666" }}>Loading...</div>;

  const isDeploying = deployments.some((d) => ["pending", "generating", "building", "deploying"].includes(d.status));
  const currentDep = deployments.find(d => d.status === "running") || deployments[0];
  const previewUrl = `${window.location.protocol}//${project.slug}.${window.location.hostname}`;

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
          {(["chat", "logs", "files", "env", "database", "domains", "github"] as SideTab[]).map((tab) => (
            <button key={tab} style={styles.tab(sideTab === tab)} onClick={() => setSideTab(tab)}>
              {{ chat: "Chat", logs: "Logs", files: "Files", env: "Env", database: "DB", domains: "Domains", github: "Git" }[tab]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={styles.sidebarContent}>
          {sideTab === "chat" && (
            <ChatPanel projectId={project.id} deploying={isDeploying} deployStatus={currentDep?.status} deploymentId={selectedDeployment} onDeploy={(prompt) => {
              if (!id) return;
              api.deploy(id, prompt).then((dep) => {
                setSelectedDeployment(dep.id);
                refresh();
              }).catch(() => {});
            }} />
          )}
          <div style={{ display: sideTab === "logs" ? "flex" : "none", flex: 1, minHeight: 0, flexDirection: "column" }}>
            <LogViewer deploymentId={selectedDeployment} />
          </div>
          {sideTab === "files" && <FileViewer projectId={project.id} />}
          {sideTab === "env" && <EnvVarsPanel projectId={project.id} />}
          {sideTab === "database" && <DatabasePanel projectId={project.id} />}
          {sideTab === "domains" && <DomainsPanel projectId={project.id} projectSlug={project.slug} />}
          {sideTab === "github" && <GitHubPanel projectId={project.id} />}
        </div>
      </div>

      {/* Main area — Preview */}
      <div style={styles.main}>
        {/* URL bar */}
        <div style={styles.previewBar}>
          <div style={styles.urlBar}>
            <input
              style={styles.urlInput}
              value={runningDep ? previewUrl : ""}
              placeholder="Deploy to see preview"
              readOnly
            />
            {runningDep && (
              <>
                <button style={styles.refreshBtn} onClick={() => setPreviewKey(k => k + 1)}>Refresh</button>
                <a href={previewUrl} target="_blank" rel="noreferrer" style={styles.openBtn}>Open</a>
              </>
            )}
          </div>
        </div>

        {/* Preview iframe or placeholder */}
        {runningDep ? (
          <div style={styles.preview}>
            <iframe
              key={previewKey}
              src={previewUrl}
              style={styles.previewIframe}
              title="App Preview"
            />
          </div>
        ) : (
          <div style={styles.previewEmpty}>
            {isDeploying ? (
              <>
                <div style={styles.previewSpinner}>Building your app...</div>
                <div style={{ fontSize: "0.8rem", color: "#444" }}>Watch the Logs tab for progress</div>
              </>
            ) : (
              <>
                <div>No app running</div>
                <div style={{ fontSize: "0.8rem", color: "#444" }}>Use the Chat tab to describe what you want to build</div>
              </>
            )}
          </div>
        )}
      </div>

      {deleteModal}
    </div>
  );
}
