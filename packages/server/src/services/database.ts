import Dockerode from "dockerode";
import crypto from "crypto";
import { getDb } from "../db/client.js";
import { encrypt } from "./encrypt.js";
import { config } from "../config.js";

const docker = new Dockerode();

const SHARED_DB_CONTAINER = "claude-server-db";

interface ProjectDatabase {
  id: number;
  project_id: string;
  container_id: string | null;
  container_name: string;
  db_name: string;
  db_user: string;
  db_password: string;
  port: number;
  status: string;
}

function generatePassword(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Execute SQL against the shared Postgres via Docker exec
async function execPostgresSQL(sql: string, user?: string, dbName?: string): Promise<string> {
  const container = docker.getContainer(SHARED_DB_CONTAINER);
  const cmd = ["psql", "-U", user || config.postgresUser, "-d", dbName || "vibestack", "-t", "-A", "-c", sql];
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});
  return streamToString(stream);
}

export async function createDatabase(projectId: string, projectSlug: string): Promise<{
  host: string;
  port: number;
  dbName: string;
  user: string;
  password: string;
  connectionString: string;
}> {
  const db = getDb();

  // Check if database already exists
  const existing = db.prepare("SELECT * FROM project_databases WHERE project_id = ?").get(projectId) as ProjectDatabase | undefined;
  if (existing && existing.status === "running") {
    const connStr = `postgresql://${existing.db_user}:${existing.db_password}@${SHARED_DB_CONTAINER}:5432/${existing.db_name}`;
    return {
      host: SHARED_DB_CONTAINER,
      port: 5432,
      dbName: existing.db_name,
      user: existing.db_user,
      password: existing.db_password,
      connectionString: connStr,
    };
  }

  const dbName = projectSlug.replace(/-/g, "_");
  const dbUser = projectSlug.replace(/-/g, "_") + "_user";
  const dbPassword = generatePassword();

  // Create database and user in the shared Postgres instance
  try {
    await execPostgresSQL(`CREATE DATABASE ${dbName};`);
  } catch {
    // Database may already exist from a previous attempt
  }
  try {
    await execPostgresSQL(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';`);
  } catch {
    // User may already exist — update password
    await execPostgresSQL(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword}';`);
  }
  await execPostgresSQL(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`);
  await execPostgresSQL(`ALTER DATABASE ${dbName} OWNER TO ${dbUser};`);
  // Hardening: connection limit, query timeout, idle timeout
  await execPostgresSQL(`ALTER USER ${dbUser} CONNECTION LIMIT 20;`);
  await execPostgresSQL(`ALTER USER ${dbUser} SET statement_timeout = '30s';`);
  await execPostgresSQL(`ALTER USER ${dbUser} SET idle_in_transaction_session_timeout = '60s';`);

  const connectionString = `postgresql://${dbUser}:${dbPassword}@${SHARED_DB_CONTAINER}:5432/${dbName}`;

  // Save to database
  if (existing) {
    db.prepare(
      `UPDATE project_databases SET container_id = NULL, container_name = ?, db_name = ?, db_user = ?, db_password = ?, port = 5432, status = 'running' WHERE project_id = ?`
    ).run(SHARED_DB_CONTAINER, dbName, dbUser, dbPassword, projectId);
  } else {
    db.prepare(
      `INSERT INTO project_databases (project_id, container_id, container_name, db_name, db_user, db_password, port, status) VALUES (?, NULL, ?, ?, ?, ?, 5432, 'running')`
    ).run(projectId, SHARED_DB_CONTAINER, dbName, dbUser, dbPassword);
  }

  // Auto-set DATABASE_URL env var for the project (encrypted)
  db.prepare(
    `INSERT INTO env_vars (project_id, key, value) VALUES (?, 'DATABASE_URL', ?)
     ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value`
  ).run(projectId, encrypt(connectionString));

  return {
    host: SHARED_DB_CONTAINER,
    port: 5432,
    dbName,
    user: dbUser,
    password: dbPassword,
    connectionString,
  };
}

export async function deleteDatabase(projectId: string): Promise<void> {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM project_databases WHERE project_id = ?").get(projectId) as ProjectDatabase | undefined;
  if (!existing) return;

  // Drop database and user from shared Postgres
  try {
    // Terminate active connections first
    await execPostgresSQL(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${existing.db_name}' AND pid <> pg_backend_pid();`);
    await execPostgresSQL(`DROP DATABASE IF EXISTS ${existing.db_name};`);
    await execPostgresSQL(`DROP USER IF EXISTS ${existing.db_user};`);
  } catch (err) {
    console.warn(`Failed to drop database ${existing.db_name}:`, err instanceof Error ? err.message : String(err));
  }

  // Remove from database
  db.prepare("DELETE FROM project_databases WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM env_vars WHERE project_id = ? AND key = 'DATABASE_URL'").run(projectId);
}

export function getDatabaseInfo(projectId: string): ProjectDatabase | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM project_databases WHERE project_id = ?").get(projectId) as ProjectDatabase) || null;
}

// Get a text summary of the database schema (for chat context)
export async function queryProjectDatabase(projectId: string): Promise<string> {
  const info = getDatabaseInfo(projectId);
  if (!info || info.status !== "running") return "(No database)";

  try {
    const schema = await getDatabaseSchema(projectId);
    if (schema.length === 0) return `Database: ${info.db_name} (no tables)`;

    let result = `Database: ${info.db_name}\n\nTables:\n`;
    for (const table of schema) {
      result += `\n${table.table_name} (${table.row_count} rows):\n`;
      for (const col of table.columns) {
        result += `  - ${col.column_name}: ${col.data_type}${col.is_nullable === "NO" ? " NOT NULL" : ""}${col.column_default ? ` DEFAULT ${col.column_default}` : ""}\n`;
      }
    }
    return result;
  } catch (err) {
    return `(Database query failed: ${err instanceof Error ? err.message : String(err)})`;
  }
}

export interface TableSchema {
  table_name: string;
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  row_count: number;
}

// Get structured schema info for all tables in a project's database
export async function getDatabaseSchema(projectId: string): Promise<TableSchema[]> {
  const info = getDatabaseInfo(projectId);
  if (!info || info.status !== "running") return [];

  const container = docker.getContainer(SHARED_DB_CONTAINER);

  // Get columns for all tables
  const colsExec = await container.exec({
    Cmd: ["psql", "-U", info.db_user, "-d", info.db_name, "-t", "-A", "-F", "\t", "-c",
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;"],
    AttachStdout: true,
    AttachStderr: true,
  });
  const colsStream = await colsExec.start({});
  const colsOutput = await streamToString(colsStream);

  // Get row counts
  const countExec = await container.exec({
    Cmd: ["psql", "-U", info.db_user, "-d", info.db_name, "-t", "-A", "-F", "\t", "-c",
      "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"],
    AttachStdout: true,
    AttachStderr: true,
  });
  const countStream = await countExec.start({});
  const countOutput = await streamToString(countStream);

  // Parse row counts
  const rowCounts = new Map<string, number>();
  for (const line of countOutput.split("\n")) {
    const [name, count] = line.split("\t");
    if (name && count) rowCounts.set(name.trim(), parseInt(count.trim()) || 0);
  }

  // Parse columns into tables
  const tables = new Map<string, TableSchema>();
  for (const line of colsOutput.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const [tableName, columnName, dataType, isNullable, columnDefault] = parts.map(p => p.trim());
    if (!tableName || !columnName) continue;

    if (!tables.has(tableName)) {
      tables.set(tableName, {
        table_name: tableName,
        columns: [],
        row_count: rowCounts.get(tableName) || 0,
      });
    }
    tables.get(tableName)!.columns.push({
      column_name: columnName,
      data_type: dataType,
      is_nullable: isNullable,
      column_default: columnDefault || null,
    });
  }

  return Array.from(tables.values());
}

// Execute a SQL query against a project's database
export async function executeQuery(projectId: string, sql: string): Promise<{
  columns: string[];
  rows: string[][];
  rowCount: number;
  error?: string;
}> {
  const info = getDatabaseInfo(projectId);
  if (!info || info.status !== "running") {
    return { columns: [], rows: [], rowCount: 0, error: "Database not running" };
  }

  // Block dangerous statements
  const normalized = sql.trim().toUpperCase();
  const blocked = [
    "DROP DATABASE", "DROP ROLE", "DROP USER", "DROP SCHEMA",
    "CREATE DATABASE", "CREATE ROLE", "CREATE USER",
    "ALTER SYSTEM", "ALTER ROLE", "ALTER USER",
    "GRANT", "REVOKE", "COPY", "\\COPY",
    "LOAD", "DO $$", "CREATE FUNCTION", "CREATE PROCEDURE",
    "CREATE EXTENSION", "CREATE TRIGGER",
  ];
  for (const b of blocked) {
    if (normalized.includes(b)) {
      return { columns: [], rows: [], rowCount: 0, error: `Blocked: ${b} is not allowed` };
    }
  }

  // Block multiple statements
  const statementsOutsideStrings = sql.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, "");
  const statementCount = statementsOutsideStrings.split(";").filter(s => s.trim().length > 0).length;
  if (statementCount > 1) {
    return { columns: [], rows: [], rowCount: 0, error: "Only single statements are allowed" };
  }

  const container = docker.getContainer(SHARED_DB_CONTAINER);

  try {
    const exec = await container.exec({
      Cmd: ["psql", "-U", info.db_user, "-d", info.db_name, "-c", sql, "--csv"],
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({});
    const output = await streamToString(stream);

    if (!output.trim()) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    if (output.includes("ERROR:")) {
      const errorLine = output.split("\n").find(l => l.includes("ERROR:"));
      return { columns: [], rows: [], rowCount: 0, error: errorLine || "Query failed" };
    }

    const lines = output.trim().split("\n");
    if (lines.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    const columns = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(parseCSVLine);

    return { columns, rows, rowCount: rows.length };
  } catch (err) {
    return { columns: [], rows: [], rowCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => {
      // Skip the 8-byte Docker multiplex header
      if (chunk.length > 8) {
        chunks.push(chunk.subarray(8));
      }
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8").trim()));
    stream.on("error", reject);
  });
}
