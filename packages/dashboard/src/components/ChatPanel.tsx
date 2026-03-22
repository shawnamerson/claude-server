import { useState, useEffect, useRef } from "react";
import { api, ChatMsg } from "../api/client";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    background: "#0d0d14",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  userMsg: {
    alignSelf: "flex-end" as const,
    background: "#7c3aed",
    color: "#fff",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.75rem 0.75rem 0.25rem 0.75rem",
    maxWidth: "85%",
    fontSize: "0.85rem",
    whiteSpace: "pre-wrap" as const,
  },
  assistantMsg: {
    alignSelf: "flex-start" as const,
    background: "#1a1a2e",
    color: "#e0e0e0",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.75rem 0.75rem 0.75rem 0.25rem",
    maxWidth: "85%",
    fontSize: "0.85rem",
    whiteSpace: "pre-wrap" as const,
  },
  activityBlock: {
    alignSelf: "flex-start" as const,
    background: "#0a0a12",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    padding: "0.5rem 0.75rem",
    maxWidth: "90%",
    width: "100%",
    fontSize: "0.78rem",
    fontFamily: "'JetBrains Mono', monospace",
    color: "#888",
    maxHeight: "200px",
    overflow: "auto",
  },
  activityLine: {
    padding: "1px 0",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  },
  activityClaude: {
    color: "#a78bfa",
  },
  activityFile: {
    color: "#34d399",
  },
  activityCmd: {
    color: "#f59e0b",
  },
  activityError: {
    color: "#f87171",
  },
  inputArea: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    borderTop: "1px solid #1e1e30",
  },
  input: {
    flex: 1,
    padding: "0.5rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit",
  },
  deployBtn: {
    padding: "0.5rem 0.75rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.8rem",
    whiteSpace: "nowrap" as const,
  },
  empty: {
    color: "#555",
    textAlign: "center" as const,
    padding: "2rem 1rem",
    fontSize: "0.85rem",
  },
};

interface LogLine {
  stream: string;
  message: string;
  timestamp: string;
}

function getActivityStyle(msg: string): React.CSSProperties {
  if (msg.startsWith("Claude:")) return styles.activityClaude;
  if (msg.startsWith("  +") || msg.startsWith("Writing")) return styles.activityFile;
  if (msg.startsWith("Running:") || msg.startsWith("$")) return styles.activityCmd;
  if (msg.includes("error") || msg.includes("Error") || msg.includes("failed")) return styles.activityError;
  return {};
}

interface Props {
  projectId: string;
  deploying?: boolean;
  deployStatus?: string;
  onDeploy: (prompt: string) => void;
  deploymentId?: string | null;
}

export default function ChatPanel({ projectId, deploying, deployStatus, onDeploy, deploymentId }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activityLogs, setActivityLogs] = useState<LogLine[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatHistory(projectId).then(setMessages);
  }, [projectId]);

  // Subscribe to deployment logs for live activity in chat
  useEffect(() => {
    if (!deploying || !deploymentId) {
      setActivityLogs([]);
      return;
    }

    setActivityLogs([]);
    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream`);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LogLine;
        // Only show interesting lines — skip Docker build noise and timestamps
        if (data.stream === "system" && data.message.trim()) {
          setActivityLogs(prev => {
            const next = [...prev, data];
            // Keep last 50 lines
            return next.length > 50 ? next.slice(-50) : next;
          });
        }
      } catch {}
    };

    return () => source.close();
  }, [deploying, deploymentId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, streamText, activityLogs]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);
    setStreamText("");

    const userMsg: ChatMsg = {
      id: Date.now(),
      project_id: projectId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      const authToken = (window as any).__authToken;
      if (authToken) authHeaders["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ message: text }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text") {
                  fullText += data.content;
                  setStreamText(fullText);
                }
              } catch {}
            }
          }
        }
      }

      const assistantMsg: ChatMsg = {
        id: Date.now() + 1,
        project_id: projectId,
        role: "assistant",
        content: fullText,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamText("");
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setStreaming(false);
    }
  };

  const handleDeploy = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const userMsg: ChatMsg = {
      id: Date.now(),
      project_id: projectId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    onDeploy(text);
  };

  const statusText = deployStatus === "generating" ? "Generating..."
    : deployStatus === "deploying" ? "Deploying..."
    : "Working...";

  return (
    <div style={styles.container}>
      <div ref={messagesRef} style={styles.messages}>
        {messages.length === 0 && !streaming && !deploying && (
          <div style={styles.empty}>
            Describe what you want to build and hit Deploy.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={msg.role === "user" ? styles.userMsg : styles.assistantMsg}>
            {msg.content}
          </div>
        ))}
        {streamText && (
          <div style={styles.assistantMsg}>{streamText}</div>
        )}
        {deploying && activityLogs.length > 0 && (
          <div style={styles.activityBlock}>
            {activityLogs.map((log, i) => (
              <div key={i} style={{ ...styles.activityLine, ...getActivityStyle(log.message) }}>
                {log.message}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleDeploy();
            }
          }}
          placeholder={deploying ? statusText : "Describe what to build..."}
          disabled={streaming || deploying}
        />
        <button
          style={{
            ...styles.deployBtn,
            opacity: (streaming || deploying || !input.trim()) ? 0.5 : 1,
          }}
          onClick={handleDeploy}
          disabled={streaming || deploying || !input.trim()}
        >
          {deploying ? statusText : "Deploy"}
        </button>
      </div>
    </div>
  );
}
