import { describe, test, expect } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadBrandConfig, syncBrandConfig } from "../../src/config/brands-config";

describe("loadBrandConfig", () => {
  test("loads the real brands.json keyed by brand id with alias arrays", () => {
    const cfg = loadBrandConfig();
    expect(cfg["the-news-lens-關鍵評論網"].aliases).toContain("關鍵評論網");
    expect(cfg["inside-硬塞"].aliases).toContain("INSIDE");
    expect(Object.keys(cfg).length).toBeGreaterThanOrEqual(40);
  });
});

describe("syncBrandConfig", () => {
  test("adds missing brand ids, flags stale keys, preserves existing aliases", () => {
    const path = join(process.env.TMPDIR || "/tmp", `brands-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify({ "old-brand": { aliases: ["Keep Me"], notes: "" } }, null, 2));

    const { added, stale } = syncBrandConfig(["new-brand", "another"], path);

    expect(added.sort()).toEqual(["another", "new-brand"]);
    expect(stale).toEqual(["old-brand"]); // no longer an active brand
    const cfg = JSON.parse(readFileSync(path, "utf-8"));
    expect(cfg["new-brand"]).toEqual({ aliases: [], notes: "" }); // fresh empty slot
    expect(cfg["old-brand"].aliases).toEqual(["Keep Me"]); // hand-written aliases NOT destroyed
  });
});
