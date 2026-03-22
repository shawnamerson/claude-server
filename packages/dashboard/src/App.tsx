import { Routes, Route, Link } from "react-router-dom";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";

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
