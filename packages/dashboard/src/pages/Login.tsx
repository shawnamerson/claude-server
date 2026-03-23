import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const s = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", padding: "1rem" },
  card: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "2.5rem", width: "100%", maxWidth: "400px" },
  logo: { fontSize: "1.5rem", fontWeight: 800, color: "#a78bfa", textAlign: "center" as const, marginBottom: "0.25rem" },
  subtitle: { fontSize: "0.85rem", color: "#555", textAlign: "center" as const, marginBottom: "2rem" },
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  label: { fontSize: "0.8rem", color: "#888", marginBottom: "0.25rem", display: "block" },
  input: { width: "100%", padding: "0.7rem 0.75rem", background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: "0.5rem", color: "#e0e0e0", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" as const },
  inputFocus: { borderColor: "#7c3aed" },
  btn: { padding: "0.75rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "1rem", fontWeight: 600, marginTop: "0.25rem", width: "100%" },
  error: { color: "#f87171", fontSize: "0.85rem", textAlign: "center" as const, background: "#1a0a0a", padding: "0.5rem", borderRadius: "0.35rem", border: "1px solid #7f1d1d" },
  link: { textAlign: "center" as const, fontSize: "0.85rem", color: "#888", marginTop: "1.25rem" },
  divider: { textAlign: "center" as const, color: "#333", fontSize: "0.8rem", margin: "1rem 0", position: "relative" as const },
};

export default function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Email and password are required"); return; }
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <Link to="/" style={{ ...s.logo, textDecoration: "none" }}>JustVibe</Link>
        <div style={s.subtitle}>Welcome back</div>
        <form onSubmit={handleSubmit} style={s.form}>
          <div>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
          </div>
          <div>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div style={s.link}>
          Don't have an account? <Link to="/signup" style={{ color: "#a78bfa", fontWeight: 600 }}>Create one</Link>
        </div>
      </div>
    </div>
  );
}
