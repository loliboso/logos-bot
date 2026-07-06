import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { AssetResolver } from "../../src/bot/asset-resolver";
import { CatalogRepo, BrandRecord, AssetRecord } from "../../src/catalog/catalog-repo";
import { ConversationState } from "../../src/bot/conversation";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

describe("AssetResolver", () => {
  let db: Database.Database;
  let repo: CatalogRepo;
  let resolver: AssetResolver;

  const brand: BrandRecord = {
    id: "the-news-lens",
    display_name: "The News Lens 關鍵評論網",
    aliases: ["TNL"],
    brand_group: null,
    importance: "primary",
    drive_folder_id: null,
    status: "active",
  };

  const svgAsset: AssetRecord = {
    id: "svg-blue",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "svg",
    color: "blue",
    background: "transparent",
    layout: "horizontal",
    usage: ["general"],
    source_drive_file_id: "f1",
    source_path: "TNL/SVG/logo-blue.svg",
    intrinsic_width: 300,
    intrinsic_height: 100,
    can_resize: true,
    status: "active",
    confidence: 0.9,
    inferred_from: [],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: null,
  };

  const pngAsset: AssetRecord = {
    id: "png-blue",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "png",
    color: "blue",
    background: "transparent",
    layout: "horizontal",
    usage: ["general"],
    source_drive_file_id: "f2",
    source_path: "TNL/PNG/tnl-primary.png",
    intrinsic_width: 500,
    intrinsic_height: 167,
    can_resize: false,
    status: "active",
    confidence: 0.9,
    inferred_from: [],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: null,
  };

  beforeEach(() => {
    db = createTestDb();
    repo = new CatalogRepo(db);
    resolver = new AssetResolver(repo);
    repo.upsertBrand(brand);
    repo.upsertAsset(svgAsset);
    repo.upsertAsset(pngAsset);
  });

  it("resolves asset matching brand, format, and color", () => {
    const state: ConversationState = {
      userId: "u1",
      channelId: "c1",
      parsed: { brand: "TNL", format: "svg", color: "blue", language: null, asset_type: null, width: null, height: null, raw_text: "" },
      resolvedBrandId: "the-news-lens",
      resolvedAssetId: null,
      step: "done",
      startedAt: "",
    };
    const result = resolver.resolve(state);
    expect(result?.asset.id).toBe("svg-blue");
    expect(result?.needsCustomSize).toBe(false);
  });

  it("prefers SVG source for custom-size rendering", () => {
    const state: ConversationState = {
      userId: "u1",
      channelId: "c1",
      parsed: { brand: "TNL", format: null, color: "blue", language: null, asset_type: null, width: 500, height: 500, raw_text: "" },
      resolvedBrandId: "the-news-lens",
      resolvedAssetId: null,
      step: "done",
      startedAt: "",
    };
    const result = resolver.resolve(state);
    expect(result?.asset.format).toBe("svg");
    expect(result?.needsCustomSize).toBe(true);
    expect(result?.requestedWidth).toBe(500);
  });

  it("returns null when no assets match", () => {
    const state: ConversationState = {
      userId: "u1",
      channelId: "c1",
      parsed: { brand: "TNL", format: "svg", color: "red", language: null, asset_type: null, width: null, height: null, raw_text: "" },
      resolvedBrandId: "the-news-lens",
      resolvedAssetId: null,
      step: "done",
      startedAt: "",
    };
    const result = resolver.resolve(state);
    expect(result).toBeNull();
  });

  it("returns null without resolved brand", () => {
    const state: ConversationState = {
      userId: "u1",
      channelId: "c1",
      parsed: { brand: "TNL", format: "svg", color: "blue", language: null, asset_type: null, width: null, height: null, raw_text: "" },
      resolvedBrandId: null,
      resolvedAssetId: null,
      step: "brand_select",
      startedAt: "",
    };
    const result = resolver.resolve(state);
    expect(result).toBeNull();
  });
});
