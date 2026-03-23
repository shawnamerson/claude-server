import { useState, useEffect, useRef } from "react";
import { api, ChatMsg } from "../api/client";

interface LogLine {
  stream: string;
  message: string;
  timestamp: string;
}

interface ActivityItem {
  type: "thinking" | "files" | "command" | "command_output" | "status" | "error" | "success";
  content: string;
  files?: string[];
}

function parseLogToActivity(msg: string): ActivityItem | null {
  if (!msg.trim()) return null;
  if (msg.startsWith("Tokens:") || msg.startsWith("Total API")) return null;

  if (msg.startsWith("Claude:")) return { type: "thinking", content: msg.slice(7).trim() };
  if (msg.startsWith("  + ")) return { type: "files", content: msg.trim() };
  if (msg.startsWith("$ ")) return null; // Skip — already shown via "Running:" line
  if (msg.startsWith("Running:")) return { type: "command", content: msg.replace(/^Running:\s*/, "") };
  if (msg.startsWith("  Exit code:") || msg.startsWith("  Command error:")) return { type: "error", content: msg.trim() };
  if (msg.includes("error") || msg.includes("Error") || msg.includes("failed") || msg.includes("Failed")) return { type: "error", content: msg };
  if (msg.startsWith("Notes:")) return { type: "thinking", content: msg.slice(6).trim() };
  if (msg.startsWith("Deployed successfully") || msg.startsWith("Auto-fixed and redeployed")) return { type: "success", content: "Your app is live!" };
  if (msg.startsWith("Live at:")) return { type: "success", content: msg };
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
        if (item.type === "thinking") return <div key={i} style={s.thinkingLine}>{item.content}</div>;
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
                <div style={s.fileList}>{item.files.map((f, j) => <div key={j} style={s.fileName}>{f}</div>)}</div>
              )}
            </div>
          );
        }
        if (item.type === "command") return <div key={i} style={s.cmdBlock}><span style={s.cmdPrompt}>$</span> {item.content}</div>;
        if (item.type === "command_output") return <div key={i} style={s.cmdOutput}>{item.content}</div>;
        if (item.type === "error") return <div key={i} style={s.errorLine}>{item.content}</div>;
        if (item.type === "success") return <div key={i} style={s.successLine}>{item.content}</div>;
        if (item.type === "status") return <div key={i} style={s.statusLine}>{item.content}</div>;
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
  const [lastFinishedDepId, setLastFinishedDepId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<ActivityItem[]>([]);

  useEffect(() => {
    api.getChatHistory(projectId).then(setMessages);
  }, [projectId]);

  // Subscribe to SSE — lock to first deployment ID to avoid reconnecting on re-renders
  const sseDepId = useRef<string | null>(null);
  const sseSource = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!deploymentId) return;
    if (deploymentId === lastFinishedDepId) return;
    // Already subscribed to this deployment
    if (sseDepId.current === deploymentId && sseSource.current) return;

    // Close previous connection if any
    if (sseSource.current) {
      sseSource.current.close();
    }

    sseDepId.current = deploymentId;
    const authToken = (window as any).__authToken;
    const tokenParam = authToken ? `?token=${authToken}` : "";
    const source = new EventSource(`/api/deployments/${deploymentId}/logs/stream${tokenParam}`);
    sseSource.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LogLine;
        if (data.stream === "system") {
          const item = parseLogToActivity(data.message);
          if (item) {
            activityRef.current = [...activityRef.current, item];
            setActivity([...activityRef.current]);
          }
        }
      } catch {}
    };

    source.onerror = () => {
      // Don't reconnect — just let it die. New events will come when the connection is re-established.
    };

    return () => {
      source.close();
      sseSource.current = null;
      sseDepId.current = null;
    };
  }, [deploymentId, lastFinishedDepId]);

  // When deploy finishes, save the activity as a chat message and reset
  useEffect(() => {
    if (!deploying && activityRef.current.length > 0 && deploymentId) {
      setLastFinishedDepId(deploymentId);
      activityRef.current = [];
      setActivity([]);
      api.getChatHistory(projectId).then(setMessages);
    }
  }, [deploying]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, activity]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || deploying) return;
    setInput("");

    activityRef.current = [];
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
  };

  const isActive = !!deploying;
  const statusLabel = deployStatus === "generating" ? "Claude is working..."
    : deployStatus === "deploying" ? "Starting your app..."
    : deploying ? "Working..." : "";

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
  container: { display: "flex", flexDirection: "column" as const, flex: 1, minHeight: 0, overflow: "hidden" },
  messages: { flex: 1, minHeight: 0, overflow: "auto", padding: "0.75rem", display: "flex", flexDirection: "column" as const, gap: "0.5rem" },
  userMsg: { alignSelf: "flex-end" as const, background: "#7c3aed", color: "#fff", padding: "0.5rem 0.75rem", borderRadius: "0.75rem 0.75rem 0.25rem 0.75rem", maxWidth: "85%", fontSize: "0.85rem", whiteSpace: "pre-wrap" as const },
  assistantMsg: { alignSelf: "flex-start" as const, background: "#1a1a2e", color: "#e0e0e0", padding: "0.5rem 0.75rem", borderRadius: "0.75rem 0.75rem 0.75rem 0.25rem", maxWidth: "90%", fontSize: "0.85rem", whiteSpace: "pre-wrap" as const },
  inputArea: { display: "flex", gap: "0.5rem", padding: "0.5rem 0.75rem", borderTop: "1px solid #1e1e30", background: "#0d0d14" },
  input: { flex: 1, padding: "0.5rem 0.6rem", background: "#12121a", border: "1px solid #1e1e30", borderRadius: "0.5rem", color: "#e0e0e0", fontSize: "0.85rem", outline: "none", fontFamily: "inherit" },
  sendBtn: { padding: "0.5rem 1rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 },
  empty: { color: "#555", textAlign: "center" as const, padding: "2rem 1rem", fontSize: "0.85rem" },
  activityContainer: { display: "flex", flexDirection: "column" as const, gap: "0.35rem" },
  thinkingLine: { color: "#c4b5fd", fontSize: "0.85rem", lineHeight: "1.4" },
  fileBlock: { background: "#0f0f1a", borderRadius: "0.35rem", overflow: "hidden" },
  fileHeader: { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.5rem", cursor: "pointer", color: "#34d399", fontSize: "0.8rem" },
  fileIcon: { fontSize: "0.7rem", color: "#555", width: "0.8rem" },
  fileLabel: { color: "#34d399" },
  fileList: { padding: "0 0.5rem 0.3rem 1.5rem", fontSize: "0.75rem", fontFamily: "'JetBrains Mono', monospace" },
  fileName: { color: "#888", padding: "1px 0" },
  cmdBlock: { fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "#f59e0b", background: "#0f0f1a", padding: "0.3rem 0.5rem", borderRadius: "0.35rem" },
  cmdPrompt: { color: "#555" },
  cmdOutput: { fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", color: "#888", padding: "0.15rem 0.5rem" },
  errorLine: { color: "#f87171", fontSize: "0.8rem", background: "#1a0a0a", padding: "0.3rem 0.5rem", borderRadius: "0.35rem" },
  successLine: { color: "#34d399", fontSize: "0.9rem", fontWeight: 600, background: "#0a1a14", padding: "0.4rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #064e3b" },
  statusLine: { color: "#888", fontSize: "0.8rem", fontStyle: "italic" as const },
};
