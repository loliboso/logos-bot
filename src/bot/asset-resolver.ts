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

    const query: Record<string, string> = { brand_id: state.resolvedBrandId };
    if (state.parsed.format) query.format = state.parsed.format;
    if (state.parsed.color) query.color = state.parsed.color;
    if (state.parsed.language) query.language = state.parsed.language;
    if (state.parsed.asset_type) query.asset_type = state.parsed.asset_type;
    if (state.parsed.layout) query.layout = state.parsed.layout;

    const assets = this.repo.findAssets(query);
    if (assets.length === 0) return null;

    const wantsCustomSize = state.parsed.width !== null && state.parsed.height !== null;
    const best = this.selectBestSource(assets, wantsCustomSize);
    if (!best) return null;

    // .ai cannot be rendered; treat it as direct download even if custom size was requested
    const needsCustomSize = wantsCustomSize && best.format !== "ai";

    return {
      asset: best,
      needsCustomSize,
      requestedWidth: state.parsed.width,
      requestedHeight: state.parsed.height,
      background: state.parsed.background,
      paddingRatio: state.parsed.paddingRatio,
    };
  }

  selectBestSource(assets: AssetRecord[], wantsCustomSize: boolean): AssetRecord | null {
    if (assets.length === 0) return null;

    if (wantsCustomSize) {
      // Prefer SVG for custom rendering
      const svgs = assets.filter((a) => a.format === "svg");
      if (svgs.length > 0) return svgs[0];
      // Fallback: largest PNG
      const pngs = assets.filter((a) => a.format === "png");
      pngs.sort((a, b) => (b.intrinsic_width || 0) - (a.intrinsic_width || 0));
      if (pngs.length > 0) return pngs[0];
      // Final fallback: .ai (cannot be rendered, so delivery sends original file)
      const ais = assets.filter((a) => a.format === "ai");
      return ais[0] || null;
    }

    // For direct download, prefer exact format match
    return assets[0];
  }
}
