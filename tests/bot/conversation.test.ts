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
    // Format (svg) + color set. SVG is delivered as-is (no size question), so
    // the only thing left is the mandatory purpose gate.
    expect(question?.field).toBe("purpose");
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

  it("offers PNG for an SVG-only brand (PNG is a render target)", () => {
    const parsed: ParsedRequest = {
      brand: "the-news-lens", brandCandidates: ["the-news-lens"],
      format: null, color: "blue", language: null, asset_type: null, layout: null,
      width: null, height: null, background: null, paddingRatio: null, raw_text: "test",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";
    // Only an SVG is stored for this brand.
    const svgOnly = [{ ...sampleAssets[0], format: "svg", color: "blue" }];
    const question = manager.getNextQuestion(state, [twoBrands[0]], svgOnly);
    expect(question?.field).toBe("format");
    expect(question?.options?.map((o) => o.value)).toEqual(["svg", "png"]);
  });

  it("offers .ai even when the request is logo-typed (guideline .ai is brand-level)", () => {
    // iCook's only .ai is an identity-guidelines file catalogued as
    // asset_type='guideline' with null colour/language/layout. A "logo" request
    // sets asset_type='logo', which would narrow that .ai away — but .ai must
    // still be offered because it exists for the brand.
    const guidelineAi: AssetRecord = {
      id: "g1", brand_id: "the-news-lens", asset_type: "guideline", variant: "guideline",
      language: null, format: "ai", color: null, background: "transparent", layout: null,
      usage: ["general"], source_drive_file_id: "fai", source_path: "Guidelines.ai",
      intrinsic_width: null, intrinsic_height: null, can_resize: false, status: "active",
      confidence: 0.85, inferred_from: [], review_status: "accepted", review_reason: null, scanner_run_id: null,
    };
    const assets = [...sampleAssets, guidelineAi];
    const parsed: ParsedRequest = {
      brand: "the-news-lens", brandCandidates: ["the-news-lens"],
      format: null, color: null, language: null, asset_type: "logo", layout: null,
      width: null, height: null, background: null, paddingRatio: null, raw_text: "iCook logo",
    };
    const state = manager.startConversation("user1", "ch1", parsed);
    state.resolvedBrandId = "the-news-lens";

    const question = manager.getNextQuestion(state, [twoBrands[0]], assets);
    expect(question?.field).toBe("format");
    expect(question?.options?.map((o) => o.value)).toContain("ai");

    // Choosing .ai clears the logo-oriented filters and the flow proceeds to the
    // purpose gate (not stuck with an empty narrowed set).
    const afterAi = manager.applyAnswer(state, "format", "ai");
    expect(afterAi.parsed.asset_type).toBeNull();
    expect(manager.getNextQuestion(afterAi, [twoBrands[0]], assets)?.field).toBe("purpose");
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
      format: "png", // PNG output → size question applies
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
    // Size is not re-asked; the mandatory purpose gate is what remains.
    expect(manager.getNextQuestion(updated, [twoBrands[0]], sampleAssets)?.field).toBe("purpose");

    const withPurpose = manager.applyPurposeInput(updated, "放在簡報");
    expect(manager.getNextQuestion(withPurpose!, [twoBrands[0]], sampleAssets)).toBeNull();
    expect(manager.isComplete(withPurpose!)).toBe(true);
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

  it("isComplete requires brand, format, and a stated purpose", () => {
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
    // Brand + format resolved but no purpose yet → not complete.
    expect(manager.isComplete(state)).toBe(false);
    const withPurpose = manager.applyPurposeInput(state, "官網頁尾");
    expect(manager.isComplete(withPurpose!)).toBe(true);
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
      language: null, asset_type: null, layout: null, width: null, height: null,
      background: null, paddingRatio: null, raw_text: "x", ...over,
    };
  }

  test("asks padding right after a custom size, before background", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // size already answered as custom
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("padding");
    expect(q?.options?.map((o) => o.value)).toEqual(["0", "0.2"]);
  });

  test("asks background after padding is set", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500, paddingRatio: 0 }) as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true;
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("background");
    expect(q?.options?.map((o) => o.value)).toEqual(["transparent", "white", "black"]);
  });

  test("applyAnswer sets paddingRatio", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    expect(mgr.applyAnswer(state, "padding", "0.2").parsed.paddingRatio).toBe(0.2);
    expect(mgr.applyAnswer(state, "padding", "0").parsed.paddingRatio).toBe(0);
  });

  test("does NOT ask background for original size (goes straight to purpose)", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true; // chose original → width/height stay null
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    // No custom size → background skipped; the purpose gate is what's left.
    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("purpose");
  });

  test("purpose gate: asks, captures URL, then completes", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    state.resolvedBrandId = "b";
    state.sizeResolved = true;
    const assets = [{ format: "png", color: "black", can_resize: false } as any];

    const q = mgr.getNextQuestion(state, [], assets);
    expect(q?.field).toBe("purpose");
    expect(state.awaitingPurpose).toBe(true);

    const done = mgr.applyPurposeInput(state, "首頁 banner https://tnl.tw/post/123");
    expect(done?.purpose).toContain("首頁 banner");
    expect(done?.purposeUrl).toBe("https://tnl.tw/post/123");
    expect(done?.awaitingPurpose).toBe(false);
    expect(mgr.getNextQuestion(done!, [], assets)).toBeNull();
  });

  test("purpose gate rejects an empty reply", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed() as any);
    expect(mgr.applyPurposeInput(state, "   ")).toBeNull();
  });

  test("applyAnswer sets background and marks it resolved", () => {
    const mgr = new ConversationManager();
    const state = mgr.startConversation("u", "c", baseParsed({ width: 500, height: 500 }) as any);
    const next = mgr.applyAnswer(state, "background", "white");
    expect(next.parsed.background).toBe("white");
    expect(next.backgroundResolved).toBe(true);
  });

  // --- Two-axis form/richness questions (asset_type / language / layout) ---

  // Brand with a mix of types, languages and layouts so each axis has >1 value.
  const multiFormAssets: AssetRecord[] = [
    { ...sampleAssets[0], id: "m1", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" },
    { ...sampleAssets[0], id: "m2", asset_type: "logo", language: "en", layout: "vertical", color: "blue" },
    { ...sampleAssets[0], id: "m3", asset_type: "mark", language: null, layout: "square", color: "black" },
  ];

  function formParsed(over: any = {}) {
    return {
      brand: "b", brandCandidates: ["b"], format: "svg", color: null,
      language: null, asset_type: null, layout: null, width: null, height: null,
      background: null, paddingRatio: null, raw_text: "x", ...over,
    } as ParsedRequest;
  }

  test("asks type (asset_type) when brand has both logo and mark", () => {
    const state = manager.startConversation("u", "c", formParsed());
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], multiFormAssets);
    expect(q?.field).toBe("asset_type");
    expect(q?.options?.map((o) => o.value).sort()).toEqual(["logo", "mark"]);
  });

  test("asks language after type is chosen, narrowed to that type", () => {
    const state = manager.startConversation("u", "c", formParsed({ asset_type: "logo" }));
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], multiFormAssets);
    // logo assets are zh + en; the null-language mark was filtered out by type
    expect(q?.field).toBe("language");
    expect(q?.options?.map((o) => o.value).sort()).toEqual(["en", "zh"]);
  });

  test("asks layout (form) when only the layout axis varies", () => {
    // Same type, same language, same color — only the shape differs.
    const assets: AssetRecord[] = [
      { ...sampleAssets[0], id: "l1", asset_type: "logo", language: "en", layout: "horizontal", color: "blue" },
      { ...sampleAssets[0], id: "l2", asset_type: "logo", language: "en", layout: "vertical", color: "blue" },
    ];
    const state = manager.startConversation("u", "c", formParsed({ color: "blue" }));
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], assets);
    expect(q?.field).toBe("layout");
    expect(q?.options?.map((o) => o.value).sort()).toEqual(["horizontal", "vertical"]);
  });

  test("does not ask language when only one non-null language coexists with null", () => {
    // All logos, all horizontal, all blue → only the language axis could vary.
    // Languages are [en, null]; non-null distinct = [en] (just 1) → must skip,
    // otherwise auto-picking en would drop the language-neutral asset.
    const assets: AssetRecord[] = [
      { ...sampleAssets[0], id: "x1", asset_type: "logo", language: "en", layout: "horizontal", color: "blue" },
      { ...sampleAssets[0], id: "x2", asset_type: "logo", language: null, layout: "horizontal", color: "blue" },
    ];
    const state = manager.startConversation("u", "c", formParsed({ format: "png", color: "blue" }));
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], assets);
    // language is skipped and never auto-set → flow lands on size (PNG output)
    expect(q?.field).toBe("size");
    expect(state.parsed.language).toBeNull();
  });

  test("auto-skips all axes when the brand has only one uniform variant", () => {
    const assets: AssetRecord[] = [
      { ...sampleAssets[0], id: "u1", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" },
    ];
    const state = manager.startConversation("u", "c", formParsed({ format: "png", color: "blue" }));
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], assets);
    // nothing to disambiguate → straight to size (PNG output)
    expect(q?.field).toBe("size");
  });

  test("only asks size for PNG output — not svg or ai", () => {
    const assets: AssetRecord[] = [
      { ...sampleAssets[0], id: "s", format: "svg", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" },
    ];
    // AI: cannot be rendered → no size question, straight to purpose gate.
    const ai = manager.startConversation("u", "c", formParsed({ format: "ai", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" }));
    ai.resolvedBrandId = "b";
    expect(manager.getNextQuestion(ai, [twoBrands[0]], assets)?.field).toBe("purpose");

    // SVG: delivered as-is → no size question either.
    const svg = manager.startConversation("u", "c", formParsed({ format: "svg", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" }));
    svg.resolvedBrandId = "b";
    expect(manager.getNextQuestion(svg, [twoBrands[0]], assets)?.field).toBe("purpose");

    // PNG: rendered to a pixel size → size IS asked.
    const png = manager.startConversation("u", "c", formParsed({ format: "png", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" }));
    png.resolvedBrandId = "b";
    expect(manager.getNextQuestion(png, [twoBrands[0]], assets)?.field).toBe("size");
  });

  test("size options are original / custom only (no hardcoded square preset)", () => {
    const state = manager.startConversation("u", "c", formParsed({ format: "png", asset_type: "logo", language: "zh", layout: "horizontal", color: "blue" }));
    state.resolvedBrandId = "b";
    const q = manager.getNextQuestion(state, [twoBrands[0]], multiFormAssets);
    expect(q?.field).toBe("size");
    expect(q?.options?.map((o) => o.value)).toEqual(["original", "custom"]);
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

    // Should ask padding first...
    const assets = [{ format: "png", color: "black", can_resize: false } as any];
    const q = mgr.getNextQuestion(afterInput!, [], assets);
    expect(q?.field).toBe("padding");

    // ...then background once padding is answered
    const afterPadding = mgr.applyAnswer(afterInput!, "padding", "0");
    expect(mgr.getNextQuestion(afterPadding, [], assets)?.field).toBe("background");
  });
});
