import Dockerode from "dockerode";
import fs from "fs";
import path from "path";
import { getDb } from "../db/client.js";

const docker = new Dockerode();

interface ProjectDatabase {
  project_id: string;
  container_name: string;
  db_name: string;
  db_user: string;
  status: string;
}

const BACKUP_DIR = process.env.BACKUP_DIR || "/app/data/backups";

export async function backupAllDatabases(): Promise<void> {
  const db = getDb();
  const databases = db.prepare(
    "SELECT project_id, container_name, db_name, db_user, status FROM project_databases WHERE status = 'running'"
  ).all() as ProjectDatabase[];

  if (databases.length === 0) {
    console.log("No databases to back up");
    return;
  }

  // Ensure backup directory exists
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let succeeded = 0;
  let failed = 0;

  for (const dbInfo of databases) {
    try {
      const container = docker.getContainer(dbInfo.container_name);

      // Run pg_dump inside the container
      const exec = await container.exec({
        Cmd: ["pg_dump", "-U", dbInfo.db_user, "-d", dbInfo.db_name, "--no-owner", "--no-acl"],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({});
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          // Docker multiplexes stdout/stderr with 8-byte header
          if (chunk.length > 8) {
            const streamType = chunk.readUInt8(0);
            const payload = chunk.subarray(8);
            if (streamType === 2) {
              errChunks.push(payload);
            } else {
              chunks.push(payload);
            }
          }
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      });

      const dump = Buffer.concat(chunks).toString("utf-8");
      const errors = Buffer.concat(errChunks).toString("utf-8").trim();

      if (!dump.trim()) {
        console.warn(`Backup empty for ${dbInfo.db_name}: ${errors}`);
        failed++;
        continue;
      }

      // Write to backup file
      const backupFile = path.join(BACKUP_DIR, `${dbInfo.project_id}_${date}.sql`);
      fs.writeFileSync(backupFile, dump);

      // Keep only last 7 backups per project
      const allBackups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith(dbInfo.project_id + "_") && f.endsWith(".sql"))
        .sort()
        .reverse();

      for (const old of allBackups.slice(7)) {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
      }

      succeeded++;
    } catch (err) {
      console.error(`Backup failed for ${dbInfo.db_name}:`, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  console.log(`Database backups: ${succeeded} succeeded, ${failed} failed out of ${databases.length}`);
}
