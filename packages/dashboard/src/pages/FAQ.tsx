import { Link } from "react-router-dom";
import { useState } from "react";

const colors = {
  bg: "#0a0a0f",
  card: "#12121a",
  border: "#1e1e30",
  text: "#e0e0e0",
  muted: "#888",
  accent: "#7c3aed",
  link: "#60a5fa",
};

interface FAQItem {
  q: string;
  a: string;
}

const faqs: FAQItem[] = [
  {
    q: "What is VibeStack?",
    a: "VibeStack is an AI-powered app deployment platform. You describe the application you want in plain English, and our AI (powered by Anthropic's Claude) writes the code, tests it, and deploys it to a live URL with HTTPS and an optional database. No coding knowledge required.",
  },
  {
    q: "Do I need to know how to code?",
    a: "Not at all. VibeStack is designed for everyone — entrepreneurs, small business owners, designers, marketers, and anyone with an idea. You describe what you want in plain English, and the AI handles all the technical work. If you do know how to code, you can still use VibeStack to prototype ideas quickly.",
  },
  {
    q: "What can I build with VibeStack?",
    a: "Almost any web application: business websites, booking systems, portfolios, dashboards, internal tools, landing pages, e-commerce storefronts, contact forms, calculators, directories, and more. Each app runs as a Node.js server with full access to HTML, CSS, JavaScript, and an optional SQLite database.",
  },
  {
    q: "How does deployment work?",
    a: "When you create or update a project, Claude AI generates the code, VibeStack validates it for errors, then deploys it to an isolated container. Your app gets a unique subdomain (like my-app.vibestack.build) with automatic HTTPS. The entire process typically takes under 60 seconds.",
  },
  {
    q: "How much does VibeStack cost?",
    a: "VibeStack offers a free tier so you can try it out with no commitment. Paid plans unlock more projects, more AI prompts per month, custom domains, and priority deployment. Visit our pricing page for current details. All payments are processed securely through Stripe.",
  },
  {
    q: "How does billing work?",
    a: "Billing is monthly and handled through Stripe. You can upgrade, downgrade, or cancel your plan at any time from your dashboard. When you upgrade, you get immediate access to the new tier's features. There are no long-term contracts or hidden fees.",
  },
  {
    q: "Can I use a custom domain?",
    a: "Yes. Paid plans support custom domains. You point your domain's DNS to our servers, and we handle SSL certificate provisioning automatically. Your app will be accessible at both your custom domain and its vibestack.build subdomain.",
  },
  {
    q: "Do my apps get a database?",
    a: "Yes. Every VibeStack app can use an SQLite database that persists across restarts and redeployments. The AI can generate database schemas, queries, and migrations automatically based on your description. For most use cases — storing form submissions, managing content, tracking orders — SQLite is more than sufficient.",
  },
  {
    q: "Is my data secure?",
    a: "Security is a priority. Each application runs in its own isolated container, so one app cannot access another's data. All traffic is encrypted with HTTPS. Database files are stored securely and are only accessible by your application. We do not sell or share your data with third parties. See our Privacy Policy for full details.",
  },
  {
    q: "Who owns the code and data?",
    a: "You do. The code generated for your applications and all data stored in your databases belong to you. You can export your code at any time. We do not claim any intellectual property rights over the applications you build on VibeStack.",
  },
  {
    q: "Can I export my code?",
    a: "Yes. You can view and download the source code of any application you build on VibeStack. The generated code is standard Node.js and can be deployed anywhere — there is no vendor lock-in. If you outgrow VibeStack, you can take your code and run it on your own infrastructure.",
  },
  {
    q: "What happens if I cancel my subscription?",
    a: "If you cancel, your apps will remain live until the end of your current billing period. After that, apps on paid-tier features (like custom domains) will revert to the free tier limitations. Your code and data are retained for 30 days after cancellation, giving you time to export anything you need.",
  },
];

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
  item: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    marginBottom: "0.75rem",
    overflow: "hidden",
  },
  question: {
    width: "100%",
    background: "none",
    border: "none",
    color: colors.text,
    padding: "1.25rem 1.5rem",
    fontSize: "1.05rem",
    fontWeight: 600,
    textAlign: "left" as const,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
  answer: {
    padding: "0 1.5rem 1.25rem",
    fontSize: "0.95rem",
    lineHeight: 1.7,
    color: "#bbb",
  },
  chevron: {
    fontSize: "1.2rem",
    color: colors.muted,
    flexShrink: 0,
    marginLeft: "1rem",
    transition: "transform 0.2s",
  },
  cta: {
    textAlign: "center" as const,
    marginTop: "3rem",
    padding: "2rem",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
  },
};

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/" style={s.back}>&larr; Back to home</Link>

        <h1 style={s.h1}>Frequently Asked Questions</h1>
        <p style={s.subtitle}>
          Everything you need to know about VibeStack. Can't find what you're
          looking for?{" "}
          <a
            href="mailto:hello@vibestack.build"
            style={{ color: colors.link, textDecoration: "none" }}
          >
            Get in touch
          </a>
          .
        </p>

        {faqs.map((faq, i) => (
          <div key={i} style={s.item}>
            <button style={s.question} onClick={() => toggle(i)}>
              <span>{faq.q}</span>
              <span
                style={{
                  ...s.chevron,
                  transform: openIndex === i ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                &#9662;
              </span>
            </button>
            {openIndex === i && <div style={s.answer}>{faq.a}</div>}
          </div>
        ))}

        <div style={s.cta}>
          <div style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: 8 }}>
            Still have questions?
          </div>
          <div style={{ color: colors.muted, marginBottom: "1.25rem", fontSize: "0.95rem" }}>
            We are happy to help. Reach out anytime.
          </div>
          <a
            href="mailto:hello@vibestack.build"
            style={{
              display: "inline-block",
              background: colors.accent,
              color: "#fff",
              padding: "0.65rem 1.5rem",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}
