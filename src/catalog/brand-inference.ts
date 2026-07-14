/**
 * Derive a brand identity from a file's full source path (the `source_path`
 * stored in the catalog, e.g. `@mediagene 旗下品牌/GIZMODO/logo.png`).
 *
 * Pure string logic — no AI, no I/O — so both the scanner and the one-off
 * migration can share it. The scanner joins parentPath + fileName; the
 * migration passes the stored source_path verbatim.
 */
export interface InferredBrand {
  brand_id: string;
  display_name: string;
  aliases: string[];
}

/**
 * Group container folders that hold multiple distinct sub-brands rather than
 * one brand's assets. For these, the brand is one level deeper. Hardcoded
 * (matches the project's "keywords in code" philosophy); matched case-insensitively.
 */
const CONTAINER_FOLDERS = ["@mediagene 旗下品牌"];

/**
 * Folder-name segments whose contents are archived / superseded, not live
 * brand assets. Any path containing one of these segments is skipped entirely
 * (not scanned, not catalogued). Matched case-insensitively per segment.
 */
const SKIP_SEGMENTS = ["封存", "@封存", "舊版"];

/**
 * Loose single-file brands sitting directly in a container get their id from
 * the filename, which is noisy (`FUZE_logo_fix.ai`) and can split one brand
 * across two files. This table pins the human-approved id per filename.
 */
const LOOSE_FILE_OVERRIDES: Record<string, { id: string; display: string }> = {
  "FUZE_logo_fix.ai": { id: "fuze", display: "FUZE" },
  "MONEY INSIDER Logo artboards_web(RGB).ai": { id: "money-insider", display: "MONEY INSIDER" },
  "GIZ-YATAI_logo.ai": { id: "giz-yatai", display: "GIZ-YATAI" },
  "GIZ-YATAI_logo-ギズ屋台.ai": { id: "giz-yatai", display: "GIZ-YATAI" },
  "ROOMIE-kitchen_0411_out.ai": { id: "roomie-kitchen", display: "ROOMIE-kitchen" },
  "modern-retail_logo.ai": { id: "modern-retail", display: "modern-retail" },
};

/** True if any path segment marks archived / old content that must be skipped. */
export function isSkippedPath(sourcePath: string): boolean {
  const segments = sourcePath.split("/");
  return segments.some((seg) =>
    SKIP_SEGMENTS.some((skip) => skip.toLowerCase() === seg.toLowerCase())
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function inferBrand(sourcePath: string): InferredBrand {
  const parts = sourcePath.split("/");
  const top = parts[0] || "unknown";

  const isContainer = CONTAINER_FOLDERS.some(
    (c) => c.toLowerCase() === top.toLowerCase()
  );

  if (isContainer && parts.length === 2) {
    // Container + loose root file. Prefer the human-approved id; the display
    // name still comes from the (stripped) filename for readability.
    const fileName = parts[1];
    const stripped = stripExtension(fileName);
    const override = LOOSE_FILE_OVERRIDES[fileName];
    const displayName = override?.display ?? stripped;
    return {
      brand_id: override?.id ?? slugify(stripped),
      display_name: displayName,
      aliases: [displayName],
    };
  }

  // Container + sub-brand folder → the sub-brand folder; otherwise the top folder.
  const brandName = isContainer && parts.length > 2 ? parts[1] : top;
  return {
    brand_id: slugify(brandName),
    display_name: brandName,
    aliases: [brandName],
  };
}
