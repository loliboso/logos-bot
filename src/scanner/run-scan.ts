import Database from "better-sqlite3";
import { DriveClient } from "./drive-client";
import { scanDriveRoot } from "./scanner";
import { extractIntrinsicDimensions } from "./file-metadata";
import { AiBuilder } from "../catalog/ai-builder";
import { CatalogRepo } from "../catalog/catalog-repo";
import { OverrideRepo } from "../catalog/override-repo";
import { exportReviewReports } from "../catalog/review-export";
import { generateCoverageReport } from "../catalog/coverage-report";
import { AiProvider } from "../ai/provider";

export interface ScanOptions {
  driveClient: DriveClient;
  rootFolderId: string;
  db: Database.Database;
  aiProvider: AiProvider;
  outputDir: string;
  /** Re-process every file, ignoring modifiedTime. Use after changing AI /
   *  naming inference rules. Defaults to false (incremental). */
  full?: boolean;
}

export interface ScanSummary {
  runId: number;
  totalFiles: number;
  /** Files actually re-processed this run (new or changed; all files when full). */
  processed: number;
  /** Files skipped because their Drive modifiedTime was unchanged. */
  unchanged: number;
  /** Assets marked removed because their Drive source disappeared. */
  removed: number;
  accepted: number;
  needsReview: number;
  ignored: number;
}

export async function runFullScan(options: ScanOptions): Promise<ScanSummary> {
  const { driveClient, rootFolderId, db, aiProvider, outputDir, full = false } = options;
  const repo = new CatalogRepo(db);
  const overrideRepo = new OverrideRepo(db);
  const aiBuilder = new AiBuilder(aiProvider);

  const runId = repo.startScannerRun();

  // Snapshot existing catalog state keyed on Drive file id, so we can skip
  // files whose modifiedTime is unchanged and detect ones that disappeared.
  const priorState = repo.listAssetSourceState();
  const priorByFileId = new Map(priorState.map((s) => [s.source_drive_file_id, s]));
  const seenFileIds = new Set<string>();

  const scanResult = await scanDriveRoot(driveClient, rootFolderId);
  let accepted = 0;
  let needsReview = 0;
  let ignored = 0;
  let processed = 0;
  let unchanged = 0;

  for (const file of scanResult.files) {
    seenFileIds.add(file.id);

    // Incremental skip: an active asset whose Drive modifiedTime hasn't changed
    // needs no download and no AI call. Requiring status='active' means a file
    // that was previously removed (then reappeared) is re-processed and revived.
    const prior = priorByFileId.get(file.id);
    if (!full && prior && prior.status === "active" && prior.source_modified_time === file.modifiedTime) {
      unchanged++;
      continue;
    }

    processed++;

    // Download raster/vector content so we can record intrinsic dimensions.
    // Unsupported formats (AI/EPS) and download failures leave dimensions null.
    let dimensions = null;
    if (file.mimeType === "image/svg+xml" || file.mimeType === "image/png") {
      try {
        const content = await driveClient.downloadFile(file.id);
        dimensions = extractIntrinsicDimensions(content, file.mimeType);
      } catch (err) {
        console.warn(`Failed to download ${file.name} (${file.id}):`, err);
      }
    }

    const metadata = await aiBuilder.buildAssetMetadata(file, dimensions);

    // Upsert brand
    repo.upsertBrand({
      id: metadata.brand_id,
      display_name: metadata.display_name,
      aliases: metadata.aliases,
      brand_group: null,
      importance: "primary",
      drive_folder_id: null,
      status: "active",
    });

    // Build asset ID
    const assetId = `${metadata.brand_id}-${file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const format = file.mimeType === "image/svg+xml" ? "svg" : file.mimeType === "image/png" ? "png" : "ai";

    const asset = {
      id: assetId,
      brand_id: metadata.brand_id,
      asset_type: metadata.asset_type,
      variant: metadata.variant,
      language: metadata.language,
      format,
      color: metadata.color,
      background: metadata.background,
      layout: metadata.layout,
      usage: metadata.usage,
      source_drive_file_id: file.id,
      source_path: `${file.parentPath}/${file.name}`,
      source_modified_time: file.modifiedTime,
      intrinsic_width: dimensions ? dimensions.width : null,
      intrinsic_height: dimensions ? dimensions.height : null,
      can_resize: format === "svg",
      status: "active",
      confidence: metadata.confidence,
      inferred_from: metadata.inferred_from,
      review_status: metadata.review_status,
      review_reason: metadata.review_reason,
      scanner_run_id: runId,
    };

    // Apply manual overrides before saving
    const overridden = overrideRepo.applyOverrides(asset);
    repo.upsertAsset(overridden);

    if (overridden.review_status === "accepted") accepted++;
    else if (overridden.review_status === "needs_review") needsReview++;
    else ignored++;
  }

  // Deletion detection: any active asset whose Drive source wasn't seen this
  // run has disappeared from Drive — mark it removed so the bot stops offering
  // it. Compute the diff in JS and apply in one transaction.
  const toRemove = priorState.filter(
    (s) => s.status === "active" && !seenFileIds.has(s.source_drive_file_id)
  );
  const removeAll = db.transaction((ids: string[]) => {
    for (const id of ids) repo.markAssetRemoved(id);
  });
  removeAll(toRemove.map((s) => s.id));
  const removed = toRemove.length;

  repo.completeScannerRun(runId, scanResult.files.length);
  exportReviewReports(db, outputDir);
  generateCoverageReport(db, outputDir);

  return {
    runId,
    totalFiles: scanResult.files.length,
    processed,
    unchanged,
    removed,
    accepted,
    needsReview,
    ignored,
  };
}
