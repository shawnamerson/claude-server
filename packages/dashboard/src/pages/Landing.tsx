import { Link } from "react-router-dom";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0f",
    overflow: "auto",
  },
  hero: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "4rem 2rem",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-block",
    padding: "0.3rem 0.8rem",
    background: "#7c3aed22",
    border: "1px solid #7c3aed44",
    borderRadius: "9999px",
    fontSize: "0.8rem",
    color: "#a78bfa",
    marginBottom: "1.5rem",
  },
  title: {
    fontSize: "3.5rem",
    fontWeight: 800,
    lineHeight: 1.1,
    marginBottom: "1.5rem",
    background: "linear-gradient(135deg, #e0e0e0 0%, #a78bfa 50%, #7c3aed 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: "1.25rem",
    color: "#888",
    lineHeight: 1.6,
    maxWidth: "600px",
    margin: "0 auto 2.5rem",
  },
  cta: {
    display: "inline-block",
    padding: "0.9rem 2.5rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.6rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  secondaryCta: {
    display: "inline-block",
    padding: "0.9rem 2.5rem",
    background: "transparent",
    color: "#a78bfa",
    border: "1px solid #7c3aed44",
    borderRadius: "0.6rem",
    fontSize: "1.1rem",
    fontWeight: 500,
    textDecoration: "none",
    marginLeft: "1rem",
  },
  features: {
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "2rem 2rem 4rem",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "1.5rem",
  },
  featureCard: {
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.75rem",
    padding: "1.5rem",
  },
  featureIcon: {
    fontSize: "1.5rem",
    marginBottom: "0.75rem",
  },
  featureTitle: {
    fontSize: "1.05rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#e0e0e0",
  },
  featureDesc: {
    fontSize: "0.9rem",
    color: "#888",
    lineHeight: 1.5,
  },
  how: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "3rem 2rem",
  },
  howTitle: {
    fontSize: "2rem",
    fontWeight: 700,
    textAlign: "center" as const,
    marginBottom: "2.5rem",
    color: "#e0e0e0",
  },
  steps: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.5rem",
  },
  step: {
    display: "flex",
    gap: "1.25rem",
    alignItems: "flex-start",
  },
  stepNum: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "#7c3aed",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.9rem",
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    marginBottom: "0.3rem",
    color: "#e0e0e0",
  },
  stepDesc: {
    fontSize: "0.9rem",
    color: "#888",
    lineHeight: 1.5,
  },
  footer: {
    textAlign: "center" as const,
    padding: "3rem 2rem",
    borderTop: "1px solid #1e1e30",
    color: "#555",
    fontSize: "0.85rem",
  },
};

const features = [
  {
    icon: "AI",
    title: "Describe, Don't Code",
    desc: "Tell Claude what you want to build in plain English. It generates the entire codebase, Dockerfile, and configs.",
  },
  {
    icon: ">>",
    title: "Instant Deploy",
    desc: "Your app is built and deployed in a Docker container automatically. Get a live URL in minutes.",
  },
  {
    icon: "{}",
    title: "Auto-Fix Errors",
    desc: "If your app crashes, Claude detects the error, fixes the code, and redeploys — all without you lifting a finger.",
  },
  {
    icon: "DB",
    title: "Managed Databases",
    desc: "One-click PostgreSQL databases. Connection string is automatically injected into your app.",
  },
  {
    icon: "//",
    title: "Built-In Editor",
    desc: "View and edit your generated code directly in the browser. Full file tree with syntax highlighting.",
  },
  {
    icon: "@",
    title: "Custom Domains",
    desc: "Every project gets a subdomain automatically. Add your own custom domain with automatic HTTPS.",
  },
];

const steps = [
  {
    title: "Describe your app",
    desc: "\"Build me a vacation rental site like Airbnb with search, listings, and booking.\"",
  },
  {
    title: "Claude builds it",
    desc: "Claude plans the architecture, generates all the code, creates a Dockerfile, and builds a Docker image.",
  },
  {
    title: "It's live",
    desc: "Your app is deployed and accessible at a URL. Chat with Claude to iterate, add features, or fix issues.",
  },
];

export default function Landing() {
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.badge}>Powered by Claude AI</div>
        <h1 style={styles.title}>Describe it. Deploy it.</h1>
        <p style={styles.subtitle}>
          Tell Claude what you want to build and it generates, deploys, and maintains your app automatically. No coding required.
        </p>
        <Link to="/signup" style={styles.cta}>Start Building Free</Link>
        <a href="#how" style={styles.secondaryCta}>How it works</a>
      </div>

      <div style={styles.features}>
        {features.map((f, i) => (
          <div key={i} style={styles.featureCard}>
            <div style={{ ...styles.featureIcon, color: "#a78bfa" }}>{f.icon}</div>
            <div style={styles.featureTitle}>{f.title}</div>
            <div style={styles.featureDesc}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div id="how" style={styles.how}>
        <h2 style={styles.howTitle}>How it works</h2>
        <div style={styles.steps}>
          {steps.map((s, i) => (
            <div key={i} style={styles.step}>
              <div style={styles.stepNum}>{i + 1}</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>{s.title}</div>
                <div style={styles.stepDesc}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Link to="/signup" style={styles.cta}>Start Building Free</Link>
      </div>

      <div style={styles.footer}>
        Built with Claude AI
      </div>
    </div>
  );
}
