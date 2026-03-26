// In-memory tracking of active visitors (last 5 minutes)

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const liveVisitors = new Map<string, { path: string; lastSeen: number }>();

// Clean up stale visitors every 60s
setInterval(() => {
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  for (const [id, v] of liveVisitors) {
    if (v.lastSeen < cutoff) liveVisitors.delete(id);
  }
}, 60_000);

export function trackVisitor(visitorId: string, path: string): void {
  liveVisitors.set(visitorId, { path, lastSeen: Date.now() });
}

export function getLiveVisitors(): Array<{ visitorId: string; path: string; lastSeen: number }> {
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  const active: Array<{ visitorId: string; path: string; lastSeen: number }> = [];
  for (const [id, v] of liveVisitors) {
    if (v.lastSeen >= cutoff) active.push({ visitorId: id, path: v.path, lastSeen: v.lastSeen });
  }
  return active;
}
