interface Rule { re: RegExp; value: string; }

const FORMAT: Rule[] = [
  { re: /\b(svg)\b|向量/i, value: "svg" },
  { re: /\b(png)\b/i, value: "png" },
  { re: /\b(ai)\b|原始檔|原檔/i, value: "ai" },
];
const COLOR: Rule[] = [
  { re: /\b(black|blk)\b|黑/i, value: "black" },
  { re: /\b(white)\b|白/i, value: "white" },
  { re: /\b(blue|primary)\b|藍|主色/i, value: "primary" },
  { re: /\b(gray|grey)\b|灰/i, value: "gray" },
  { re: /\b(green)\b|綠/i, value: "green" },
];
const LANGUAGE: Rule[] = [
  { re: /\b(english|en)\b|英文/i, value: "en" },
  { re: /\b(chinese|zh)\b|中文/i, value: "zh" },
  { re: /\b(japanese|ja)\b|日文/i, value: "ja" },
];
const ASSET_TYPE: Rule[] = [
  { re: /\b(icon)\b|圖示/i, value: "icon" },
  { re: /\b(mark)\b|標記|符號/i, value: "mark" },
  { re: /\b(logo)\b|標誌/i, value: "logo" },
];
// 形式（排版方向 / 比例）。只認明確的形狀詞；「mark」屬於類型，不在這裡。
const LAYOUT: Rule[] = [
  { re: /橫式|橫版|\b(horizontal|landscape)\b/i, value: "horizontal" },
  { re: /直式|直版|\b(vertical|portrait)\b/i, value: "vertical" },
  { re: /正方形|方形|\b(square)\b/i, value: "square" },
];
const BACKGROUND: Rule[] = [
  { re: /白底|white\s?bg|white background/i, value: "white" },
  { re: /黑底|black\s?bg|black background/i, value: "black" },
  { re: /透明|transparent/i, value: "transparent" },
];

function first(rules: Rule[], text: string): string | null {
  for (const r of rules) if (r.re.test(text)) return r.value;
  return null;
}

// 留白比例。「去/無/不留白」要先判，因為它們都含「留白」子字串。
function parsePadding(text: string): number | null {
  if (/去留白|無留白|不留白|no\s?padding/i.test(text)) return 0;
  if (/留白|留邊|padding/i.test(text)) return 0.2;
  return null;
}

export function parseFields(text: string) {
  const size = text.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  return {
    format: first(FORMAT, text),
    color: first(COLOR, text),
    language: first(LANGUAGE, text),
    asset_type: first(ASSET_TYPE, text),
    layout: first(LAYOUT, text),
    width: size ? parseInt(size[1], 10) : null,
    height: size ? parseInt(size[2], 10) : null,
    background: first(BACKGROUND, text) as "transparent" | "white" | "black" | null,
    paddingRatio: parsePadding(text),
  };
}
