import { useEffect, useRef, useState } from "react";
import { useSSE } from "../hooks/useSSE";

interface LogLine {
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
  wrapper: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
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
  followBtn: {
    alignSelf: "flex-end" as const,
    padding: "0.25rem 0.6rem",
    marginTop: "0.4rem",
    background: "#1a1a2e",
    color: "#a78bfa",
    border: "1px solid #2e2e4a",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
};

export default function LogViewer({ deploymentId }: { deploymentId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const { events: logs } = useSSE<LogLine>({
    url: `/api/deployments/${deploymentId}/logs/stream`,
    enabled: !!deploymentId,
  });

  // Auto-scroll to bottom when following
  useEffect(() => {
    if (autoFollow && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoFollow]);

  // Detect if user scrolled up — disable auto-follow
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoFollow(atBottom);
  };

  return (
    <div style={styles.wrapper}>
      <div ref={containerRef} style={styles.container} onScroll={handleScroll}>
        {!deploymentId ? (
          <div style={styles.empty}>No deployment selected</div>
        ) : logs.length === 0 ? (
          <div style={styles.empty}>Waiting for logs...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ ...styles.line, color: streamColors[log.stream] || "#e0e0e0" }}>
              <span style={{ color: "#555" }}>[{log.stream}] </span>
              {log.message}
            </div>
          ))
        )}
      </div>
      {!autoFollow && logs.length > 0 && (
        <button
          style={styles.followBtn}
          onClick={() => {
            setAutoFollow(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
        >
          Follow logs
        </button>
      )}
    </div>
  );
}
