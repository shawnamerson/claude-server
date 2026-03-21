import { Routes, Route, Link } from "react-router-dom";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";

const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
  },
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    padding: "1rem 2rem",
    borderBottom: "1px solid #1a1a2e",
    background: "#0d0d14",
  },
  logo: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "#a78bfa",
    textDecoration: "none",
  },
  navLink: {
    color: "#888",
    textDecoration: "none",
    fontSize: "0.9rem",
  },
  main: {
    flex: 1,
    padding: "0.75rem 1.5rem",
    maxWidth: "1400px",
    overflow: "hidden",
    width: "100%",
    margin: "0 auto",
  },
};

export default function App() {
  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logo}>Claude Server</Link>
        <Link to="/" style={styles.navLink}>Projects</Link>
        <Link to="/new" style={styles.navLink}>New Project</Link>
      </nav>
      <main style={styles.main}>
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>
      </main>
    </div>
  );
}
