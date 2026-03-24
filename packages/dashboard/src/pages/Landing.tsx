import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

function HeroDemo() {
  const [lines, setLines] = useState<Array<{ text: string; style: Record<string, string> }>>([]);
  const [deployed, setDeployed] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const demoUrl = `${window.location.protocol}//sushi-restaurant.${window.location.hostname}`;

  useEffect(() => {
    const cursor = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(cursor);
  }, []);

  useEffect(() => {
    const script: Array<{ delay: number; text: string; style: Record<string, string> }> = [
      { delay: 800, text: "You: Build me a sushi restaurant website", style: { color: "#e0e0e0" } },
      { delay: 2200, text: "Claude: Creating a restaurant site with menu, reservations, and online ordering...", style: { color: "#a78bfa" } },
      { delay: 1200, text: "Writing 6 files...", style: { color: "#888", fontSize: "0.75rem" } },
      { delay: 350, text: "  + server.js (3,847 bytes)", style: { color: "#34d399", fontSize: "0.75rem" } },
      { delay: 250, text: "  + public/index.html (2,156 bytes)", style: { color: "#34d399", fontSize: "0.75rem" } },
      { delay: 200, text: "  + public/style.css (1,923 bytes)", style: { color: "#34d399", fontSize: "0.75rem" } },
      { delay: 200, text: "  + public/app.js (4,102 bytes)", style: { color: "#34d399", fontSize: "0.75rem" } },
      { delay: 700, text: "$ node -c server.js", style: { color: "#f59e0b", fontSize: "0.75rem" } },
      { delay: 500, text: "Syntax OK", style: { color: "#888", fontSize: "0.75rem" } },
      { delay: 400, text: "Starting app...", style: { color: "#888", fontSize: "0.75rem" } },
      { delay: 1200, text: "Deployed! Live at sushi-restaurant.vibestack.build", style: { color: "#34d399", fontWeight: "600" } },
    ];

    const totalDuration = script.reduce((sum, s) => sum + s.delay, 0);
    let timeouts: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    function runScript() {
      if (cancelled) return;
      setLines([]);
      setDeployed(false);
      let cumDelay = 0;

      for (const item of script) {
        cumDelay += item.delay;
        const d = cumDelay;
        timeouts.push(setTimeout(() => {
          if (cancelled) return;
          setLines(prev => [...prev, { text: item.text, style: item.style }]);
          if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }, d));
      }

      // Show the live app after "Deployed!" appears
      timeouts.push(setTimeout(() => { if (!cancelled) setDeployed(true); }, totalDuration + 300));

      // Loop
      timeouts.push(setTimeout(() => { if (!cancelled) runScript(); }, totalDuration + 7000));
    }

    runScript();
    return () => { cancelled = true; timeouts.forEach(clearTimeout); };
  }, []);

  return (
    <div className="jv-hero-demo">
      {/* Left: terminal */}
      <div>
        <div className="jv-hero-label">How it's built</div>
        <div style={t.terminal}>
          <div style={t.bar}>
            <div style={t.dots}>
              <span style={{ ...t.dot, background: "#f87171" }} />
              <span style={{ ...t.dot, background: "#f59e0b" }} />
              <span style={{ ...t.dot, background: "#34d399" }} />
            </div>
            <span style={t.barTitle}>VibeStack</span>
          </div>
          <div ref={containerRef} style={t.body}>
            {lines.map((line, i) => (
              <div key={i} style={{ ...t.line, ...line.style }}>{line.text}</div>
            ))}
            {lines.length === 0 && (
              <div style={t.line}>
                <span style={{ opacity: cursorVisible ? 1 : 0, color: "#7c3aed" }}>|</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: preview */}
      <div>
        <div className="jv-hero-label">The result</div>
        <div style={t.browser}>
          <div style={t.browserBar}>
            <div style={t.dots}>
              <span style={{ ...t.dot, width: "8px", height: "8px", background: "#f87171" }} />
              <span style={{ ...t.dot, width: "8px", height: "8px", background: "#f59e0b" }} />
              <span style={{ ...t.dot, width: "8px", height: "8px", background: "#34d399" }} />
            </div>
            <div style={t.urlChip}>{deployed ? "sushi-restaurant.vibestack.build" : ""}</div>
          </div>
          {deployed ? (
            <iframe src={demoUrl} style={t.iframeEl} title="Live demo" loading="eager" scrolling="no" />
          ) : (
            <div style={t.buildingState}>
              <div style={t.spinner} />
              <div style={{ color: "#7c3aed", fontSize: "0.85rem" }}>Building your app...</div>
              <div style={{ color: "#444", fontSize: "0.75rem" }}>Watch the terminal for progress</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const t = {
  terminal: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", overflow: "hidden", textAlign: "left" as const, height: "100%" },
  bar: { display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #1e1e30", background: "#0d0d14" },
  dots: { display: "flex", gap: "0.3rem" },
  dot: { width: "9px", height: "9px", borderRadius: "50%", display: "inline-block" },
  barTitle: { fontSize: "0.7rem", color: "#555" },
  body: { padding: "0.75rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", lineHeight: 1.7, overflow: "hidden", maxHeight: "320px" },
  line: { color: "#e0e0e0", whiteSpace: "pre-wrap" as const },
  browser: { background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: "0.75rem", overflow: "hidden", height: "100%", position: "relative" as const },
  browserBar: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderBottom: "1px solid #1e1e30", background: "#0d0d14" },
  urlChip: { flex: 1, padding: "0.2rem 0.6rem", background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.3rem", fontSize: "0.72rem", color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" },
  iframeEl: { width: "100%", height: "calc(100% - 34px)", border: "none", display: "block", pointerEvents: "none" as const },
  buildingState: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: "0.75rem", height: "calc(100% - 34px)", background: "#08080c" },
  spinner: { width: "24px", height: "24px", border: "2px solid #1e1e30", borderTop: "2px solid #7c3aed", borderRadius: "50%", animation: "jv-spin 0.8s linear infinite" },
};

const responsiveCSS = `
  .jv-landing { scrollbar-width: none; -ms-overflow-style: none; }
  .jv-landing::-webkit-scrollbar { display: none; }
  @keyframes jv-spin { to { transform: rotate(360deg); } }
  .jv-feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  .jv-steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
  .jv-comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .jv-nav-links { display: flex; gap: 1.5rem; align-items: center; }
  .jv-title { font-size: 3.2rem; }
  .jv-hero-demo { display: grid; grid-template-columns: 1fr 1.2fr; gap: 1rem; height: 380px; }
  .jv-hero-label { font-size: 0.75rem; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; font-weight: 600; }
  @media (max-width: 900px) {
    .jv-hero-demo { grid-template-columns: 1fr; height: auto; }
    .jv-hero-demo > div:first-child { height: 280px; }
    .jv-hero-demo > div:last-child { height: 350px; }
  }
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
    <div className="jv-landing" style={s.page}>
      <style>{responsiveCSS}</style>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>VibeStack</div>
        <div className="jv-nav-links">
          <a href="#features" style={s.navLink}>Features</a>
          <a href="#how" style={s.navLink}>How it works</a>
          <Link to="/login" style={s.navLink}>Log in</Link>
          <Link to="/signup" style={s.ctaSmall}>Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.badge}>Describe it. Ship it.</div>
        <h1 className="jv-title" style={s.title}>Describe your app.<br />Watch it build.</h1>
        <p style={s.subtitle}>
          Tell AI what you want. Watch it write code, test it, and deploy — all in real-time.
          Your app is live in under a minute.
        </p>
        <div style={s.ctaRow}>
          <Link to="/signup" style={s.cta}>Start building free</Link>
        </div>

        {/* Side-by-side: terminal on left, live app on right */}
        <HeroDemo />
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
        <h2 style={s.sectionTitle}>Why VibeStack?</h2>
        <div className="jv-comp-grid">
          <div style={s.compCard}>
            <div style={s.compTitle}>Other tools</div>
            <div style={s.compList}>
              <div style={s.compItem}><span style={s.compX}>x</span> Prototypes that don't persist</div>
              <div style={s.compItem}><span style={s.compX}>x</span> No real databases</div>
              <div style={s.compItem}><span style={s.compX}>x</span> One stack, take it or leave it</div>
              <div style={s.compItem}><span style={s.compX}>x</span> Breaks and you're on your own</div>
              <div style={s.compItem}><span style={s.compX}>x</span> Can't import existing code</div>
            </div>
          </div>
          <div style={{ ...s.compCard, borderColor: "#7c3aed" }}>
            <div style={{ ...s.compTitle, color: "#a78bfa" }}>VibeStack</div>
            <div style={s.compList}>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Real apps with real URLs</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> PostgreSQL databases included</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> 7 stacks — React, Next.js, Python, and more</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Self-healing — auto-fixes crashes</div>
              <div style={s.compItem}><span style={s.compCheck}>+</span> Import from GitHub, auto-deploy on push</div>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={s.finalCta}>
        <h2 style={s.finalTitle}>Stop configuring. Start shipping.</h2>
        <p style={s.finalSub}>20 free deploys every month. No credit card required.</p>
        <Link to="/signup" style={s.cta}>Start building free</Link>
      </div>

      <div style={s.footer}>
        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginBottom: "0.75rem" }}>
          <Link to="/about" style={s.footerLink}>About</Link>
          <Link to="/blog" style={s.footerLink}>Blog</Link>
          <Link to="/faq" style={s.footerLink}>FAQ</Link>
          <Link to="/privacy" style={s.footerLink}>Privacy & Terms</Link>
          <a href="mailto:hello@vibestack.build" style={s.footerLink}>Contact</a>
        </div>
        <div>VibeStack — Describe it. Ship it.</div>
      </div>
    </div>
  );
}

const features = [
  { emoji: ">>", title: "Real-time building", desc: "Watch Claude write code, test it, and fix errors live in the chat. Not a black box — you see everything." },
  { emoji: "**", title: "Any stack", desc: "Express, React, Next.js, SvelteKit, Python Flask, FastAPI, or static HTML. Claude picks the right tool for the job." },
  { emoji: "DB", title: "Built-in databases", desc: "One-click PostgreSQL. Connection string auto-injected. Schema viewer and query runner included." },
  { emoji: "!!", title: "Self-healing apps", desc: "If your app crashes, Claude detects it, reads the error logs, fixes the code, and redeploys automatically." },
  { emoji: "GH", title: "GitHub import", desc: "Clone any repo — public or private — and deploy it. Auto-adapts to your stack. Webhook auto-deploys on push." },
  { emoji: "//", title: "Custom domains & cron", desc: "Every project gets a subdomain with HTTPS. Add custom domains. Schedule cron jobs to hit your app on a timer." },
];

const s = {
  page: { minHeight: "100vh", background: "#0a0a0f", overflow: "auto", color: "#e0e0e0" },
  nav: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 2rem", maxWidth: "1100px", margin: "0 auto" },
  logo: { fontSize: "1.3rem", fontWeight: 800, color: "#a78bfa" },
  navLink: { color: "#888", textDecoration: "none", fontSize: "0.9rem" },
  ctaSmall: { padding: "0.4rem 1rem", background: "#7c3aed", color: "#fff", borderRadius: "0.5rem", textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 },
  hero: { maxWidth: "960px", margin: "0 auto", padding: "3rem 2rem 2rem", textAlign: "center" as const },
  badge: { display: "inline-block", padding: "0.3rem 1rem", background: "#7c3aed15", border: "1px solid #7c3aed33", borderRadius: "9999px", fontSize: "0.85rem", color: "#a78bfa", marginBottom: "1.5rem" },
  title: { fontSize: "3.2rem", fontWeight: 800, lineHeight: 1.1, marginBottom: "1.5rem", background: "linear-gradient(135deg, #fff 0%, #a78bfa 60%, #7c3aed 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  subtitle: { fontSize: "1.2rem", color: "#888", lineHeight: 1.6, maxWidth: "550px", margin: "0 auto 2rem" },
  ctaRow: { display: "flex", gap: "1rem", justifyContent: "center", marginBottom: "2.5rem" },
  cta: { display: "inline-block", padding: "0.85rem 2.5rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.6rem", fontSize: "1.05rem", fontWeight: 600, textDecoration: "none", cursor: "pointer" },
  features: { maxWidth: "1000px", margin: "0 auto", padding: "4rem 2rem" },
  sectionTitle: { fontSize: "2rem", fontWeight: 700, textAlign: "center" as const, marginBottom: "2.5rem", color: "#e0e0e0" },
  featureCard: { background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.75rem", padding: "1.5rem" },
  featureEmoji: { fontSize: "1.3rem", marginBottom: "0.5rem", color: "#a78bfa", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" },
  featureTitle: { fontSize: "1rem", fontWeight: 600, marginBottom: "0.4rem" },
  featureDesc: { fontSize: "0.88rem", color: "#888", lineHeight: 1.5 },
  how: { maxWidth: "900px", margin: "0 auto", padding: "4rem 2rem" },
  stepCard: { textAlign: "center" as const, padding: "1.5rem" },
  stepNum: { width: "40px", height: "40px", borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.1rem", marginBottom: "1rem" },
  stepTitle: { fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" },
  stepDesc: { fontSize: "0.9rem", color: "#888", lineHeight: 1.5 },
  comparison: { maxWidth: "700px", margin: "0 auto", padding: "4rem 2rem" },
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
  footerLink: { color: "#666", textDecoration: "none", fontSize: "0.82rem" },
};
