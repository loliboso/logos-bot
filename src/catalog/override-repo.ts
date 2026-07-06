import Database from "better-sqlite3";
import { AssetRecord } from "./catalog-repo";

export interface Override {
  asset_id: string;
  field_name: string;
  override_value: string;
  reason: string | null;
}

export class OverrideRepo {
  constructor(private db: Database.Database) {}

  setOverride(assetId: string, field: string, value: string, reason?: string): void {
    this.db
      .prepare(
        `INSERT INTO manual_overrides (asset_id, field_name, override_value, reason)
         VALUES (@assetId, @field, @value, @reason)
         ON CONFLICT(asset_id, field_name) DO UPDATE SET
           override_value = @value, reason = @reason`
      )
      .run({ assetId, field, value, reason: reason || null });
  }

  getOverrides(assetId: string): Override[] {
    return this.db
      .prepare("SELECT asset_id, field_name, override_value, reason FROM manual_overrides WHERE asset_id = ?")
      .all(assetId) as Override[];
  }

  getAllOverrides(): Override[] {
    return this.db
      .prepare("SELECT asset_id, field_name, override_value, reason FROM manual_overrides")
      .all() as Override[];
  }

  applyOverrides(asset: AssetRecord): AssetRecord {
    const overrides = this.getOverrides(asset.id);
    if (overrides.length === 0) return asset;

    const result = { ...asset };
    for (const o of overrides) {
      if (o.field_name in result) {
        (result as any)[o.field_name] = this.parseValue(o.override_value, o.field_name);
      }
    }
    return result;
  }

  private parseValue(value: string, field: string): any {
    if (field === "usage" || field === "inferred_from" || field === "aliases") {
      return JSON.parse(value);
    }
    if (field === "can_resize") return value === "true";
    if (field === "confidence") return parseFloat(value);
    if (field === "intrinsic_width" || field === "intrinsic_height") return parseInt(value, 10);
    return value;
  }
}
