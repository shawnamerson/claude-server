import { useEffect, useRef, useState, useCallback } from "react";

interface SSEOptions {
  url: string;
  enabled?: boolean;
}

/** Fetch a short-lived SSE token from the server */
async function getSSEToken(): Promise<string | null> {
  const authToken = (window as any).__authToken;
  if (!authToken) return null;
  try {
    const res = await fetch("/api/auth/sse-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

export { getSSEToken };

export function useSSE<T>(options: SSEOptions) {
  const { url, enabled = true } = options;
  const [events, setEvents] = useState<T[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!enabled) return;

    // Clear events when URL changes
    setEvents([]);

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    async function connect() {
      if (closed) return;

      // Get a short-lived token for SSE (not the long-lived session token)
      const sseToken = await getSSEToken();
      const separator = url.includes("?") ? "&" : "?";
      const fullUrl = sseToken ? `${url}${separator}token=${sseToken}` : url;
      const source = new EventSource(fullUrl);
      sourceRef.current = source;

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          setEvents((prev) => [...prev, data]);
        } catch {
          // Skip unparseable events
        }
      };

      source.onerror = () => {
        source.close();
        // Reconnect after 2 seconds (will get a fresh SSE token)
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [url, enabled]);

  return { events, clear };
}
