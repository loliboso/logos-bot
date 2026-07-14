import { describe, test, expect } from "vitest";
import { parseFields } from "../../src/bot/rule-parser";

describe("parseFields", () => {
  test("extracts format, color, size from a mixed sentence", () => {
    const r = parseFields("我要藍色的 svg，500x500");
    expect(r.format).toBe("svg");
    expect(r.color).toBe("primary");
    expect(r.width).toBe(500);
    expect(r.height).toBe(500);
  });

  test("black + png + english", () => {
    const r = parseFields("black png english");
    expect(r.color).toBe("black");
    expect(r.format).toBe("png");
    expect(r.language).toBe("en");
  });

  test("empty when no keywords", () => {
    expect(parseFields("給我 logo")).toEqual({
      format: null, color: null, language: null,
      asset_type: "logo", width: null, height: null,
    });
  });

  test("full-width × size separator", () => {
    const r = parseFields("1200×630");
    expect(r.width).toBe(1200);
    expect(r.height).toBe(630);
  });
});
