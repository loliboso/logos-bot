import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";

export interface RenderRequest {
  source: Buffer | string;
  sourceFormat: "svg" | "png";
  width: number;
  height: number;
  background: "transparent" | string;
  /**
   * Fraction of the output reserved as margin around the logo (0–0.9). The logo
   * is fit inside a box shrunk by this ratio, then centred, so the surrounding
   * space is the padding. 0 (default) means the logo fills the canvas edge to
   * edge — the "去留白" case, which relies on the source SVG already being tight.
   */
  paddingRatio?: number;
}

export interface RenderResult {
  buffer: Buffer;
  actualWidth: number;
  actualHeight: number;
}

export function validateDimensions(
  width: number,
  height: number,
  maxSize: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return { valid: false, error: "尺寸必須為整數。" };
  }
  if (width <= 0 || height <= 0) {
    return { valid: false, error: "尺寸必須大於零。" };
  }
  if (width > maxSize || height > maxSize) {
    return { valid: false, error: `尺寸不可超過 ${maxSize}x${maxSize}。` };
  }
  return { valid: true };
}

export async function renderCustomSize(request: RenderRequest): Promise<RenderResult> {
  const { source, sourceFormat, width, height, background } = request;

  let sourceBuffer: Buffer;

  if (sourceFormat === "svg") {
    const svgString = typeof source === "string" ? source : source.toString("utf-8");
    const resvg = new Resvg(svgString, {
      fitTo: { mode: "width", value: width * 2 },
    });
    const rendered = resvg.render();
    sourceBuffer = Buffer.from(rendered.asPng());
  } else {
    sourceBuffer = source as Buffer;
  }

  const metadata = await sharp(sourceBuffer).metadata();
  const srcWidth = metadata.width!;
  const srcHeight = metadata.height!;

  // Shrink the fit box by the padding ratio so the logo occupies (1-ratio) of
  // the canvas, leaving equal margin on all sides. Using both dimensions keeps
  // tall logos from overflowing while matching the width-based intent for wide
  // ones. ratio 0 → availW/availH == width/height, i.e. the old edge-to-edge fit.
  const p = Math.min(Math.max(request.paddingRatio ?? 0, 0), 0.9);
  const availWidth = width * (1 - p);
  const availHeight = height * (1 - p);

  const scale = Math.min(availWidth / srcWidth, availHeight / srcHeight);
  const scaledWidth = Math.round(srcWidth * scale);
  const scaledHeight = Math.round(srcHeight * scale);

  const resized = await sharp(sourceBuffer)
    .resize(scaledWidth, scaledHeight, { fit: "inside" })
    .toBuffer();

  const isTransparent = background === "transparent";
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: isTransparent
        ? { r: 0, g: 0, b: 0, alpha: 0 }
        : background === "black"
        ? { r: 0, g: 0, b: 0, alpha: 1 }
        : { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const left = Math.round((width - scaledWidth) / 2);
  const top = Math.round((height - scaledHeight) / 2);

  const output = await canvas
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();

  return { buffer: output, actualWidth: width, actualHeight: height };
}
