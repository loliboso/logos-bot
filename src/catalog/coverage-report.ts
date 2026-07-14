import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import { join } from "path";
import { loadBrandConfig } from "../config/brands-config";

const COMMON_COLORS = ["black", "white", "primary"];

export function generateCoverageReport(
  db: Database.Database,
  outputDir: string,
  configPath?: string
): string {
  const config = loadBrandConfig(configPath);
  const brands = db.prepare(`SELECT id, display_name FROM brands WHERE status='active' ORDER BY display_name`).all() as any[];

  const rows: string[] = [
    "# 品牌覆蓋報告",
    "",
    "| 品牌 | 別名已設定 | 格式 | 顏色 | 語言 | accepted 數 | 缺口提醒 |",
    "|------|:--------:|------|------|------|:---------:|---------|",
  ];

  for (const b of brands) {
    const assets = db.prepare(
      `SELECT format, color, language FROM assets WHERE brand_id=? AND status='active' AND review_status='accepted'`
    ).all(b.id) as any[];
    const formats = [...new Set(assets.map((a) => a.format).filter(Boolean))].sort();
    const colors = [...new Set(assets.map((a) => a.color).filter(Boolean))].sort();
    const langs = [...new Set(assets.map((a) => a.language).filter(Boolean))].sort();

    const aliasCount = config[b.id]?.aliases?.length ?? 0;
    const aliasSet = aliasCount >= 2 ? "✅" : "❌";

    const gaps: string[] = [];
    if (aliasCount < 2) gaps.push("未設定別名");
    if (formats.length === 1) gaps.push(`只有 ${formats[0].toUpperCase()}`);
    const missing = COMMON_COLORS.filter((c) => !colors.includes(c));
    if (colors.length && missing.length) gaps.push(`缺${missing.join("/")}`);

    rows.push(
      `| ${b.display_name} | ${aliasSet} | ${formats.join(", ") || "—"} | ${colors.join(", ") || "—"} | ${langs.join(", ") || "—"} | ${assets.length} | ${gaps.length ? "⚠️ " + gaps.join("；") : "—"} |`
    );
  }

  const md = rows.join("\n") + "\n";
  writeFileSync(join(outputDir, "brand_coverage.md"), md);
  return md;
}
