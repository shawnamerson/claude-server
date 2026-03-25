import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { track } from "../hooks/useTrack";

const styles = {
  container: { maxWidth: "800px", padding: "4rem 2rem", margin: "0 auto" },
  title: { fontSize: "2.2rem", fontWeight: 700, marginBottom: "2.5rem" },
  form: { display: "flex", flexDirection: "column" as const, gap: "1.5rem" },
  label: { fontSize: "1.05rem", color: "#aaa", marginBottom: "0.4rem" },
  input: {
    width: "100%",
    padding: "1rem 1.2rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "1.15rem",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "1rem 1.2rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "1.15rem",
    outline: "none",
    minHeight: "250px",
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  button: {
    padding: "1rem 2rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 500,
    marginTop: "0.5rem",
  },
  hint: { fontSize: "0.8rem", color: "#666" },
};

export default function NewProject() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showWarning } = useToast();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState(searchParams.get("prompt") || "");
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{ projectCount: number; projectLimit: number } | null>(null);

  useEffect(() => {
    api.getBillingStatus().then(status => {
      if (status.projectLimit > 0 && status.projectCount >= status.projectLimit) {
        setLimitReached(true);
        setLimitInfo(status);
        track("project_limit_reached", { count: status.projectCount, limit: status.projectLimit });
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    track("create_project_clicked", { hasDescription: !!description.trim() });
    try {
      const project = await api.createProject(name, description);
      track("project_created", { slug: project.slug });
      if (description.trim()) {
        track("first_deploy_started", { slug: project.slug });
        const dep = await api.deploy(project.id, description);
        navigate(`/project/${project.id}?dep=${dep.id}`);
      } else {
        navigate(`/project/${project.id}`);
      }
      return;
    } catch (err) {
      track("create_project_error", { error: err instanceof Error ? err.message : "unknown" });
      showError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  if (user && !user.email_verified) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "60vh" }}>
        <div style={{ background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "2.5rem", textAlign: "center", maxWidth: "420px" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Verify your email</div>
          <div style={{ color: "#888", fontSize: "0.95rem", marginBottom: "1rem" }}>
            Check your inbox for a 6-digit verification code. Enter it in the banner above to start building.
          </div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>
            Didn't get it? Check spam, or the banner above has a resend option.
          </div>
        </div>
      </div>
    );
  }

  if (limitReached) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Project limit reached</h1>
        <div style={{ background: "#1a1a2e", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "1rem", color: "#e0e0e0", marginBottom: "0.5rem" }}>
            You've used {limitInfo?.projectCount} of {limitInfo?.projectLimit} projects on the Free plan.
          </div>
          <div style={{ fontSize: "0.9rem", color: "#888", marginBottom: "1.5rem" }}>
            Upgrade to Pro for unlimited projects.
          </div>
          <Link to="/billing" style={{ display: "inline-block", padding: "0.75rem 2rem", background: "#7c3aed", color: "#fff", borderRadius: "0.5rem", textDecoration: "none", fontSize: "1rem", fontWeight: 600 }}>
            Upgrade plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>New Project</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div>
          <div style={styles.label}>Project Name</div>
          <input
            style={{ ...styles.input, ...(nameError ? { borderColor: "#f59e0b" } : {}) }}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(""); }}
            placeholder="my-awesome-app"
            required
          />
          {nameError && <div style={{ color: "#fbbf24", fontSize: "0.8rem", marginTop: "0.35rem" }}>{nameError}</div>}
        </div>
        <div>
          <div style={styles.label}>What do you want to build?</div>
          <textarea
            style={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your app in plain English. For example:&#10;&#10;A vacation rental marketplace where users can list properties, search by location, and book stays."
          />
          <div style={styles.hint}>
            Describe what you want and Claude will build it.
          </div>
        </div>
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Creating..." : "Create Project"}
        </button>
      </form>
      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <span style={{ color: "#555", fontSize: "0.82rem" }}>Have existing code? </span>
        <span
          style={{ color: "#60a5fa", fontSize: "0.82rem", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
          onClick={() => {
            if (!name.trim()) { setNameError("Enter a project name first"); return; }
            setLoading(true);
            api.createProject(name, "").then(p => navigate(`/project/${p.id}?tab=github`)).catch(err => {
              showError(err instanceof Error ? err.message : "Failed to create project");
              setLoading(false);
            });
          }}
        >Deploy from GitHub</span>
      </div>
    </div>
  );
}
