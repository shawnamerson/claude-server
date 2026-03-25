import Database from "better-sqlite3";

export function initializeDatabase(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      credits     INTEGER NOT NULL DEFAULT 3,
      stripe_customer_id TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL,
      type        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS custom_domains (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      domain      TEXT NOT NULL UNIQUE,
      verified    INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS teams (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role        TEXT NOT NULL DEFAULT 'member',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(team_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS team_invites (
      id          TEXT PRIMARY KEY,
      team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      invited_by  TEXT NOT NULL REFERENCES users(id),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
    CREATE INDEX IF NOT EXISTS idx_logs_deployment ON logs(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(project_id);
    CREATE INDEX IF NOT EXISTS idx_env_vars_project ON env_vars(project_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);

    CREATE TABLE IF NOT EXISTS cron_jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path        TEXT NOT NULL,
      schedule    TEXT NOT NULL,
      method      TEXT NOT NULL DEFAULT 'GET',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS cron_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cron_job_id INTEGER NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
      status      INTEGER,
      duration_ms INTEGER,
      error       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cron_jobs_project ON cron_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_cron_logs_job ON cron_logs(cron_job_id);

    CREATE TABLE IF NOT EXISTS page_views (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT NOT NULL,
      referrer    TEXT,
      visitor_id  TEXT NOT NULL,
      user_agent  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
    CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_id);

    CREATE TABLE IF NOT EXISTS api_usage (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      cost_cents      INTEGER NOT NULL DEFAULT 0,
      source          TEXT NOT NULL DEFAULT 'deploy',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations for existing databases
  const projCols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  if (!projCols.find(c => c.name === "user_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  }

  const depCols = db.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>;
  if (!depCols.find(c => c.name === "input_tokens")) {
    db.exec("ALTER TABLE deployments ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE deployments ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE deployments ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0");
  }

  // Plan-based billing migration
  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userCols.find(c => c.name === "plan")) {
    db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
    db.exec("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT");
    db.exec("ALTER TABLE users ADD COLUMN plan_expires_at TEXT");
  }
  // Teams migration — add team_id to projects
  if (!projCols.find(c => c.name === "team_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL");
  }

  if (!userCols.find(c => c.name === "email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE users ADD COLUMN verification_code TEXT");
    // Mark existing users as verified
    db.exec("UPDATE users SET email_verified = 1 WHERE email_verified = 0");
  }

  // GitHub token on user account — shared across all projects
  if (!userCols.find(c => c.name === "github_token")) {
    db.exec("ALTER TABLE users ADD COLUMN github_token TEXT");
  }

  // GitHub token migration — support private repos
  const ghCols = db.prepare("PRAGMA table_info(github_repos)").all() as Array<{ name: string }>;
  if (!ghCols.find(c => c.name === "github_token")) {
    db.exec("ALTER TABLE github_repos ADD COLUMN github_token TEXT");
  }
}
