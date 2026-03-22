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
  const hostPort = await findAvailablePort();
  const domain = process.env.DOMAIN || "localhost";

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
      Internal: false, // needs outbound for npm, APIs, etc.
    });
  }

  const container = await docker.createContainer({
    Image: imageTag,
    name: `claude-server-${deploymentId}`,
    ExposedPorts: { [`${appPort}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${appPort}/tcp`]: [{ HostPort: String(hostPort) }],
      },
      RestartPolicy: { Name: "no" },
      Memory: 512 * 1024 * 1024, // 512MB limit
      MemorySwap: 512 * 1024 * 1024, // No swap
      CpuPeriod: 100000,
      CpuQuota: 50000, // 50% CPU limit
      PidsLimit: 256, // Prevent fork bombs
      CapDrop: ["ALL"], // Drop all capabilities
      CapAdd: ["NET_BIND_SERVICE"], // Only allow binding to ports
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: false, // Apps may need to write temp files
    },
    Env: [`PORT=${appPort}`, ...extraEnv],
    Labels: {
      "claude-server": "true",
      "claude-server.deployment": deploymentId,
      "claude-server.project": projectSlug || deploymentId,
      // Traefik labels for custom domain routing
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
        [networkName]: {}, // Isolated project network (for its database)
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
