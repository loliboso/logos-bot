export interface SvgDimensions {
  viewBoxWidth: number;
  viewBoxHeight: number;
  width: number | null;
  height: number | null;
}

export interface PngDimensions {
  width: number;
  height: number;
}

export function extractSvgDimensions(svgContent: string): SvgDimensions | null {
  const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
  if (!viewBoxMatch) return null;

  const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN)) return null;

  const [, , viewBoxWidth, viewBoxHeight] = parts;

  const widthMatch = svgContent.match(/\bwidth=["']([^"']+)["']/);
  const heightMatch = svgContent.match(/\bheight=["']([^"']+)["']/);

  const width = widthMatch ? parseFloat(widthMatch[1]) : null;
  const height = heightMatch ? parseFloat(heightMatch[1]) : null;

  return {
    viewBoxWidth,
    viewBoxHeight,
    width: width && !isNaN(width) ? width : null,
    height: height && !isNaN(height) ? height : null,
  };
}

/**
 * Normalize a downloaded file's content into intrinsic pixel dimensions,
 * dispatching on MIME type. Returns null for unsupported formats (e.g. AI/EPS)
 * or when dimensions can't be determined.
 */
export function extractIntrinsicDimensions(
  buffer: Buffer,
  mimeType: string
): PngDimensions | null {
  if (mimeType === "image/svg+xml") {
    const svg = extractSvgDimensions(buffer.toString("utf-8"));
    if (!svg) return null;
    // Prefer explicit width/height; fall back to the viewBox extents.
    const width = svg.width ?? svg.viewBoxWidth;
    const height = svg.height ?? svg.viewBoxHeight;
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (mimeType === "image/png") {
    return extractPngDimensions(buffer);
  }
  return null;
}

export function extractPngDimensions(buffer: Buffer): PngDimensions | null {
  // PNG header: 8 bytes signature, then IHDR chunk
  // IHDR starts at byte 8: 4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height
  if (buffer.length < 24) return null;

  const signature = buffer.slice(0, 8);
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(pngSig)) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width === 0 || height === 0) return null;
  return { width, height };
}
