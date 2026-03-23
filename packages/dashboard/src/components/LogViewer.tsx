import { useRef, useEffect } from "react";
import { useSSE } from "../hooks/useSSE";

interface LogLine {
  id?: number;
  stream: string;
  message: string;
  timestamp: string;
}

const streamColors: Record<string, string> = {
  stdout: "#e0e0e0",
  stderr: "#f87171",
  system: "#a78bfa",
};

const styles = {
  container: {
    flex: 1,
    minHeight: 0,
    background: "#0a0a0f",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    overflow: "auto",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "0.8rem",
    padding: "0.75rem",
  },
  line: {
    padding: "1px 0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  empty: {
    color: "#555",
    padding: "2rem",
    textAlign: "center" as const,
    fontFamily: "inherit",
  },
};

export default function LogViewer({ deploymentId }: { deploymentId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { events: rawLogs } = useSSE<LogLine>({
    url: `/api/deployments/${deploymentId}/logs/stream`,
    enabled: !!deploymentId,
  });

  // Deduplicate logs
  const logs = rawLogs.filter((log, index) => {
    if (log.id) {
      return rawLogs.findIndex((l) => l.id === log.id) === index;
    }
    return rawLogs.findIndex((l) => l.timestamp === log.timestamp && l.message === log.message) === index;
  });

  // Keep scroll at top so newest logs are visible
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  // Reverse: newest first
  const reversedLogs = [...logs].reverse();

  return (
    <div ref={containerRef} style={styles.container}>
      {!deploymentId ? (
        <div style={styles.empty}>No deployment selected</div>
      ) : reversedLogs.length === 0 ? (
        <div style={styles.empty}>Waiting for logs...</div>
      ) : (
        reversedLogs.map((log, i) => (
          <div key={i} style={{ ...styles.line, color: streamColors[log.stream] || "#e0e0e0" }}>
            <span style={{ color: "#555" }}>[{log.stream}] </span>
            {log.message}
          </div>
        ))
      )}
    </div>
  );
}
