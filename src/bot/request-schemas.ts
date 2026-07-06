export const REQUEST_PARSE_SCHEMA = {
  type: "object" as const,
  properties: {
    brand: { type: ["string", "null"] as const, description: "Brand name or alias mentioned by user" },
    format: { type: ["string", "null"] as const, enum: ["svg", "png", "ai", null] },
    color: { type: ["string", "null"] as const, description: "Color variant: blue, black, white, primary, etc." },
    language: { type: ["string", "null"] as const, enum: ["zh", "en", "ja", null] },
    asset_type: { type: ["string", "null"] as const, enum: ["logo", "mark", "icon", null] },
    width: { type: ["integer", "null"] as const, description: "Requested width in pixels" },
    height: { type: ["integer", "null"] as const, description: "Requested height in pixels" },
  },
  required: ["brand", "format", "color", "language", "asset_type", "width", "height"],
};
