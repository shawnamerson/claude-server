import { useState, useEffect } from "react";
import { api, DatabaseInfo, TableSchema, QueryResult } from "../api/client";

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
  btn: {
    padding: "0.5rem 1rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  btnSmall: {
    padding: "0.35rem 0.7rem",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  dangerBtn: {
    padding: "0.4rem 0.8rem",
    background: "#450a0a",
    color: "#f87171",
    border: "1px solid #7f1d1d",
    borderRadius: "0.35rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.75rem",
  },
  statusDot: (running: boolean) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: running ? "#34d399" : "#666",
  }),
  label: {
    fontSize: "0.75rem",
    color: "#666",
    marginBottom: "0.15rem",
  },
  value: {
    fontSize: "0.85rem",
    color: "#e0e0e0",
    fontFamily: "'JetBrains Mono', monospace",
    background: "#12121a",
    padding: "0.4rem 0.6rem",
    borderRadius: "0.35rem",
    border: "1px solid #1e1e30",
    marginBottom: "0.75rem",
    wordBreak: "break-all" as const,
  },
  hint: {
    fontSize: "0.75rem",
    color: "#555",
    marginTop: "0.75rem",
  },
  empty: {
    textAlign: "center" as const,
    padding: "1.5rem",
  },
  emptyText: {
    color: "#888",
    fontSize: "0.9rem",
    marginBottom: "1rem",
  },
  tabs: {
    display: "flex",
    gap: "0",
    marginBottom: "0.75rem",
    borderBottom: "1px solid #1e1e30",
  },
  tab: (active: boolean) => ({
    padding: "0.5rem 1rem",
    background: "none",
    color: active ? "#e0e0e0" : "#666",
    border: "none",
    borderBottom: active ? "2px solid #7c3aed" : "2px solid transparent",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: active ? 600 : 400,
  }),
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.8rem",
    fontFamily: "'JetBrains Mono', monospace",
  },
  th: {
    textAlign: "left" as const,
    padding: "0.4rem 0.6rem",
    borderBottom: "1px solid #1e1e30",
    color: "#888",
    fontWeight: 500,
    fontSize: "0.75rem",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "0.35rem 0.6rem",
    borderBottom: "1px solid #12121a",
    color: "#e0e0e0",
    maxWidth: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  tableRow: {
    background: "#0a0a0f",
  },
  tableRowAlt: {
    background: "#0d0d15",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  tableName: {
    fontSize: "0.9rem",
    color: "#c4b5fd",
    fontWeight: 600,
  },
  rowCount: {
    fontSize: "0.75rem",
    color: "#666",
  },
  schemaTable: {
    marginBottom: "1rem",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    overflow: "hidden",
  },
  queryArea: {
    width: "100%",
    minHeight: "80px",
    background: "#12121a",
    color: "#e0e0e0",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
    padding: "0.5rem",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.85rem",
    resize: "vertical" as const,
    outline: "none",
  },
  queryBar: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginTop: "0.5rem",
    marginBottom: "0.75rem",
  },
  error: {
    color: "#f87171",
    fontSize: "0.85rem",
    fontFamily: "'JetBrains Mono', monospace",
    background: "#1a0a0a",
    padding: "0.5rem",
    borderRadius: "0.35rem",
    border: "1px solid #7f1d1d",
  },
  resultInfo: {
    fontSize: "0.75rem",
    color: "#666",
    marginBottom: "0.5rem",
  },
  resultWrap: {
    overflow: "auto",
    maxHeight: "400px",
    border: "1px solid #1e1e30",
    borderRadius: "0.35rem",
  },
};

function SchemaView({ projectId }: { projectId: string }) {
  const [schema, setSchema] = useState<TableSchema[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSchema = () => {
    setLoading(true);
    setError(null);
    api.getDatabaseSchema(projectId)
      .then(setSchema)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSchema(); }, [projectId]);

  if (loading) return <div style={{ color: "#666", padding: "1rem" }}>Loading schema...</div>;
  if (error) return <div style={styles.error}>{error}</div>;
  if (!schema || schema.length === 0) {
    return <div style={{ color: "#666", padding: "1rem" }}>No tables found. Deploy your app to create tables.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <span style={{ color: "#888", fontSize: "0.8rem" }}>{schema.length} table{schema.length !== 1 ? "s" : ""}</span>
        <button style={styles.btnSmall} onClick={loadSchema}>Refresh</button>
      </div>
      {schema.map(table => (
        <div key={table.table_name} style={styles.schemaTable}>
          <div style={{ padding: "0.5rem 0.6rem", background: "#12121a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={styles.tableName}>{table.table_name}</span>
            <span style={styles.rowCount}>{table.row_count} row{table.row_count !== 1 ? "s" : ""}</span>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Column</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Nullable</th>
                <th style={styles.th}>Default</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((col, i) => (
                <tr key={col.column_name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <td style={{ ...styles.td, color: "#e0e0e0", fontWeight: 500 }}>{col.column_name}</td>
                  <td style={{ ...styles.td, color: "#a78bfa" }}>{col.data_type}</td>
                  <td style={{ ...styles.td, color: col.is_nullable === "YES" ? "#666" : "#f59e0b" }}>
                    {col.is_nullable === "YES" ? "yes" : "NOT NULL"}
                  </td>
                  <td style={{ ...styles.td, color: "#666" }}>{col.column_default || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function QueryRunner({ projectId }: { projectId: string }) {
  const [sql, setSql] = useState("SELECT * FROM ");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);

  const runQuery = async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await api.queryDatabase(projectId, sql.trim());
      setResult(r);
    } catch (e) {
      setResult({ columns: [], rows: [], rowCount: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  return (
    <div>
      <textarea
        style={styles.queryArea}
        value={sql}
        onChange={e => setSql(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="SELECT * FROM ..."
        spellCheck={false}
      />
      <div style={styles.queryBar}>
        <button style={styles.btnSmall} onClick={runQuery} disabled={running || !sql.trim()}>
          {running ? "Running..." : "Run Query"}
        </button>
        <span style={{ fontSize: "0.75rem", color: "#555" }}>Ctrl+Enter to run</span>
      </div>

      {result && result.error && (
        <div style={styles.error}>{result.error}</div>
      )}

      {result && !result.error && result.columns.length > 0 && (
        <>
          <div style={styles.resultInfo}>{result.rowCount} row{result.rowCount !== 1 ? "s" : ""} returned</div>
          <div style={styles.resultWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {result.columns.map(col => (
                    <th key={col} style={styles.th}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    {row.map((cell, j) => (
                      <td key={j} style={styles.td} title={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result && !result.error && result.columns.length === 0 && (
        <div style={{ color: "#666", fontSize: "0.85rem" }}>Query executed successfully (no rows returned)</div>
      )}
    </div>
  );
}

export default function DatabasePanel({ projectId }: { projectId: string }) {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [connString, setConnString] = useState<string | null>(null);
  const [tab, setTab] = useState<"info" | "schema" | "query">("schema");

  useEffect(() => {
    api.getDatabase(projectId).then(setDbInfo);
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await api.createDatabase(projectId);
      setConnString(result.connectionString);
      api.getDatabase(projectId).then(setDbInfo);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create database");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this database? All data will be lost.")) return;
    try {
      await api.deleteDatabase(projectId);
      setDbInfo(null);
      setConnString(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete database");
    }
  };

  if (dbInfo === undefined) return <div style={styles.container}>Loading...</div>;

  if (!dbInfo) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          <div style={styles.emptyText}>No database attached to this project</div>
          <button style={styles.btn} onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create PostgreSQL Database"}
          </button>
          <div style={styles.hint}>
            Creates a PostgreSQL 16 database and automatically sets DATABASE_URL in your env vars.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.status}>
        <div style={styles.statusDot(dbInfo.status === "running")} />
        <span style={{ fontSize: "0.85rem", color: dbInfo.status === "running" ? "#34d399" : "#666" }}>
          PostgreSQL {dbInfo.status === "running" ? "Running" : dbInfo.status}
        </span>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === "schema")} onClick={() => setTab("schema")}>Schema</button>
        <button style={styles.tab(tab === "query")} onClick={() => setTab("query")}>Query</button>
        <button style={styles.tab(tab === "info")} onClick={() => setTab("info")}>Connection</button>
      </div>

      {tab === "schema" && <SchemaView projectId={projectId} />}

      {tab === "query" && <QueryRunner projectId={projectId} />}

      {tab === "info" && (
        <>
          <div style={styles.label}>Database</div>
          <div style={styles.value}>{dbInfo.dbName}</div>

          <div style={styles.label}>User</div>
          <div style={styles.value}>{dbInfo.user}</div>

          <div style={styles.label}>Internal Host</div>
          <div style={styles.value}>{dbInfo.host}:5432</div>

          <div style={styles.label}>External Port</div>
          <div style={styles.value}>{dbInfo.port}</div>

          <div style={styles.label}>Connection String (DATABASE_URL)</div>
          <div style={styles.value}>{connString || dbInfo.connectionString}</div>

          <div style={styles.hint}>
            DATABASE_URL is automatically set in your env vars. Redeploy to use it.
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button style={styles.dangerBtn} onClick={handleDelete}>Delete Database</button>
          </div>
        </>
      )}
    </div>
  );
}
