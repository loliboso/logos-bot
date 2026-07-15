import Database from "better-sqlite3";
import { config } from "./config";
import { inferBrand, isSkippedPath } from "./catalog/brand-inference";

/**
 * One-off migration: the scanner used to bucket the entire `@mediagene 旗下品牌`
 * group container as a single brand. This re-derives brand_id per asset from its
 * source_path (via the shared inferBrand), splitting the container into its real
 * sub-brands, and drops archived/superseded rows (封存 / 舊版).
 *
 * Reuses every AI-computed column already in the DB — NO AI, NO Drive calls.
 * Dry-run by default; pass --execute to write. Back up the DB first.
 */
const CONTAINER_BRAND_ID = "mediagene-旗下品牌";
const TOP_LEVEL_ARCHIVE_BRAND_ID = "封存";

function newAssetId(brandId: string, sourcePath: string): string {
  // Mirror the scanner's rule exactly (run-scan.ts), including NOT trimming
  // leading/trailing dashes — that trailing dash is what keeps the two
  // GIZ-YATAI files (…屋台 vs plain) as distinct ids, as they are today.
  const fileName = sourcePath.split("/").pop() || "";
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${brandId}-${base}`;
}

function main(): void {
  const execute = process.argv.includes("--execute");
  const db = new Database(config.DATABASE_PATH);

  const rows = db
    .prepare(`SELECT * FROM assets WHERE brand_id = ?`)
    .all(CONTAINER_BRAND_ID) as any[];

  const kept: any[] = [];
  const skipped: any[] = [];
  const brandsSeen = new Map<string, { display_name: string; aliases: string[] }>();
  const idCounts = new Map<string, number>();

  for (const row of rows) {
    if (isSkippedPath(row.source_path)) {
      skipped.push(row);
      continue;
    }
    const brand = inferBrand(row.source_path);
    const assetId = newAssetId(brand.brand_id, row.source_path);
    idCounts.set(assetId, (idCounts.get(assetId) || 0) + 1);
    brandsSeen.set(brand.brand_id, { display_name: brand.display_name, aliases: brand.aliases });
    kept.push({ ...row, _newBrandId: brand.brand_id, _newAssetId: assetId });
  }

  const collisions = [...idCounts.entries()].filter(([, n]) => n > 1);

  const topArchive = db
    .prepare(`SELECT count(*) AS n FROM assets WHERE brand_id = ?`)
    .get(TOP_LEVEL_ARCHIVE_BRAND_ID) as { n: number };

  // ---- Report ----
  console.log(`\n=== 遷移預覽（${execute ? "EXECUTE" : "DRY-RUN"}）===`);
  console.log(`來源容器 ${CONTAINER_BRAND_ID}: ${rows.length} 筆`);
  console.log(`  → 保留重分桶: ${kept.length} 筆`);
  console.log(`  → 跳過刪除(封存/舊版): ${skipped.length} 筆`);
  console.log(`頂層封存品牌 ${TOP_LEVEL_ARCHIVE_BRAND_ID}: 刪除 ${topArchive.n} 筆`);
  console.log(`\n新品牌（${brandsSeen.size} 個）:`);
  const acceptedByBrand = new Map<string, number>();
  for (const k of kept) if (k.review_status === "accepted") acceptedByBrand.set(k._newBrandId, (acceptedByBrand.get(k._newBrandId) || 0) + 1);
  for (const [id, info] of [...brandsSeen.entries()].sort()) {
    console.log(`  ${id.padEnd(24)} "${info.display_name}"  accepted=${acceptedByBrand.get(id) || 0}`);
  }

  if (collisions.length) {
    console.log(`\n⚠️  asset id 衝突（同品牌內同檔名，需處理）:`);
    for (const [id, n] of collisions) console.log(`  ${id} ×${n}`);
  } else {
    console.log(`\n✅ 無 asset id 衝突`);
  }

  if (!execute) {
    console.log(`\n（dry-run，未寫入。加 --execute 才會改 DB）\n`);
    db.close();
    return;
  }

  if (collisions.length) {
    console.error(`\n❌ 有 id 衝突，中止。請先處理。\n`);
    db.close();
    process.exit(1);
  }

  const migrate = db.transaction(() => {
    // Remove the old container rows and the top-level archive brand's assets.
    db.prepare(`DELETE FROM assets WHERE brand_id = ?`).run(CONTAINER_BRAND_ID);
    db.prepare(`DELETE FROM assets WHERE brand_id = ?`).run(TOP_LEVEL_ARCHIVE_BRAND_ID);
    db.prepare(`DELETE FROM brands WHERE id = ?`).run(CONTAINER_BRAND_ID);
    db.prepare(`DELETE FROM brands WHERE id = ?`).run(TOP_LEVEL_ARCHIVE_BRAND_ID);

    const insertBrand = db.prepare(
      `INSERT INTO brands (id, display_name, aliases, brand_group, importance, drive_folder_id, status, updated_at)
       VALUES (@id, @display_name, @aliases, NULL, 'primary', NULL, 'active', datetime('now'))
       ON CONFLICT(id) DO NOTHING`
    );
    for (const [id, info] of brandsSeen) {
      insertBrand.run({ id, display_name: info.display_name, aliases: JSON.stringify(info.aliases) });
    }

    // Re-insert assets with new brand_id + new id, all other columns verbatim.
    const cols = Object.keys(rows[0]).filter((c) => c !== "id");
    const insertAsset = db.prepare(
      `INSERT INTO assets (id, ${cols.join(", ")}) VALUES (@id, ${cols.map((c) => "@" + c).join(", ")})`
    );
    for (const k of kept) {
      const payload: any = {};
      for (const c of cols) payload[c] = k[c];
      payload.id = k._newAssetId;
      payload.brand_id = k._newBrandId;
      insertAsset.run(payload);
    }
  });

  migrate();
  console.log(`\n✅ 遷移完成，已寫入 DB。\n`);
  db.close();
}

main();
