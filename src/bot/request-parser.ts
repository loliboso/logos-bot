import { REQUEST_PARSE_SCHEMA } from "./request-schemas";
import { AiProvider } from "../ai/provider";

export interface ParsedRequest {
  brand: string | null;
  format: string | null;
  color: string | null;
  language: string | null;
  asset_type: string | null;
  width: number | null;
  height: number | null;
  raw_text: string;
}

export class RequestParser {
  constructor(private provider: AiProvider) {}

  async parseUserRequest(text: string): Promise<ParsedRequest> {
    const prompt = `Parse this logo request from a company employee. Extract structured fields.

Common brand aliases:
- TNL, The News Lens, 關鍵評論網 → brand "The News Lens 關鍵評論網"
- TNL Mediagene → brand "TNL Mediagene"

Color mappings:
- 藍色, blue, primary → "blue"
- 黑色, black → "black"
- 白色, white → "white"

Format mappings:
- SVG, svg → "svg"
- PNG, png → "png"
- AI, ai, 原始檔 → "ai"

Language indicators:
- 英文, English, en → "en"
- 中文, Chinese, zh → "zh"
- 日文, Japanese, ja → "ja"

Dimension patterns:
- "500x500" → width: 500, height: 500
- "1200x630" → width: 1200, height: 630

User request: "${text}"`;

    const parsed = await this.provider.generateStructured({
      prompt,
      toolName: "parse_logo_request",
      toolDescription: "Parse structured fields from a logo request",
      schema: REQUEST_PARSE_SCHEMA,
      maxTokens: 512,
    });

    if (!parsed) {
      return { brand: null, format: null, color: null, language: null, asset_type: null, width: null, height: null, raw_text: text };
    }

    return { ...parsed, raw_text: text } as ParsedRequest;
  }
}
