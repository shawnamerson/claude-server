import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Project } from "../api/client";
import StatusBadge from "../components/StatusBadge";

const styles = {
  container: {
    padding: "0.5rem 1.5rem",
    width: "100%",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  title: { fontSize: "1.5rem", fontWeight: 600 },
  newBtn: {
    padding: "0.5rem 1.25rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "1rem",
  },
  card: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1.25rem",
    textDecoration: "none",
    color: "inherit",
    transition: "border-color 0.2s, transform 0.2s",
    animation: "fadeInUp 0.3s ease",
  },
  cardHover: {
    borderColor: "#7c3aed",
    transform: "scale(1.02)",
  },
  cardName: { fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" },
  cardDesc: { fontSize: "0.85rem", color: "#888", marginBottom: "0.75rem" },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "0.8rem",
    color: "#666",
  },
  empty: {
    textAlign: "center" as const,
    color: "#666",
    padding: "4rem",
    fontSize: "1.1rem",
  },
  skeleton: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1.25rem",
  },
  skeletonLine: {
    borderRadius: "0.25rem",
    background: "linear-gradient(90deg, #1e1e30 25%, #2a2a40 50%, #1e1e30 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.5s infinite",
  },
};

function SkeletonCard() {
  return (
    <div style={styles.skeleton}>
      <div style={{ ...styles.skeletonLine, width: "60%", height: "1.1rem", marginBottom: "0.75rem" }} />
      <div style={{ ...styles.skeletonLine, width: "90%", height: "0.75rem", marginBottom: "0.5rem" }} />
      <div style={{ ...styles.skeletonLine, width: "40%", height: "0.75rem", marginBottom: "1rem" }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ ...styles.skeletonLine, width: "4rem", height: "1.2rem", borderRadius: "9999px" }} />
        <div style={{ ...styles.skeletonLine, width: "2.5rem", height: "0.85rem" }} />
      </div>
    </div>
  );
}

const teamBadgeStyle = {
  fontSize: "0.7rem",
  fontWeight: 600,
  padding: "0.15rem 0.5rem",
  borderRadius: "9999px",
  background: "#7c3aed22",
  color: "#a78bfa",
  marginLeft: "0.5rem",
  whiteSpace: "nowrap" as const,
};

function ProjectCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  const teamName = (project as any).team_name;
  return (
    <Link
      to={`/project/${project.id}`}
      style={{ ...styles.card, ...(hovered ? styles.cardHover : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={styles.cardName}>{project.name}</div>
        {teamName && <span style={teamBadgeStyle}>{teamName}</span>}
      </div>
      <div style={styles.cardDesc}>
        {project.description?.slice(0, 100) || "No description"}
      </div>
      <div style={styles.cardFooter}>
        <StatusBadge status={project.latest_status || "none"} />
        <span>{(project as any).deploys_this_month || 0} deploys this month</span>
      </div>
    </Link>
  );
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.listProjects().then(p => {
      setProjects(p);
      // First-time users with no projects — send them to create one
      if (p.length === 0) navigate("/new", { replace: true });
    }).finally(() => setLoading(false));
    // Poll for status updates every 5 seconds
    const interval = setInterval(() => {
      api.listProjects().then(setProjects);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Projects</h1>
          <Link to="/new" style={styles.newBtn}>New Project</Link>
        </div>
        <div style={styles.grid}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Projects</h1>
        <Link to="/new" style={styles.newBtn}>New Project</Link>
      </div>

      {projects.length === 0 ? (
        <div style={styles.empty}>
          No projects yet. Create one and tell Claude what to build.
        </div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
