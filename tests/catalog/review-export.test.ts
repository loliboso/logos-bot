import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { generateReviewCsv, generateReviewJson, exportReviewReports } from "../../src/catalog/review-export";
import { AssetRecord, CatalogRepo } from "../../src/catalog/catalog-repo";

const sampleAsset: AssetRecord = {
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
  source_path: "The News Lens 關鍵評論網/PNG/tnl-plus.png",
  intrinsic_width: 500,
  intrinsic_height: 500,
  can_resize: false,
  status: "active",
  confidence: 0.62,
  inferred_from: ["file_name"],
  review_status: "needs_review",
  review_reason: "檔名中的 plus 可能代表子品牌、產品線或特殊版本，需要確認是否可作為一般 Logo 提供。",
  scanner_run_id: 1,
};

describe("generateReviewCsv", () => {
  it("produces valid CSV with header and data", () => {
    const csv = generateReviewCsv([sampleAsset], "needs_review");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("檔案路徑,品牌,Logo 類型,顏色,信心分數,需要確認的原因");
    expect(lines[1]).toContain("tnl-plus.png");
    expect(lines[1]).toContain("0.62");
    expect(lines[1]).toContain("子品牌");
  });

  it("escapes quotes in CSV fields", () => {
    const assetWithQuotes = { ...sampleAsset, review_reason: '含有 "引號" 的原因' };
    const csv = generateReviewCsv([assetWithQuotes], "needs_review");
    expect(csv).toContain('""引號""');
  });
});

describe("generateReviewJson", () => {
  it("produces valid JSON with key fields", () => {
    const json = generateReviewJson([sampleAsset]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].confidence).toBe(0.62);
    expect(parsed[0].review_reason).toContain("子品牌");
    expect(parsed[0].inferred_from).toEqual(["file_name"]);
  });
});

describe("exportReviewReports excludes retired assets", () => {
  it("only writes active assets, not removed leftovers", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8"));
    const repo = new CatalogRepo(db);
    repo.upsertBrand({ id: "the-news-lens", display_name: "TNL", aliases: [], brand_group: null, importance: "primary", drive_folder_id: null, status: "active" });
    repo.upsertAsset({ ...sampleAsset, id: "live", source_drive_file_id: "f-live", status: "active", scanner_run_id: null });
    repo.upsertAsset({ ...sampleAsset, id: "stale", source_drive_file_id: "f-stale", status: "removed", scanner_run_id: null });

    const dir = join(process.env.TMPDIR || "/tmp", `rev-${Math.random().toString(36).slice(2)}`);
    exportReviewReports(db, dir);
    const csv = readFileSync(join(dir, "needs_review.csv"), "utf-8");
    const dataRows = csv.split("\n").length - 1; // minus header
    expect(dataRows).toBe(1); // only the active one, not the removed leftover
    db.close();
  });
});
