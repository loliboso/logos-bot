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
  migrate(db);
}

/**
 * Idempotent, in-place migrations for databases created before a column
 * existed. `CREATE TABLE IF NOT EXISTS` never alters an existing table, so
 * columns added to schema.sql after a DB was first built must be back-filled
 * here. Safe to run on every startup.
 */
function migrate(db: Database.Database): void {
  addColumnIfMissing(db, "assets", "source_modified_time", "TEXT");
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
