import { Router, Request, Response } from "express";
import { getLogs } from "../services/logger.js";
import { logEmitter } from "../services/deployer.js";

const router = Router();

// Get historical logs
router.get("/deployments/:id/logs", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const stream = typeof req.query.stream === "string" ? req.query.stream : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) : undefined;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset) : undefined;
  const logs = getLogs(id, { stream, limit, offset });
  res.json(logs);
});

// Stream logs via SSE
router.get("/deployments/:id/logs/stream", (req: Request, res: Response) => {
  const deploymentId = req.params.id as string;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send existing logs first
  const existingLogs = getLogs(deploymentId, { limit: 100 });
  for (const log of existingLogs.reverse()) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  // Subscribe to new logs
  const handler = (log: { stream: string; message: string; timestamp: string }) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  logEmitter.on(`log:${deploymentId}`, handler);

  req.on("close", () => {
    logEmitter.off(`log:${deploymentId}`, handler);
  });
});

export default router;
