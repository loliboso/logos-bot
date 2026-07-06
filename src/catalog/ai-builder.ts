import Anthropic from "@anthropic-ai/sdk";
import { ScannedFile } from "../scanner/scanner";
import { SvgDimensions, PngDimensions } from "../scanner/file-metadata";
import { ASSET_INFERENCE_SCHEMA } from "./ai-schemas";

export interface AiInferredMetadata {
  brand_id: string;
  display_name: string;
  aliases: string[];
  asset_type: string;
  variant: string;
  language: string | null;
  color: string | null;
  background: string;
  layout: string | null;
  usage: string[];
  confidence: number;
  inferred_from: string[];
  review_status: "accepted" | "needs_review" | "ignored";
  review_reason: string | null;
}

// Current, valid Claude model id (the source plan referenced a stale id).
const AI_MODEL = "claude-sonnet-5";

const NAMING_RULES = `
Naming inference rules for logo files:
- "logo": full logo with wordmark or text
- "mark": brand mark, icon, or compact symbol
- "en": English version
- "blue" or "primary": primary brand color
- "blk" or "b" suffix: black
- "white" or "w" suffix: white
- "pfp": profile picture or social avatar — mark as needs_review unless clearly configured
- "plus": possible sub-brand or product line — mark as needs_review
- Folder "封存" or "@封存": archived — mark as ignored
- Campaign folders (e.g. "十週年CI"): not general logo assets — mark as ignored

When review_reason is needed, write it in Taiwan Mandarin (繁體中文).
`;

export class AiBuilder {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async buildAssetMetadata(
    file: ScannedFile,
    dimensions: SvgDimensions | PngDimensions | null
  ): Promise<AiInferredMetadata> {
    if (file.folderSemantics === "archive") {
      return this.archivedResult(file);
    }
    if (file.folderSemantics === "campaign") {
      return this.campaignResult(file);
    }

    const brandInfo = this.inferBrandFromPath(file.parentPath);

    const prompt = `Analyze this logo file and infer metadata.

File name: ${file.name}
Parent path: ${file.parentPath}
MIME type: ${file.mimeType}
Dimensions: ${dimensions ? JSON.stringify(dimensions) : "unknown"}

${NAMING_RULES}

Return structured metadata for this asset. Confidence should reflect how certain you are about ALL inferred fields combined.
If confidence < 0.7, set review_status to "needs_review" and provide review_reason in Taiwan Mandarin.
If confidence >= 0.7, set review_status to "accepted".`;

    const response = await this.client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: "record_asset_metadata",
          description: "Record inferred metadata for a logo asset",
          input_schema: ASSET_INFERENCE_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_asset_metadata" },
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("AI did not return structured metadata");
    }

    const inferred = toolBlock.input as any;

    return {
      brand_id: brandInfo.brand_id,
      display_name: brandInfo.display_name,
      aliases: brandInfo.aliases,
      ...inferred,
    };
  }

  inferBrandFromPath(parentPath: string): { brand_id: string; display_name: string; aliases: string[] } {
    const parts = parentPath.split("/");
    const brandFolder = parts[0] || "unknown";

    const id = brandFolder
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      brand_id: id,
      display_name: brandFolder,
      aliases: [brandFolder],
    };
  }

  private archivedResult(file: ScannedFile): AiInferredMetadata {
    const brand = this.inferBrandFromPath(file.parentPath);
    return {
      ...brand,
      asset_type: "logo",
      variant: "unknown",
      language: null,
      color: null,
      background: "unknown",
      layout: null,
      usage: [],
      confidence: 1.0,
      inferred_from: ["folder_semantics"],
      review_status: "ignored",
      review_reason: "檔案位於封存資料夾中，不列入一般 Logo 目錄。",
    };
  }

  private campaignResult(file: ScannedFile): AiInferredMetadata {
    const brand = this.inferBrandFromPath(file.parentPath);
    return {
      ...brand,
      asset_type: "special",
      variant: "campaign",
      language: null,
      color: null,
      background: "unknown",
      layout: null,
      usage: [],
      confidence: 1.0,
      inferred_from: ["folder_semantics"],
      review_status: "ignored",
      review_reason: "檔案位於活動資料夾中，非一般品牌 Logo。",
    };
  }
}
