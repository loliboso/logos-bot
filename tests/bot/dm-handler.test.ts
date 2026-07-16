import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { App } from "@slack/bolt";
import { RequestParser } from "../../src/bot/request-parser";
import { ConversationManager } from "../../src/bot/conversation";
import { ConversationStore } from "../../src/bot/conversation-store";
import { AssetResolver } from "../../src/bot/asset-resolver";
import { CatalogRepo, AssetRecord } from "../../src/catalog/catalog-repo";
import { OutputCache } from "../../src/renderer/cache";
import { DriveClient } from "../../src/scanner/drive-client";
import { registerDmHandler } from "../../src/bot/dm-handler";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

function seedCatalog(repo: CatalogRepo): void {
  repo.startScannerRun();
  repo.upsertBrand({
    id: "test-brand",
    display_name: "Test Brand",
    aliases: ["TB", "Test"],
    brand_group: null,
    importance: "primary",
    drive_folder_id: null,
    status: "active",
  });

  const svgAsset: AssetRecord = {
    id: "svg-blue",
    brand_id: "test-brand",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "svg",
    color: "blue",
    background: "transparent",
    layout: "horizontal",
    usage: ["general"],
    source_drive_file_id: "f1",
    source_path: "Test/logo-blue.svg",
    intrinsic_width: 300,
    intrinsic_height: 100,
    can_resize: true,
    status: "active",
    confidence: 0.9,
    inferred_from: [],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: 1,
  };
  repo.upsertAsset(svgAsset);
}

describe("DM Handler - Custom Size Flow", () => {
  let db: Database.Database;
  let repo: CatalogRepo;
  let resolver: AssetResolver;
  let conversationManager: ConversationManager;
  let conversations: ConversationStore;
  let parser: RequestParser;
  let mockApp: any;
  let messageHandler: any;

  beforeEach(() => {
    db = createTestDb();
    repo = new CatalogRepo(db);
    seedCatalog(repo);
    resolver = new AssetResolver(repo);
    conversationManager = new ConversationManager();
    conversations = new ConversationStore();
    parser = {
      parseUserRequest: vi.fn((text: string) => ({
        brand: "test-brand",
        brandCandidates: ["test-brand"],
        format: "png", // PNG output exercises the size → padding flow this test covers
        color: "blue",
        language: null,
        asset_type: null,
        layout: null,
        width: null,
        height: null,
        background: null,
        paddingRatio: null,
        raw_text: text,
      })),
    } as any;

    mockApp = {
      message: vi.fn((handler) => {
        messageHandler = handler;
      }),
    };

    const mockCache = {} as OutputCache;
    const mockDrive = {} as DriveClient;

    registerDmHandler(
      mockApp as App,
      parser,
      conversationManager,
      resolver,
      repo,
      mockCache,
      mockDrive,
      conversations
    );
  });

  it("asks padding question after user types custom dimensions (before delivering)", async () => {
    const mockSay = vi.fn();
    const mockClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ts: "123.456" }),
        delete: vi.fn().mockResolvedValue({}),
      },
      files: {
        uploadV2: vi.fn().mockResolvedValue({}),
      },
    };

    // First message: "Test Brand SVG 藍色"
    const message1 = { text: "Test Brand SVG 藍色", user: "user123", channel: "dm123" };
    await messageHandler({ message: message1, say: mockSay, client: mockClient });

    // Should ask for size
    expect(mockSay).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("尺寸") }));
    mockSay.mockClear();

    // User picks "custom"
    const state = conversations.get("user123");
    expect(state).not.toBeNull();
    const updated = conversationManager.applyAnswer(state!, "size", "custom");
    conversations.set("user123", updated);

    // Second message: user types "800x600"
    const message2 = { text: "800x600", user: "user123", channel: "dm123" };
    await messageHandler({ message: message2, say: mockSay, client: mockClient });

    // Should ask about padding (留白) next, NOT deliver the file yet
    expect(mockSay).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("留白") }));
    expect(mockClient.files.uploadV2).not.toHaveBeenCalled();
  });
});
