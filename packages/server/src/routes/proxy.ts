import { Router, Request, Response } from "express";
import http from "http";

const router = Router();

// Proxy requests to deployed containers via /preview/:port/*
router.all("/preview/:port/*", (req: Request, res: Response) => {
  const port = parseInt(req.params.port as string);
  if (isNaN(port) || port < 10000 || port > 65535) {
    res.status(400).json({ error: "Invalid port" });
    return;
  }

  // Strip /preview/:port from the path
  const targetPath = req.originalUrl.replace(`/preview/${port}`, "") || "/";

  const options: http.RequestOptions = {
    hostname: "localhost",
    port,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${port}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    res.status(502).send("Container not reachable. It may still be starting up.");
  });

  req.pipe(proxyReq);
});

// Also handle /preview/:port with no trailing path
router.all("/preview/:port", (req: Request, res: Response) => {
  const port = parseInt(req.params.port as string);
  if (isNaN(port) || port < 10000 || port > 65535) {
    res.status(400).json({ error: "Invalid port" });
    return;
  }

  const options: http.RequestOptions = {
    hostname: "localhost",
    port,
    path: "/",
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${port}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    res.status(502).send("Container not reachable. It may still be starting up.");
  });

  req.pipe(proxyReq);
});

export default router;
