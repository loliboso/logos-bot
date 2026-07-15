import { CatalogRepo, AssetRecord } from "../catalog/catalog-repo";
import { ConversationState } from "./conversation";

export interface ResolvedAsset {
  asset: AssetRecord;
  needsCustomSize: boolean;
  requestedWidth: number | null;
  requestedHeight: number | null;
  background: "transparent" | "white" | "black" | null;
  paddingRatio: number | null;
}

export class AssetResolver {
  constructor(private repo: CatalogRepo) {}

  resolve(state: ConversationState): ResolvedAsset | null {
    if (!state.resolvedBrandId) return null;
    const p = state.parsed;

    // Match on attributes only — NOT format. We pick the render source ourselves
    // so a PNG request can be produced from the SVG (the canonical source).
    const query: Record<string, string> = { brand_id: state.resolvedBrandId };
    if (p.color) query.color = p.color;
    if (p.language) query.language = p.language;
    if (p.asset_type) query.asset_type = p.asset_type;
    if (p.layout) query.layout = p.layout;

    const assets = this.repo.findAssets(query);
    if (assets.length === 0) return null;

    const svg = assets.find((a) => a.format === "svg") ?? null;
    const png = this.largestPng(assets);
    const wantsCustomSize = p.width !== null && p.height !== null;
    const base = { background: p.background, paddingRatio: p.paddingRatio };

    // Explicit vector-file request → hand over the SVG untouched (size is moot
    // for a vector). Falls through to the raster path if no SVG exists.
    if (p.format === "svg" && svg) return this.direct(svg, base);

    // Explicit .ai request → hand over the source file (cannot be rendered).
    if (p.format === "ai") {
      const ai = assets.find((a) => a.format === "ai");
      if (ai) return this.direct(ai, base);
    }

    // Otherwise the deliverable is a raster PNG. Render from the SVG whenever
    // one exists, so we never depend on a stored PNG. Fall back to a stored PNG,
    // then to whatever remains (.ai) as a direct download.
    if (svg) {
      const w = wantsCustomSize ? p.width! : svg.intrinsic_width;
      const h = wantsCustomSize ? p.height! : svg.intrinsic_height;
      // No custom size and the SVG has no intrinsic dimensions → can't size a
      // canvas, so hand over the SVG file itself rather than fail.
      if (w && h) return this.render(svg, w, h, base);
      return this.direct(svg, base);
    }
    if (png) {
      // Fallback: no SVG. Render the PNG for a custom size, else deliver as-is.
      return wantsCustomSize ? this.render(png, p.width!, p.height!, base) : this.direct(png, base);
    }
    // Only non-renderable formats (e.g. .ai) remain.
    return this.direct(assets[0], base);
  }

  private largestPng(assets: AssetRecord[]): AssetRecord | null {
    const pngs = assets
      .filter((a) => a.format === "png")
      .sort((a, b) => (b.intrinsic_width || 0) - (a.intrinsic_width || 0));
    return pngs[0] ?? null;
  }

  private direct(
    asset: AssetRecord,
    base: { background: ResolvedAsset["background"]; paddingRatio: number | null }
  ): ResolvedAsset {
    return { asset, needsCustomSize: false, requestedWidth: null, requestedHeight: null, ...base };
  }

  private render(
    asset: AssetRecord,
    width: number,
    height: number,
    base: { background: ResolvedAsset["background"]; paddingRatio: number | null }
  ): ResolvedAsset {
    return { asset, needsCustomSize: true, requestedWidth: width, requestedHeight: height, ...base };
  }
}
