import { describe, it, expect, vi } from "vitest";
import { handleResolvedAsset, DeliveryPorts } from "../../src/bot/delivery";
import { ResolvedAsset } from "../../src/bot/asset-resolver";
import { AssetRecord } from "../../src/catalog/catalog-repo";
import { readFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const SVG_FIXTURE = readFileSync(join(__dirname, "../../fixtures/svgs/logo-blue.svg"));

function makeAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "tnl-logo-blue-svg",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "svg",
    color: "blue",
    background: "transparent",
    layout: "horizontal",
    usage: ["general"],
    source_drive_file_id: "file-1",
    source_path: "The News Lens 關鍵評論網/SVG/logo-blue.svg",
    intrinsic_width: 300,
    intrinsic_height: 100,
    can_resize: true,
    status: "active",
    confidence: 0.9,
    inferred_from: [],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: null,
    ...overrides,
  };
}

function makePorts(overrides: Partial<DeliveryPorts> = {}): DeliveryPorts {
  return {
    respond: vi.fn(async () => {}),
    downloadSource: vi.fn(async () => SVG_FIXTURE),
    getLink: vi.fn(async () => "https://drive.google.com/file/d/file-1/view"),
    uploadPng: vi.fn(async () => {}),
    maxOutputSize: 4000,
    ...overrides,
  };
}

describe("handleResolvedAsset — direct download (no custom size)", () => {
  it("responds with the Drive link and does not upload", async () => {
    const ports = makePorts();
    const result: ResolvedAsset = {
      asset: makeAsset(),
      needsCustomSize: false,
      requestedWidth: null,
      requestedHeight: null,
    };

    await handleResolvedAsset(result, ports);

    expect(ports.getLink).toHaveBeenCalledWith("file-1");
    expect(ports.uploadPng).not.toHaveBeenCalled();
    // The Drive link should appear in one of the responses.
    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).toContain("drive.google.com");
  });

  it("emits a white-logo warning for white transparent assets", async () => {
    const ports = makePorts();
    const result: ResolvedAsset = {
      asset: makeAsset({ color: "white", background: "transparent" }),
      needsCustomSize: false,
      requestedWidth: null,
      requestedHeight: null,
    };

    await handleResolvedAsset(result, ports);

    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).toContain("白色透明");
  });
});

describe("handleResolvedAsset — custom size", () => {
  it("downloads the source, renders, and uploads a valid PNG", async () => {
    const ports = makePorts();
    const result: ResolvedAsset = {
      asset: makeAsset(),
      needsCustomSize: true,
      requestedWidth: 500,
      requestedHeight: 500,
    };

    await handleResolvedAsset(result, ports);

    expect(ports.downloadSource).toHaveBeenCalledWith("file-1");
    expect(ports.uploadPng).toHaveBeenCalledOnce();

    // The uploaded buffer must be a real 500x500 PNG.
    const [buffer, filename] = (ports.uploadPng as any).mock.calls[0];
    const meta = await sharp(buffer as Buffer).metadata();
    expect(meta.width).toBe(500);
    expect(meta.height).toBe(500);
    expect(filename).toContain(".png");
  });

  it("rejects oversized dimensions without downloading or uploading", async () => {
    const ports = makePorts();
    const result: ResolvedAsset = {
      asset: makeAsset(),
      needsCustomSize: true,
      requestedWidth: 9000,
      requestedHeight: 9000,
    };

    await handleResolvedAsset(result, ports);

    expect(ports.downloadSource).not.toHaveBeenCalled();
    expect(ports.uploadPng).not.toHaveBeenCalled();
    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).toContain("4000");
  });
});
