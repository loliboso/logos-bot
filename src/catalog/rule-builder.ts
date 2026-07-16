import { ScannedFile } from "../scanner/scanner";
import { SvgDimensions, PngDimensions } from "../scanner/file-metadata";
import { AiInferredMetadata, MetadataBuilder, applyFilenameShapeRules } from "./ai-builder";
import { inferBrand } from "./brand-inference";
import { parseFields } from "../bot/rule-parser";

/**
 * Deterministic, zero-AI metadata builder. Infers brand from the path
 * (inferBrand) and colour / language / type / layout from the filename using
 * the same keyword tables the request parser uses (parseFields). No network, no
 * tokens, fully repeatable — a scan is now seconds instead of an hour.
 *
 * A filename with no recognisable signal is defaulted to a logo and flagged
 * needs_review, so nothing is silently mis-classified — the same safety net the
 * AI builder gave via low-confidence review, just rule-driven.
 */
export class RuleBuilder implements MetadataBuilder {
  async buildAssetMetadata(
    file: ScannedFile,
    _dimensions: SvgDimensions | PngDimensions | null
  ): Promise<AiInferredMetadata> {
    if (file.folderSemantics === "archive") {
      return this.ignored(file, "檔案位於封存資料夾中，不列入一般 Logo 目錄。", "logo");
    }
    if (file.folderSemantics === "campaign") {
      return this.ignored(file, "檔案位於活動資料夾中，非一般品牌 Logo。", "special", "campaign");
    }

    const brand = inferBrand(`${file.parentPath}/${file.name}`);

    // Parse attributes from the filename base only (folder names like svg/png
    // would add noise). parseFields also returns format/size/background, which
    // are irrelevant here — the scanner derives format from the mime type.
    // Underscores are treated as separators: the keyword tables match on word
    // boundaries, but "_" is a word char, so costory_logo_black wouldn't match
    // logo/black until the underscores become spaces.
    const base = file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
    const parsed = parseFields(base);

    const assetType = parsed.asset_type ?? "logo";
    // "Signal" = anything we actually recognised. If none, the classification is
    // a guess, so flag it for a human rather than trusting the logo default.
    const recognised = [parsed.asset_type, parsed.color, parsed.language, parsed.layout].filter(Boolean);
    const confident = recognised.length > 0;

    const metadata: AiInferredMetadata = {
      brand_id: brand.brand_id,
      display_name: brand.display_name,
      aliases: brand.aliases,
      asset_type: assetType,
      variant: assetType,
      language: parsed.language,
      color: parsed.color,
      background: "transparent",
      layout: parsed.layout,
      usage: ["general"],
      confidence: confident ? 0.9 : 0.5,
      inferred_from: ["filename_rules"],
      review_status: confident ? "accepted" : "needs_review",
      review_reason: confident
        ? null
        : "檔名未包含可辨識的顏色／類型／語言／形式關鍵字，已預設為 logo，請人工確認分類。",
    };

    return applyFilenameShapeRules(file.name, metadata);
  }

  private ignored(
    file: ScannedFile,
    reason: string,
    assetType: string,
    variant = "unknown"
  ): AiInferredMetadata {
    const brand = inferBrand(`${file.parentPath}/${file.name}`);
    return {
      ...brand,
      asset_type: assetType,
      variant,
      language: null,
      color: null,
      background: "unknown",
      layout: null,
      usage: [],
      confidence: 1.0,
      inferred_from: ["folder_semantics"],
      review_status: "ignored",
      review_reason: reason,
    };
  }
}
