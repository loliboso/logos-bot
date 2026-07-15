import Database from "better-sqlite3";

export interface BrandRecord {
  id: string;
  display_name: string;
  aliases: string[];
  brand_group: string | null;
  importance: string;
  drive_folder_id: string | null;
  status: string;
}

export interface AssetRecord {
  id: string;
  brand_id: string;
  asset_type: string;
  variant: string;
  language: string | null;
  format: string;
  color: string | null;
  background: string;
  layout: string | null;
  usage: string[];
  source_drive_file_id: string;
  source_path: string;
  source_modified_time?: string | null;
  intrinsic_width: number | null;
  intrinsic_height: number | null;
  can_resize: boolean;
  status: string;
  confidence: number;
  inferred_from: string[];
  review_status: string;
  review_reason: string | null;
  scanner_run_id: number | null;
}

/** Minimal per-asset state used by the incremental scanner to decide what to
 *  re-process and what to mark removed. Keyed on the Drive file id. */
export interface AssetSourceState {
  id: string;
  source_drive_file_id: string;
  source_modified_time: string | null;
  status: string;
}

/** One audited logo delivery: who took what, at what settings, and why. */
export interface DeliveryRecord {
  slack_user_id: string;
  brand_id: string | null;
  asset_id: string | null;
  output_format: string | null;
  width: number | null;
  height: number | null;
  background: string | null;
  padding_ratio: number | null;
  purpose: string;
  purpose_url: string | null;
}

export interface AssetQuery {
  brand_id?: string;
  format?: string;
  color?: string;
  language?: string;
  asset_type?: string;
  layout?: string;
  variant?: string;
}

export class CatalogRepo {
  constructor(private db: Database.Database) {}

  upsertBrand(brand: BrandRecord): void {
    this.db
      .prepare(
        `INSERT INTO brands (id, display_name, aliases, brand_group, importance, drive_folder_id, status, updated_at)
         VALUES (@id, @display_name, @aliases, @brand_group, @importance, @drive_folder_id, @status, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           display_name = @display_name, aliases = @aliases, brand_group = @brand_group,
           importance = @importance, drive_folder_id = @drive_folder_id, status = @status,
           updated_at = datetime('now')`
      )
      .run({
        ...brand,
        aliases: JSON.stringify(brand.aliases),
      });
  }

  upsertAsset(asset: AssetRecord): void {
    this.db
      .prepare(
        `INSERT INTO assets (id, brand_id, asset_type, variant, language, format, color, background, layout, usage,
           source_drive_file_id, source_path, source_modified_time, intrinsic_width, intrinsic_height, can_resize, status,
           confidence, inferred_from, review_status, review_reason, scanner_run_id, updated_at)
         VALUES (@id, @brand_id, @asset_type, @variant, @language, @format, @color, @background, @layout, @usage,
           @source_drive_file_id, @source_path, @source_modified_time, @intrinsic_width, @intrinsic_height, @can_resize, @status,
           @confidence, @inferred_from, @review_status, @review_reason, @scanner_run_id, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           brand_id = @brand_id, asset_type = @asset_type, variant = @variant, language = @language,
           format = @format, color = @color, background = @background, layout = @layout, usage = @usage,
           source_drive_file_id = @source_drive_file_id, source_path = @source_path,
           source_modified_time = @source_modified_time,
           intrinsic_width = @intrinsic_width, intrinsic_height = @intrinsic_height, can_resize = @can_resize,
           status = @status, confidence = @confidence, inferred_from = @inferred_from,
           review_status = @review_status, review_reason = @review_reason, scanner_run_id = @scanner_run_id,
           updated_at = datetime('now')`
      )
      .run({
        ...asset,
        source_modified_time: asset.source_modified_time ?? null,
        usage: JSON.stringify(asset.usage),
        inferred_from: JSON.stringify(asset.inferred_from),
        can_resize: asset.can_resize ? 1 : 0,
      });
  }

  findBrandByAlias(alias: string): BrandRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM brands WHERE status = 'active' AND (
          display_name LIKE @pattern OR aliases LIKE @pattern OR id LIKE @pattern
        )`
      )
      .all({ pattern: `%${alias}%` }) as any[];
    return rows.map(this.toBrandRecord);
  }

  getBrandById(brandId: string): BrandRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM brands WHERE id = @brandId`)
      .get({ brandId }) as any;
    return row ? this.toBrandRecord(row) : null;
  }

  getAllBrands(): BrandRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM brands WHERE status = 'active'`)
      .all() as any[];
    return rows.map(this.toBrandRecord);
  }

  getActiveAssets(brandId: string): AssetRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM assets WHERE brand_id = @brandId AND status = 'active' AND review_status = 'accepted'`
      )
      .all({ brandId }) as any[];
    return rows.map(this.toAssetRecord);
  }

  findAssets(query: AssetQuery): AssetRecord[] {
    const conditions: string[] = ["status = 'active'", "review_status = 'accepted'"];
    const params: Record<string, string> = {};

    if (query.brand_id) { conditions.push("brand_id = @brand_id"); params.brand_id = query.brand_id; }
    if (query.format) { conditions.push("format = @format"); params.format = query.format; }
    if (query.color) { conditions.push("color = @color"); params.color = query.color; }
    if (query.language) { conditions.push("language = @language"); params.language = query.language; }
    if (query.asset_type) { conditions.push("asset_type = @asset_type"); params.asset_type = query.asset_type; }
    if (query.layout) { conditions.push("layout = @layout"); params.layout = query.layout; }
    if (query.variant) { conditions.push("variant = @variant"); params.variant = query.variant; }

    const rows = this.db
      .prepare(`SELECT * FROM assets WHERE ${conditions.join(" AND ")}`)
      .all(params) as any[];
    return rows.map(this.toAssetRecord);
  }

  /** Source state for every asset, for incremental scan diffing. Includes all
   *  statuses (active/removed/…) so the scanner can revive files that reappear. */
  listAssetSourceState(): AssetSourceState[] {
    return this.db
      .prepare(
        `SELECT id, source_drive_file_id, source_modified_time, status FROM assets`
      )
      .all() as AssetSourceState[];
  }

  /** Mark an asset removed — its Drive source no longer exists. Bot queries
   *  filter on status='active', so removed assets stop being offered. */
  markAssetRemoved(assetId: string): void {
    this.db
      .prepare(
        `UPDATE assets SET status = 'removed', updated_at = datetime('now') WHERE id = @assetId`
      )
      .run({ assetId });
  }

  /** Append an audit row for a delivered logo. */
  recordDelivery(row: DeliveryRecord): void {
    this.db
      .prepare(
        `INSERT INTO deliveries
           (slack_user_id, brand_id, asset_id, output_format, width, height, background, padding_ratio, purpose, purpose_url)
         VALUES
           (@slack_user_id, @brand_id, @asset_id, @output_format, @width, @height, @background, @padding_ratio, @purpose, @purpose_url)`
      )
      .run(row);
  }

  /** Most-recent deliveries first, for review/export. */
  listRecentDeliveries(limit = 100): (DeliveryRecord & { id: number; created_at: string })[] {
    return this.db
      .prepare(`SELECT * FROM deliveries ORDER BY id DESC LIMIT @limit`)
      .all({ limit }) as (DeliveryRecord & { id: number; created_at: string })[];
  }

  startScannerRun(): number {
    const result = this.db.prepare("INSERT INTO scanner_runs (status) VALUES ('running')").run();
    return Number(result.lastInsertRowid);
  }

  completeScannerRun(runId: number, filesFound: number): void {
    this.db
      .prepare("UPDATE scanner_runs SET status = 'completed', completed_at = datetime('now'), files_found = @filesFound WHERE id = @runId")
      .run({ runId, filesFound });
  }

  private toBrandRecord(row: any): BrandRecord {
    return { ...row, aliases: JSON.parse(row.aliases) };
  }

  private toAssetRecord(row: any): AssetRecord {
    return {
      ...row,
      usage: JSON.parse(row.usage),
      inferred_from: JSON.parse(row.inferred_from),
      can_resize: row.can_resize === 1,
    };
  }
}
