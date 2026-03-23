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

interface Article {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  excerpt: string;
  content: string[];
}

const articles: Article[] = [
  {
    slug: "what-is-vibe-coding",
    title: "What is Vibe Coding?",
    date: "March 18, 2026",
    readTime: "4 min read",
    excerpt:
      "A new approach to software development is emerging — one where you describe what you want and AI writes the code. Welcome to the era of vibe coding.",
    content: [
      "The term \"vibe coding\" has been gaining traction across developer communities, tech Twitter, and startup circles throughout 2025 and into 2026. But what does it actually mean, and why should you care?",
      "Vibe coding is the practice of building software by describing what you want in natural language and letting an AI system generate the actual code. Instead of writing syntax, debugging semicolons, and wrestling with framework documentation, you focus on the what — the features, the design, the user experience — and the AI handles the how.",
      "This is not the same as using GitHub Copilot or ChatGPT to help you write code. Those tools are assistants for developers who already know how to code. Vibe coding is fundamentally different: it is designed for people who may never learn a programming language, and that is perfectly fine.",
      "At VibeStack, we have built an entire platform around this idea. You describe your application in plain English. Our AI — powered by Anthropic's Claude — generates a complete, deployable application: server code, frontend, database schema, and styling. It tests the code for errors, then deploys it to a live URL with HTTPS. The whole process takes under 60 seconds.",
      "Critics argue that vibe coding produces lower-quality code than hand-written software. There is some truth to that — for complex enterprise systems with millions of users, you still want experienced engineers. But for the vast majority of use cases — landing pages, internal tools, booking systems, portfolios, small business websites, prototypes — AI-generated code is more than good enough. It is, in fact, often better than what a junior developer would produce, because models like Claude have been trained on billions of lines of high-quality open source code.",
      "The real revolution is not about code quality. It is about access. There are millions of people with great ideas who have never been able to build software because the learning curve is too steep and hiring a developer is too expensive. Vibe coding removes that barrier entirely.",
      "We believe vibe coding is not a fad. It is the beginning of a fundamental shift in how software gets made. Just as spreadsheets democratized data analysis and Canva democratized graphic design, vibe coding platforms like VibeStack are democratizing software development. The question is not whether this shift will happen — it is whether you will be early.",
    ],
  },
  {
    slug: "how-ai-is-changing-app-development",
    title: "How AI is Changing App Development",
    date: "March 10, 2026",
    readTime: "5 min read",
    excerpt:
      "From code generation to automated testing to instant deployment, AI is reshaping every stage of the software development lifecycle.",
    content: [
      "Software development has always been a craft that rewards deep expertise. Learning to build applications has historically required years of study: programming languages, data structures, algorithms, frameworks, deployment infrastructure, and an ever-changing ecosystem of tools. But in 2026, artificial intelligence is compressing that learning curve in ways that would have seemed impossible just three years ago.",
      "The most visible change is code generation. Large language models like Anthropic's Claude and OpenAI's GPT-4 can now produce working code from natural language descriptions with remarkable accuracy. This is not template-based generation or drag-and-drop website builders. These models understand context, architecture, and nuance. Ask Claude to build a restaurant website with online ordering and reservation management, and it will generate a Node.js server with proper routing, a responsive frontend, form validation, and persistent storage — all from a single prompt.",
      "But code generation is only the beginning. AI is transforming every stage of the development lifecycle. Automated testing has gone from writing unit tests manually to having AI generate comprehensive test suites that cover edge cases a human developer might miss. Code review, once a bottleneck in team workflows, can now be augmented by AI that catches bugs, security vulnerabilities, and performance issues before code reaches production.",
      "Deployment is another area seeing rapid change. Traditional deployment involves configuring servers, setting up CI/CD pipelines, managing DNS records, provisioning SSL certificates, and monitoring uptime. Platforms like VibeStack abstract all of this away. When our AI generates your application, it is automatically deployed to isolated infrastructure with HTTPS, a unique subdomain, and optional database support. There is no server to configure, no pipeline to maintain, no certificate to renew.",
      "Perhaps the most significant change is who can participate in software development. The traditional model required either technical skill or money to hire someone with technical skill. AI-powered platforms are creating a third option: describe what you want and get a working application. This does not replace professional developers — it expands the market. People who never would have built software are now building software, and that creates entirely new categories of applications.",
      "The developer community has had mixed reactions. Some see AI as a threat to their livelihood. Others see it as the most powerful tool they have ever had — a way to prototype faster, automate tedious work, and focus on the creative and architectural challenges that make software engineering interesting. At VibeStack, we believe the second group is right. AI does not replace developers any more than calculators replaced mathematicians. It raises the floor and lets everyone build higher.",
      "We are still in the early days of this transformation. The AI models will get better. The platforms will get more capable. The applications people build will get more sophisticated. But the direction is clear: software development is becoming accessible to everyone, and that is going to change everything.",
    ],
  },
  {
    slug: "idea-to-deployed-app-60-seconds",
    title: "From Idea to Deployed App in 60 Seconds",
    date: "March 3, 2026",
    readTime: "4 min read",
    excerpt:
      "We benchmarked the full VibeStack pipeline — from typing a prompt to a live URL. Here is what happens in those 60 seconds.",
    content: [
      "When we say you can go from idea to deployed app in 60 seconds, we mean it literally. We have benchmarked the full VibeStack pipeline repeatedly, and for typical applications, the median time from pressing Enter to having a live URL is under one minute. Here is a breakdown of what happens in that time.",
      "Seconds 1-3: Prompt Processing. Your natural language description hits our API and is routed to Claude. The model receives your prompt along with system context that instructs it to generate a complete, deployable Node.js application. Claude begins streaming its response immediately.",
      "Seconds 3-20: Code Generation. Claude generates the full application — typically 4 to 8 files including a server entry point, HTML templates, CSS styling, client-side JavaScript, and any necessary configuration. For applications that need a database, it also generates the schema and initialization code. The code is generated as a structured response that our pipeline can parse into individual files.",
      "Seconds 20-30: Validation and Testing. Once the code is generated, VibeStack runs automated checks. We parse every JavaScript file to verify there are no syntax errors. We validate that the server entry point exists and exports the right interface. We check that file references are consistent — if the HTML references a script file, that file must exist. If any check fails, we can re-prompt Claude with the error to get a corrected version.",
      "Seconds 30-50: Container Build and Deployment. The validated code is packaged into a lightweight container. We spin up an isolated runtime environment, install any dependencies, and start the application. Each app runs in its own sandboxed container with dedicated resources, ensuring that one user's application cannot affect another's.",
      "Seconds 50-60: DNS and HTTPS. Your application is assigned a subdomain on vibestack.build and our reverse proxy is configured to route traffic to your container. HTTPS is handled automatically through our wildcard certificate. By the time you see the \"Deployed\" confirmation, your app is live and accessible to anyone in the world.",
      "What makes this possible is tight integration between every component. The AI model, the validation pipeline, the container orchestration, and the networking layer are all designed to work together with minimal overhead. There are no manual steps, no approval gates, no configuration files to edit. You type a description, and you get a live app.",
      "Of course, 60 seconds is for a typical application. If you ask for something unusually complex — a multi-page dashboard with authentication and real-time data — it might take 90 seconds or two minutes. And if you iterate on your app with follow-up prompts, each update goes through the same pipeline but often faster, since the model can build on existing code rather than starting from scratch.",
      "The speed is not a gimmick. It fundamentally changes how people approach building software. When deployment takes weeks, you agonize over every decision. When it takes 60 seconds, you experiment freely. You try five different approaches and keep the one that works best. That is the power of making deployment instant.",
    ],
  },
  {
    slug: "why-every-business-needs-web-app-2026",
    title: "Why Every Business Needs a Web App in 2026",
    date: "February 24, 2026",
    readTime: "4 min read",
    excerpt:
      "In 2026, having a static website is not enough. Customers expect interactive experiences, and web apps are now cheap and fast to build.",
    content: [
      "Ten years ago, the advice for every small business was simple: you need a website. A basic online presence with your hours, location, and contact information was enough to establish credibility and attract customers. In 2026, that advice needs an upgrade. A static website is table stakes. What businesses actually need is a web application.",
      "The distinction matters. A website displays information. A web application does things. It lets customers book appointments, place orders, submit inquiries, track deliveries, manage accounts, or interact with your business in ways that a static page simply cannot support. And in an era where consumers expect Amazon-level convenience from every business they interact with, that interactivity is not optional — it is expected.",
      "The problem has always been cost. Building a custom web application traditionally required hiring a developer or an agency, and even a simple booking system could run $5,000 to $20,000. For a small business operating on thin margins, that is a non-starter. Content management systems like WordPress can get you partway there with plugins, but they come with their own complexity, security vulnerabilities, and ongoing maintenance costs.",
      "This is where AI-powered platforms change the equation. With VibeStack, a small business owner can describe the application they need — \"I need a booking system for my hair salon with time slots, stylist selection, and email confirmations\" — and have a working, deployed application in under a minute. The cost is a monthly subscription, not a five-figure project fee. And updates are just as fast: describe what you want to change, and the AI rebuilds and redeploys.",
      "Consider some real-world examples. A restaurant that takes reservations through a custom web app instead of relying on a third-party platform that takes a cut of every booking. A fitness studio with a class schedule and registration system that does not require students to download yet another app. A consulting firm with a client intake form that automatically organizes submissions into a database. A real estate agent with a property search tool customized to their specific listings.",
      "Every one of these applications would have cost thousands of dollars to build two years ago. Today, they can be created in minutes and deployed instantly. The ROI calculation has fundamentally changed.",
      "There is also a competitive angle. If your competitor has an interactive web app that lets customers self-serve — booking appointments at midnight, checking order status on their phone, browsing inventory in real time — and you have a static website with a phone number, you are at a disadvantage. Customers will choose convenience every time.",
      "The businesses that thrive in 2026 and beyond will be the ones that treat software as a core part of their operations, not an afterthought. And with AI making it possible to build and deploy custom web applications in minutes instead of months, there is no longer any excuse not to.",
    ],
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
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: "1.5rem",
    marginBottom: "1.5rem",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  articleTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: colors.text,
  },
  meta: {
    fontSize: "0.85rem",
    color: colors.muted,
    marginBottom: "0.75rem",
    display: "flex",
    gap: "1rem",
  },
  excerpt: {
    fontSize: "0.95rem",
    color: "#aaa",
    lineHeight: 1.6,
  },
  readMore: {
    color: colors.accent,
    fontSize: "0.9rem",
    fontWeight: 600,
    marginTop: "0.75rem",
    display: "inline-block",
  },
  articleBody: {
    fontSize: "1rem",
    lineHeight: 1.8,
    color: "#ccc",
  },
  articleP: {
    marginBottom: "1.25rem",
  },
  backToList: {
    color: colors.link,
    textDecoration: "none",
    fontSize: "0.9rem",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: "1.5rem",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
  },
};

export default function Blog() {
  const [activeSlug, setActiveSlug] = useState<string | null>(() => {
    const hash = window.location.hash.replace("#", "");
    return articles.find((a) => a.slug === hash) ? hash : null;
  });

  const activeArticle = articles.find((a) => a.slug === activeSlug);

  const openArticle = (slug: string) => {
    setActiveSlug(slug);
    window.location.hash = slug;
    window.scrollTo(0, 0);
  };

  const backToList = () => {
    setActiveSlug(null);
    window.location.hash = "";
    window.scrollTo(0, 0);
  };

  if (activeArticle) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <Link to="/" style={s.back}>&larr; Back to home</Link>

          <button onClick={backToList} style={s.backToList}>
            &larr; All articles
          </button>

          <h1 style={{ ...s.h1, fontSize: "2rem", marginBottom: "0.75rem" }}>
            {activeArticle.title}
          </h1>
          <div style={{ ...s.meta, marginBottom: "2rem" }}>
            <span>{activeArticle.date}</span>
            <span>{activeArticle.readTime}</span>
          </div>

          <div style={s.articleBody}>
            {activeArticle.content.map((p, i) => (
              <p key={i} style={s.articleP}>{p}</p>
            ))}
          </div>

          <div
            style={{
              marginTop: "2rem",
              padding: "1.5rem",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Ready to start building?
            </div>
            <Link
              to="/signup"
              style={{
                display: "inline-block",
                background: colors.accent,
                color: "#fff",
                padding: "0.6rem 1.5rem",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "0.95rem",
              }}
            >
              Try VibeStack Free
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/" style={s.back}>&larr; Back to home</Link>

        <h1 style={s.h1}>Blog</h1>
        <p style={s.subtitle}>
          Thoughts on AI, vibe coding, and the future of app development.
        </p>

        {articles.map((article) => (
          <div
            key={article.slug}
            style={s.card}
            onClick={() => openArticle(article.slug)}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = colors.accent)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = colors.border)
            }
          >
            <div style={s.articleTitle}>{article.title}</div>
            <div style={s.meta}>
              <span>{article.date}</span>
              <span>{article.readTime}</span>
            </div>
            <div style={s.excerpt}>{article.excerpt}</div>
            <span style={s.readMore}>Read more &rarr;</span>
          </div>
        ))}
      </div>
    </div>
  );
}
