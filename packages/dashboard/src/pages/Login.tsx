import { useState } from "react";
import { Link } from "react-router-dom";

const s = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", padding: "1rem" },
  card: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "2.5rem", width: "100%", maxWidth: "400px" },
  logo: { fontSize: "1.5rem", fontWeight: 800, color: "#a78bfa", textAlign: "center" as const, marginBottom: "0.25rem" },
  subtitle: { fontSize: "0.85rem", color: "#555", textAlign: "center" as const, marginBottom: "2rem" },
  form: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  label: { fontSize: "0.8rem", color: "#888", marginBottom: "0.25rem", display: "block" },
  input: { width: "100%", padding: "0.7rem 0.75rem", background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: "0.5rem", color: "#e0e0e0", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" as const },
  btn: { padding: "0.75rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "1rem", fontWeight: 600, marginTop: "0.25rem", width: "100%" },
  error: { color: "#f87171", fontSize: "0.85rem", textAlign: "center" as const, background: "#1a0a0a", padding: "0.5rem", borderRadius: "0.35rem", border: "1px solid #7f1d1d" },
  success: { color: "#34d399", fontSize: "0.85rem", textAlign: "center" as const, background: "#0a1a14", padding: "0.5rem", borderRadius: "0.35rem", border: "1px solid #064e3b" },
  link: { textAlign: "center" as const, fontSize: "0.85rem", color: "#888", marginTop: "1.25rem" },
  textBtn: { background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontSize: "0.82rem", padding: 0, fontFamily: "inherit" },
};

type Mode = "login" | "forgot" | "reset";

export default function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
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

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Enter your email"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess("Check your email for a 6-digit reset code.");
      setMode("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!code || !newPassword) { setError("Code and new password are required"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password: newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setSuccess("Password reset! You can now sign in.");
      setMode("login");
      setPassword("");
      setCode("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <Link to="/" style={{ ...s.logo, textDecoration: "none", display: "block" }}>VibeStack</Link>
        <div style={s.subtitle}>
          {mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Enter reset code"}
        </div>

        {error && <div style={{ ...s.error, marginBottom: "1rem" }}>{error}</div>}
        {success && <div style={{ ...s.success, marginBottom: "1rem" }}>{success}</div>}

        {mode === "login" && (
          <>
            <form onSubmit={handleLogin} style={s.form}>
              <div>
                <label style={s.label}>Email</label>
                <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
              </div>
              <div>
                <label style={s.label}>Password</label>
                <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
              </div>
              <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button style={s.textBtn} onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}>Forgot password?</button>
            </div>
            <div style={s.link}>
              Don't have an account? <Link to="/signup" style={{ color: "#a78bfa", fontWeight: 600 }}>Create one</Link>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <form onSubmit={handleForgot} style={s.form}>
              <div>
                <label style={s.label}>Email</label>
                <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
              </div>
              <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                {loading ? "Sending..." : "Send reset code"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button style={s.textBtn} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Back to sign in</button>
            </div>
          </>
        )}

        {mode === "reset" && (
          <>
            <form onSubmit={handleReset} style={s.form}>
              <div>
                <label style={s.label}>6-digit code</label>
                <input style={s.input} type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required autoFocus maxLength={6} />
              </div>
              <div>
                <label style={s.label}>New password</label>
                <input style={s.input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" required />
              </div>
              <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button style={s.textBtn} onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }}>Resend code</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
