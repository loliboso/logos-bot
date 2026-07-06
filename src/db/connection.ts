import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

export function getDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(db: Database.Database): void {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
}
