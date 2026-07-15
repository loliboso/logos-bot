/**
 * Shared Taiwan-Mandarin labels for asset attribute values, so the guided
 * question flow and the "not found" fallback present colors identically.
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
