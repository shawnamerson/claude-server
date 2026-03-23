import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root (two levels up from packages/server)
const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname2, "..", "..", "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  dataDir: path.resolve(
    process.env.DATA_DIR || path.join(__dirname, "..", "data")
  ),
  get projectsDir() {
    return path.join(this.dataDir, "projects");
  },
  get buildsDir() {
    return path.join(this.dataDir, "builds");
  },
  get dbPath() {
    return path.join(this.dataDir, "claude-server.db");
  },
  domain: process.env.DOMAIN || "localhost",
  containerPortStart: 10000,
  dockerHostIp: process.env.DOCKER_HOST_IP || "172.17.0.1",
  maxUploadSize: 100 * 1024 * 1024, // 100MB
  maxBuildRetries: 3,
};
