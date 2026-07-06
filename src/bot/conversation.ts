import { ParsedRequest } from "./request-parser";
import { BrandRecord, AssetRecord } from "../catalog/catalog-repo";

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
      step: "brand_select",
      startedAt: new Date().toISOString(),
    };
  }

  getNextQuestion(
    state: ConversationState,
    brands: BrandRecord[],
    assets: AssetRecord[]
  ): Question | null {
    if (!state.parsed.brand && !state.resolvedBrandId) {
      return null; // Cannot proceed without any brand hint
    }

    // Brand disambiguation
    if (!state.resolvedBrandId) {
      if (brands.length > 1) {
        return {
          text: "找到多個符合的品牌，請選擇：",
          field: "brand_id",
          options: brands.map((b) => ({ label: b.display_name, value: b.id })),
        };
      }
      if (brands.length === 1) {
        state.resolvedBrandId = brands[0].id;
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
            { label: "不確定", value: "any" },
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
        const colorLabels: Record<string, string> = {
          blue: "主色（藍）",
          black: "黑色",
          white: "白色",
          primary: "主色",
        };
        return {
          text: "要哪個版本？",
          field: "color",
          options: colors.map((c) => ({ label: colorLabels[c] || c, value: c })),
        };
      }
      if (colors.length === 1) {
        state.parsed.color = colors[0];
      }
    }

    // Size selection (only ask if no size provided and asset can be resized)
    if (state.parsed.width === null && state.parsed.height === null) {
      const resizableCount = assets.filter((a) => a.can_resize).length;
      if (resizableCount > 0) {
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
        if (value === "original") {
          next.parsed.width = null;
          next.parsed.height = null;
        } else if (value === "custom") {
          // Will need follow-up text input
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

  isComplete(state: ConversationState): boolean {
    return (
      state.resolvedBrandId !== null &&
      state.parsed.format !== null
    );
  }
}
