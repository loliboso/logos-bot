import { ParsedRequest } from "./request-parser";
import { BrandRecord, AssetRecord } from "../catalog/catalog-repo";
import { colorLabel } from "./labels";

export type ConversationStep =
  | "brand_select"
  | "format_select"
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
  /**
   * Whether the size question has been answered. Needed because "original size"
   * leaves width/height null — the same as "not yet asked" — so without this we
   * would re-ask the size question forever.
   */
  sizeResolved: boolean;
  step: ConversationStep;
  startedAt: string;
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
      sizeResolved: false,
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

    // Format selection
    if (!state.parsed.format) {
      const formats = [...new Set(assets.map((a) => a.format))];
      if (formats.length > 1) {
        return {
          text: "你想要哪種格式？",
          field: "format",
          options: [
            ...formats.map((f) => ({ label: f.toUpperCase(), value: f })),
          ],
        };
      }
      if (formats.length === 1) {
        state.parsed.format = formats[0];
      }
    }

    // Color selection
    if (!state.parsed.color) {
      const colors = [...new Set(assets.filter((a) => a.color).map((a) => a.color!))];
      if (colors.length > 1) {
        return {
          text: "要哪個版本？",
          field: "color",
          options: colors.map((c) => ({ label: colorLabel(c), value: c })),
        };
      }
      if (colors.length === 1) {
        state.parsed.color = colors[0];
      }
    }

    // Size selection (only ask if no size provided, not already answered, and
    // asset can be resized). sizeResolved distinguishes "chose original" (also
    // width/height null) from "not yet asked".
    if (!state.sizeResolved && state.parsed.width === null && state.parsed.height === null) {
      // Any raster/vector source can be rendered to a custom size (renderer
      // handles both svg and png). .ai cannot be rendered, so it doesn't count.
      const renderableCount = assets.filter(
        (a) => a.format === "svg" || a.format === "png"
      ).length;
      if (renderableCount > 0) {
        return {
          text: "需要指定尺寸嗎？",
          field: "size",
          options: [
            { label: "原始尺寸", value: "original" },
            { label: "500x500", value: "500x500" },
            { label: "1200x630", value: "1200x630" },
            { label: "自訂尺寸", value: "custom" },
          ],
        };
      }
    }

    return null;
  }

  applyAnswer(state: ConversationState, field: string, value: string): ConversationState {
    const next = { ...state, parsed: { ...state.parsed } };

    switch (field) {
      case "brand_id":
        next.resolvedBrandId = value;
        break;
      case "format":
        next.parsed.format = value === "any" ? null : value;
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
      state.parsed.format !== null
    );
  }
}
