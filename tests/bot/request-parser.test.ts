import { describe, test, expect } from "vitest";
import { RequestParser } from "../../src/bot/request-parser";
import { BrandMatcher, BrandSource } from "../../src/bot/brand-matcher";

const brands: BrandSource[] = [
  { id: "inside-硬塞", display_name: "INSIDE 硬塞", aliases: ["INSIDE 硬塞"] },
  { id: "cool3c", display_name: "Cool3c", aliases: ["Cool3c"] },
];
const config = {
  "inside-硬塞": { aliases: ["INSIDE", "硬塞"], notes: "" },
  "cool3c": { aliases: ["Cool3c"], notes: "" },
};

describe("RequestParser (rule-based)", () => {
  test("single brand match populates brand + fields, no candidates ambiguity", () => {
    const p = new RequestParser(new BrandMatcher(brands, config));
    const r = p.parseUserRequest("我要 INSIDE 的黑色 svg");
    expect(r.brand).toBe("inside-硬塞");
    expect(r.brandCandidates).toEqual(["inside-硬塞"]);
    expect(r.color).toBe("black");
    expect(r.format).toBe("svg");
    expect(r.raw_text).toBe("我要 INSIDE 的黑色 svg");
  });

  test("no brand match → brand null, empty candidates", () => {
    const p = new RequestParser(new BrandMatcher(brands, config));
    const r = p.parseUserRequest("隨便給我東西");
    expect(r.brand).toBeNull();
    expect(r.brandCandidates).toEqual([]);
  });
});
