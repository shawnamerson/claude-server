import Database from "better-sqlite3";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      source_path TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status          TEXT NOT NULL DEFAULT 'pending',
      dockerfile      TEXT,
      docker_image_id TEXT,
      container_id    TEXT,
      port            INTEGER,
      error           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      stopped_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      stream        TEXT NOT NULL DEFAULT 'stdout',
      message       TEXT NOT NULL,
      timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      deployment_id TEXT REFERENCES deployments(id),
      role          TEXT NOT NULL,
      content       TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS env_vars (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, key)
    );

    CREATE TABLE IF NOT EXISTS github_repos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      repo_url    TEXT NOT NULL,
      branch      TEXT NOT NULL DEFAULT 'main',
      webhook_secret TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_databases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      container_id    TEXT,
      container_name  TEXT NOT NULL,
      db_name         TEXT NOT NULL,
      db_user         TEXT NOT NULL,
      db_password     TEXT NOT NULL,
      port            INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'running',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_logs_deployment ON logs(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id);
    CREATE INDEX IF NOT EXISTS idx_env_vars_project ON env_vars(project_id);
  `);
}
