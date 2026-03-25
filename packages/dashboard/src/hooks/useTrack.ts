const authToken = () => (window as any).__authToken;

export function track(event: string, meta?: Record<string, any>) {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = authToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch("/api/analytics/event", {
      method: "POST",
      headers,
      body: JSON.stringify({ event, meta }),
    }).catch(() => {});
  } catch {}
}
