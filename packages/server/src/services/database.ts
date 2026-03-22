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

  // Create and start the Postgres container
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
      EndpointsConfig: { "claude-server-network": {} },
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
