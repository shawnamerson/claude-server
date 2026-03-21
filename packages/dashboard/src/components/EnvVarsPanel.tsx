import { useState, useEffect } from "react";
import { api, EnvVar } from "../api/client";

const styles = {
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    border: "1px solid #1e1e30",
    borderRadius: "0.5rem",
    background: "#0a0a0f",
    padding: "0.75rem",
  },
  row: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.5rem",
    alignItems: "center",
  },
  input: {
    padding: "0.4rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    color: "#e0e0e0",
    fontSize: "0.8rem",
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
  },
  keyInput: {
    width: "140px",
  },
  valueInput: {
    flex: 1,
  },
  deleteBtn: {
    padding: "0.3rem 0.5rem",
    background: "#450a0a",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  addBtn: {
    padding: "0.35rem 0.7rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.5rem",
  },
  empty: {
    color: "#555",
    fontSize: "0.85rem",
    padding: "1rem",
    textAlign: "center" as const,
  },
};

export default function EnvVarsPanel({ projectId }: { projectId: string }) {
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    api.getEnvVars(projectId).then(setVars);
  }, [projectId]);

  const addVar = async () => {
    if (!newKey.trim()) return;
    const updated = await api.setEnvVar(projectId, newKey.trim(), newValue);
    setVars(updated);
    setNewKey("");
    setNewValue("");
  };

  const deleteVar = async (key: string) => {
    await api.deleteEnvVar(projectId, key);
    setVars(vars.filter((v) => v.key !== key));
  };

  return (
    <div style={styles.container}>
      {vars.length === 0 && (
        <div style={styles.empty}>No environment variables set</div>
      )}
      {vars.map((v) => (
        <div key={v.key} style={styles.row}>
          <input
            style={{ ...styles.input, ...styles.keyInput }}
            value={v.key}
            readOnly
          />
          <input
            style={{ ...styles.input, ...styles.valueInput }}
            value={v.value}
            readOnly
          />
          <button style={styles.deleteBtn} onClick={() => deleteVar(v.key)}>
            X
          </button>
        </div>
      ))}
      <div style={styles.row}>
        <input
          style={{ ...styles.input, ...styles.keyInput }}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.toUpperCase())}
          placeholder="KEY"
          onKeyDown={(e) => e.key === "Enter" && addVar()}
        />
        <input
          style={{ ...styles.input, ...styles.valueInput }}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          onKeyDown={(e) => e.key === "Enter" && addVar()}
        />
        <button style={styles.addBtn} onClick={addVar}>Add</button>
      </div>
      <div style={styles.hint}>
        Env vars are injected on the next deploy.
      </div>
    </div>
  );
}
