/**
 * Shared Taiwan-Mandarin labels for asset attribute values, so the guided
 * question flow and the "not found" fallback present values identically.
 */

const COLOR_LABELS: Record<string, string> = {
  blue: "主色（藍）",
  black: "黑色",
  white: "白色",
  primary: "主色",
};

export function colorLabel(color: string): string {
  return COLOR_LABELS[color] || color;
}

// 類型（資訊豐富程度的一環）：完整 Logo 帶字，mark 是純品牌標記。
const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: "完整 Logo",
  mark: "品牌標記（mark）",
  icon: "圖示",
  avatar: "大頭貼",
  special: "特殊款",
  guideline: "品牌規範手冊（.ai，內含向量 logo）",
};

export function assetTypeLabel(assetType: string): string {
  return ASSET_TYPE_LABELS[assetType] || assetType;
}

// 語言版本（資訊豐富程度的另一環）。
const LANGUAGE_LABELS: Record<string, string> = {
  zh: "中文",
  en: "英文",
  ja: "日文",
};

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] || language;
}

// 形式：logo 的排版方向 / 比例。
const LAYOUT_LABELS: Record<string, string> = {
  horizontal: "橫式",
  vertical: "直式",
  square: "正方形",
};

export function layoutLabel(layout: string): string {
  return LAYOUT_LABELS[layout] || layout;
}
