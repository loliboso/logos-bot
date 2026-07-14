import { describe, test, expect } from "vitest";
import { loadBrandConfig } from "../../src/config/brands-config";

describe("loadBrandConfig", () => {
  test("loads the real brands.json keyed by brand id with alias arrays", () => {
    const cfg = loadBrandConfig();
    expect(cfg["the-news-lens-關鍵評論網"].aliases).toContain("關鍵評論網");
    expect(cfg["inside-硬塞"].aliases).toContain("INSIDE");
    expect(Object.keys(cfg).length).toBeGreaterThanOrEqual(40);
  });
});
