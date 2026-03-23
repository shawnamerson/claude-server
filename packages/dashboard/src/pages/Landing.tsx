import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

function AnimatedTerminal() {
  const [lines, setLines] = useState<Array<{ text: string; style: Record<string, string>; typed?: boolean }>>([]);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the actual deployed vacation rental app as the demo
  const demoAppUrl = `${window.location.protocol}//vacation-rental.${window.location.hostname}`;

  useEffect(() => {
    const cursor = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(cursor);
  }, []);

  useEffect(() => {
    const script: Array<{ delay: number; line: { text: string; style: Record<string, string>; typed?: boolean } }> = [
      { delay: 500, line: { text: "", style: {}, typed: true } },
      { delay: 0, line: { text: "You: Build me a vacation rental site like Airbnb", style: { color: "#e0e0e0" }, typed: true } },
      { delay: 2000, line: { text: "", style: {} } },
      { delay: 800, line: { text: "Claude: I'll create a rental platform with property listings, search, booking calendar, and reviews...", style: { color: "#a78bfa" } } },
      { delay: 1200, line: { text: "Writing 6 files...", style: { color: "#888", fontSize: "0.78rem" } } },
      { delay: 400, line: { text: "  + package.json (245 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 300, line: { text: "  + server.js (3,847 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 250, line: { text: "  + public/index.html (2,156 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 200, line: { text: "  + public/style.css (1,923 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 200, line: { text: "  + public/app.js (4,102 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 200, line: { text: "  + Dockerfile (89 bytes)", style: { color: "#34d399", fontSize: "0.78rem" } } },
      { delay: 800, line: { text: "$ node -c server.js", style: { color: "#f59e0b", fontSize: "0.78rem" } } },
      { delay: 600, line: { text: "Syntax OK", style: { color: "#888", fontSize: "0.78rem" } } },
      { delay: 500, line: { text: "Starting app...", style: { color: "#888", fontSize: "0.78rem" } } },
      { delay: 1500, line: { text: "Deployed! Live at rentals.justvibe.dev", style: { color: "#34d399", fontWeight: "600", fontSize: "0.9rem" } } },
    ];

    // Total time for the script to play out
    const scriptDuration = script.reduce((sum, s) => sum + s.delay, 0);

    let timeouts: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    function runScript() {
      if (cancelled) return;
      setLines([]);
      setShowPreview(false);
      let cumDelay = 0;

      script.forEach((item) => {
        if (!item.line.text) {
          cumDelay += item.delay;
          return;
        }
        cumDelay += item.delay;
        const t = setTimeout(() => {
          if (cancelled) return;
          setLines(prev => [...prev, item.line]);
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        }, cumDelay);
        timeouts.push(t);
      });

      // Show preview after deploy line
      const previewT = setTimeout(() => {
        if (!cancelled) setShowPreview(true);
      }, scriptDuration + 500);
      timeouts.push(previewT);

      // Loop after showing preview for a while
      const restart = setTimeout(() => {
        if (!cancelled) runScript();
      }, scriptDuration + 8000);
      timeouts.push(restart);
    }

    runScript();
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto" }}>
      {/* Terminal */}
      <div style={{ ...termStyles.terminal, borderRadius: showPreview ? "0.75rem 0.75rem 0 0" : "0.75rem", transition: "border-radius 0.3s" }}>
        <div style={termStyles.bar}>
          <div style={termStyles.dots}>
            <span style={{ ...termStyles.dot, background: "#f87171" }} />
            <span style={{ ...termStyles.dot, background: "#f59e0b" }} />
            <span style={{ ...termStyles.dot, background: "#34d399" }} />
          </div>
          <span style={termStyles.title}>JustVibe</span>
        </div>
        <div ref={containerRef} style={termStyles.body}>
          {lines.map((line, i) => (
            <div key={i} style={{ ...termStyles.line, ...line.style }}>
              {line.text}
              {i === 0 && line.typed && (
                <span style={{ opacity: cursorVisible ? 1 : 0, color: "#7c3aed", transition: "opacity 0.1s" }}>|</span>
              )}
            </div>
          ))}
          {lines.length === 0 && (
            <div style={termStyles.line}>
              <span style={{ opacity: cursorVisible ? 1 : 0, color: "#7c3aed" }}>|</span>
            </div>
          )}
        </div>
      </div>

      {/* Live app preview — slides in after deploy */}
      <div style={{
        maxHeight: showPreview ? "350px" : "0",
        opacity: showPreview ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 0.6s ease, opacity 0.4s ease",
        background: "#fff",
        borderRadius: "0 0 0.75rem 0.75rem",
        border: showPreview ? "1px solid #1e1e30" : "none",
        borderTop: "none",
      }}>
        {/* Mini browser chrome */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.4rem 0.75rem", background: "#0d0d14",
          borderTop: "1px solid #1e1e30",
        }}>
          <div style={termStyles.dots}>
            <span style={{ ...termStyles.dot, width: "8px", height: "8px", background: "#f87171" }} />
            <span style={{ ...termStyles.dot, width: "8px", height: "8px", background: "#f59e0b" }} />
            <span style={{ ...termStyles.dot, width: "8px", height: "8px", background: "#34d399" }} />
          </div>
          <div style={{
            flex: 1, padding: "0.2rem 0.5rem", background: "#12121a",
            borderRadius: "0.25rem", fontSize: "0.7rem", color: "#60a5fa",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            rentals.justvibe.dev
          </div>
        </div>
        <iframe
          src={showPreview ? demoAppUrl : "about:blank"}
          style={{ width: "100%", height: "310px", border: "none", display: "block" }}
          title="Demo app preview"
          loading="lazy"
        />
      </div>
    </div>
  );
}

const termStyles = {
  terminal: { maxWidth: "600px", margin: "0 auto", background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", overflow: "hidden", textAlign: "left" as const },
  bar: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 1rem", borderBottom: "1px solid #1e1e30", background: "#0d0d14" },
  dots: { display: "flex", gap: "0.35rem" },
  dot: { width: "10px", height: "10px", borderRadius: "50%", display: "inline-block" },
  title: { fontSize: "0.75rem", color: "#555" },
  body: { padding: "1rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", lineHeight: 1.7, minHeight: "220px", maxHeight: "280px", overflow: "hidden" },
  line: { color: "#e0e0e0", whiteSpace: "pre-wrap" as const },
};

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
        {/* Animated terminal demo */}
        <AnimatedTerminal />
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
