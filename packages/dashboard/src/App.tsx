import { useState, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api/client";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Billing from "./pages/Billing";
import About from "./pages/About";
import Blog from "./pages/Blog";
import FAQ from "./pages/FAQ";
import Privacy from "./pages/Privacy";
import Admin from "./pages/Admin";
import TeamSettings from "./pages/TeamSettings";
import TeamList from "./pages/TeamList";
import Settings from "./pages/Settings";
import { useAuth } from "./hooks/useAuth";
import { useAnalytics } from "./hooks/useAnalytics";
import { track } from "./hooks/useTrack";

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

function useAdminCheck(token: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!token) { setIsAdmin(false); return; }
    const headers: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    fetch("/api/admin/check", { headers })
      .then((r) => r.json())
      .then((data: { isAdmin: boolean }) => setIsAdmin(data.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [token]);
  return isAdmin;
}

function AppShell({ children, user, onLogout, onRefresh, isAdmin }: { children: React.ReactNode; user: any; onLogout: () => void; onRefresh: () => void; isAdmin: boolean }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navLocation = useLocation();
  useEffect(() => { setMobileMenuOpen(false); }, [navLocation.pathname]);
  return (
    <div style={styles.app} className="vs-app">
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

        /* Mobile responsive */
        .vs-hamburger { display: none; background: none; border: none; color: #888; font-size: 1.4rem; cursor: pointer; padding: 0.2rem; line-height: 1; }
        .vs-mobile-menu { display: none; }
        @media (max-width: 768px) {
          .vs-hamburger { display: block; margin-left: auto; }
          .vs-nav { flex-wrap: nowrap; gap: 0.5rem !important; padding: 0.5rem 0.75rem !important; }
          .vs-nav-links { display: none !important; }
          .vs-nav-right { display: none !important; }
          .vs-mobile-menu { display: none; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.75rem; background: #0d0d14; border-bottom: 1px solid #1a1a2e; }
          .vs-mobile-menu.open { display: flex; }
          .vs-mobile-menu a, .vs-mobile-menu button { display: block; padding: 0.5rem 0; color: #888; text-decoration: none; font-size: 0.9rem; background: none; border: none; text-align: left; cursor: pointer; font-family: inherit; }
          .vs-app { overflow: auto !important; height: auto !important; min-height: 100vh !important; }
          .vs-main { overflow: auto !important; }
          .vs-project-detail { flex-direction: column !important; }
          .vs-project-sidebar { width: 100% !important; max-width: 100% !important; min-width: 0 !important; height: 50vh !important; }
          .vs-project-main { flex: 1 !important; min-height: 40vh !important; }
          .vs-project-tabs { overflow-x: auto; scrollbar-width: none; flex-wrap: nowrap !important; }
          .vs-project-tabs::-webkit-scrollbar { display: none; }
          .vs-project-tabs button { flex-shrink: 0; font-size: 0.75rem !important; padding: 0.35rem 0.5rem !important; }
          .vs-admin-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .vs-admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <nav style={styles.nav} className="vs-nav">
        <Link to="/" style={styles.logo}>VibeStack</Link>
        <div className="vs-nav-links">
          <Link to="/projects" style={styles.navLink}>Projects</Link>
          <Link to="/new" style={styles.navLink}>New</Link>
          <Link to="/billing" style={styles.navLink}>Billing</Link>
          <Link to="/teams" style={styles.navLink}>Teams</Link>
          <Link to="/settings" style={styles.navLink}>Settings</Link>
          {isAdmin && <Link to="/admin" style={{ ...styles.navLink, color: "#f59e0b" }}>Admin</Link>}
        </div>
        <div style={styles.navRight} className="vs-nav-right">
          {user && (
            <>
              <span className="vs-email" style={{ fontSize: "0.8rem", color: "#888" }}>{user.email}</span>
              <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
            </>
          )}
        </div>
        <button className="vs-hamburger" onClick={() => setMobileMenuOpen(v => !v)}>{mobileMenuOpen ? "\u2715" : "\u2630"}</button>
      </nav>
      <div className={`vs-mobile-menu ${mobileMenuOpen ? "open" : ""}`}>
        <Link to="/projects">Projects</Link>
        <Link to="/new">New Project</Link>
        <Link to="/billing">Billing</Link>
        <Link to="/teams">Teams</Link>
        <Link to="/settings">Settings</Link>
        {isAdmin && <Link to="/admin" style={{ color: "#f59e0b" }}>Admin</Link>}
        {user && <button onClick={onLogout} style={{ color: "#666" }}>Logout ({user.email})</button>}
      </div>
      {user && !user.email_verified && (
        <VerifyBanner onVerified={onRefresh} />
      )}
      <main style={styles.main} className="vs-main">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, login, signup, logout, token, refreshUser } = useAuth();
  useAnalytics();
  const isAdmin = useAdminCheck(token);
  const location = useLocation();
  const navigate = useNavigate();

  // Store token globally for API client to use
  if (typeof window !== "undefined") {
    (window as any).__authToken = token;
  }

  if (loading) return <div style={{ background: "#0a0a0f", height: "100vh" }} />;

  const isLanding = location.pathname === "/";
  const isAuth = location.pathname === "/login" || location.pathname === "/signup";
  const isPublicPage = ["/about", "/blog", "/faq", "/privacy"].includes(location.pathname);

  if (isLanding) return <Landing />;

  if (isPublicPage) {
    return (
      <Routes>
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    );
  }

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
            track("signed_up", {
              referrer: document.referrer || "(direct)",
              landingPage: sessionStorage.getItem("vs_landing") || "/",
              utm_source: sessionStorage.getItem("vs_utm_source") || "",
              utm_medium: sessionStorage.getItem("vs_utm_medium") || "",
              utm_campaign: sessionStorage.getItem("vs_utm_campaign") || "",
            });
            const params = new URLSearchParams(window.location.search);
            const prompt = params.get("prompt");
            // Always send new users to create their first project
            navigate(prompt ? `/new?prompt=${encodeURIComponent(prompt)}` : "/new");
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
    <AppShell user={user} onLogout={() => { logout(); navigate("/"); }} onRefresh={refreshUser} isAdmin={isAdmin}>
      <Routes>
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/teams" element={<TeamList />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/team/:teamId" element={<TeamSettings />} />
        <Route path="/admin" element={isAdmin ? <Admin /> : <ProjectList />} />
        <Route path="*" element={<ProjectList />} />
      </Routes>
    </AppShell>
  );
}
