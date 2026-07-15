import { describe, test, expect } from "vitest";
import { inferBrand, isSkippedPath } from "./brand-inference";

describe("inferBrand", () => {
  test("container folder + sub-brand folder → brand from the sub-brand folder", () => {
    const result = inferBrand("@mediagene 旗下品牌/GIZMODO/GIZMODO_Logo_RGB_black.png");
    expect(result.brand_id).toBe("gizmodo");
  });

  test("container folder + loose root file → brand from the filename", () => {
    const result = inferBrand("@mediagene 旗下品牌/DIGIDAY.ai");
    expect(result.brand_id).toBe("digiday");
  });

  test("normal brand + format subfolder → brand from the top folder", () => {
    const result = inferBrand("cool3c/PNG/logo.png");
    expect(result.brand_id).toBe("cool3c");
  });

  test("a brand's own 封存 subfolder is NOT treated as a container", () => {
    const result = inferBrand("the-news-lens-關鍵評論網/封存/old-logo.png");
    expect(result.brand_id).toBe("the-news-lens-關鍵評論網");
  });

  test("display_name and aliases come from the brand folder name", () => {
    const result = inferBrand("@mediagene 旗下品牌/fumumu/fumumu-mark.png");
    expect(result.display_name).toBe("fumumu");
    expect(result.aliases).toEqual(["fumumu"]);
  });

  test("loose root file uses the approved id override, not the messy filename", () => {
    expect(inferBrand("@mediagene 旗下品牌/FUZE_logo_fix.ai").brand_id).toBe("fuze");
    expect(
      inferBrand("@mediagene 旗下品牌/MONEY INSIDER Logo artboards_web(RGB).ai").brand_id
    ).toBe("money-insider");
  });

  test("both GIZ-YATAI loose files map to one shared id", () => {
    expect(inferBrand("@mediagene 旗下品牌/GIZ-YATAI_logo.ai").brand_id).toBe("giz-yatai");
    expect(inferBrand("@mediagene 旗下品牌/GIZ-YATAI_logo-ギズ屋台.ai").brand_id).toBe(
      "giz-yatai"
    );
  });

  test("override brands get a clean display_name, not the raw filename", () => {
    const fuze = inferBrand("@mediagene 旗下品牌/FUZE_logo_fix.ai");
    expect(fuze.display_name).toBe("FUZE");
    expect(fuze.aliases).toEqual(["FUZE"]);

    const money = inferBrand(
      "@mediagene 旗下品牌/MONEY INSIDER Logo artboards_web(RGB).ai"
    );
    expect(money.display_name).toBe("MONEY INSIDER");
  });
});

describe("isSkippedPath", () => {
  test("skips the 舊版 container subfolder", () => {
    expect(isSkippedPath("@mediagene 旗下品牌/舊版/BI-PrimaryLogo-Black.png")).toBe(true);
  });

  test("skips any 封存 / @封存 segment", () => {
    expect(isSkippedPath("封存/@TNL MEDIA GROUP/x.ai")).toBe(true);
    expect(isSkippedPath("the-news-lens-關鍵評論網/封存/old.png")).toBe(true);
  });

  test("does not skip a real sub-brand", () => {
    expect(isSkippedPath("@mediagene 旗下品牌/GIZMODO/logo.png")).toBe(false);
  });
});
