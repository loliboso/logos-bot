import { BrandMatcher } from "./brand-matcher";
import { parseFields } from "./rule-parser";

export interface ParsedRequest {
  brand: string | null;
  brandCandidates: string[];
  format: string | null;
  color: string | null;
  language: string | null;
  asset_type: string | null;
  layout: string | null;
  width: number | null;
  height: number | null;
  background: "transparent" | "white" | "black" | null;
  /** Margin ratio for custom-size renders. null = not decided yet. */
  paddingRatio: number | null;
  raw_text: string;
}

/**
 * Parses a logo request entirely with local rules — brand alias matching plus
 * keyword/size extraction. No AI calls (that was the ~20s bottleneck). The AI
 * provider layer remains for the scan-time catalog builder.
 */
export class RequestParser {
  constructor(private matcher: BrandMatcher) {}

  parseUserRequest(text: string): ParsedRequest {
    const candidates = this.matcher.match(text);
    const fields = parseFields(text);
    return {
      brand: candidates.length === 1 ? candidates[0] : null,
      brandCandidates: candidates,
      ...fields,
      raw_text: text,
    };
  }
}
