import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { CatalogRepo, AssetRecord } from "../src/catalog/catalog-repo";
import { ConversationManager } from "../src/bot/conversation";
import { AssetResolver } from "../src/bot/asset-resolver";
import { buildDeliveryMessage } from "../src/bot/response-builder";
import { validateDimensions } from "../src/renderer/renderer";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

function seedCatalog(repo: CatalogRepo): void {
  // Seed a scanner run so assets referencing scanner_run_id: 1 satisfy the FK.
  repo.startScannerRun();

  repo.upsertBrand({
    id: "the-news-lens",
    display_name: "The News Lens 關鍵評論網",
    aliases: ["TNL", "The News Lens", "關鍵評論網"],
    brand_group: "TNL Mediagene",
    importance: "primary",
    drive_folder_id: "folder-tnl",
    status: "active",
  });

  repo.upsertBrand({
    id: "tnl-mediagene",
    display_name: "TNL Mediagene",
    aliases: ["TNL Mediagene", "TNL"],
    brand_group: null,
    importance: "primary",
    drive_folder_id: "folder-mg",
    status: "active",
  });

  const assets: AssetRecord[] = [
    { id: "tnl-logo-blue-svg", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: null, format: "svg", color: "blue", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f1", source_path: "The News Lens 關鍵評論網/SVG/logo-blue.svg", intrinsic_width: 300, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.93, inferred_from: ["file_name", "folder_name"], review_status: "accepted", review_reason: null, scanner_run_id: 1 },
    { id: "tnl-logo-en-blue-svg", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: "en", format: "svg", color: "blue", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f2", source_path: "The News Lens 關鍵評論網/SVG/logo-en-blue.svg", intrinsic_width: 300, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.95, inferred_from: ["file_name", "folder_name"], review_status: "accepted", review_reason: null, scanner_run_id: 1 },
    { id: "tnl-logo-en-white-svg", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: "en", format: "svg", color: "white", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f3", source_path: "The News Lens 關鍵評論網/SVG/logo-en-white.svg", intrinsic_width: 300, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.95, inferred_from: ["file_name"], review_status: "accepted", review_reason: null, scanner_run_id: 1 },
    { id: "tnl-mark-blk-svg", brand_id: "the-news-lens", asset_type: "mark", variant: "mark", language: null, format: "svg", color: "black", background: "transparent", layout: "square", usage: ["general"], source_drive_file_id: "f4", source_path: "The News Lens 關鍵評論網/SVG/mark-blk.svg", intrinsic_width: 100, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.9, inferred_from: ["file_name"], review_status: "accepted", review_reason: null, scanner_run_id: 1 },
    { id: "tnl-primary-png", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: null, format: "png", color: "blue", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f6", source_path: "The News Lens 關鍵評論網/PNG/tnl-primary.png", intrinsic_width: 500, intrinsic_height: 167, can_resize: false, status: "active", confidence: 0.88, inferred_from: ["file_name"], review_status: "accepted", review_reason: null, scanner_run_id: 1 },
  ];

  for (const asset of assets) {
    repo.upsertAsset(asset);
  }
}

describe("Integration: full request flow", () => {
  let db: Database.Database;
  let repo: CatalogRepo;
  let resolver: AssetResolver;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    db = createTestDb();
    repo = new CatalogRepo(db);
    resolver = new AssetResolver(repo);
    conversationManager = new ConversationManager();
    seedCatalog(repo);
  });

  it("full flow: '我要 TNL 藍色 SVG' with brand disambiguation", () => {
    // Simulate parsed request (rule-first parser returns brandCandidates)
    const parsed = {
      brand: null,
      brandCandidates: ["the-news-lens", "tnl-mediagene"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "我要 TNL 藍色 SVG",
    };
    const state = conversationManager.startConversation("user1", "ch1", parsed);

    // Resolve brandCandidates to BrandRecord[]
    const brands = parsed.brandCandidates
      .map((id) => repo.getBrandById(id))
      .filter((b): b is NonNullable<typeof b> => b !== null);
    expect(brands.length).toBe(2);

    // Bot asks disambiguation
    const question = conversationManager.getNextQuestion(state, brands, []);
    expect(question?.field).toBe("brand_id");
    expect(question?.options?.length).toBe(2);

    // User selects "The News Lens"
    const updated = conversationManager.applyAnswer(state, "brand_id", "the-news-lens");
    expect(updated.resolvedBrandId).toBe("the-news-lens");

    // Now conversation is complete
    expect(conversationManager.isComplete(updated)).toBe(true);

    // Resolve asset
    const result = resolver.resolve(updated);
    expect(result).not.toBeNull();
    expect(result!.asset.id).toBe("tnl-logo-blue-svg");
    expect(result!.needsCustomSize).toBe(false);

    // Build delivery message
    const msg = buildDeliveryMessage(result!.asset);
    expect(msg.text).toContain("logo-blue.svg");
  });

  it("full flow: custom size request '關鍵評論網 500x500'", () => {
    const parsed = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: null,
      color: "blue",
      language: null,
      asset_type: null,
      width: 500,
      height: 500,
      raw_text: "關鍵評論網 藍色 500x500",
    };
    const state = conversationManager.startConversation("user1", "ch1", parsed);

    const brands = parsed.brandCandidates
      .map((id) => repo.getBrandById(id))
      .filter((b): b is NonNullable<typeof b> => b !== null);
    expect(brands.length).toBe(1);
    state.resolvedBrandId = brands[0].id;

    // Should resolve to SVG for custom size
    const result = resolver.resolve(state);
    expect(result).not.toBeNull();
    expect(result!.asset.format).toBe("svg");
    expect(result!.needsCustomSize).toBe(true);
    expect(result!.requestedWidth).toBe(500);

    // Validate dimensions
    const validation = validateDimensions(500, 500, 4000);
    expect(validation.valid).toBe(true);

    // Build delivery message
    const msg = buildDeliveryMessage(result!.asset, { width: 500, height: 500 });
    expect(msg.text).toContain("500 x 500");
    expect(msg.text).toContain("等比例置中");
  });

  it("rejects oversized custom dimensions", () => {
    const validation = validateDimensions(5000, 5000, 4000);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("4000");
  });

  it("excludes low-confidence assets from resolution", () => {
    // Add a low-confidence asset
    repo.upsertAsset({
      id: "tnl-plus-png",
      brand_id: "the-news-lens",
      asset_type: "logo",
      variant: "special",
      language: null,
      format: "png",
      color: "blue",
      background: "transparent",
      layout: null,
      usage: ["general"],
      source_drive_file_id: "f10",
      source_path: "The News Lens 關鍵評論網/PNG/tnl-plus.png",
      intrinsic_width: 500,
      intrinsic_height: 500,
      can_resize: false,
      status: "active",
      confidence: 0.62,
      inferred_from: ["file_name"],
      review_status: "needs_review",
      review_reason: "需要確認",
      scanner_run_id: 1,
    });

    // getActiveAssets should not return it
    const active = repo.getActiveAssets("the-news-lens");
    const plusAsset = active.find((a) => a.id === "tnl-plus-png");
    expect(plusAsset).toBeUndefined();
  });
});
