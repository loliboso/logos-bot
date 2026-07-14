import { describe, it, expect } from "vitest";
import { ConversationManager } from "../../src/bot/conversation";
import { ParsedRequest } from "../../src/bot/request-parser";
import { BrandRecord, AssetRecord } from "../../src/catalog/catalog-repo";

const manager = new ConversationManager();

const twoBrands: BrandRecord[] = [
  { id: "the-news-lens", display_name: "The News Lens 關鍵評論網", aliases: ["TNL"], brand_group: "TNL Mediagene", importance: "primary", drive_folder_id: null, status: "active" },
  { id: "tnl-mediagene", display_name: "TNL Mediagene", aliases: ["TNL"], brand_group: null, importance: "primary", drive_folder_id: null, status: "active" },
];

const sampleAssets: AssetRecord[] = [
  { id: "a1", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: null, format: "svg", color: "blue", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f1", source_path: "p1", intrinsic_width: 300, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.9, inferred_from: [], review_status: "accepted", review_reason: null, scanner_run_id: null },
  { id: "a2", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: null, format: "svg", color: "white", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f2", source_path: "p2", intrinsic_width: 300, intrinsic_height: 100, can_resize: true, status: "active", confidence: 0.9, inferred_from: [], review_status: "accepted", review_reason: null, scanner_run_id: null },
  { id: "a3", brand_id: "the-news-lens", asset_type: "logo", variant: "logo", language: null, format: "png", color: "blue", background: "transparent", layout: "horizontal", usage: ["general"], source_drive_file_id: "f3", source_path: "p3", intrinsic_width: 500, intrinsic_height: 167, can_resize: false, status: "active", confidence: 0.9, inferred_from: [], review_status: "accepted", review_reason: null, scanner_run_id: null },
];

describe("ConversationManager", () => {
  it("asks for brand disambiguation when multiple brands match", () => {
    const parsed: ParsedRequest = {
      brand: null,
      brandCandidates: ["the-news-lens", "tnl-mediagene"],
      format: "svg",
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "我要 TNL logo",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    const question = manager.getNextQuestion(state, twoBrands, sampleAssets);
    expect(question?.field).toBe("brand_id");
    expect(question?.options).toHaveLength(2);
    expect(question?.text).toContain("多個");
  });

  it("auto-resolves single brand match without asking", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "我要關鍵評論網 SVG",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    const question = manager.getNextQuestion(state, [twoBrands[0]], sampleAssets);
    // Brand auto-resolved, next question is color
    expect(question?.field).toBe("color");
  });

  it("asks for color when multiple colors available", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";
    const question = manager.getNextQuestion(state, [twoBrands[0]], sampleAssets);
    expect(question?.field).toBe("color");
    expect(question?.options?.length).toBeGreaterThan(1);
  });

  it("skips format question when already specified", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";
    const question = manager.getNextQuestion(state, [twoBrands[0]], sampleAssets);
    // Format and color are set, asks about size
    expect(question?.field).toBe("size");
  });

  it("offers only concrete formats when a format is required", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: null,
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";

    const question = manager.getNextQuestion(state, [twoBrands[0]], sampleAssets);

    expect(question?.field).toBe("format");
    expect(question?.options?.map((option) => option.value)).toEqual(["svg", "png"]);
  });

  it("asks for dimensions after the user chooses a custom size", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";

    const updated = manager.applyAnswer(state, "size", "custom");
    const question = manager.getNextQuestion(updated, [twoBrands[0]], sampleAssets);

    expect(question).toMatchObject({ field: "custom_size" });
    expect(question?.text).toContain("800x600");
  });

  it("does not re-ask size after the user chooses the original size", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";

    // Sanity: size is the outstanding question.
    expect(manager.getNextQuestion(state, [twoBrands[0]], sampleAssets)?.field).toBe("size");

    const updated = manager.applyAnswer(state, "size", "original");
    const question = manager.getNextQuestion(updated, [twoBrands[0]], sampleAssets);

    expect(question).toBeNull();
    expect(manager.isComplete(updated)).toBe(true);
  });

  it("accepts a custom dimension reply", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);

    const updated = manager.applyCustomSizeInput(state, "800 x 600");

    expect(updated?.parsed.width).toBe(800);
    expect(updated?.parsed.height).toBe(600);
  });

  it("applyAnswer updates state correctly", () => {
    const parsed: ParsedRequest = {
      brand: null,
      brandCandidates: [],
      format: null,
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    const updated = manager.applyAnswer(state, "brand_id", "the-news-lens");
    expect(updated.resolvedBrandId).toBe("the-news-lens");
  });

  it("isComplete when brand and format are resolved", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens",
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";
    expect(manager.isComplete(state)).toBe(true);
  });

  it("not complete without brand resolution", () => {
    const parsed: ParsedRequest = {
      brand: null,
      brandCandidates: ["the-news-lens"],
      format: "svg",
      color: "blue",
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    expect(manager.isComplete(state)).toBe(false);
  });

  it("uses brandCandidates for disambiguation (rule-first parser)", () => {
    const parsed: ParsedRequest = {
      brand: null,
      brandCandidates: ["the-news-lens", "tnl-mediagene"],
      format: null,
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "tnl",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    const question = manager.getNextQuestion(state, twoBrands, sampleAssets);
    expect(question?.field).toBe("brand_id");
    expect(question?.options?.length).toBe(2);
    expect(question?.text).toContain("多個");
  });

  it("returns null when brandCandidates is empty (rule-first parser)", () => {
    const parsed: ParsedRequest = {
      brand: null,
      brandCandidates: [],
      format: null,
      color: null,
      language: null,
      asset_type: null,
      width: null,
      height: null,
      raw_text: "something",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    const question = manager.getNextQuestion(state, [], sampleAssets);
    expect(question).toBeNull();
  });

  test("asks size for a PNG-only brand (not just SVG)", () => {
    const mgr = new ConversationManager();
    const parsed = {
      brand: "b", brandCandidates: ["b"], format: "png", color: "black",
      language: null, asset_type: null, width: null, height: null,
      background: null, raw_text: "b png",
    };
    const state = mgr.startConversation("u", "c", parsed as any);
    state.resolvedBrandId = "b";
    const assets = [
      { format: "png", color: "black", can_resize: false } as any,
    ];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("size");
  });

  function baseParsed(over: any = {}) {
    return {
      brand: "b", brandCandidates: ["b"], format: "png", color: "black",
      language: null, asset_type: null, width: null, height: null,
      background: null, raw_text: "x", ...over,
    };
  }

  test("asks background after a custom size is set", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // size already answered as custom
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("background");
    expect(q?.options?.map((o) => o.value)).toEqual(["transparent", "white", "black"]);
  });

  test("does NOT ask background for original size", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // chose original → width/height stay null
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q).toBeNull();
  });

  test("applyAnswer sets background and marks it resolved", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    const next = mgr.applyAnswer(state, "background", "white");
    expect(next.parsed.background).toBe("white");
    expect(next.backgroundResolved).toBe(true);
  });

  test("asks background after user types custom dimensions", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    state.resolvedBrandId = "b";

    // User picks "custom" from the size menu
    const afterCustomChoice = mgr.applyAnswer(state, "size", "custom");
    expect(afterCustomChoice.sizeResolved).toBe(true);
    expect(afterCustomChoice.awaitingCustomSize).toBe(true);

    // User types dimensions
    const afterInput = mgr.applyCustomSizeInput(afterCustomChoice, "800x600");
    expect(afterInput?.parsed.width).toBe(800);
    expect(afterInput?.parsed.height).toBe(600);
    expect(afterInput?.awaitingCustomSize).toBe(false);

    // Should now ask background
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(afterInput!, [], assets);
    expect(q?.field).toBe("background");
  });
});
