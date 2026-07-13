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
    uploadFile: vi.fn(async () => true),
    maxOutputSize: 4000,
    ...overrides,
  };
}

describe("handleResolvedAsset — direct download (no custom size)", () => {
  it("uploads the original file bytes instead of returning a link", async () => {
    const ports = makePorts();
    const result: ResolvedAsset = {
      asset: makeAsset(),
      needsCustomSize: false,
      requestedWidth: null,
      requestedHeight: null,
    };

    await handleResolvedAsset(result, ports);

    // The original bytes are downloaded and uploaded to Slack, preserving the
    // source filename so employees without Drive access still get the file.
    expect(ports.downloadSource).toHaveBeenCalledWith("file-1");
    expect(ports.uploadFile).toHaveBeenCalledOnce();
    const [buffer, filename] = (ports.uploadFile as any).mock.calls[0];
    expect(buffer).toEqual(SVG_FIXTURE);
    expect(filename).toBe("logo-blue.svg");
    // No Drive link should be handed back.
    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).not.toContain("drive.google.com");
  });

  it("falls back to a DM notice when uploading is unavailable (ephemeral slash context)", async () => {
    const ports = makePorts({ uploadFile: vi.fn(async () => false) });
    const result: ResolvedAsset = {
      asset: makeAsset(),
      needsCustomSize: false,
      requestedWidth: null,
      requestedHeight: null,
    };

    await handleResolvedAsset(result, ports);

    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).toContain("私訊");
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
    expect(ports.uploadFile).toHaveBeenCalledOnce();

    // The uploaded buffer must be a real 500x500 PNG.
    const [buffer, filename] = (ports.uploadFile as any).mock.calls[0];
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
    expect(ports.uploadFile).not.toHaveBeenCalled();
    const responded = (ports.respond as any).mock.calls.map((c: any[]) => JSON.stringify(c[0])).join(" ");
    expect(responded).toContain("4000");
  });
});
