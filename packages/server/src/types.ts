export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  credits: number;
  email_verified: number;
}

// Augment Express Request globally so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Re-export for explicit typing in route handlers
export type { Request as AuthenticatedRequest } from "express";

export interface Project {
  id: string;
  name: string;
  slug: string;
  source_path: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  project_id: string;
  status: DeploymentStatus;
  dockerfile: string | null;
  docker_image_id: string | null;
  container_id: string | null;
  port: number | null;
  error: string | null;
  created_at: string;
  stopped_at: string | null;
}

export type DeploymentStatus =
  | "pending"
  | "generating"
  | "building"
  | "deploying"
  | "running"
  | "sleeping"
  | "failed"
  | "stopped";

export interface LogEntry {
  id: number;
  deployment_id: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
  timestamp: string;
}

export interface ChatMessage {
  id: number;
  project_id: string;
  deployment_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  dockerfile: string;
  dockerignore: string;
  notes: string;
}
