import Database from "better-sqlite3";
import { config } from "../config.js";
import { initializeDatabase } from "./schema.js";
import fs from "fs";
import path from "path";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dir = path.dirname(config.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    db = new Database(config.dbPath);
    initializeDatabase(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
