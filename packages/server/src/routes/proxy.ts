import { Router, Request, Response } from "express";
import http from "http";
import { config } from "../config.js";

const router = Router();

const DOCKER_HOST = config.dockerHostIp;

function proxyRequest(req: Request, res: Response, port: number, targetPath: string) {
  const options: http.RequestOptions = {
    hostname: DOCKER_HOST,
    port,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${DOCKER_HOST}:${port}`,
    },
  };

  // Remove headers that shouldn't be forwarded
  const hdrs = options.headers as Record<string, unknown>;
  delete hdrs["connection"];
  delete hdrs["transfer-encoding"];

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(`Proxy error to port ${port}:`, err.message);
    if (!res.headersSent) {
      res.status(502).send("Container not reachable. It may still be starting up.");
    }
  });

  req.pipe(proxyReq);
}

// Proxy requests to deployed containers via /preview/:port/*
router.all("/preview/:port/*", (req: Request, res: Response) => {
  const port = parseInt(req.params.port as string);
  if (isNaN(port) || port < 10000 || port > 65535) {
    res.status(400).json({ error: "Invalid port" });
    return;
  }
  const targetPath = req.originalUrl.replace(`/preview/${port}`, "") || "/";
  proxyRequest(req, res, port, targetPath);
});

// Handle /preview/:port with no trailing path
router.all("/preview/:port", (req: Request, res: Response) => {
  const port = parseInt(req.params.port as string);
  if (isNaN(port) || port < 10000 || port > 65535) {
    res.status(400).json({ error: "Invalid port" });
    return;
  }
  proxyRequest(req, res, port, "/");
});

export default router;
