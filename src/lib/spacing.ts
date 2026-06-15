export type SpacingKind = "width" | "height" | "gap" | "padding" | "radius" | "stroke" | "size";

export const SPACING_KIND_ORDER: SpacingKind[] = [
  "width",
  "height",
  "gap",
  "padding",
  "radius",
  "stroke",
  "size",
];

export const SPACING_KIND_LABEL: Record<SpacingKind, string> = {
  width: "Widths",
  height: "Heights",
  gap: "Gaps",
  padding: "Padding",
  radius: "Radii",
  stroke: "Strokes",
  size: "Sizes",
};

/** Pick the most appropriate visualization kind from a token name. */
export function spacingKind(name: string): SpacingKind {
  const n = name.toLowerCase();
  if (/(radius|rounded|corner)/.test(n)) return "radius";
  if (/(stroke|border-?width|outline)/.test(n)) return "stroke";
  if (/(padding|inset|pad)\b/.test(n) || /padding/.test(n)) return "padding";
  if (/gap/.test(n)) return "gap";
  if (/height/.test(n)) return "height";
  if (/width/.test(n)) return "width";
  return "size";
}

/** Resolve a CSS length to pixels (best effort) for comparison & rendering. */
export function lengthToPx(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?[\d.]+)(px|rem|em|pt)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (unit === "rem" || unit === "em") return n * 16;
  if (unit === "pt") return n * (96 / 72);
  return n;
}
