import { ParsedRequest } from "./request-parser";
import { BrandRecord, AssetRecord } from "../catalog/catalog-repo";
import { colorLabel, assetTypeLabel, languageLabel, layoutLabel } from "./labels";

/**
 * Narrow the brand's assets down to those still matching everything the user
 * has decided so far. Each guided question offers only values that exist in the
 * *remaining* set, so we never ask about (or auto-pick) a combination that has
 * no real file behind it. A null/undecided field imposes no constraint.
 */
function narrow(assets: AssetRecord[], p: ParsedRequest): AssetRecord[] {
  return assets.filter(
    (a) =>
      (!p.format || a.format === p.format) &&
      (!p.asset_type || a.asset_type === p.asset_type) &&
      (!p.language || a.language === p.language) &&
      (!p.layout || a.layout === p.layout) &&
      (!p.color || a.color === p.color)
  );
}

function distinct<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((v): v is T => v !== null && v !== undefined))];
}

export type ConversationStep =
  | "brand_select"
  | "format_select"
  | "type_select"
  | "language_select"
  | "layout_select"
  | "color_select"
  | "size_select"
  | "confirm"
  | "done";

export interface ConversationState {
  userId: string;
  channelId: string;
  parsed: ParsedRequest;
  resolvedBrandId: string | null;
  resolvedAssetId: string | null;
  awaitingCustomSize: boolean;
  /** Awaiting the free-text purpose reply (mandatory gate before delivery). */
  awaitingPurpose: boolean;
  /**
   * Whether the size question has been answered. Needed because "original size"
   * leaves width/height null — the same as "not yet asked" — so without this we
   * would re-ask the size question forever.
   */
  sizeResolved: boolean;
  /** Whether the background question has been answered (custom-size only). */
  backgroundResolved: boolean;
  /** Why the user needs this logo (URL encouraged). Null until answered. */
  purpose: string | null;
  /** A URL extracted from the purpose reply, if any. */
  purposeUrl: string | null;
  step: ConversationStep;
  startedAt: string;
}

/** Pull the first http(s) URL out of a free-text purpose reply, if present. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

export interface Question {
  text: string;
  field: string;
  options?: { label: string; value: string }[];
}

export class ConversationManager {
  startConversation(userId: string, channelId: string, parsed: ParsedRequest): ConversationState {
    return {
      userId,
      channelId,
      parsed,
      resolvedBrandId: null,
      resolvedAssetId: null,
      awaitingCustomSize: false,
      awaitingPurpose: false,
      sizeResolved: false,
      backgroundResolved: false,
      purpose: null,
      purposeUrl: null,
      step: "brand_select",
      startedAt: new Date().toISOString(),
    };
  }

  getNextQuestion(
    state: ConversationState,
    brands: BrandRecord[],
    assets: AssetRecord[]
  ): Question | null {
    if (state.awaitingCustomSize) {
      return {
        text: "請輸入自訂尺寸（例如 800x600）：",
        field: "custom_size",
      };
    }

    const candidates = state.parsed.brandCandidates ?? [];
    if (candidates.length === 0 && !state.resolvedBrandId) {
      return null; // Cannot proceed without any brand hint
    }

    // Brand disambiguation
    if (!state.resolvedBrandId) {
      if (candidates.length > 1) {
        return {
          text: "找到多個符合的品牌，請選擇：",
          field: "brand_id",
          options: brands.map((b) => ({ label: b.display_name, value: b.id })),
        };
      }
      if (candidates.length === 1) {
        state.resolvedBrandId = candidates[0];
      }
    }

    // Format selection. Output format is decoupled from what is stored: PNG is
    // a render target, so we can offer it whenever an SVG exists even if no PNG
    // was scanned. SVG / .ai are only offered when that source file exists.
    if (!state.parsed.format) {
      const stored = distinct(narrow(assets, state.parsed).map((a) => a.format));
      const options: { label: string; value: string }[] = [];
      if (stored.includes("svg")) options.push({ label: "向量 .svg", value: "svg" });
      if (stored.includes("svg") || stored.includes("png")) {
        options.push({ label: "圖片 .png", value: "png" });
      }
      // .ai is a brand-level source file (e.g. identity guidelines), usually
      // catalogued as asset_type='guideline' with null colour/language/layout —
      // so any logo-oriented constraint the user gave would narrow it away. Offer
      // it whenever the brand has ANY .ai at all, not just within the narrowed set.
      if (assets.some((a) => a.format === "ai")) options.push({ label: "原始檔 .ai", value: "ai" });
      if (options.length > 1) {
        return { text: "你想要哪種格式？", field: "format", options };
      }
      if (options.length === 1) {
        state.parsed.format = options[0].value;
      }
    }

    // Type selection (資訊豐富程度：完整 Logo vs 純品牌標記 mark …). asset_type
    // is never null, so auto-picking the sole value can't drop other assets.
    if (!state.parsed.asset_type) {
      const types = distinct(narrow(assets, state.parsed).map((a) => a.asset_type));
      if (types.length > 1) {
        return {
          text: "要哪一種類型？",
          field: "asset_type",
          options: types.map((t) => ({ label: assetTypeLabel(t), value: t })),
        };
      }
      if (types.length === 1) {
        state.parsed.asset_type = types[0];
      }
    }

    // Language selection (資訊豐富程度：中文 / 英文 / 日文). Only *ask* — never
    // auto-pick — because language-neutral assets (language=null, e.g. a mark)
    // coexist with language-specific ones; forcing a language would drop them.
    if (!state.parsed.language) {
      const langs = distinct(narrow(assets, state.parsed).map((a) => a.language));
      if (langs.length > 1) {
        return {
          text: "要哪個語言版本？",
          field: "language",
          options: langs.map((l) => ({ label: languageLabel(l), value: l })),
        };
      }
    }

    // Layout selection (形式：橫式 / 直式 / 正方形). Ask-only, same reasoning as
    // language — layout may be null (unknown) on some assets. This is the real
    // "which shape" question; size below is just a downstream render dimension.
    if (!state.parsed.layout) {
      const layouts = distinct(narrow(assets, state.parsed).map((a) => a.layout));
      if (layouts.length > 1) {
        return {
          text: "要哪一種形式？",
          field: "layout",
          options: layouts.map((l) => ({ label: layoutLabel(l), value: l })),
        };
      }
    }

    // Color selection
    if (!state.parsed.color) {
      const colors = distinct(narrow(assets, state.parsed).map((a) => a.color));
      if (colors.length > 1) {
        return {
          text: "要哪個顏色版本？",
          field: "color",
          options: colors.map((c) => ({ label: colorLabel(c), value: c })),
        };
      }
      if (colors.length === 1) {
        state.parsed.color = colors[0];
      }
    }

    // Size selection. Only meaningful for PNG output — that is the only format
    // we render to a pixel size. SVG is delivered as-is (vector scales freely)
    // and .ai cannot be rendered at all, so neither should be asked for a size.
    // sizeResolved distinguishes "chose original" (width/height also null) from
    // "not yet asked".
    if (
      state.parsed.format === "png" &&
      !state.sizeResolved &&
      state.parsed.width === null &&
      state.parsed.height === null
    ) {
      // Shape/orientation is chosen via the form question above, so size is
      // now just "keep original" vs "render to a custom pixel size".
      return {
        text: "需要指定尺寸嗎？",
        field: "size",
        options: [
          { label: "原始尺寸", value: "original" },
          { label: "自訂尺寸", value: "custom" },
        ],
      };
    }

    // Padding and background are only meaningful once a custom size is chosen —
    // they describe the render canvas. Original size returns the source
    // untouched. Ask padding right after size, per the two use cases: a
    // presentation wants the logo edge-to-edge (不留白), a social avatar wants
    // breathing room (留白). paddingRatio stays null until answered.
    const hasCustomSize = state.parsed.width !== null && state.parsed.height !== null;
    if (hasCustomSize && state.parsed.paddingRatio === null) {
      return {
        text: "要不要在四周留白？（大頭貼建議留白，簡報通常不留）",
        field: "padding",
        options: [
          { label: "不留白", value: "0" },
          { label: "留白（約 20%）", value: "0.2" },
        ],
      };
    }

    if (hasCustomSize && !state.backgroundResolved) {
      return {
        text: "要什麼底色？",
        field: "background",
        options: [
          { label: "透明", value: "transparent" },
          { label: "白底", value: "white" },
          { label: "黑底", value: "black" },
        ],
      };
    }

    // Mandatory usage gate — always the last step, so no logo is delivered
    // without recording why. Free text; a URL is encouraged. Setting
    // awaitingPurpose routes the user's next message to applyPurposeInput.
    if (state.purpose === null) {
      state.awaitingPurpose = true;
      return {
        text: "最後一步：這個 Logo 要用在哪裡？請簡述用途；若已有連結，直接貼上網址（例如貼文或網頁 URL）。",
        field: "purpose",
      };
    }

    return null;
  }

  applyPurposeInput(state: ConversationState, value: string): ConversationState | null {
    const purpose = value.trim();
    if (!purpose) return null; // empty reply is not a valid purpose — re-ask
    return {
      ...state,
      purpose,
      purposeUrl: extractUrl(purpose),
      awaitingPurpose: false,
    };
  }

  applyAnswer(state: ConversationState, field: string, value: string): ConversationState {
    const next = { ...state, parsed: { ...state.parsed } };

    switch (field) {
      case "brand_id":
        next.resolvedBrandId = value;
        break;
      case "format":
        next.parsed.format = value === "any" ? null : value;
        // .ai is delivered as the brand's source file, not a logo variant. Any
        // asset_type/colour/language/layout/size already set (by the user or the
        // parser — e.g. "logo") is about logos and would filter the .ai record
        // (typically a null-attribute 'guideline') down to nothing. Clear them so
        // the .ai path resolves at the brand level; the type step then re-derives
        // asset_type from the .ai files that actually exist.
        if (next.parsed.format === "ai") {
          next.parsed.asset_type = null;
          next.parsed.color = null;
          next.parsed.language = null;
          next.parsed.layout = null;
          next.parsed.width = null;
          next.parsed.height = null;
        }
        break;
      case "color":
        next.parsed.color = value;
        break;
      case "size":
        next.sizeResolved = true;
        if (value === "original") {
          next.parsed.width = null;
          next.parsed.height = null;
        } else if (value === "custom") {
          next.awaitingCustomSize = true;
          break;
        } else {
          const [w, h] = value.split("x").map(Number);
          next.parsed.width = w;
          next.parsed.height = h;
        }
        break;
      case "padding":
        next.parsed.paddingRatio = Number(value);
        break;
      case "background":
        next.parsed.background = value as "transparent" | "white" | "black";
        next.backgroundResolved = true;
        break;
      default:
        (next.parsed as any)[field] = value;
    }

    return next;
  }

  applyCustomSizeInput(state: ConversationState, value: string): ConversationState | null {
    const match = value.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!match) return null;

    const next = { ...state, parsed: { ...state.parsed } };
    next.parsed.width = Number(match[1]);
    next.parsed.height = Number(match[2]);
    next.awaitingCustomSize = false;
    return next;
  }

  isComplete(state: ConversationState): boolean {
    return (
      state.resolvedBrandId !== null &&
      state.parsed.format !== null &&
      state.purpose !== null
    );
  }
}
