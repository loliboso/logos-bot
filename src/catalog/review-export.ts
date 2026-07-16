import Database from "better-sqlite3";
import { AssetRecord } from "./catalog-repo";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export function generateReviewCsv(assets: AssetRecord[], _category: string): string {
  const header = "檔案路徑,品牌,Logo 類型,顏色,信心分數,需要確認的原因";
  const rows = assets.map((a) =>
    [
      a.source_path,
      a.brand_id,
      `${a.asset_type}/${a.variant}`,
      a.color || "未知",
      a.confidence.toFixed(2),
      a.review_reason || "",
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

export function generateReviewJson(assets: AssetRecord[]): string {
  return JSON.stringify(
    assets.map((a) => ({
      id: a.id,
      source_path: a.source_path,
      brand_id: a.brand_id,
      asset_type: a.asset_type,
      variant: a.variant,
      color: a.color,
      confidence: a.confidence,
      review_status: a.review_status,
      review_reason: a.review_reason,
      inferred_from: a.inferred_from,
    })),
    null,
    2
  );
}

export function exportReviewReports(db: Database.Database, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  // Only live assets. Without the status filter, every asset ever retired
  // (renamed/removed across past scans) still showed up here — the needs_review
  // report ballooned with stale rows that no longer exist in the catalog.
  const accepted = db
    .prepare("SELECT * FROM assets WHERE review_status = 'accepted' AND status = 'active'")
    .all() as any[];
  const needsReview = db
    .prepare("SELECT * FROM assets WHERE review_status = 'needs_review' AND status = 'active'")
    .all() as any[];
  const ignored = db
    .prepare("SELECT * FROM assets WHERE review_status = 'ignored' AND status = 'active'")
    .all() as any[];

  const parse = (rows: any[]): AssetRecord[] =>
    rows.map((r) => ({
      ...r,
      usage: JSON.parse(r.usage),
      inferred_from: JSON.parse(r.inferred_from),
      can_resize: r.can_resize === 1,
    }));

  writeFileSync(join(outputDir, "accepted_assets.csv"), generateReviewCsv(parse(accepted), "accepted"));
  writeFileSync(join(outputDir, "needs_review.csv"), generateReviewCsv(parse(needsReview), "needs_review"));
  writeFileSync(join(outputDir, "ignored_assets.csv"), generateReviewCsv(parse(ignored), "ignored"));
  writeFileSync(join(outputDir, "review_export.json"), generateReviewJson(parse(needsReview)));
}
