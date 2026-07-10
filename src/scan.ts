import { config } from "./config";
import { getDb, initDb } from "./db/connection";
import { DriveClient } from "./scanner/drive-client";
import { runFullScan } from "./scanner/run-scan";
import { createAiProvider } from "./ai/factory";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

/**
 * CLI entry point: scans the configured Drive root, builds the catalog, and
 * writes review reports. Run with `npm run scan`. Needs Google + Anthropic
 * credentials but not Slack tokens (config getters are lazy).
 */
async function main(): Promise<void> {
  mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
  const db = getDb(config.DATABASE_PATH);
  initDb(db);

  const driveClient = new DriveClient(config.GOOGLE_SERVICE_ACCOUNT_KEY);
  const aiProvider = createAiProvider();
  const outputDir = join(dirname(config.DATABASE_PATH), "reports");
  mkdirSync(outputDir, { recursive: true });

  console.log("🔍 Scanning Drive folder:", config.DRIVE_ROOT_FOLDER_ID);
  const summary = await runFullScan({
    driveClient,
    rootFolderId: config.DRIVE_ROOT_FOLDER_ID,
    db,
    aiProvider,
    outputDir,
  });

  console.log("✅ Scan complete:");
  console.log(`   run #${summary.runId}`);
  console.log(`   files:        ${summary.totalFiles}`);
  console.log(`   accepted:     ${summary.accepted}`);
  console.log(`   needs review: ${summary.needsReview}`);
  console.log(`   ignored:      ${summary.ignored}`);
  console.log(`   reports:      ${outputDir}`);
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exit(1);
});
