import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface BrandConfigEntry {
  aliases: string[];
  notes: string;
}

const DEFAULT_PATH = join(process.cwd(), "config", "brands.json");

export function loadBrandConfig(
  path: string = DEFAULT_PATH
): Record<string, BrandConfigEntry> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Keep brands.json's keys aligned with the live brand ids. Adds an empty entry
 * for every active brand id missing from the file (so there is always a slot to
 * fill in aliases), and reports keys that no longer match any brand (e.g. after
 * a folder rename). Stale keys are NOT deleted — they may hold hand-written
 * aliases that only a human can migrate to the renamed brand — just reported.
 */
export function syncBrandConfig(
  activeBrandIds: string[],
  path: string = DEFAULT_PATH
): { added: string[]; stale: string[] } {
  let config: Record<string, BrandConfigEntry> = {};
  try {
    config = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    /* no file yet — start from empty */
  }

  const added: string[] = [];
  for (const id of activeBrandIds) {
    if (!config[id]) {
      config[id] = { aliases: [], notes: "" };
      added.push(id);
    }
  }
  const activeSet = new Set(activeBrandIds);
  const stale = Object.keys(config).filter((k) => !activeSet.has(k));

  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return { added, stale };
}
