import { describe, it, expect } from "vitest";
import { AiBuilder, applyFilenameShapeRules, AiInferredMetadata } from "../../src/catalog/ai-builder";
import { ScannedFile } from "../../src/scanner/scanner";
import { AiProvider } from "../../src/ai/provider";

// A provider stub. `output` is what generateStructured returns for AI-backed
// calls; archive/campaign paths never reach the provider.
function stubProvider(output: Record<string, any> | null = null): AiProvider {
  return { generateStructured: async () => output };
}

const mockFile = (overrides: Partial<ScannedFile> = {}): ScannedFile => ({
  id: "file-1",
  name: "logo-blue.svg",
  mimeType: "image/svg+xml",
  parentFolderId: "folder-svg",
  parentPath: "The News Lens 關鍵評論網/SVG",
  modifiedTime: "2025-03-15T08:00:00Z",
  size: 4200,
  folderSemantics: "normal",
  ...overrides,
});

describe("AiBuilder", () => {
  // Brand inference moved to the shared pure function `inferBrand`
  // (see src/catalog/brand-inference.test.ts). AiBuilder now delegates to it.

  describe("buildAssetMetadata for archived files", () => {
    it("returns ignored status without calling AI", async () => {
      const builder = new AiBuilder(stubProvider());
      const file = mockFile({ folderSemantics: "archive", parentPath: "The News Lens 關鍵評論網/封存" });
      const result = await builder.buildAssetMetadata(file, null);
      expect(result.review_status).toBe("ignored");
      expect(result.review_reason).toContain("封存");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("buildAssetMetadata for campaign files", () => {
    it("returns ignored status without calling AI", async () => {
      const builder = new AiBuilder(stubProvider());
      const file = mockFile({ folderSemantics: "campaign", parentPath: "The News Lens 關鍵評論網/十週年CI" });
      const result = await builder.buildAssetMetadata(file, null);
      expect(result.review_status).toBe("ignored");
      expect(result.review_reason).toContain("活動");
    });
  });

  describe("buildAssetMetadata for normal files", () => {
    it("calls AI and returns structured metadata", async () => {
      const builder = new AiBuilder(
        stubProvider({
          asset_type: "logo",
          variant: "logo",
          language: null,
          color: "blue",
          background: "transparent",
          layout: "horizontal",
          usage: ["general"],
          confidence: 0.93,
          inferred_from: ["file_name", "folder_name"],
          review_status: "accepted",
          review_reason: null,
        })
      );

      const file = mockFile();
      const dims = { viewBoxWidth: 300, viewBoxHeight: 100, width: 300, height: 100 };
      const result = await builder.buildAssetMetadata(file, dims);

      expect(result.brand_id).toContain("news-lens");
      expect(result.asset_type).toBe("logo");
      expect(result.color).toBe("blue");
      expect(result.confidence).toBe(0.93);
      expect(result.review_status).toBe("accepted");
    });

    it("filename shape rule overrides the AI's square/mark guess", async () => {
      const builder = new AiBuilder(
        stubProvider({
          asset_type: "logo",
          variant: "logo",
          language: null,
          color: "black",
          background: "transparent",
          layout: "horizontal", // AI guessed wrong
          usage: ["general"],
          confidence: 0.9,
          inferred_from: ["file_name"],
          review_status: "accepted",
          review_reason: null,
        })
      );
      const file = mockFile({ name: "favicon.svg" });
      const result = await builder.buildAssetMetadata(file, null);
      expect(result.layout).toBe("square");
      expect(result.asset_type).toBe("mark");
      expect(result.inferred_from).toContain("filename_shape_rule");
    });
  });

  describe("applyFilenameShapeRules", () => {
    const base = (): AiInferredMetadata => ({
      brand_id: "b", display_name: "B", aliases: [],
      asset_type: "logo", variant: "logo", language: null, color: null,
      background: "transparent", layout: "horizontal", usage: [],
      confidence: 0.9, inferred_from: [], review_status: "accepted", review_reason: null,
    });

    it("marks mark/square/icon/favicon/正方形 filenames as square layout", () => {
      for (const name of ["logo-mark.svg", "brand-square.png", "app-icon.png", "favicon.svg", "正方形版.svg"]) {
        expect(applyFilenameShapeRules(name, base()).layout).toBe("square");
      }
    });

    it("sets asset_type=mark for mark and favicon filenames", () => {
      expect(applyFilenameShapeRules("logo-mark.svg", base()).asset_type).toBe("mark");
      expect(applyFilenameShapeRules("favicon.png", base()).asset_type).toBe("mark");
      // 正方形 / square / icon are shape-only — they do not imply a mark
      expect(applyFilenameShapeRules("hero-square.png", base()).asset_type).toBe("logo");
      expect(applyFilenameShapeRules("app-icon.png", base()).asset_type).toBe("logo");
    });

    it("leaves ordinary logo filenames untouched (no rule tag)", () => {
      const m = applyFilenameShapeRules("logo-en-blue.svg", base());
      expect(m.layout).toBe("horizontal");
      expect(m.asset_type).toBe("logo");
      expect(m.inferred_from).not.toContain("filename_shape_rule");
    });
  });
});
