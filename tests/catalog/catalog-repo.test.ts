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

import { CatalogRepo, BrandRecord, AssetRecord } from "../../src/catalog/catalog-repo";

describe("CatalogRepo", () => {
  let db: Database.Database;
  let repo: CatalogRepo;

  beforeEach(() => {
    db = createTestDb();
    repo = new CatalogRepo(db);
  });

  const testBrand: BrandRecord = {
    id: "the-news-lens",
    display_name: "The News Lens 關鍵評論網",
    aliases: ["TNL", "The News Lens", "關鍵評論網"],
    brand_group: "TNL Mediagene",
    importance: "primary",
    drive_folder_id: "folder-tnl",
    status: "active",
  };

  const testAsset: AssetRecord = {
    id: "the-news-lens-logo-blue-svg",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "svg",
    color: "blue",
    background: "transparent",
    layout: "horizontal",
    usage: ["general"],
    source_drive_file_id: "file-1",
    source_path: "The News Lens 關鍵評論網/SVG/logo-blue.svg",
    intrinsic_width: 300,
    intrinsic_height: 100,
    can_resize: true,
    status: "active",
    confidence: 0.93,
    inferred_from: ["folder_name", "file_name"],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: null,
  };

  it("upserts and retrieves a brand", () => {
    repo.upsertBrand(testBrand);
    const results = repo.findBrandByAlias("TNL");
    expect(results.length).toBe(1);
    expect(results[0].display_name).toBe("The News Lens 關鍵評論網");
    expect(results[0].aliases).toEqual(["TNL", "The News Lens", "關鍵評論網"]);
  });

  it("finds brand by Chinese alias", () => {
    repo.upsertBrand(testBrand);
    const results = repo.findBrandByAlias("關鍵評論網");
    expect(results.length).toBe(1);
  });

  it("upserts and queries assets", () => {
    repo.upsertBrand(testBrand);
    repo.upsertAsset(testAsset);
    const results = repo.findAssets({ brand_id: "the-news-lens", format: "svg", color: "blue" });
    expect(results.length).toBe(1);
    expect(results[0].source_path).toBe("The News Lens 關鍵評論網/SVG/logo-blue.svg");
  });

  it("getActiveAssets excludes non-accepted", () => {
    repo.upsertBrand(testBrand);
    repo.upsertAsset(testAsset);
    repo.upsertAsset({ ...testAsset, id: "pending-asset", review_status: "pending", confidence: 0.5 });
    const active = repo.getActiveAssets("the-news-lens");
    expect(active.length).toBe(1);
    expect(active[0].id).toBe("the-news-lens-logo-blue-svg");
  });

  it("tracks scanner runs", () => {
    const runId = repo.startScannerRun();
    expect(runId).toBeGreaterThan(0);
    repo.completeScannerRun(runId, 12);
    const row = db.prepare("SELECT * FROM scanner_runs WHERE id = ?").get(runId) as any;
    expect(row.status).toBe("completed");
    expect(row.files_found).toBe(12);
  });
});
