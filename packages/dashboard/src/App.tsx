import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
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
    padding: "0.5rem 1rem",
    overflow: "hidden",
    width: "100%",
    maxWidth: "1400px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column" as const,
    minHeight: 0,
  },
};

function AppShell({ children, user, onLogout }: { children: React.ReactNode; user: any; onLogout: () => void }) {
  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logo}>JustVibe</Link>
        <Link to="/projects" style={styles.navLink}>Projects</Link>
        <Link to="/new" style={styles.navLink}>New Project</Link>
        <div style={styles.navRight}>
          {user && (
            <>
              <span style={styles.credits}>{user.credits} credits</span>
              <span style={{ fontSize: "0.8rem", color: "#888" }}>{user.email}</span>
              <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
            </>
          )}
        </div>
      </nav>
      <main style={styles.main}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, login, signup, logout, token } = useAuth();
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
    <AppShell user={user} onLogout={logout}>
      <Routes>
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
      </Routes>
    </AppShell>
  );
}
