import { config } from "./config";
import { getDb, initDb } from "./db/connection";
import { DriveClient } from "./scanner/drive-client";
import { runFullScan } from "./scanner/run-scan";
import { RuleBuilder } from "./catalog/rule-builder";
import { CatalogRepo } from "./catalog/catalog-repo";
import { syncBrandConfig } from "./config/brands-config";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

/**
 * CLI entry point: scans the configured Drive root, builds the catalog, and
 * writes review reports. Run with `npm run scan`. Needs Google + Anthropic
 * credentials but not Slack tokens (config getters are lazy).
 */
async function main(): Promise<void> {
  const full = process.argv.includes("--full");

  mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
  const db = getDb(config.DATABASE_PATH);
  initDb(db);

  const driveClient = new DriveClient(config.GOOGLE_SERVICE_ACCOUNT_KEY);
  const builder = new RuleBuilder();
  const outputDir = join(dirname(config.DATABASE_PATH), "reports");
  mkdirSync(outputDir, { recursive: true });

  console.log("🔍 Scanning Drive folder:", config.DRIVE_ROOT_FOLDER_ID);
  console.log("🧩 rule-based metadata (no AI calls)");
  if (full) {
    console.log("⚙️  --full: re-processing every file (ignoring modifiedTime)");
  } else {
    console.log("⚡ incremental: only new / changed files are re-processed");
  }

  const summary = await runFullScan({
    driveClient,
    rootFolderId: config.DRIVE_ROOT_FOLDER_ID,
    db,
    builder,
    outputDir,
    full,
    // Rule-based metadata needs no file bytes, so skip per-file downloads: the
    // scan runs in seconds and can't stall on a hung download.
    skipDownload: true,
  });

  console.log("✅ Scan complete:");
  console.log(`   run #${summary.runId}`);
  console.log(`   files found:  ${summary.totalFiles}`);
  console.log(`   processed:    ${summary.processed}`);
  console.log(`   unchanged:    ${summary.unchanged}`);
  console.log(`   failed:       ${summary.failed}`);
  console.log(`   removed:      ${summary.removed}`);
  console.log(`   accepted:     ${summary.accepted}`);
  console.log(`   needs review: ${summary.needsReview}`);
  console.log(`   ignored:      ${summary.ignored}`);
  console.log(`   reports:      ${outputDir}`);

  // Keep config/brands.json in step with the live brand ids.
  const activeBrandIds = new CatalogRepo(db).getAllBrands().map((b) => b.id);
  const { added, stale } = syncBrandConfig(activeBrandIds);
  if (added.length) console.log(`   brands.json: 新增 ${added.length} 個品牌 id（空別名待填）: ${added.join(", ")}`);
  if (stale.length) console.log(`   ⚠️ brands.json 有 ${stale.length} 個過期 key（對不上任何品牌，請搬移別名後刪除）: ${stale.join(", ")}`);
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exit(1);
});
