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
    expect(names).toContain("deliveries");
  });

  it("retireEmptyBrands retires only brands with no active assets", () => {
    const repo = new CatalogRepo(db);
    const brand = (id: string) => repo.upsertBrand({
      id, display_name: id, aliases: [], brand_group: null,
      importance: "primary", drive_folder_id: null, status: "active",
    });
    brand("keeps"); // will have an active asset
    brand("zombie"); // renamed folder → no assets left
    repo.upsertAsset({
      id: "keeps-logo-svg", brand_id: "keeps", asset_type: "logo", variant: "logo",
      language: null, format: "svg", color: "blue", background: "transparent", layout: "horizontal",
      usage: ["general"], source_drive_file_id: "f1", source_path: "keeps/logo.svg",
      intrinsic_width: null, intrinsic_height: null, can_resize: true, status: "active",
      confidence: 0.9, inferred_from: [], review_status: "accepted", review_reason: null, scanner_run_id: null,
    });

    const retired = repo.retireEmptyBrands();
    expect(retired).toBe(1);
    const active = repo.getAllBrands().map((b) => b.id);
    expect(active).toContain("keeps");
    expect(active).not.toContain("zombie");
  });

  it("records and lists deliveries newest-first", () => {
    const repo = new CatalogRepo(db);
    repo.recordDelivery({
      slack_user_id: "U1", brand_id: "the-news-lens", asset_id: "svg-blue",
      output_format: "png", width: 500, height: 500, background: "white",
      padding_ratio: 0.2, purpose: "簡報首頁", purpose_url: null,
    });
    repo.recordDelivery({
      slack_user_id: "U2", brand_id: "the-news-lens", asset_id: "svg-blue",
      output_format: "svg", width: null, height: null, background: null,
      padding_ratio: null, purpose: "貼文 https://x.tw/1", purpose_url: "https://x.tw/1",
    });
    const rows = repo.listRecentDeliveries();
    expect(rows).toHaveLength(2);
    expect(rows[0].slack_user_id).toBe("U2"); // newest first
    expect(rows[0].purpose_url).toBe("https://x.tw/1");
    expect(rows[1].width).toBe(500);
    expect(rows[1].padding_ratio).toBe(0.2);
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

import { OverrideRepo } from "../../src/catalog/override-repo";

describe("OverrideRepo", () => {
  let db: Database.Database;
  let overrideRepo: OverrideRepo;
  let catalogRepo: CatalogRepo;

  beforeEach(() => {
    db = createTestDb();
    overrideRepo = new OverrideRepo(db);
    catalogRepo = new CatalogRepo(db);
  });

  const testBrand: BrandRecord = {
    id: "the-news-lens",
    display_name: "The News Lens 關鍵評論網",
    aliases: ["TNL"],
    brand_group: null,
    importance: "primary",
    drive_folder_id: null,
    status: "active",
  };

  const testAsset: AssetRecord = {
    id: "test-asset",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "special",
    language: null,
    format: "png",
    color: "primary",
    background: "transparent",
    layout: null,
    usage: ["general"],
    source_drive_file_id: "file-10",
    source_path: "path/tnl-plus.png",
    intrinsic_width: 500,
    intrinsic_height: 500,
    can_resize: false,
    status: "active",
    confidence: 0.62,
    inferred_from: ["file_name"],
    review_status: "needs_review",
    review_reason: "需要確認",
    scanner_run_id: null,
  };

  it("sets and retrieves overrides", () => {
    overrideRepo.setOverride("test-asset", "review_status", "accepted", "已確認為 TNL Plus 子品牌 Logo");
    const overrides = overrideRepo.getOverrides("test-asset");
    expect(overrides).toHaveLength(1);
    expect(overrides[0].override_value).toBe("accepted");
    expect(overrides[0].reason).toContain("TNL Plus");
  });

  it("applies overrides to asset record", () => {
    catalogRepo.upsertBrand(testBrand);
    catalogRepo.upsertAsset(testAsset);

    overrideRepo.setOverride("test-asset", "review_status", "accepted");
    overrideRepo.setOverride("test-asset", "color", "blue");

    const patched = overrideRepo.applyOverrides(testAsset);
    expect(patched.review_status).toBe("accepted");
    expect(patched.color).toBe("blue");
    expect(patched.variant).toBe("special"); // unchanged
  });

  it("upserts on conflict", () => {
    overrideRepo.setOverride("test-asset", "color", "blue");
    overrideRepo.setOverride("test-asset", "color", "black");
    const overrides = overrideRepo.getOverrides("test-asset");
    expect(overrides).toHaveLength(1);
    expect(overrides[0].override_value).toBe("black");
  });
});
