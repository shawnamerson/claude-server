import { useState, useEffect, useRef } from "react";
import { api, ChatMsg } from "../api/client";

interface LogLine {
  stream: string;
  message: string;
  timestamp: string;
}

interface ActivityItem {
  type: "thinking" | "files" | "command" | "command_output" | "status" | "error";
  content: string;
  files?: string[];
}

function parseLogToActivity(msg: string): ActivityItem | null {
  if (!msg.trim()) return null;

  // Skip noisy internal lines
  if (msg.startsWith("Tokens:") || msg.startsWith("Total API")) return null;

  // Claude's thinking
  if (msg.startsWith("Claude:")) {
    return { type: "thinking", content: msg.slice(7).trim() };
  }
  // File writes
  if (msg.startsWith("  + ")) {
    return { type: "files", content: msg.trim() };
  }
  // Commands
  if (msg.startsWith("Running:") || msg.startsWith("$ ")) {
    return { type: "command", content: msg.replace(/^(Running:|\$)\s*/, "") };
  }
  if (msg.startsWith("  Exit code:") || msg.startsWith("  Command error:")) {
    return { type: "error", content: msg.trim() };
  }
  // Errors
  if (msg.includes("error") || msg.includes("Error") || msg.includes("failed") || msg.includes("Failed")) {
    return { type: "error", content: msg };
  }
  // Notes from Claude
  if (msg.startsWith("Notes:")) {
    return { type: "thinking", content: msg.slice(6).trim() };
  }
  // Everything else is a status update
  return { type: "status", content: msg };
}

function groupActivities(items: ActivityItem[]): ActivityItem[] {
  const grouped: ActivityItem[] = [];
  let fileBuffer: string[] = [];

  for (const item of items) {
    if (item.type === "files") {
      fileBuffer.push(item.content);
    } else {
      if (fileBuffer.length > 0) {
        grouped.push({ type: "files", content: `${fileBuffer.length} file${fileBuffer.length !== 1 ? "s" : ""} created`, files: fileBuffer });
        fileBuffer = [];
      }
      grouped.push(item);
    }
  }
  if (fileBuffer.length > 0) {
    grouped.push({ type: "files", content: `${fileBuffer.length} file${fileBuffer.length !== 1 ? "s" : ""} created`, files: fileBuffer });
  }
  return grouped;
}

function ActivityBlock({ items }: { items: ActivityItem[] }) {
  const grouped = groupActivities(items);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());

  return (
    <div style={s.activityContainer}>
      {grouped.map((item, i) => {
        if (item.type === "thinking") {
          return <div key={i} style={s.thinkingLine}>{item.content}</div>;
        }
        if (item.type === "files") {
          const expanded = expandedFiles.has(i);
          return (
            <div key={i} style={s.fileBlock}>
              <div style={s.fileHeader} onClick={() => setExpandedFiles(prev => {
                const next = new Set(prev);
                next.has(i) ? next.delete(i) : next.add(i);
                return next;
              })}>
                <span style={s.fileIcon}>{expanded ? "v" : ">"}</span>
                <span style={s.fileLabel}>{item.content}</span>
              </div>
              {expanded && item.files && (
                <div style={s.fileList}>
                  {item.files.map((f, j) => <div key={j} style={s.fileName}>{f}</div>)}
                </div>
              )}
            </div>
          );
        }
        if (item.type === "command") {
          return <div key={i} style={s.cmdBlock}><span style={s.cmdPrompt}>$</span> {item.content}</div>;
        }
        if (item.type === "command_output") {
          return <div key={i} style={s.cmdOutput}>{item.content}</div>;
        }
        if (item.type === "error") {
          return <div key={i} style={s.errorLine}>{item.content}</div>;
        }
        if (item.type === "status") {
          return <div key={i} style={s.statusLine}>{item.content}</div>;
        }
        return null;
      })}
    </div>
  );
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
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activeDepId, setActiveDepId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatHistory(projectId).then(setMessages);
  }, [projectId]);

  // Track building state from both local trigger and external deploying prop
  useEffect(() => {
    if (deploying) {
      setBuilding(true);
    }
    if (!deploying && building) {
      // Deploy just finished
      setBuilding(false);
      setActivity([]);
      setActiveDepId(null);
      api.getChatHistory(projectId).then(setMessages);
    }
  }, [deploying]);

  // Subscribe to deployment logs — use activeDepId (set immediately on deploy)
  // or fall back to deploymentId from parent (set via polling)
  const watchId = activeDepId || (deploying ? deploymentId : null);

  useEffect(() => {
    if (!watchId) return;

    setActivity([]);
    const source = new EventSource(`/api/deployments/${watchId}/logs/stream`);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LogLine;
        if (data.stream === "system") {
          const item = parseLogToActivity(data.message);
          if (item) {
            setActivity(prev => [...prev, item]);
          }
        }
      } catch {}
    };

    return () => source.close();
  }, [watchId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, activity]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || building) return;
    setInput("");
    setBuilding(true);
    setActivity([]);

    const userMsg: ChatMsg = {
      id: Date.now(),
      project_id: projectId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    onDeploy(text);

    // Poll quickly for the new deployment ID so we can subscribe to SSE
    const poll = setInterval(() => {
      api.listDeployments(projectId).then(deps => {
        if (deps.length > 0) {
          const latest = deps[0];
          if (["pending", "generating", "building", "deploying"].includes(latest.status)) {
            setActiveDepId(latest.id);
            clearInterval(poll);
          }
        }
      });
    }, 300);
    // Stop polling after 10s
    setTimeout(() => clearInterval(poll), 10000);
  };

  const isActive = building || deploying;
  const statusLabel = deployStatus === "generating" ? "Claude is working..."
    : deployStatus === "deploying" ? "Starting your app..."
    : isActive ? "Working..." : "";

  return (
    <div style={s.container}>
      <div ref={messagesRef} style={s.messages}>
        {messages.length === 0 && !isActive && (
          <div style={s.empty}>Describe what you want to build.</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={msg.role === "user" ? s.userMsg : s.assistantMsg}>
            {msg.content}
          </div>
        ))}
        {isActive && (
          <div style={s.assistantMsg}>
            {activity.length > 0 ? (
              <ActivityBlock items={activity} />
            ) : (
              <span style={s.statusLine}>{statusLabel || "Starting..."}</span>
            )}
          </div>
        )}
      </div>
      <div style={s.inputArea}>
        <input
          style={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isActive ? statusLabel : "Tell Claude what to build or change..."}
          disabled={isActive}
        />
        <button
          style={{ ...s.sendBtn, opacity: (isActive || !input.trim()) ? 0.5 : 1 }}
          onClick={handleSend}
          disabled={isActive || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const s = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
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
    maxWidth: "90%",
    fontSize: "0.85rem",
    whiteSpace: "pre-wrap" as const,
  },
  inputArea: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    borderTop: "1px solid #1e1e30",
    background: "#0d0d14",
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
  sendBtn: {
    padding: "0.5rem 1rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  empty: {
    color: "#555",
    textAlign: "center" as const,
    padding: "2rem 1rem",
    fontSize: "0.85rem",
  },
  activityContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  },
  thinkingLine: {
    color: "#c4b5fd",
    fontSize: "0.85rem",
    lineHeight: "1.4",
  },
  fileBlock: {
    background: "#0f0f1a",
    borderRadius: "0.35rem",
    overflow: "hidden",
  },
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.5rem",
    cursor: "pointer",
    color: "#34d399",
    fontSize: "0.8rem",
  },
  fileIcon: {
    fontSize: "0.7rem",
    color: "#555",
    width: "0.8rem",
  },
  fileLabel: {
    color: "#34d399",
  },
  fileList: {
    padding: "0 0.5rem 0.3rem 1.5rem",
    fontSize: "0.75rem",
    fontFamily: "'JetBrains Mono', monospace",
  },
  fileName: {
    color: "#888",
    padding: "1px 0",
  },
  cmdBlock: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.78rem",
    color: "#f59e0b",
    background: "#0f0f1a",
    padding: "0.3rem 0.5rem",
    borderRadius: "0.35rem",
  },
  cmdPrompt: {
    color: "#555",
  },
  cmdOutput: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.75rem",
    color: "#888",
    padding: "0.15rem 0.5rem",
  },
  errorLine: {
    color: "#f87171",
    fontSize: "0.8rem",
    background: "#1a0a0a",
    padding: "0.3rem 0.5rem",
    borderRadius: "0.35rem",
  },
  statusLine: {
    color: "#888",
    fontSize: "0.8rem",
    fontStyle: "italic" as const,
  },
};
