import Dockerode from "dockerode";
import { EventEmitter } from "events";
import { getDb } from "../db/client.js";
import { config } from "../config.js";

const docker = new Dockerode();

// Global event emitter for log streaming
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(100);

// Track used ports
const usedPorts = new Set<number>();

function addLog(deploymentId: string, stream: string, message: string) {
  const db = getDb();
  db.prepare(
    "INSERT INTO logs (deployment_id, stream, message) VALUES (?, ?, ?)"
  ).run(deploymentId, stream, message);

  // Emit for real-time streaming
  logEmitter.emit(`log:${deploymentId}`, { stream, message, timestamp: new Date().toISOString() });
}

async function findAvailablePort(): Promise<number> {
  let port = config.containerPortStart;
  while (usedPorts.has(port)) {
    port++;
  }
  usedPorts.add(port);
  return port;
}

export function releasePort(port: number) {
  usedPorts.delete(port);
}

export async function deployContainer(
  imageTag: string,
  deploymentId: string,
  appPort: number,
  extraEnv: string[] = [],
  projectSlug?: string
): Promise<{ containerId: string; hostPort: number }> {
  return _createAndStartContainer(deploymentId, appPort, extraEnv, projectSlug, {
    Image: imageTag,
  });
}

/**
 * Deploy using the base image with project files mounted from the app-data volume.
 * Skips the Docker build step entirely — files are already on disk and tested.
 */
export async function deployFromVolume(
  sourcePath: string,
  deploymentId: string,
  appPort: number,
  startCommand: string,
  extraEnv: string[] = [],
  projectSlug?: string,
  opts?: { memoryMb?: number }
): Promise<{ containerId: string; hostPort: number }> {
  const relativeToData = sourcePath.replace(/^\/app\/data\//, "");
  const workDir = `/data/${relativeToData}`;

  return _createAndStartContainer(deploymentId, appPort, [
    ...extraEnv,
    "NODE_PATH=/app/node_modules",
    "PYTHONUNBUFFERED=1",
  ], projectSlug, {
    Image: "claude-server/base:latest",
    WorkingDir: workDir,
    Cmd: ["sh", "-c", startCommand],
    extraBinds: [`claude-server_app-data:/data:rw`],
    memoryMb: opts?.memoryMb,
  });
}

async function _createAndStartContainer(
  deploymentId: string,
  appPort: number,
  extraEnv: string[],
  projectSlug: string | undefined,
  opts: {
    Image: string;
    WorkingDir?: string;
    Cmd?: string[];
    extraBinds?: string[];
    memoryMb?: number;
  }
): Promise<{ containerId: string; hostPort: number }> {
  const hostPort = await findAvailablePort();
  const domain = process.env.DOMAIN || "localhost";
  const memoryBytes = (opts.memoryMb || 512) * 1024 * 1024;

  addLog(deploymentId, "system", `Deploying container on port ${hostPort} -> ${appPort}`);
  if (projectSlug) {
    addLog(deploymentId, "system", `Custom domain: ${projectSlug}.${domain}`);
  }

  // Create an isolated network for this project so it can only reach its own database
  const networkName = `claude-project-${projectSlug || deploymentId}`;
  try {
    await docker.getNetwork(networkName).inspect();
  } catch {
    await docker.createNetwork({
      Name: networkName,
      Driver: "bridge",
      Internal: false,
    });
  }

  const container = await docker.createContainer({
    Image: opts.Image,
    name: `claude-server-${deploymentId}`,
    ...(opts.WorkingDir ? { WorkingDir: opts.WorkingDir } : {}),
    ...(opts.Cmd ? { Cmd: opts.Cmd } : {}),
    ExposedPorts: { [`${appPort}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${appPort}/tcp`]: [{ HostPort: String(hostPort) }],
      },
      Binds: opts.extraBinds || [],
      RestartPolicy: { Name: "no" },
      Memory: memoryBytes,
      MemorySwap: memoryBytes,
      CpuPeriod: 100000,
      CpuQuota: 50000,
      PidsLimit: 256,
      CapDrop: ["ALL"],
      CapAdd: ["NET_BIND_SERVICE"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: false,
    },
    Env: [`PORT=${appPort}`, ...extraEnv],
    Labels: {
      "claude-server": "true",
      "claude-server.deployment": deploymentId,
      "claude-server.project": projectSlug || deploymentId,
      "traefik.enable": "true",
      [`traefik.http.routers.${deploymentId}.rule`]: `Host(\`${projectSlug || deploymentId}.${domain}\`)`,
      [`traefik.http.routers.${deploymentId}.entrypoints`]: domain === "localhost" ? "web" : "websecure",
      ...(domain !== "localhost" ? {
        [`traefik.http.routers.${deploymentId}.tls.certresolver`]: "letsencrypt-dns",
      } : {}),
      [`traefik.http.services.${deploymentId}.loadbalancer.server.port`]: String(appPort),
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [networkName]: {},
        "claude-server-network": {}, // Reach shared Postgres
      },
    },
  });

  await container.start();

  addLog(deploymentId, "system", `Container started: ${container.id.slice(0, 12)}`);

  // Attach to container logs for real-time streaming
  attachLogs(container, deploymentId);

  return { containerId: container.id, hostPort };
}

function attachLogs(container: Dockerode.Container, deploymentId: string) {
  container.logs(
    { follow: true, stdout: true, stderr: true, timestamps: true },
    (err, stream) => {
      if (err || !stream) {
        addLog(deploymentId, "system", `Failed to attach logs: ${err?.message}`);
        return;
      }

      stream.on("data", (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr with an 8-byte header
        const header = chunk.readUInt8(0);
        const payload = chunk.subarray(8).toString("utf-8").trim();
        if (!payload) return;

        const streamType = header === 2 ? "stderr" : "stdout";
        addLog(deploymentId, streamType, payload);
      });

      stream.on("end", () => {
        addLog(deploymentId, "system", "Container stopped");
      });
    }
  );
}

export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 });
    await container.remove({ force: true });
  } catch (err) {
    // Container may already be stopped
    try {
      const container = docker.getContainer(containerId);
      await container.remove({ force: true });
    } catch {
      // Ignore
    }
  }
}

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    // If the container keeps restarting, it's crashing
    if (info.RestartCount > 0) {
      return "crashed";
    }
    return info.State.Status;
  } catch {
    return "unknown";
  }
}

// Clean up stopped project containers and dangling images
export async function cleanupStoppedContainers() {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["claude-server=true"], status: ["exited", "dead"] },
    });
    let removed = 0;
    for (const c of containers) {
      try {
        await docker.getContainer(c.Id).remove({ force: true });
        removed++;
        if (c.Ports) {
          for (const port of c.Ports) {
            if (port.PublicPort) usedPorts.delete(port.PublicPort);
          }
        }
      } catch (err) {
        console.warn(`Failed to remove container ${c.Id.slice(0, 12)}:`, err instanceof Error ? err.message : String(err));
      }
    }
    if (removed > 0) console.log(`Cleaned up ${removed} stopped containers`);

    // Prune dangling images
    await docker.pruneImages({ filters: { dangling: { "true": true } } }).catch((err) => {
      console.warn("Image prune failed:", err instanceof Error ? err.message : String(err));
    });
  } catch (err) {
    console.warn("Container cleanup failed:", err instanceof Error ? err.message : String(err));
  }
}

// Initialize: scan for existing containers and mark their ports as used
export async function initializePortTracking() {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["claude-server=true"] },
    });

    for (const container of containers) {
      if (container.Ports) {
        for (const port of container.Ports) {
          if (port.PublicPort) {
            usedPorts.add(port.PublicPort);
          }
        }
      }
    }
  } catch {
    // Docker might not be available yet
  }
}

// Remove running containers that have no matching DB record (orphans)
export async function cleanupOrphanedContainers() {
  try {
    const db = getDb();

    // Get all claude-server containers (app deployments)
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["claude-server=true", "claude-server.deployment"] },
    });

    let removed = 0;
    for (const c of containers) {
      const deploymentId = c.Labels["claude-server.deployment"];
      if (!deploymentId) continue;

      // Check if this deployment still exists in the DB as running
      const dep = db.prepare(
        "SELECT id, status FROM deployments WHERE id = ? AND status IN ('running', 'deploying')"
      ).get(deploymentId) as { id: string; status: string } | undefined;

      if (!dep) {
        console.log(`Removing orphaned container: ${c.Names[0]} (deployment ${deploymentId} not in DB)`);
        try {
          const container = docker.getContainer(c.Id);
          await container.stop({ t: 5 }).catch(() => {});
          await container.remove({ force: true });
          removed++;
          if (c.Ports) {
            for (const port of c.Ports) {
              if (port.PublicPort) usedPorts.delete(port.PublicPort);
            }
          }
        } catch (err) {
          console.warn(`Failed to remove orphaned container ${c.Id.slice(0, 12)}:`, err instanceof Error ? err.message : String(err));
        }
      }
    }

    if (removed > 0) console.log(`Cleaned up ${removed} orphaned container(s)`);
  } catch (err) {
    console.warn("Orphan cleanup failed:", err instanceof Error ? err.message : String(err));
  }
}

// Periodically reconcile usedPorts with actual running containers
export async function reconcilePorts() {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["claude-server=true"] },
    });

    const activePorts = new Set<number>();
    for (const container of containers) {
      if (container.Ports) {
        for (const port of container.Ports) {
          if (port.PublicPort) activePorts.add(port.PublicPort);
        }
      }
    }

    // Release ports that no longer have a container
    let released = 0;
    for (const port of usedPorts) {
      if (!activePorts.has(port)) {
        usedPorts.delete(port);
        released++;
      }
    }

    // Add ports we didn't know about
    for (const port of activePorts) {
      usedPorts.add(port);
    }

    if (released > 0) {
      console.log(`Port reconciliation: released ${released} stale port(s), tracking ${usedPorts.size} active`);
    }
  } catch (err) {
    console.warn("Port reconciliation failed:", err instanceof Error ? err.message : String(err));
  }
}
