import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

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
};

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const project = await api.createProject(name, description);
      if (description.trim()) {
        api.deploy(project.id, description).catch(() => {});
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
