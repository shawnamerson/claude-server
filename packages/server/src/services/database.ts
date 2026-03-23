import Dockerode from "dockerode";
import crypto from "crypto";
import { getDb } from "../db/client.js";

const docker = new Dockerode();

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

// Find an available port for Postgres (starting at 15432)
const usedDbPorts = new Set<number>();

async function findAvailableDbPort(): Promise<number> {
  let port = 15432;
  while (usedDbPorts.has(port)) {
    port++;
  }
  usedDbPorts.add(port);
  return port;
}

function generatePassword(): string {
  return crypto.randomBytes(16).toString("hex");
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
    const connStr = `postgresql://${existing.db_user}:${existing.db_password}@${existing.container_name}:5432/${existing.db_name}`;
    return {
      host: existing.container_name,
      port: existing.port,
      dbName: existing.db_name,
      user: existing.db_user,
      password: existing.db_password,
      connectionString: connStr,
    };
  }

  const dbName = projectSlug.replace(/-/g, "_");
  const dbUser = "app";
  const dbPassword = generatePassword();
  const hostPort = await findAvailableDbPort();
  const containerName = `claude-server-db-${projectSlug}`;

  // Remove stale container with same name if it exists
  try {
    const stale = docker.getContainer(containerName);
    await stale.stop({ t: 2 }).catch(() => {});
    await stale.remove({ force: true });
    console.log(`Removed stale database container: ${containerName}`);
  } catch {
    // Container doesn't exist — that's fine
  }

  // Pull postgres image if needed
  try {
    await docker.getImage("postgres:16-alpine").inspect();
  } catch {
    console.log("Pulling postgres:16-alpine...");
    const stream = await docker.pull("postgres:16-alpine");
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Create project-specific network if it doesn't exist
  const networkName = `claude-project-${projectSlug}`;
  try {
    await docker.getNetwork(networkName).inspect();
  } catch {
    await docker.createNetwork({ Name: networkName, Driver: "bridge" });
  }

  // Create and start the Postgres container on the project's isolated network
  const container = await docker.createContainer({
    Image: "postgres:16-alpine",
    name: containerName,
    Env: [
      `POSTGRES_DB=${dbName}`,
      `POSTGRES_USER=${dbUser}`,
      `POSTGRES_PASSWORD=${dbPassword}`,
    ],
    ExposedPorts: { "5432/tcp": {} },
    HostConfig: {
      PortBindings: {
        "5432/tcp": [{ HostPort: String(hostPort) }],
      },
      RestartPolicy: { Name: "unless-stopped" },
      Memory: 256 * 1024 * 1024, // 256MB limit
    },
    Labels: {
      "claude-server": "true",
      "claude-server.database": projectId,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [networkName]: {}, // Only accessible from this project's containers
        "claude-server-network": {}, // Also on main network for schema viewer/query runner
      },
    },
  });

  await container.start();

  // Save to database
  if (existing) {
    db.prepare(
      `UPDATE project_databases SET container_id = ?, container_name = ?, db_name = ?, db_user = ?, db_password = ?, port = ?, status = 'running' WHERE project_id = ?`
    ).run(container.id, containerName, dbName, dbUser, dbPassword, hostPort, projectId);
  } else {
    db.prepare(
      `INSERT INTO project_databases (project_id, container_id, container_name, db_name, db_user, db_password, port, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'running')`
    ).run(projectId, container.id, containerName, dbName, dbUser, dbPassword, hostPort);
  }

  // Auto-set DATABASE_URL env var for the project
  const connectionString = `postgresql://${dbUser}:${dbPassword}@${containerName}:5432/${dbName}`;
  db.prepare(
    `INSERT INTO env_vars (project_id, key, value) VALUES (?, 'DATABASE_URL', ?)
     ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value`
  ).run(projectId, connectionString);

  return {
    host: containerName,
    port: hostPort,
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

  // Stop and remove the container
  if (existing.container_id) {
    try {
      const container = docker.getContainer(existing.container_id);
      await container.stop({ t: 5 });
      await container.remove({ force: true });
    } catch {
      // Container may already be gone
      try {
        const container = docker.getContainer(existing.container_name);
        await container.remove({ force: true });
      } catch {
        // Ignore
      }
    }
  }

  usedDbPorts.delete(existing.port);

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

  const container = docker.getContainer(info.container_name);

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

  // Basic safety: block dangerous statements
  const normalized = sql.trim().toUpperCase();
  const blocked = ["DROP DATABASE", "DROP ROLE", "DROP USER", "CREATE DATABASE", "ALTER SYSTEM"];
  for (const b of blocked) {
    if (normalized.includes(b)) {
      return { columns: [], rows: [], rowCount: 0, error: `Blocked: ${b} is not allowed` };
    }
  }

  const container = docker.getContainer(info.container_name);

  try {
    // Use CSV format for reliable parsing
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

    // Check for error messages from psql
    if (output.includes("ERROR:")) {
      const errorLine = output.split("\n").find(l => l.includes("ERROR:"));
      return { columns: [], rows: [], rowCount: 0, error: errorLine || "Query failed" };
    }

    // Parse CSV output
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

// Initialize: track existing database container ports
export async function initializeDbPortTracking() {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["claude-server.database"] },
    });
    for (const container of containers) {
      if (container.Ports) {
        for (const port of container.Ports) {
          if (port.PublicPort) {
            usedDbPorts.add(port.PublicPort);
          }
        }
      }
    }
  } catch {
    // Docker might not be available
  }
}
