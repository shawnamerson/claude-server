import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, Project, Deployment } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import LogViewer from "../components/LogViewer";
import ChatPanel from "../components/ChatPanel";
import FileViewer from "../components/FileViewer";
import EnvVarsPanel from "../components/EnvVarsPanel";
import GitHubPanel from "../components/GitHubPanel";
import DatabasePanel from "../components/DatabasePanel";
import DomainsPanel from "../components/DomainsPanel";

type Tab = "logs" | "files" | "env" | "database" | "domains" | "github";

const styles = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.25rem 0",
    flexShrink: 0,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  name: { fontSize: "1.1rem", fontWeight: 600 },
  actions: { display: "flex", gap: "0.5rem", alignItems: "center" },
  dangerBtn: {
    padding: "0.4rem 0.8rem",
    background: "#450a0a",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  stopBtn: {
    padding: "0.15rem 0.5rem",
    background: "#1a1a2e",
    color: "#f59e0b",
    border: "1px solid #92400e",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  deploymentBar: {
    display: "flex",
    gap: "0.4rem",
    paddingBottom: "0.25rem",
    flexShrink: 0,
    flexWrap: "wrap" as const,
    overflow: "hidden",
    maxHeight: "2rem",
  },
  deployItem: {
    padding: "0.3rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  deployItemActive: {
    borderColor: "#7c3aed",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.5rem",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  leftPanel: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
    overflow: "hidden",
  },
  rightPanel: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    gap: "0",
    flexShrink: 0,
    marginBottom: "0.25rem",
  },
  tab: {
    padding: "0.25rem 0.6rem",
    background: "transparent",
    color: "#666",
    border: "1px solid #1e1e30",
    borderBottom: "none",
    cursor: "pointer",
    fontSize: "0.75rem",
    borderRadius: "0.35rem 0.35rem 0 0",
  },
  tabActive: {
    background: "#0a0a0f",
    color: "#a78bfa",
    borderColor: "#7c3aed",
  },
  sectionTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#aaa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    flexShrink: 0,
    marginBottom: "0.25rem",
  },
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<Tab>("logs");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
          setSelectedDeployment((prev) => prev || deps[0].id);
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
    }} onClick={() => setShowDeleteModal(false)}>
      <div style={{
        background: "#12121a", border: "1px solid #1e1e30",
        borderRadius: "0.75rem", padding: "1.5rem", maxWidth: "400px", width: "90%",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Delete Project
        </div>
        <div style={{ color: "#888", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          Are you sure you want to delete <strong style={{ color: "#e0e0e0" }}>{project?.name}</strong>? This will stop all containers and remove all files. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            style={{
              padding: "0.5rem 1rem", background: "#1a1a2e", color: "#aaa",
              border: "1px solid #2e2e4a", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem",
            }}
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </button>
          <button
            style={{
              padding: "0.5rem 1rem", background: "#dc2626", color: "#fff",
              border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem",
            }}
            onClick={() => { setShowDeleteModal(false); handleDelete(); }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  if (!project) return <div>Loading...</div>;

  const runningDep = deployments.find((d) => d.status === "running");
  const isDeploying = deployments.some((d) => ["pending", "generating", "building", "deploying"].includes(d.status));

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.titleRow}>
          <div style={styles.name}>{project.name}</div>
          {(project as any).usage?.total_cost_cents > 0 && (
            <span style={{
              fontSize: "0.75rem",
              color: "#888",
              background: "#1a1a2e",
              padding: "0.15rem 0.5rem",
              borderRadius: "9999px",
            }}>
              {(project as any).usage.deploys} deploys &middot; ${((project as any).usage.total_cost_cents / 100).toFixed(2)} API cost
            </span>
          )}
          {runningDep?.port && (
            <a
              href={`${window.location.protocol}//${project.slug}.${window.location.hostname}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#60a5fa", fontSize: "0.8rem" }}
            >
              {project.slug}.{window.location.hostname}
            </a>
          )}
        </div>
        <div style={styles.actions}>
          <button style={styles.dangerBtn} onClick={() => setShowDeleteModal(true)}>Delete</button>
        </div>
      </div>

      {/* Current deployment status */}
      {deployments.length > 0 && (
        <div style={styles.deploymentBar}>
          {(() => {
            const current = deployments[0]; // Most recent
            return (
              <div
                style={{ ...styles.deployItem, ...styles.deployItemActive }}
                onClick={() => setSelectedDeployment(current.id)}
              >
                <StatusBadge status={current.status} />
                {current.status === "running" && (
                  <button
                    style={styles.stopBtn}
                    onClick={(e) => { e.stopPropagation(); handleStop(current.id); }}
                  >
                    Stop
                  </button>
                )}
                {(current.status === "stopped" || current.status === "failed") && current.dockerfile && (
                  <button
                    style={{ ...styles.stopBtn, color: "#34d399", borderColor: "#064e3b" }}
                    onClick={(e) => { e.stopPropagation(); handleStart(current.id); }}
                  >
                    Start
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Main content */}
      <div style={styles.grid}>
        {/* Left panel: Tabs for Logs / Files / Env / GitHub */}
        <div style={styles.leftPanel}>
          <div style={styles.tabs}>
            {(["logs", "files", "env", "database", "domains", "github"] as Tab[]).map((tab) => (
              <button
                key={tab}
                style={{ ...styles.tab, ...(leftTab === tab ? styles.tabActive : {}) }}
                onClick={() => setLeftTab(tab)}
              >
                {{ logs: "Logs", files: "Files", env: "Env", database: "DB", domains: "Domains", github: "Git" }[tab]}
              </button>
            ))}
          </div>
          <div style={{ display: leftTab === "logs" ? "flex" : "none", flex: 1, minHeight: 0, overflow: "hidden", flexDirection: "column" }}>
            <LogViewer deploymentId={selectedDeployment} />
          </div>
          {leftTab === "files" && <FileViewer projectId={project.id} />}
          {leftTab === "env" && <EnvVarsPanel projectId={project.id} />}
          {leftTab === "database" && <DatabasePanel projectId={project.id} />}
          {leftTab === "domains" && <DomainsPanel projectId={project.id} projectSlug={project.slug} />}
          {leftTab === "github" && <GitHubPanel projectId={project.id} />}
        </div>

        {/* Right panel: Chat */}
        <div style={styles.rightPanel}>
          <div style={styles.sectionTitle}>Chat with Claude</div>
          <ChatPanel projectId={project.id} deploying={isDeploying} deployStatus={deployments[0]?.status} onDeploy={(prompt) => {
            if (!id) return;
            api.deploy(id, prompt).then((dep) => {
              setSelectedDeployment(dep.id);
              setLeftTab("logs");
              refresh();
            }).catch(() => {});
          }} />
        </div>
      </div>
      {deleteModal}
    </div>
  );
}
