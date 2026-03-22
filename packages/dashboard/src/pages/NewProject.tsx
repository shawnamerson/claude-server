import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const TEMPLATES = [
  { id: "web-app", name: "Web App", desc: "Express server + HTML/CSS/JS frontend" },
  { id: "react-app", name: "React App", desc: "Express API + React frontend (Vite)" },
  { id: "static-site", name: "Static Site", desc: "HTML/CSS/JS with minimal server" },
];

const styles = {
  container: { maxWidth: "600px" },
  title: { fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" },
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  label: { fontSize: "0.85rem", color: "#aaa", marginBottom: "0.25rem" },
  input: {
    width: "100%",
    padding: "0.75rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "1rem",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "0.75rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "1rem",
    outline: "none",
    minHeight: "150px",
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  button: {
    padding: "0.75rem 1.5rem",
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
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "0.75rem",
  },
  templateCard: (selected: boolean) => ({
    padding: "0.75rem",
    background: selected ? "#1a1035" : "#12121a",
    border: `1px solid ${selected ? "#7c3aed" : "#1e1e30"}`,
    borderRadius: "0.5rem",
    cursor: "pointer",
    transition: "border-color 0.2s",
  }),
  templateName: { fontSize: "0.9rem", fontWeight: 600, color: "#e0e0e0", marginBottom: "0.25rem" },
  templateDesc: { fontSize: "0.75rem", color: "#888" },
};

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("web-app");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const project = await api.createProject(name, description);
      if (description.trim()) {
        api.deploy(project.id, description, template).catch(() => {});
      }
      navigate(`/project/${project.id}`);
      return;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>New Project</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div>
          <div style={styles.label}>Project Name</div>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-awesome-app"
            required
          />
        </div>
        <div>
          <div style={styles.label}>Template</div>
          <div style={styles.templateGrid}>
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                style={styles.templateCard(template === t.id)}
                onClick={() => setTemplate(t.id)}
              >
                <div style={styles.templateName}>{t.name}</div>
                <div style={styles.templateDesc}>{t.desc}</div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
