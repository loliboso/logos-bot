import { BrandConfigEntry } from "../config/brands-config";

export interface BrandSource {
  id: string;
  display_name: string;
  aliases: string[];
}

const CJK = /[一-鿿぀-ヿ]/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `alias` occurs in `text` at word boundaries (ASCII) or by
 *  containment (CJK, which has no word delimiters). Case-insensitive. */
function aliasMatches(text: string, alias: string): boolean {
  const t = text.toLowerCase();
  const a = alias.toLowerCase().trim();
  if (!a) return false;
  if (CJK.test(a)) return a.length >= 2 && t.includes(a);
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(a)}([^a-z0-9]|$)`, "i");
  return re.test(text);
}

export class BrandMatcher {
  private table: { id: string; aliases: string[] }[];

  constructor(brands: BrandSource[], config: Record<string, BrandConfigEntry>) {
    this.table = brands.map((b) => {
      const configAliases = config[b.id]?.aliases ?? [];
      const aliases = [...new Set([b.display_name, ...b.aliases, ...configAliases])];
      return { id: b.id, aliases };
    });
  }

  match(text: string): string[] {
    const hits = new Set<string>();
    for (const brand of this.table) {
      if (brand.aliases.some((a) => aliasMatches(text, a))) hits.add(brand.id);
    }
    return [...hits];
  }
}
