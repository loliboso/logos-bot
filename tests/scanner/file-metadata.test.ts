import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import sharp from "sharp";
import { extractSvgDimensions, extractPngDimensions } from "../../src/scanner/file-metadata";

const SVG_FIXTURE = join(__dirname, "../../fixtures/svgs/logo-blue.svg");
const PNG_FIXTURE = join(__dirname, "../../fixtures/pngs/tnl-primary.png");

beforeAll(async () => {
  if (!existsSync(PNG_FIXTURE)) {
    mkdirSync(join(__dirname, "../../fixtures/pngs"), { recursive: true });
    const buf = await sharp({
      create: { width: 200, height: 80, channels: 4, background: { r: 0, g: 102, b: 204, alpha: 1 } },
    }).png().toBuffer();
    writeFileSync(PNG_FIXTURE, buf);
  }
});

describe("extractSvgDimensions", () => {
  it("extracts viewBox and explicit dimensions", () => {
    const svg = readFileSync(SVG_FIXTURE, "utf-8");
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({
      viewBoxWidth: 300,
      viewBoxHeight: 100,
      width: 300,
      height: 100,
    });
  });

  it("handles SVG with viewBox but no width/height", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 200"><rect/></svg>';
    const dims = extractSvgDimensions(svg);
    expect(dims).toEqual({
      viewBoxWidth: 500,
      viewBoxHeight: 200,
      width: null,
      height: null,
    });
  });

  it("returns null for SVG without viewBox", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    expect(extractSvgDimensions(svg)).toBeNull();
  });
});

describe("extractPngDimensions", () => {
  it("extracts width and height from PNG header", () => {
    const buffer = readFileSync(PNG_FIXTURE);
    const dims = extractPngDimensions(buffer);
    expect(dims).toEqual({ width: 200, height: 80 });
  });

  it("returns null for non-PNG buffer", () => {
    const buffer = Buffer.from("not a png file");
    expect(extractPngDimensions(buffer)).toBeNull();
  });

  it("returns null for buffer too short", () => {
    const buffer = Buffer.alloc(10);
    expect(extractPngDimensions(buffer)).toBeNull();
  });
});
