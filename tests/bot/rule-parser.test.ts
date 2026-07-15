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
      asset_type: "logo", layout: null, width: null, height: null,
      background: null, paddingRatio: null,
    });
  });

  test("parses padding intent, with 'no padding' phrases winning", () => {
    expect(parseFields("1000x1000 留白").paddingRatio).toBe(0.2);
    expect(parseFields("去留白").paddingRatio).toBe(0);
    expect(parseFields("不留白").paddingRatio).toBe(0);
    expect(parseFields("我要 logo").paddingRatio).toBeNull();
  });

  test("extracts layout (form) keywords", () => {
    expect(parseFields("我要橫式的").layout).toBe("horizontal");
    expect(parseFields("直式 logo").layout).toBe("vertical");
    expect(parseFields("正方形").layout).toBe("square");
    expect(parseFields("square png").layout).toBe("square");
  });

  test("layout is null when no shape word (mark alone stays asset_type only)", () => {
    const r = parseFields("我要 mark");
    expect(r.asset_type).toBe("mark");
    expect(r.layout).toBeNull();
  });

  test("full-width × size separator", () => {
    const r = parseFields("1200×630");
    expect(r.width).toBe(1200);
    expect(r.height).toBe(630);
  });

  test("extracts background keywords", () => {
    expect(parseFields("白底").background).toBe("white");
    expect(parseFields("black bg").background).toBe("black");
    expect(parseFields("透明背景").background).toBe("transparent");
  });

  test("background is null when no keyword", () => {
    expect(parseFields("我要 logo").background).toBeNull();
  });
});
