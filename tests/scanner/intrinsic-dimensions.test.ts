import { describe, it, expect } from "vitest";
import { extractIntrinsicDimensions } from "../../src/scanner/file-metadata";

describe("extractIntrinsicDimensions", () => {
  it("uses explicit width/height for SVG when present", () => {
    const svg = '<svg viewBox="0 0 300 100" width="300" height="100"></svg>';
    const dims = extractIntrinsicDimensions(Buffer.from(svg), "image/svg+xml");
    expect(dims).toEqual({ width: 300, height: 100 });
  });

  it("falls back to viewBox for SVG without explicit width/height", () => {
    const svg = '<svg viewBox="0 0 500 200"></svg>';
    const dims = extractIntrinsicDimensions(Buffer.from(svg), "image/svg+xml");
    expect(dims).toEqual({ width: 500, height: 200 });
  });

  it("rounds fractional SVG dimensions", () => {
    const svg = '<svg viewBox="0 0 300.6 100.4"></svg>';
    const dims = extractIntrinsicDimensions(Buffer.from(svg), "image/svg+xml");
    expect(dims).toEqual({ width: 301, height: 100 });
  });

  it("returns null for an SVG without viewBox or dimensions", () => {
    const svg = "<svg><rect/></svg>";
    expect(extractIntrinsicDimensions(Buffer.from(svg), "image/svg+xml")).toBeNull();
  });

  it("reads PNG dimensions from the header", () => {
    // Minimal PNG: 8-byte sig + IHDR with width=120, height=40
    const buf = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buf, 0);
    buf.writeUInt32BE(120, 16);
    buf.writeUInt32BE(40, 20);
    const dims = extractIntrinsicDimensions(buf, "image/png");
    expect(dims).toEqual({ width: 120, height: 40 });
  });

  it("returns null for an unsupported mime type", () => {
    expect(extractIntrinsicDimensions(Buffer.from("x"), "application/postscript")).toBeNull();
  });
});
