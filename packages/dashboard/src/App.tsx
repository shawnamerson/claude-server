import { useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api/client";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Billing from "./pages/Billing";
import { useAuth } from "./hooks/useAuth";

const styles = {
  app: {
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    padding: "0.6rem 1.5rem",
    borderBottom: "1px solid #1a1a2e",
    background: "#0d0d14",
    flexShrink: 0,
  },
  logo: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#a78bfa",
    textDecoration: "none",
  },
  navLink: {
    color: "#888",
    textDecoration: "none",
    fontSize: "0.85rem",
  },
  navRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  credits: {
    fontSize: "0.8rem",
    color: "#a78bfa",
    background: "#7c3aed22",
    padding: "0.2rem 0.6rem",
    borderRadius: "9999px",
  },
  logoutBtn: {
    background: "none",
    border: "none",
    color: "#666",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  main: {
    flex: 1,
    padding: "0",
    overflow: "hidden",
    width: "100%",
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
  },
};

function VerifyBanner({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      await api.verifyEmail(code);
      await onVerified();
      // Force re-render if state didn't update
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #7c3aed44", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.85rem" }}>
      <span style={{ color: "#f59e0b" }}>Verify your email to start deploying.</span>
      <input
        style={{ padding: "0.35rem 0.5rem", background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.35rem", color: "#e0e0e0", fontSize: "0.85rem", width: "100px", outline: "none" }}
        placeholder="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleVerify()}
      />
      <button
        style={{ padding: "0.35rem 0.75rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.35rem", cursor: "pointer", fontSize: "0.8rem" }}
        onClick={handleVerify}
        disabled={loading}
      >{loading ? "..." : "Verify"}</button>
      {error && <span style={{ color: "#f87171", fontSize: "0.8rem" }}>{error}</span>}
      <span style={{ color: "#555", fontSize: "0.75rem", marginLeft: "auto" }}>Check your email for the code</span>
    </div>
  );
}

function AppShell({ children, user, onLogout, onRefresh }: { children: React.ReactNode; user: any; onLogout: () => void; onRefresh: () => void }) {
  return (
    <div style={styles.app}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        *::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
        button { transition: opacity 0.15s, transform 0.15s; }
        button:hover:not(:disabled) { opacity: 0.85; }
        button:active:not(:disabled) { transform: scale(0.97); }
        button:focus-visible { outline: 2px solid #7c3aed; outline-offset: 2px; }
        input, textarea { transition: border-color 0.2s; }
        input:focus, textarea:focus { border-color: #7c3aed !important; }
        a { transition: opacity 0.15s; }
        a:hover { opacity: 0.8; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logo}>VibeStack</Link>
        <Link to="/projects" style={styles.navLink}>Projects</Link>
        <Link to="/new" style={styles.navLink}>New Project</Link>
        <div style={styles.navRight}>
          {user && (
            <>
              <Link to="/billing" style={{ fontSize: "0.8rem", color: "#a78bfa", textDecoration: "none" }}>Billing</Link>
              <span style={{ fontSize: "0.8rem", color: "#888" }}>{user.email}</span>
              <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
            </>
          )}
        </div>
      </nav>
      {user && !user.email_verified && (
        <VerifyBanner onVerified={onRefresh} />
      )}
      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, login, signup, logout, token, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Store token globally for API client to use
  if (typeof window !== "undefined") {
    (window as any).__authToken = token;
  }

  if (loading) return <div style={{ background: "#0a0a0f", height: "100vh" }} />;

  const isLanding = location.pathname === "/";
  const isAuth = location.pathname === "/login" || location.pathname === "/signup";

  if (isLanding) return <Landing />;

  if (isAuth) {
    return (
      <Routes>
        <Route path="/login" element={
          <Login onLogin={async (email, password) => {
            await login(email, password);
            navigate("/projects");
          }} />
        } />
        <Route path="/signup" element={
          <Signup onSignup={async (email, password, name) => {
            await signup(email, password, name);
            navigate("/projects");
          }} />
        } />
      </Routes>
    );
  }

  // Require auth for dashboard pages
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={
          <Login onLogin={async (email, password) => {
            await login(email, password);
            navigate(location.pathname);
          }} />
        } />
      </Routes>
    );
  }

  return (
    <AppShell user={user} onLogout={() => { logout(); navigate("/"); }} onRefresh={refreshUser}>
      <Routes>
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="/billing" element={<Billing />} />
      </Routes>
    </AppShell>
  );
}
