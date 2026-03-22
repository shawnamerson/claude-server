import { useEffect, useRef, useState, useCallback } from "react";

interface SSEOptions {
  url: string;
  enabled?: boolean;
}

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

    function connect() {
      if (closed) return;

      const authToken = (window as any).__authToken;
      const separator = url.includes("?") ? "&" : "?";
      const fullUrl = authToken ? `${url}${separator}token=${authToken}` : url;
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
        // Reconnect after 2 seconds
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
