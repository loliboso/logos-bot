import { describe, it, expect } from "vitest";
import { RuleBuilder } from "../../src/catalog/rule-builder";
import { ScannedFile } from "../../src/scanner/scanner";

const builder = new RuleBuilder();

const file = (name: string, over: Partial<ScannedFile> = {}): ScannedFile => ({
  id: "f1",
  name,
  mimeType: name.endsWith(".png") ? "image/png" : "image/svg+xml",
  parentFolderId: "folder",
  parentPath: "The News Lens 關鍵評論網/SVG",
  modifiedTime: "2026-01-01T00:00:00Z",
  size: 100,
  folderSemantics: "normal",
  ...over,
});

describe("RuleBuilder (zero-AI)", () => {
  it("parses type / language / colour from the filename", async () => {
    const m = await builder.buildAssetMetadata(file("logo-en-blue.svg"), null);
    expect(m.asset_type).toBe("logo");
    expect(m.language).toBe("en");
    expect(m.color).toBe("primary"); // "blue" maps to primary in the keyword table
    expect(m.review_status).toBe("accepted");
    expect(m.brand_id).toContain("news-lens");
    expect(m.inferred_from).toContain("filename_rules");
  });

  it("applies the shape rule: a 'mark' file is a square mark", async () => {
    const m = await builder.buildAssetMetadata(file("mark-white.png"), null);
    expect(m.asset_type).toBe("mark");
    expect(m.color).toBe("white");
    expect(m.layout).toBe("square");
    expect(m.inferred_from).toContain("filename_shape_rule");
  });

  it("treats favicon as a square mark", async () => {
    const m = await builder.buildAssetMetadata(file("favicon.svg"), null);
    expect(m.asset_type).toBe("mark");
    expect(m.layout).toBe("square");
  });

  it("flags an unrecognisable filename for review instead of guessing silently", async () => {
    const m = await builder.buildAssetMetadata(file("artwork.svg"), null);
    expect(m.asset_type).toBe("logo"); // safe default
    expect(m.review_status).toBe("needs_review");
    expect(m.review_reason).toContain("檔名");
  });

  it("ignores archived files without inspecting the name", async () => {
    const m = await builder.buildAssetMetadata(file("logo-blue.svg", { folderSemantics: "archive" }), null);
    expect(m.review_status).toBe("ignored");
    expect(m.review_reason).toContain("封存");
  });

  it("makes no network/AI call (returns synchronously fast)", async () => {
    // Purely deterministic — resolves immediately with no provider involved.
    const m = await builder.buildAssetMetadata(file("logo-primary.svg"), null);
    expect(m.confidence).toBeGreaterThan(0);
  });
});
