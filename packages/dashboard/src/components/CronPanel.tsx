import { useState, useEffect } from "react";
import { api, CronJob, CronLog } from "../api/client";
import { useToast } from "./Toast";

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
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    marginBottom: "0.25rem",
  },
  input: {
    flex: 1,
    padding: "0.4rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit",
  },
  select: {
    padding: "0.4rem 0.5rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    color: "#e0e0e0",
    fontSize: "0.85rem",
    outline: "none",
  },
  btn: {
    padding: "0.35rem 0.7rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
    whiteSpace: "nowrap" as const,
  },
  dangerBtn: {
    padding: "0.25rem 0.5rem",
    background: "none",
    color: "#f87171",
    border: "1px solid #7f1d1d44",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  jobRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.6rem",
    background: "#12121a",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    marginBottom: "0.4rem",
    fontSize: "0.85rem",
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.5rem",
    lineHeight: 1.5,
  },
};

const PRESETS: Array<{ label: string; value: string }> = [
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 9am UTC", value: "0 9 * * *" },
  { label: "Weekly Mon 9am", value: "0 9 * * 1" },
];

export default function CronPanel({ projectId }: { projectId: string }) {
  const { showError } = useToast();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [newPath, setNewPath] = useState("/api/cron");
  const [newSchedule, setNewSchedule] = useState("0 * * * *");
  const [newMethod, setNewMethod] = useState("GET");
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [triggering, setTriggering] = useState<number | null>(null);

  useEffect(() => {
    api.getCronJobs(projectId).then(setJobs).catch(() => {});
  }, [projectId]);

  const addJob = async () => {
    if (!newPath.trim() || !newSchedule.trim()) return;
    try {
      const updated = await api.createCronJob(projectId, newPath, newSchedule, newMethod);
      setJobs(updated);
      setNewPath("/api/cron");
      setNewSchedule("0 * * * *");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create cron job");
    }
  };

  const deleteJob = async (id: number) => {
    await api.deleteCronJob(projectId, id);
    setJobs(prev => prev.filter(j => j.id !== id));
    if (expandedJob === id) setExpandedJob(null);
  };

  const toggleEnabled = async (job: CronJob) => {
    await api.updateCronJob(projectId, job.id, { enabled: !job.enabled });
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: job.enabled ? 0 : 1 } : j));
  };

  const triggerJob = async (id: number) => {
    setTriggering(id);
    try {
      await api.triggerCronJob(projectId, id);
      // Refresh jobs to get updated last_run
      const updated = await api.getCronJobs(projectId);
      setJobs(updated);
      if (expandedJob === id) {
        const jobLogs = await api.getCronLogs(projectId, id);
        setLogs(jobLogs);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(null);
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedJob === id) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(id);
    try {
      const jobLogs = await api.getCronLogs(projectId, id);
      setLogs(jobLogs);
    } catch {
      setLogs([]);
    }
  };

  return (
    <div style={styles.container}>
      {/* Existing jobs */}
      {jobs.map(job => (
        <div key={job.id}>
          <div
            style={{ ...styles.jobRow, cursor: "pointer", opacity: job.enabled ? 1 : 0.5 }}
            onClick={() => toggleExpand(job.id)}
          >
            <span style={{ color: job.last_status && job.last_status < 400 ? "#34d399" : job.last_status ? "#f87171" : "#555", fontSize: "0.6rem" }}>
              {"\u25CF"}
            </span>
            <span style={{ color: "#7c3aed", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
              {job.method}
            </span>
            <span style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
              {job.path}
            </span>
            <span style={{ color: "#888", fontSize: "0.75rem" }}>{job.schedule}</span>
            <button
              style={{ ...styles.btn, background: "#1a1a2e", fontSize: "0.7rem", padding: "0.2rem 0.4rem" }}
              onClick={(e) => { e.stopPropagation(); toggleEnabled(job); }}
            >
              {job.enabled ? "On" : "Off"}
            </button>
            <button
              style={{ ...styles.btn, fontSize: "0.7rem", padding: "0.2rem 0.4rem" }}
              disabled={triggering === job.id}
              onClick={(e) => { e.stopPropagation(); triggerJob(job.id); }}
            >
              {triggering === job.id ? "..." : "Run"}
            </button>
            <button
              style={styles.dangerBtn}
              onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
            >
              Del
            </button>
          </div>

          {/* Expanded: show logs */}
          {expandedJob === job.id && (
            <div style={{ marginLeft: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem" }}>
              {logs.length === 0 ? (
                <div style={{ color: "#555", padding: "0.3rem 0" }}>No runs yet</div>
              ) : (
                logs.slice(0, 10).map(log => (
                  <div key={log.id} style={{ display: "flex", gap: "0.5rem", padding: "0.2rem 0", color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>{new Date(log.created_at + "Z").toLocaleString()}</span>
                    <span style={{ color: log.status && log.status < 400 ? "#34d399" : "#f87171" }}>
                      {log.status || "ERR"}
                    </span>
                    <span>{log.duration_ms}ms</span>
                    {log.error && <span style={{ color: "#f87171" }}>{log.error.slice(0, 50)}</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add new job */}
      <div style={{ marginTop: jobs.length > 0 ? "0.75rem" : 0, borderTop: jobs.length > 0 ? "1px solid #1e1e30" : "none", paddingTop: jobs.length > 0 ? "0.75rem" : 0 }}>
        <div style={styles.label}>Add Cron Job</div>
        <div style={styles.row}>
          <input
            style={styles.input}
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            placeholder="/api/cron/daily"
          />
          <select style={styles.select} value={newMethod} onChange={e => setNewMethod(e.target.value)}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <div style={styles.row}>
          <input
            style={styles.input}
            value={newSchedule}
            onChange={e => setNewSchedule(e.target.value)}
            placeholder="0 * * * *"
          />
          <button style={styles.btn} onClick={addJob}>Add</button>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => setNewSchedule(p.value)}
              style={{
                padding: "0.15rem 0.4rem",
                background: newSchedule === p.value ? "#7c3aed33" : "#1a1a2e",
                border: `1px solid ${newSchedule === p.value ? "#7c3aed" : "#1e1e30"}`,
                borderRadius: "0.25rem",
                color: newSchedule === p.value ? "#c084fc" : "#666",
                fontSize: "0.7rem",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={styles.hint}>
          The platform hits your app's URL on schedule. All times are UTC. Your app must be running.
        </div>
      </div>
    </div>
  );
}
