import { Router, Request, Response } from "express";
import sharp from "sharp";
import { config } from "../config.js";

const router = Router();

// Cache the generated OG image in memory
let ogImageCache: Buffer | null = null;

function generateOgSvg(): string {
  const domain = config.domain;
  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0a0a12"/>
        <stop offset="100%" style="stop-color:#12121f"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#818cf8"/>
        <stop offset="50%" style="stop-color:#c084fc"/>
        <stop offset="100%" style="stop-color:#f0abfc"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="40%" r="40%">
        <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:0.15"/>
        <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect width="1200" height="630" fill="url(#glow)"/>
    <!-- Logo -->
    <text x="100" y="120" fill="#a78bfa" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700">VibeStack</text>
    <!-- Main headline -->
    <text x="100" y="240" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="700">Describe your app.</text>
    <text x="100" y="320" fill="url(#accent)" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="700">Watch it build.</text>
    <!-- Subtitle -->
    <text x="100" y="400" fill="#888888" font-family="system-ui, -apple-system, sans-serif" font-size="28">AI writes code, tests it, and deploys — in under a minute.</text>
    <!-- URL -->
    <text x="100" y="530" fill="#555555" font-family="monospace" font-size="22">${domain}</text>
    <!-- Terminal decoration -->
    <rect x="750" y="80" width="380" height="240" rx="12" fill="#12121a" stroke="#1e1e30" stroke-width="1"/>
    <circle cx="775" cy="100" r="5" fill="#f87171"/>
    <circle cx="795" cy="100" r="5" fill="#f59e0b"/>
    <circle cx="815" cy="100" r="5" fill="#34d399"/>
    <text x="770" y="140" fill="#e0e0e0" font-family="monospace" font-size="14">You: Build me a sushi app</text>
    <text x="770" y="168" fill="#a78bfa" font-family="monospace" font-size="14">Claude: Creating...</text>
    <text x="770" y="196" fill="#34d399" font-family="monospace" font-size="13">  + server.js (3,847 B)</text>
    <text x="770" y="220" fill="#34d399" font-family="monospace" font-size="13">  + index.html (2,156 B)</text>
    <text x="770" y="248" fill="#f59e0b" font-family="monospace" font-size="13">$ node -c server.js</text>
    <text x="770" y="276" fill="#34d399" font-family="monospace" font-size="14" font-weight="600">Deployed!</text>
  </svg>`;
}

// OG Image endpoint
router.get("/og-image.png", async (_req: Request, res: Response) => {
  try {
    if (!ogImageCache) {
      const svg = generateOgSvg();
      ogImageCache = await sharp(Buffer.from(svg)).png().toBuffer();
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ogImageCache);
  } catch (err) {
    console.error("OG image generation failed:", err);
    res.status(500).send("Failed to generate image");
  }
});

// Sitemap
router.get("/sitemap.xml", (_req: Request, res: Response) => {
  const domain = config.domain;
  const now = new Date().toISOString().split("T")[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${domain}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://${domain}/signup</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://${domain}/about</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://${domain}/blog</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://${domain}/faq</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://${domain}/privacy</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://${domain}/login</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(xml);
});

// Robots.txt
router.get("/robots.txt", (_req: Request, res: Response) => {
  const domain = config.domain;
  res.setHeader("Content-Type", "text/plain");
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /preview/

Sitemap: https://${domain}/sitemap.xml`);
});

// Prerendered landing page for bots
const BOT_UA = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot/i;

export function prerenderMiddleware(req: Request, res: Response, next: () => void) {
  const ua = req.headers["user-agent"] || "";
  if (!BOT_UA.test(ua)) return next();
  const prerenderedPaths = ["/", "/signup", "/login", "/about", "/blog", "/faq", "/privacy"];
  if (!prerenderedPaths.includes(req.path)) return next();

  const domain = config.domain;
  const ogImage = `https://${domain}/og-image.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeStack — Describe your app. Watch it build.</title>
  <meta name="description" content="Tell AI what you want. Watch it write code, test it, and deploy — all in real-time. Your app is live in under a minute with a real URL, database, and HTTPS.">
  <meta name="keywords" content="AI app builder, vibe coding, deploy apps, no-code, Claude AI, build apps with AI">
  <link rel="canonical" href="https://${domain}${req.path}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://${domain}${req.path}">
  <meta property="og:title" content="VibeStack — Describe your app. Watch it build.">
  <meta property="og:description" content="Tell AI what you want. Watch it write code, test it, and deploy — all in real-time. Your app is live in under a minute.">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="VibeStack">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="VibeStack — Describe your app. Watch it build.">
  <meta name="twitter:description" content="Tell AI what you want. Watch it write code, test it, and deploy — all in real-time.">
  <meta name="twitter:image" content="${ogImage}">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>VibeStack — Describe your app. Watch it build.</h1>
  <p>Tell AI what you want. Watch it write code, test it, and deploy — all in real-time. Your app is live in under a minute.</p>
  <h2>Everything you need to ship</h2>
  <ul>
    <li>Real-time building — Watch Claude write code, test it, and fix errors live</li>
    <li>Built-in databases — One-click PostgreSQL with schema viewer and query runner</li>
    <li>Code editor — Full editor with syntax highlighting</li>
    <li>Self-healing apps — Auto-fixes crashes by reading error logs</li>
    <li>Instant preview — Live preview as soon as it deploys</li>
    <li>Custom domains — Subdomains with automatic HTTPS via Let's Encrypt</li>
  </ul>
  <h2>Three steps. That's it.</h2>
  <ol>
    <li>Describe — Type what you want in plain English</li>
    <li>Watch — Claude writes code, tests it, fixes errors, and deploys in real-time</li>
    <li>Ship — Your app is live with a URL, database, and HTTPS</li>
  </ol>
  <p>Your first 3 deploys are free. No credit card required.</p>
  <a href="https://${domain}/signup">Start building free</a>
</body>
</html>`;
  res.send(html);
}

export default router;
