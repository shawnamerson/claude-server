const BASE = "/api";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = (window as any).__authToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: getAuthHeaders(),
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  source_path: string;
  created_at: string;
  updated_at: string;
  latest_status?: string;
  latest_port?: number;
  files?: Record<string, string>;
}

export interface Deployment {
  id: string;
  project_id: string;
  status: string;
  dockerfile: string | null;
  container_id: string | null;
  port: number | null;
  error: string | null;
  created_at: string;
}

export interface LogEntry {
  id: number;
  deployment_id: string;
  stream: string;
  message: string;
  timestamp: string;
}

export interface ChatMsg {
  id: number;
  project_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface EnvVar {
  id: number;
  project_id: string;
  key: string;
  value: string;
}

export interface GitHubConnection {
  repoUrl: string;
  branch: string;
  webhookUrl: string;
}

export interface CustomDomain {
  id: number;
  project_id: string;
  domain: string;
  verified: number;
}

export interface DatabaseInfo {
  status: string;
  dbName: string;
  user: string;
  port: number;
  host: string;
  connectionString: string;
}

export interface DatabaseCreateResult {
  ok: boolean;
  dbName: string;
  user: string;
  port: number;
  host: string;
  connectionString: string;
  message: string;
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (name: string, description: string) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // Deployments
  listDeployments: (projectId: string) =>
    request<Deployment[]>(`/projects/${projectId}/deployments`),
  getDeployment: (id: string) => request<Deployment>(`/deployments/${id}`),
  deploy: (projectId: string, prompt?: string) =>
    request<Deployment>(`/projects/${projectId}/deploy`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  stopDeployment: (id: string) =>
    request<{ ok: boolean }>(`/deployments/${id}/stop`, { method: "POST" }),
  startDeployment: (id: string) =>
    request<{ ok: boolean }>(`/deployments/${id}/start`, { method: "POST" }),

  // Chat
  getChatHistory: (projectId: string) => request<ChatMsg[]>(`/projects/${projectId}/chat`),

  // Files
  getFileTree: (projectId: string) => request<FileNode[]>(`/projects/${projectId}/files`),
  getFile: (projectId: string, filePath: string) =>
    request<{ path: string; content: string }>(`/projects/${projectId}/files/${encodeURIComponent(filePath)}`),
  updateFile: (projectId: string, filePath: string, content: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/files/${encodeURIComponent(filePath)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  uploadFile: async (projectId: string, file: File, directory = "public"): Promise<{ ok: boolean; path: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("directory", directory);
    const token = (window as any).__authToken;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/projects/${projectId}/upload`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  // Environment Variables
  getEnvVars: (projectId: string) => request<EnvVar[]>(`/projects/${projectId}/env`),
  setEnvVar: (projectId: string, key: string, value: string) =>
    request<EnvVar[]>(`/projects/${projectId}/env`, {
      method: "POST",
      body: JSON.stringify({ key, value }),
    }),
  deleteEnvVar: (projectId: string, key: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/env/${key}`, { method: "DELETE" }),

  // GitHub
  getGitHub: (projectId: string) => request<GitHubConnection | null>(`/projects/${projectId}/github`),
  connectGitHub: (projectId: string, repoUrl: string, branch?: string) =>
    request<{ ok: boolean; webhookSecret: string; webhookUrl: string }>(`/projects/${projectId}/github`, {
      method: "POST",
      body: JSON.stringify({ repoUrl, branch }),
    }),
  disconnectGitHub: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/github`, { method: "DELETE" }),

  // Database
  getDatabase: (projectId: string) => request<DatabaseInfo | null>(`/projects/${projectId}/database`),
  createDatabase: (projectId: string) =>
    request<DatabaseCreateResult>(`/projects/${projectId}/database`, { method: "POST" }),
  deleteDatabase: (projectId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/database`, { method: "DELETE" }),

  // Domains
  getDomains: (projectId: string) => request<CustomDomain[]>(`/projects/${projectId}/domains`),
  addDomain: (projectId: string, domain: string) =>
    request<{ ok: boolean; domain: string; instructions: string }>(`/projects/${projectId}/domains`, {
      method: "POST",
      body: JSON.stringify({ domain }),
    }),
  removeDomain: (projectId: string, domainId: number) =>
    request<{ ok: boolean }>(`/projects/${projectId}/domains/${domainId}`, { method: "DELETE" }),
};
