import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

describe("database schema", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("creates all expected tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("brands");
    expect(names).toContain("assets");
    expect(names).toContain("scanner_runs");
    expect(names).toContain("manual_overrides");
    expect(names).toContain("generated_outputs");
  });

  it("enforces foreign key on assets.brand_id", () => {
    expect(() => {
      db.prepare(
        `INSERT INTO assets (id, brand_id, asset_type, variant, format, source_drive_file_id, source_path)
         VALUES ('test', 'nonexistent', 'logo', 'logo', 'svg', 'abc', 'path/file.svg')`
      ).run();
    }).toThrow();
  });
});
