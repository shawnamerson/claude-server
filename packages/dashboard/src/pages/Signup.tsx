import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const s = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", padding: "1rem" },
  card: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "2.5rem", width: "100%", maxWidth: "400px" },
  logo: { fontSize: "1.5rem", fontWeight: 800, color: "#a78bfa", textAlign: "center" as const, marginBottom: "0.25rem" },
  subtitle: { fontSize: "0.85rem", color: "#555", textAlign: "center" as const, marginBottom: "2rem" },
  badge: { display: "inline-block", padding: "0.2rem 0.6rem", background: "#34d39920", color: "#34d399", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600 },
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  label: { fontSize: "0.8rem", color: "#888", marginBottom: "0.25rem", display: "block" },
  input: { width: "100%", padding: "0.7rem 0.75rem", background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: "0.5rem", color: "#e0e0e0", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" as const },
  hint: { fontSize: "0.72rem", color: "#555", marginTop: "0.25rem" },
  btn: { padding: "0.75rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "1rem", fontWeight: 600, marginTop: "0.25rem", width: "100%" },
  error: { color: "#f87171", fontSize: "0.85rem", textAlign: "center" as const, background: "#1a0a0a", padding: "0.5rem", borderRadius: "0.35rem", border: "1px solid #7f1d1d" },
  link: { textAlign: "center" as const, fontSize: "0.85rem", color: "#888", marginTop: "1.25rem" },
};

export default function Signup({ onSignup }: { onSignup: (email: string, password: string, name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Email is required"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }

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
    <div style={s.page}>
      <div style={s.card}>
        <Link to="/" style={{ ...s.logo, textDecoration: "none" }}>JustVibe</Link>
        <div style={s.subtitle}>Start building for free <span style={s.badge}>3 free deploys</span></div>
        <form onSubmit={handleSubmit} style={s.form}>
          <div>
            <label style={s.label}>Name</label>
            <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoFocus />
          </div>
          <div>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
          </div>
          <div>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
          </div>
          <div>
            <label style={s.label}>Confirm password</label>
            <input style={s.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" required />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <div style={s.link}>
          Already have an account? <Link to="/login" style={{ color: "#a78bfa", fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
