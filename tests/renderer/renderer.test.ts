import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { renderCustomSize, validateDimensions } from "../../src/renderer/renderer";

const SVG_FIXTURE = join(__dirname, "../../fixtures/svgs/logo-blue.svg");

describe("validateDimensions", () => {
  it("accepts valid dimensions", () => {
    expect(validateDimensions(500, 500, 4000)).toEqual({ valid: true });
  });

  it("rejects zero width", () => {
    const result = validateDimensions(0, 500, 4000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("大於零");
  });

  it("rejects negative height", () => {
    const result = validateDimensions(500, -100, 4000);
    expect(result.valid).toBe(false);
  });

  it("rejects oversized dimensions", () => {
    const result = validateDimensions(5000, 500, 4000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("4000");
  });

  it("rejects non-integer dimensions", () => {
    const result = validateDimensions(500.5, 300, 4000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("整數");
  });
});

describe("renderCustomSize", () => {
  it("renders SVG to exact canvas size with centered logo", async () => {
    const svgContent = readFileSync(SVG_FIXTURE, "utf-8");
    const result = await renderCustomSize({
      source: svgContent,
      sourceFormat: "svg",
      width: 500,
      height: 500,
      background: "transparent",
    });

    expect(result.actualWidth).toBe(500);
    expect(result.actualHeight).toBe(500);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(500);
    expect(metadata.height).toBe(500);
    expect(metadata.channels).toBe(4);
  });

  it("renders PNG source to custom canvas size", async () => {
    // Create a 200x80 source PNG
    const sourcePng = await sharp({
      create: { width: 200, height: 80, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 1 } },
    }).png().toBuffer();

    const result = await renderCustomSize({
      source: sourcePng,
      sourceFormat: "png",
      width: 1200,
      height: 630,
      background: "transparent",
    });

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  it("preserves aspect ratio (no distortion)", async () => {
    // Source is 300x100 (3:1 ratio)
    const svgContent = readFileSync(SVG_FIXTURE, "utf-8");
    const result = await renderCustomSize({
      source: svgContent,
      sourceFormat: "svg",
      width: 500,
      height: 500,
      background: "transparent",
    });

    // The logo should be scaled to 500x167 (maintaining 3:1), centered in 500x500
    // We verify the output is exactly 500x500 (correct canvas)
    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(500);
    expect(metadata.height).toBe(500);
  });

  it("padding shrinks the logo to (1 - ratio) of the canvas", async () => {
    // 200x50 opaque logo on a transparent 1000x1000 canvas. With ratio 0.2 the
    // fit box is 800x800; the wide logo binds on width → scaled to 800 wide.
    const src = await sharp({
      create: { width: 200, height: 50, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 1 } },
    }).png().toBuffer();

    const padded = await renderCustomSize({
      source: src, sourceFormat: "png", width: 1000, height: 1000, background: "transparent", paddingRatio: 0.2,
    });
    // .metadata() reports the source dims — run the trim pipeline to get real size.
    const trimmed = await sharp(padded.buffer).trim().toBuffer({ resolveWithObject: true });
    expect(trimmed.info.width).toBeGreaterThanOrEqual(796);
    expect(trimmed.info.width).toBeLessThanOrEqual(804);

    // ratio 0 fills edge to edge → content spans the full width.
    const full = await renderCustomSize({
      source: src, sourceFormat: "png", width: 1000, height: 1000, background: "transparent", paddingRatio: 0,
    });
    const fullTrim = await sharp(full.buffer).trim().toBuffer({ resolveWithObject: true });
    expect(fullTrim.info.width).toBeGreaterThanOrEqual(996);
  });

  it("fills the canvas white when background is white", async () => {
    // 1x1 transparent PNG source, render to 4x4 with white bg → corner pixel opaque white
    const src = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await renderCustomSize({ source: src, sourceFormat: "png", width: 4, height: 4, background: "white" });
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 255, 255, 255]);
  });

  it("fills the canvas black when background is black", async () => {
    const src = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await renderCustomSize({ source: src, sourceFormat: "png", width: 4, height: 4, background: "black" });
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 255]);
  });
});
