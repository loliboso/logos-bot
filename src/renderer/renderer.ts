import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";

export interface RenderRequest {
  source: Buffer | string;
  sourceFormat: "svg" | "png";
  width: number;
  height: number;
  background: "transparent" | string;
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

  const scale = Math.min(width / srcWidth, height / srcHeight);
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
