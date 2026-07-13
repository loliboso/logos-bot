import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { CatalogRepo, BrandRecord, AssetRecord } from "../../src/catalog/catalog-repo";
import { ConversationState } from "../../src/bot/conversation";
import { buildNoMatchMessage } from "../../src/bot/no-match";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8"));
  return db;
}

const cool3c: BrandRecord = {
  id: "cool3c",
  display_name: "Cool3c",
  aliases: ["Cool3c", "Cool3C"],
  brand_group: null,
  importance: "primary",
  drive_folder_id: "folder-cool3c",
  status: "active",
};

const baseAsset: AssetRecord = {
  id: "cool3c-primary-png",
  brand_id: "cool3c",
  asset_type: "logo",
  variant: "logo",
  language: null,
  format: "png",
  color: "primary",
  background: "transparent",
  layout: null,
  usage: ["general"],
  source_drive_file_id: "f1",
  source_path: "Cool3c/PNG/Cool3C@3x.png",
  intrinsic_width: 300,
  intrinsic_height: 100,
  can_resize: false,
  status: "active",
  confidence: 0.9,
  inferred_from: [],
  review_status: "accepted",
  review_reason: null,
  scanner_run_id: null,
};

function makeState(overrides: Partial<ConversationState["parsed"]>): ConversationState {
  return {
    userId: "U1",
    channelId: "C1",
    parsed: {
      brand: "Cool3c",
      format: null,
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "",
      ...overrides,
    } as ConversationState["parsed"],
    resolvedBrandId: "cool3c",
    resolvedAssetId: null,
    awaitingCustomSize: false,
    sizeResolved: false,
    step: "done",
    startedAt: "now",
  };
}

describe("buildNoMatchMessage", () => {
  let repo: CatalogRepo;

  beforeEach(() => {
    const db = createTestDb();
    repo = new CatalogRepo(db);
    repo.upsertBrand(cool3c);
    repo.upsertAsset(baseAsset);
    repo.upsertAsset({ ...baseAsset, id: "cool3c-white-png", color: "white", source_drive_file_id: "f2" });
  });

  it("names the missing color and offers the brand's actual colors as buttons", () => {
    // User asked for black; Cool3c only has primary + white.
    const { message, state } = buildNoMatchMessage(makeState({ color: "black" }), repo);

    expect(message.text).toContain("Cool3c");
    expect(message.text).toContain("黑色");
    expect(message.text).toContain("主色");
    expect(message.text).toContain("白色");

    // Buttons for re-selection, one per available color.
    const actions = message.blocks?.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
    expect(actions.elements).toHaveLength(2);
    expect(actions.elements[0].action_id).toMatch(/^select_color_/);

    // Retained state clears the unmatched color so the button click can resume.
    expect(state).not.toBeNull();
    expect(state!.parsed.color).toBeNull();
  });

  it("returns a dead-end message (no retained state) when brand is unresolved", () => {
    const s = makeState({ color: "black" });
    s.resolvedBrandId = null;
    const { message, state } = buildNoMatchMessage(s, repo);
    expect(message.text).toContain("找不到");
    expect(state).toBeNull();
  });

  it("falls back to a clearer generic message when the requested color also does not exist as an alternative", () => {
    // Brand exists but has no colored assets matching the format filter.
    const { message, state } = buildNoMatchMessage(makeState({ color: "black", format: "svg" }), repo);
    expect(message.text).toContain("Cool3c");
    expect(message.blocks?.some((b) => b.type === "actions")).toBeFalsy();
    expect(state).toBeNull();
  });
});
