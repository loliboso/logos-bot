import { describe, test, expect } from "vitest";
import { BrandMatcher, BrandSource } from "../../src/bot/brand-matcher";

const brands: BrandSource[] = [
  { id: "inside-硬塞", display_name: "INSIDE 硬塞", aliases: ["INSIDE 硬塞"] },
  { id: "techinsider", display_name: "techinsider", aliases: ["techinsider"] },
  { id: "bi", display_name: "BI", aliases: ["BI"] },
  { id: "the-news-lens-關鍵評論網", display_name: "The News Lens 關鍵評論網", aliases: ["The News Lens 關鍵評論網"] },
  { id: "tnl-mediagene", display_name: "TNL Mediagene", aliases: ["TNL Mediagene"] },
];
const config = {
  "inside-硬塞": { aliases: ["INSIDE", "硬塞"], notes: "" },
  "techinsider": { aliases: ["techinsider", "tech-insider"], notes: "" },
  "bi": { aliases: ["BI", "business insider"], notes: "" },
  "the-news-lens-關鍵評論網": { aliases: ["tnl", "關鍵評論網"], notes: "" },
  "tnl-mediagene": { aliases: ["tnl", "tnl mediagene", "tnmg"], notes: "" },
};

describe("BrandMatcher", () => {
  test("'INSIDE' matches only 硬塞, not techinsider/business insider", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("我要 INSIDE 的 logo")).toEqual(["inside-硬塞"]);
  });

  test("CJK alias matches by containment", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("給我關鍵評論網的圖")).toEqual(["the-news-lens-關鍵評論網"]);
  });

  test("no alias present → empty", () => {
    const m = new BrandMatcher(brands, config);
    expect(m.match("隨便給我一個東西")).toEqual([]);
  });

  test("ambiguous 'tnl' matches both news-lens and mediagene", () => {
    const m = new BrandMatcher(brands, config);
    const result = m.match("我要 tnl 的檔案").sort();
    expect(result).toContain("the-news-lens-關鍵評論網");
    expect(result).toContain("tnl-mediagene");
  });
});
