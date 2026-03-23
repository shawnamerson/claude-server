import { Link } from "react-router-dom";

const colors = {
  bg: "#0a0a0f",
  card: "#12121a",
  border: "#1e1e30",
  text: "#e0e0e0",
  muted: "#888",
  accent: "#7c3aed",
  link: "#60a5fa",
};

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: colors.bg,
    color: colors.text,
    overflowY: "auto",
    padding: "2rem 1rem 4rem",
  },
  container: {
    maxWidth: 760,
    margin: "0 auto",
  },
  back: {
    color: colors.link,
    textDecoration: "none",
    fontSize: "0.9rem",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: "2rem",
  },
  h1: {
    fontSize: "2.4rem",
    fontWeight: 700,
    marginBottom: "0.5rem",
    background: `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: "1.15rem",
    color: colors.muted,
    marginBottom: "2.5rem",
    lineHeight: 1.6,
  },
  section: {
    marginBottom: "2.5rem",
  },
  h2: {
    fontSize: "1.4rem",
    fontWeight: 600,
    marginBottom: "1rem",
    color: colors.text,
  },
  p: {
    fontSize: "1rem",
    lineHeight: 1.75,
    color: "#ccc",
    marginBottom: "1rem",
  },
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: "1.5rem",
    marginBottom: "1.5rem",
  },
  step: {
    display: "flex",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "1.25rem",
  },
  stepNum: {
    background: colors.accent,
    color: "#fff",
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: "0.9rem",
    flexShrink: 0,
  },
  founderCard: {
    display: "flex",
    gap: "1.5rem",
    alignItems: "center",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
  highlight: {
    color: colors.accent,
    fontWeight: 600,
  },
};

export default function About() {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/" style={s.back}>&larr; Back to home</Link>

        <h1 style={s.h1}>About VibeStack</h1>
        <p style={s.subtitle}>
          We believe everyone should be able to build and deploy real web applications,
          regardless of technical skill. VibeStack makes that possible with AI.
        </p>

        <div style={s.section}>
          <h2 style={s.h2}>Our Mission</h2>
          <div style={s.card}>
            <p style={s.p}>
              VibeStack is an AI-powered app deployment platform that turns plain English
              descriptions into live, fully-functional web applications. You describe what you want.
              Claude AI writes the code, tests it for errors, and deploys it instantly with a real
              URL, database, and HTTPS — all in under 60 seconds.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We are <span style={s.highlight}>democratizing app development</span>. No more hiring
              expensive developers for simple tools. No more waiting weeks for a prototype. No more
              choosing between learning to code and getting your idea online. With VibeStack, if you
              can describe it, you can ship it.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>How It Works</h2>
          <div style={s.card}>
            {[
              { n: "1", title: "Describe Your App", desc: "Tell VibeStack what you want in plain English. A restaurant website, a booking tool, an internal dashboard — anything." },
              { n: "2", title: "Claude AI Writes the Code", desc: "Anthropic's Claude AI generates production-ready code: server logic, front-end, database schema, and styling." },
              { n: "3", title: "Automatic Testing", desc: "VibeStack runs syntax checks and validation to make sure the generated code works before it goes live." },
              { n: "4", title: "Instant Deployment", desc: "Your app is deployed to a live URL with HTTPS, a subdomain on vibestack.build, and an optional SQLite database — ready to share." },
            ].map((step) => (
              <div key={step.n} style={s.step}>
                <div style={s.stepNum}>{step.n}</div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
                  <div style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Powered by Claude AI</h2>
          <div style={s.card}>
            <p style={s.p}>
              At the heart of VibeStack is <span style={s.highlight}>Claude</span>, built by{" "}
              <a href="https://anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: colors.link, textDecoration: "none" }}>
                Anthropic
              </a>. Claude is one of the most capable AI models in the world for code generation,
              reasoning, and understanding nuanced instructions. It does not just autocomplete — it
              architects full applications from a single prompt.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              Every time you create or update a project on VibeStack, Claude reads your description,
              plans the file structure, writes every line of code, and hands it off to our deployment
              pipeline. The result is a real, working app — not a mockup, not a template.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Why We Built This</h2>
          <div style={s.card}>
            <p style={s.p}>
              Most people with great ideas never build them because the barrier to entry in software
              development is too high. You need to learn programming languages, frameworks, hosting,
              databases, SSL certificates, DNS, CI/CD pipelines — the list is endless. And even if
              you hire a developer, a simple app can cost thousands of dollars and take weeks.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We built VibeStack because we believe AI has finally reached the point where this
              friction can be eliminated. Not reduced — eliminated. A small business owner should be
              able to get a booking page live in 60 seconds. A startup founder should be able to
              prototype 5 ideas before lunch. A teacher should be able to build a classroom tool
              without a computer science degree. That is the world VibeStack is building toward.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>The Team</h2>
          <div style={s.card}>
            <div style={s.founderCard}>
              <div style={s.avatar}>SA</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "1.1rem", marginBottom: 4 }}>
                  Shawn Amerson
                </div>
                <div style={{ color: colors.muted, fontSize: "0.95rem", marginBottom: 8 }}>
                  Founder
                </div>
                <div style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: 1.6 }}>
                  Shawn founded VibeStack with a simple conviction: the best tools are the ones
                  anyone can use. With a background in software engineering and a passion for making
                  technology accessible, he set out to build the fastest path from idea to deployed
                  application.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "3rem" }}>
          <Link
            to="/signup"
            style={{
              display: "inline-block",
              background: colors.accent,
              color: "#fff",
              padding: "0.75rem 2rem",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Start Building for Free
          </Link>
        </div>
      </div>
    </div>
  );
}
