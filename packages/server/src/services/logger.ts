import { getDb } from "../db/client.js";
import { LogEntry } from "../types.js";

export function getLogs(
  deploymentId: string,
  options: { stream?: string; limit?: number; offset?: number } = {}
): LogEntry[] {
  const db = getDb();
  const { stream, limit = 500, offset = 0 } = options;

  if (stream) {
    return db
      .prepare(
        "SELECT * FROM logs WHERE deployment_id = ? AND stream = ? ORDER BY id DESC LIMIT ? OFFSET ?"
      )
      .all(deploymentId, stream, limit, offset) as LogEntry[];
  }

  return db
    .prepare(
      "SELECT * FROM logs WHERE deployment_id = ? ORDER BY id DESC LIMIT ? OFFSET ?"
    )
    .all(deploymentId, limit, offset) as LogEntry[];
}

export function getRecentLogs(deploymentId: string, limit = 200): LogEntry[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM logs WHERE deployment_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(deploymentId, limit) as LogEntry[];
}

// Cap logs at 10,000 per deployment
export function pruneOldLogs(deploymentId: string): void {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) as count FROM logs WHERE deployment_id = ?")
    .get(deploymentId) as { count: number };

  if (count.count > 10000) {
    const cutoff = db
      .prepare(
        "SELECT id FROM logs WHERE deployment_id = ? ORDER BY id DESC LIMIT 1 OFFSET 10000"
      )
      .get(deploymentId) as { id: number } | undefined;

    if (cutoff) {
      db.prepare(
        "DELETE FROM logs WHERE deployment_id = ? AND id < ?"
      ).run(deploymentId, cutoff.id);
    }
  }
}
