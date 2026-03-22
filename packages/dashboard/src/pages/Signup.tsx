import { useState } from "react";
import { Link } from "react-router-dom";

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0f",
  },
  card: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "2rem",
    width: "100%",
    maxWidth: "380px",
  },
  title: { fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" as const, color: "#a78bfa" },
  subtitle: { fontSize: "0.85rem", color: "#888", textAlign: "center" as const, marginBottom: "1.5rem" },
  form: { display: "flex", flexDirection: "column" as const, gap: "0.75rem" },
  label: { fontSize: "0.8rem", color: "#888", marginBottom: "0.15rem" },
  input: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "0.9rem",
    outline: "none",
  },
  btn: {
    padding: "0.7rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    marginTop: "0.5rem",
  },
  error: { color: "#f87171", fontSize: "0.85rem", textAlign: "center" as const },
  link: { textAlign: "center" as const, fontSize: "0.85rem", color: "#888", marginTop: "1rem" },
};

export default function Signup({ onSignup }: { onSignup: (email: string, password: string, name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSignup(email, password, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create Account</h1>
        <div style={styles.subtitle}>Start with 3 free build credits</div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div>
            <div style={styles.label}>Name</div>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <div style={styles.label}>Email</div>
            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <div style={styles.label}>Password</div>
            <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <div style={styles.link}>
          Already have an account? <Link to="/login" style={{ color: "#a78bfa" }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
