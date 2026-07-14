import { describe, test, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";
import { generateCoverageReport } from "../../src/catalog/coverage-report";

function seed(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE brands (id TEXT PRIMARY KEY, display_name TEXT, aliases TEXT, brand_group TEXT, importance TEXT, drive_folder_id TEXT, status TEXT);
           CREATE TABLE assets (id TEXT PRIMARY KEY, brand_id TEXT, asset_type TEXT, variant TEXT, language TEXT, format TEXT, color TEXT, status TEXT, review_status TEXT);`);
  db.prepare(`INSERT INTO brands VALUES ('cool3c','Cool3c','[]',NULL,'primary',NULL,'active')`).run();
  db.prepare(`INSERT INTO assets VALUES ('a1','cool3c','logo','logo','en','png','primary','active','accepted')`).run();
  return db;
}

describe("generateCoverageReport", () => {
  test("writes a markdown table counting only accepted assets", () => {
    const db = seed();
    const dir = mkdtempSync(join(tmpdir(), "cov-"));
    const md = generateCoverageReport(db, dir, join(process.cwd(), "config", "brands.json"));
    expect(md).toContain("Cool3c");
    expect(md).toContain("png");
    const onDisk = readFileSync(join(dir, "brand_coverage.md"), "utf-8");
    expect(onDisk).toBe(md);
  });
});
