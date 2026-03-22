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
    padding: "1rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  userMsg: {
    alignSelf: "flex-end" as const,
    background: "#7c3aed",
    color: "#fff",
    padding: "0.6rem 1rem",
    borderRadius: "1rem 1rem 0.25rem 1rem",
    maxWidth: "80%",
    fontSize: "0.9rem",
    whiteSpace: "pre-wrap" as const,
  },
  assistantMsg: {
    alignSelf: "flex-start" as const,
    background: "#1a1a2e",
    color: "#e0e0e0",
    padding: "0.6rem 1rem",
    borderRadius: "1rem 1rem 1rem 0.25rem",
    maxWidth: "80%",
    fontSize: "0.9rem",
    whiteSpace: "pre-wrap" as const,
  },
  inputArea: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.75rem",
    borderTop: "1px solid #1e1e30",
  },
  input: {
    flex: 1,
    padding: "0.6rem 0.75rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    color: "#e0e0e0",
    fontSize: "0.9rem",
    outline: "none",
    fontFamily: "inherit",
  },
  askBtn: {
    padding: "0.6rem 0.75rem",
    background: "#1a1a2e",
    color: "#a78bfa",
    border: "1px solid #2e2e4a",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  deployBtn: {
    padding: "0.6rem 0.75rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.85rem",
    whiteSpace: "nowrap" as const,
  },
  empty: {
    color: "#555",
    textAlign: "center" as const,
    padding: "2rem",
    fontSize: "0.9rem",
  },
};

interface Props {
  projectId: string;
  deploying?: boolean;
  deployStatus?: string;
  onDeploy: (prompt: string) => void;
}

export default function ChatPanel({ projectId, deploying, deployStatus, onDeploy }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatHistory(projectId).then(setMessages);
  }, [projectId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, streamText]);

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
              } catch {
                // Skip
              }
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

  const handleApplyDeploy = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    // Show confirmation in chat
    const userMsg: ChatMsg = {
      id: Date.now(),
      project_id: projectId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const systemMsg: ChatMsg = {
      id: Date.now() + 1,
      project_id: projectId,
      role: "assistant",
      content: "Deploying your changes now... Check the Logs tab for progress.",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, systemMsg]);
    onDeploy(text);
  };

  return (
    <div style={styles.container}>
      <div ref={messagesRef} style={styles.messages}>
        {messages.length === 0 && !streaming && (
          <div style={styles.empty}>
            Ask Claude questions, or describe changes and click "Apply & Deploy".
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            <div style={msg.role === "user" ? styles.userMsg : styles.assistantMsg}>
              {msg.content}
            </div>
            {msg.role === "assistant" && idx === messages.length - 1 && !streaming && !deploying && (
              <button
                style={{
                  ...styles.deployBtn,
                  marginTop: "0.4rem",
                  fontSize: "0.8rem",
                  padding: "0.4rem 0.7rem",
                  alignSelf: "flex-start",
                }}
                onClick={() => {
                  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
                  const applyPrompt = lastUserMsg
                    ? `Apply the fix you suggested for: ${lastUserMsg.content}`
                    : "Apply the changes you just suggested";
                  const systemMsg: ChatMsg = {
                    id: Date.now(),
                    project_id: projectId,
                    role: "assistant",
                    content: "Applying suggestion and deploying... Check the Logs tab for progress.",
                    created_at: new Date().toISOString(),
                  };
                  setMessages((prev) => [...prev, systemMsg]);
                  onDeploy(applyPrompt);
                }}
              >
                Apply Suggestion & Deploy
              </button>
            )}
          </div>
        ))}
        {streamText && (
          <div style={styles.assistantMsg}>{streamText}</div>
        )}
      </div>
      <div style={styles.inputArea}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Ask a question or describe changes..."
          disabled={streaming}
        />
        <button style={styles.askBtn} onClick={sendMessage} disabled={streaming || !input.trim()}>
          {streaming ? "..." : "Ask"}
        </button>
        <button style={styles.deployBtn} onClick={handleApplyDeploy} disabled={streaming || deploying || !input.trim()}>
          {deploying
            ? deployStatus === "generating" ? "Generating..."
              : deployStatus === "building" ? "Building..."
              : deployStatus === "deploying" ? "Deploying..."
              : "Working..."
            : "Apply & Deploy"}
        </button>
      </div>
    </div>
  );
}
