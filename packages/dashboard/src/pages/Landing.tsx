import { Link } from "react-router-dom";

const responsiveCSS = `
  .jv-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  .jv-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
  .jv-comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .jv-nav-links { display: flex; gap: 1.5rem; align-items: center; }
  .jv-title { font-size: 3.2rem; }
  @media (max-width: 768px) {
    .jv-feature-grid { grid-template-columns: 1fr; }
    .jv-steps-grid { grid-template-columns: 1fr; }
    .jv-comp-grid { grid-template-columns: 1fr; }
    .jv-nav-links a:not(:last-child) { display: none; }
    .jv-title { font-size: 2rem; }
  }
`;

export default function Landing() {
  return (
    <div style={s.page}>
      <style>{responsiveCSS}</style>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>JustVibe</div>
        <div className="jv-nav-links">
          <a href="#features" style={s.navLink}>Features</a>
          <a href="#how" style={s.navLink}>How it works</a>
          <Link to="/login" style={s.navLink}>Log in</Link>
          <Link to="/signup" style={s.ctaSmall}>Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.badge}>Vibe coding, perfected</div>
        <h1 className="jv-title" style={s.title}>Describe your app.<br />Watch it build.</h1>
        <p style={s.subtitle}>
          Tell AI what you want. Watch it write code, test it, and deploy — all in real-time.
          Your app is live in under a minute.
        </p>
        <div style={s.ctaRow}>
          <Link to="/signup" style={s.cta}>Start building free</Link>
        </div>
        {/* Fake terminal preview */}
        <div style={s.terminal}>
          <div style={s.termBar}>
            <div style={s.termDots}>
              <span style={{ ...s.termDot, background: "#f87171" }} />
              <span style={{ ...s.termDot, background: "#f59e0b" }} />
              <span style={{ ...s.termDot, background: "#34d399" }} />
            </div>
            <span style={s.termTitle}>JustVibe</span>
          </div>
          <div style={s.termBody}>
            <div style={s.termLine}><span style={s.termUser}>You:</span> Build me a marketplace like Etsy</div>
            <div style={{ height: "0.5rem" }} />
            <div style={s.termLine}><span style={s.termClaude}>Claude:</span> I'll build a marketplace with product listings, user auth, shopping cart, and Stripe checkout...</div>
            <div style={{ height: "0.4rem" }} />
            <div style={s.termFile}>5 files created <span style={s.termFileDetail}>package.json, server.js, public/index.html, public/style.css, public/app.js</span></div>
            <div style={s.termCmd}>$ node -c server.js</div>
            <div style={s.termFile}>2 files created <span style={s.termFileDetail}>Dockerfile, .dockerignore</span></div>
            <div style={{ height: "0.3rem" }} />
            <div style={s.termSuccess}>Deployed! Live at marketplace.justvibe.dev</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features" style={s.features}>
        <h2 style={s.sectionTitle}>Everything you need to ship</h2>
        <div className="jv-feature-grid">
          {features.map((f, i) => (
            <div key={i} style={s.featureCard}>
              <div style={s.featureEmoji}>{f.emoji}</div>
              <div style={s.featureTitle}>{f.title}</div>
              <div style={s.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div id="how" style={s.how}>
        <h2 style={s.sectionTitle}>Three steps. That's it.</h2>
        <div className="jv-steps-grid">
          <div style={s.stepCard}>
            <div style={s.stepNum}>1</div>
            <div style={s.stepTitle}>Describe</div>
            <div style={s.stepDesc}>Type what you want in plain English. "Build me a project management app with kanban boards."</div>
          </div>
          <div style={s.stepCard}>
            <div style={s.stepNum}>2</div>
            <div style={s.stepTitle}>Watch</div>
            <div style={s.stepDesc}>Claude writes code, tests it, fixes errors, and deploys — all streaming in real-time in the chat.</div>
          </div>
          <div style={s.stepCard}>
            <div style={s.stepNum}>3</div>
            <div style={s.stepTitle}>Ship</div>
            <div style={s.stepDesc}>Your app is live with a URL, database, and HTTPS. Iterate by chatting — "add dark mode" or "fix the search".</div>
          </div>
        </div>
      </div>

      {/* vs Bolt comparison */}
      <div style={s.comparison}>
        <h2 style={s.sectionTitle}>Why JustVibe?</h2>
        <div className="jv-comp-grid">
          <div style={s.compCard}>
            <div style={s.compTitle}>Other tools</div>
            <div style={s.compList}>
              <div style={s.compItem}><span style={s.compX}>x</span> Prototypes that don't persist</div>
              <div style={s.compItem}><span style={s.compX}>x</span> No real databases</div>
              <div style={s.compItem}><span style={s.compX}>x</span> Manual deployment required</div>
              <div style={s.compItem}><span style={s.compX}>x</span> Breaks and you're on your own</div>
            </div>
          </div>
          <div style={{ ...s.compCard, borderColor: "#7c3aed" }}>
            <div style={{ ...s.compTitle, color: "#a78bfa" }}>JustVibe</div>
            <div style={s.compList}>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Real apps with real URLs</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> PostgreSQL databases included</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Auto-deployed with HTTPS</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Self-healing — auto-fixes crashes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={s.finalCta}>
        <h2 style={s.finalTitle}>Stop configuring. Start shipping.</h2>
        <p style={s.finalSub}>Your first 3 deploys are free. No credit card required.</p>
        <Link to="/signup" style={s.cta}>Start building free</Link>
      </div>

      <div style={s.footer}>JustVibe — Vibe coding, perfected</div>
    </div>
  );
}

const features = [
  { emoji: ">>", title: "Real-time building", desc: "Watch Claude write code, test it, and fix errors live in the chat. Not a black box — you see everything." },
  { emoji: "DB", title: "Built-in databases", desc: "One-click PostgreSQL. Connection string auto-injected. Schema viewer and query runner included." },
  { emoji: "{}", title: "Code editor", desc: "Full Monaco editor with syntax highlighting. Edit any file, save, and redeploy." },
  { emoji: "!!", title: "Self-healing apps", desc: "If your app crashes, Claude detects it, reads the error logs, fixes the code, and redeploys automatically." },
  { emoji: "@@", title: "Instant preview", desc: "See your app in a live preview as soon as it deploys. No waiting, no manual refresh." },
  { emoji: "//", title: "Custom domains", desc: "Every project gets a subdomain. Add your own domain with automatic HTTPS via Let's Encrypt." },
];

const s = {
  page: { minHeight: "100vh", background: "#0a0a0f", overflow: "auto", color: "#e0e0e0" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 2rem", maxWidth: "1100px", margin: "0 auto" },
  logo: { fontSize: "1.3rem", fontWeight: 800, color: "#a78bfa" },
  navLinks: { display: "flex", gap: "1.5rem", alignItems: "center" },
  navLink: { color: "#888", textDecoration: "none", fontSize: "0.9rem" },
  ctaSmall: { padding: "0.4rem 1rem", background: "#7c3aed", color: "#fff", borderRadius: "0.5rem", textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 },
  hero: { maxWidth: "800px", margin: "0 auto", padding: "3rem 2rem 2rem", textAlign: "center" as const },
  badge: { display: "inline-block", padding: "0.3rem 1rem", background: "#7c3aed15", border: "1px solid #7c3aed33", borderRadius: "9999px", fontSize: "0.85rem", color: "#a78bfa", marginBottom: "1.5rem" },
  title: { fontSize: "3.2rem", fontWeight: 800, lineHeight: 1.1, marginBottom: "1.5rem", background: "linear-gradient(135deg, #fff 0%, #a78bfa 60%, #7c3aed 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  subtitle: { fontSize: "1.2rem", color: "#888", lineHeight: 1.6, maxWidth: "550px", margin: "0 auto 2rem" },
  ctaRow: { display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "3rem" },
  cta: { display: "inline-block", padding: "0.85rem 2.5rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.6rem", fontSize: "1.05rem", fontWeight: 600, textDecoration: "none", cursor: "pointer" },
  terminal: { maxWidth: "600px", margin: "0 auto", background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", overflow: "hidden", textAlign: "left" as const },
  termBar: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 1rem", borderBottom: "1px solid #1e1e30", background: "#0d0d14" },
  termDots: { display: "flex", gap: "0.35rem" },
  termDot: { width: "10px", height: "10px", borderRadius: "50%", display: "inline-block" },
  termTitle: { fontSize: "0.75rem", color: "#555" },
  termBody: { padding: "1rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", lineHeight: 1.6 },
  termLine: { color: "#e0e0e0" },
  termUser: { color: "#7c3aed", fontWeight: 600 },
  termClaude: { color: "#a78bfa", fontWeight: 600 },
  termFile: { color: "#34d399", fontSize: "0.78rem" },
  termFileDetail: { color: "#555", fontSize: "0.72rem" },
  termCmd: { color: "#f59e0b", fontSize: "0.78rem" },
  termSuccess: { color: "#34d399", fontWeight: 600 },
  features: { maxWidth: "1000px", margin: "0 auto", padding: "4rem 2rem" },
  sectionTitle: { fontSize: "2rem", fontWeight: 700, textAlign: "center" as const, marginBottom: "2.5rem", color: "#e0e0e0" },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" },
  featureCard: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "1.5rem" },
  featureEmoji: { fontSize: "1.3rem", marginBottom: "0.5rem", color: "#a78bfa", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
  featureTitle: { fontSize: "1rem", fontWeight: 600, marginBottom: "0.4rem" },
  featureDesc: { fontSize: "0.88rem", color: "#888", lineHeight: 1.5 },
  how: { maxWidth: "900px", margin: "0 auto", padding: "4rem 2rem" },
  stepsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" },
  stepCard: { textAlign: "center" as const, padding: "1.5rem" },
  stepNum: { width: "40px", height: "40px", borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" },
  stepTitle: { fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" },
  stepDesc: { fontSize: "0.9rem", color: "#888", lineHeight: 1.5 },
  comparison: { maxWidth: "700px", margin: "0 auto", padding: "4rem 2rem" },
  compGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" },
  compCard: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "1.5rem" },
  compTitle: { fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem", color: "#888" },
  compList: { display: "flex", flexDirection: "column" as const, gap: "0.6rem" },
  compItem: { fontSize: "0.9rem", color: "#bbb", display: "flex", gap: "0.5rem", alignItems: "center" },
  compX: { color: "#f87171", fontWeight: 700, fontSize: "0.85rem" },
  compCheck: { color: "#34d399", fontWeight: 700, fontSize: "0.85rem" },
  finalCta: { textAlign: "center" as const, padding: "4rem 2rem" },
  finalTitle: { fontSize: "2rem", fontWeight: 700, marginBottom: "0.75rem" },
  finalSub: { fontSize: "1.05rem", color: "#888", marginBottom: "2rem" },
  footer: { textAlign: "center" as const, padding: "2rem", borderTop: "1px solid #1e1e30", color: "#444", fontSize: "0.85rem" },
};
