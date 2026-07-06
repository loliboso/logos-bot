import { describe, it, expect, vi } from "vitest";
import { RequestParser } from "../../src/bot/request-parser";

function createMockParser(mockInput: any): RequestParser {
  const parser = new RequestParser("fake-key");
  vi.spyOn((parser as any).client.messages, "create").mockResolvedValue({
    content: [
      { type: "tool_use", id: "call-1", name: "parse_logo_request", input: mockInput },
    ],
  });
  return parser;
}

describe("RequestParser", () => {
  it("parses '我要 TNL 藍色 SVG'", async () => {
    const parser = createMockParser({
      brand: "The News Lens 關鍵評論網",
      format: "svg",
      color: "blue",
      language: null,
      asset_type: "logo",
      width: null,
      height: null,
    });

    const result = await parser.parseUserRequest("我要 TNL 藍色 SVG");
    expect(result.brand).toBe("The News Lens 關鍵評論網");
    expect(result.format).toBe("svg");
    expect(result.color).toBe("blue");
    expect(result.raw_text).toBe("我要 TNL 藍色 SVG");
  });

  it("parses '關鍵評論網透明 PNG，500x500'", async () => {
    const parser = createMockParser({
      brand: "The News Lens 關鍵評論網",
      format: "png",
      color: null,
      language: null,
      asset_type: "logo",
      width: 500,
      height: 500,
    });

    const result = await parser.parseUserRequest("關鍵評論網透明 PNG，500x500");
    expect(result.width).toBe(500);
    expect(result.height).toBe(500);
    expect(result.format).toBe("png");
  });

  it("parses 'The News Lens 英文版白色 logo，1200x630'", async () => {
    const parser = createMockParser({
      brand: "The News Lens 關鍵評論網",
      format: null,
      color: "white",
      language: "en",
      asset_type: "logo",
      width: 1200,
      height: 630,
    });

    const result = await parser.parseUserRequest("The News Lens 英文版白色 logo，1200x630");
    expect(result.language).toBe("en");
    expect(result.color).toBe("white");
    expect(result.width).toBe(1200);
    expect(result.height).toBe(630);
  });

  it("handles completely ambiguous request", async () => {
    const parser = createMockParser({
      brand: null,
      format: null,
      color: null,
      language: null,
      asset_type: "logo",
      width: null,
      height: null,
    });

    const result = await parser.parseUserRequest("給我一個 logo");
    expect(result.brand).toBeNull();
    expect(result.format).toBeNull();
  });
});
