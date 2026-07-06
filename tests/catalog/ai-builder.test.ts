import { describe, it, expect, vi } from "vitest";
import { AiBuilder } from "../../src/catalog/ai-builder";
import { ScannedFile } from "../../src/scanner/scanner";

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
  describe("inferBrandFromPath", () => {
    it("extracts brand id from first path segment", () => {
      const builder = new AiBuilder("fake-key");
      const result = builder.inferBrandFromPath("The News Lens 關鍵評論網/SVG");
      expect(result.brand_id).toBe("the-news-lens-關鍵評論網");
      expect(result.display_name).toBe("The News Lens 關鍵評論網");
    });
  });

  describe("buildAssetMetadata for archived files", () => {
    it("returns ignored status without calling AI", async () => {
      const builder = new AiBuilder("fake-key");
      const file = mockFile({ folderSemantics: "archive", parentPath: "The News Lens 關鍵評論網/封存" });
      const result = await builder.buildAssetMetadata(file, null);
      expect(result.review_status).toBe("ignored");
      expect(result.review_reason).toContain("封存");
      expect(result.confidence).toBe(1.0);
    });
  });

  describe("buildAssetMetadata for campaign files", () => {
    it("returns ignored status without calling AI", async () => {
      const builder = new AiBuilder("fake-key");
      const file = mockFile({ folderSemantics: "campaign", parentPath: "The News Lens 關鍵評論網/十週年CI" });
      const result = await builder.buildAssetMetadata(file, null);
      expect(result.review_status).toBe("ignored");
      expect(result.review_reason).toContain("活動");
    });
  });

  describe("buildAssetMetadata for normal files", () => {
    it("calls AI and returns structured metadata", async () => {
      const builder = new AiBuilder("fake-key");

      // Mock the Anthropic client
      const mockResponse = {
        content: [
          {
            type: "tool_use" as const,
            id: "call-1",
            name: "record_asset_metadata",
            input: {
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
            },
          },
        ],
      };

      vi.spyOn((builder as any).client.messages, "create").mockResolvedValue(mockResponse);

      const file = mockFile();
      const dims = { viewBoxWidth: 300, viewBoxHeight: 100, width: 300, height: 100 };
      const result = await builder.buildAssetMetadata(file, dims);

      expect(result.brand_id).toContain("news-lens");
      expect(result.asset_type).toBe("logo");
      expect(result.color).toBe("blue");
      expect(result.confidence).toBe(0.93);
      expect(result.review_status).toBe("accepted");
    });
  });
});
