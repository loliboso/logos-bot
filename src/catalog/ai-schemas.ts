export const BRAND_INFERENCE_SCHEMA = {
  type: "object" as const,
  properties: {
    brand_id: { type: "string" as const, description: "kebab-case unique brand identifier" },
    display_name: { type: "string" as const, description: "Human-readable brand name, mixed English and Chinese if applicable" },
    aliases: { type: "array" as const, items: { type: "string" as const }, description: "Alternative names users might use to find this brand" },
    brand_group: { type: ["string", "null"] as const, description: "Parent group if applicable" },
  },
  required: ["brand_id", "display_name", "aliases"] as const,
};

export const ASSET_INFERENCE_SCHEMA = {
  type: "object" as const,
  properties: {
    asset_type: { type: "string" as const, enum: ["logo", "mark", "icon", "avatar", "special"] },
    variant: { type: "string" as const, description: "e.g. logo, mark, wordmark, pfp" },
    language: { type: ["string", "null"] as const, enum: ["zh", "en", "ja", null] },
    color: { type: ["string", "null"] as const, description: "e.g. blue, black, white, primary" },
    background: { type: "string" as const, enum: ["transparent", "solid", "unknown"] },
    layout: { type: ["string", "null"] as const, enum: ["horizontal", "vertical", "square", null] },
    usage: { type: "array" as const, items: { type: "string" as const } },
    confidence: { type: "number" as const, minimum: 0, maximum: 1 },
    inferred_from: { type: "array" as const, items: { type: "string" as const } },
    review_status: { type: "string" as const, enum: ["accepted", "needs_review", "ignored"] },
    review_reason: { type: ["string", "null"] as const, description: "Taiwan Mandarin reason if needs_review" },
  },
  required: ["asset_type", "variant", "language", "color", "background", "layout", "usage", "confidence", "inferred_from", "review_status", "review_reason"] as const,
};
