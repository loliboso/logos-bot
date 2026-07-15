import { readFileSync } from "fs";
import { join } from "path";

export interface BrandConfigEntry {
  aliases: string[];
  notes: string;
}

export function loadBrandConfig(
  path: string = join(process.cwd(), "config", "brands.json")
): Record<string, BrandConfigEntry> {
  return JSON.parse(readFileSync(path, "utf-8"));
}
