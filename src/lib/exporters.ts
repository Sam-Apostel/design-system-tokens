import type { Token } from "../types";
import { valueToCss } from "./value";
import { topGroupOf, groupKeyOf, stepOf } from "./groups";
import { spacingKind } from "./spacing";

export type ExportFormat = "css" | "json" | "scss" | "js" | "tailwind";

export interface FormatMeta {
  id: ExportFormat;
  label: string;
  ext: string;
  filename: string;
}

export const FORMATS: FormatMeta[] = [
  { id: "css", label: "CSS", ext: "css", filename: "tokens.css" },
  { id: "json", label: "JSON (W3C)", ext: "json", filename: "tokens.json" },
  { id: "scss", label: "SCSS", ext: "scss", filename: "_tokens.scss" },
  { id: "js", label: "JS / TS", ext: "ts", filename: "tokens.ts" },
  { id: "tailwind", label: "Tailwind", ext: "js", filename: "tailwind.tokens.js" },
];

/* ----------------------------- CSS ----------------------------- */

export interface CssOptions {
  selector: string;
  groupBySection: boolean;
}

export function toCss(tokens: Token[], opts: CssOptions): string {
  const ordered = order(tokens);
  const lines: string[] = [];
  let lastGroup: string | null = null;
  for (const t of ordered) {
    if (opts.groupBySection) {
      const g = topGroupOf(t.name);
      if (g !== lastGroup) {
        if (lastGroup !== null) lines.push("");
        lines.push(`  /* ${g} */`);
        lastGroup = g;
      }
    }
    lines.push(`  --${t.name}: ${valueToCss(t.value)};`);
  }
  return `${opts.selector} {\n${lines.join("\n")}\n}\n`;
}

/* ----------------------------- SCSS ----------------------------- */

export function toScss(tokens: Token[]): string {
  return (
    order(tokens)
      .map((t) => `$${t.name}: ${scssValue(t)};`)
      .join("\n") + "\n"
  );
}

function scssValue(t: Token): string {
  // var(--x) → $x so SCSS variables reference each other.
  return valueToCss(t.value).replace(/var\(--([A-Za-z0-9-_]+)\)/g, "$$$1");
}

/* ----------------------------- JS / TS ----------------------------- */

export function toJs(tokens: Token[]): string {
  const body = order(tokens)
    .map((t) => `  "${t.name}": "${valueToCss(t.value)}",`)
    .join("\n");
  return `// Design tokens. Values keep var() aliases so they resolve against the exported CSS.\nexport const tokens = {\n${body}\n} as const;\n\nexport type TokenName = keyof typeof tokens;\n`;
}

/* ----------------------------- W3C JSON ----------------------------- */

function w3cType(t: Token): string {
  if (t.category === "color") return "color";
  if (t.category === "spacing") return "dimension";
  if (t.category === "typography") {
    const v = t.value.kind === "raw" ? t.value.raw.trim() : "";
    if (/^\d+(\.\d+)?$/.test(v)) return /weight/i.test(t.name) ? "fontWeight" : "number";
    if (/,/.test(v)) return "fontFamily";
    if (/(px|rem|em)$/.test(v)) return "dimension";
    return "fontWeight";
  }
  return "other";
}

function w3cValue(t: Token): string {
  if (t.value.kind === "ref") return `{${t.value.ref.replace(/-/g, ".")}}`;
  return t.value.raw;
}

export function toJsonW3C(tokens: Token[]): string {
  const root: Record<string, unknown> = {};
  for (const t of order(tokens)) {
    const segs = t.name.split("-");
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      const cur = node[k];
      if (cur && typeof cur === "object" && "$value" in (cur as object)) {
        node[k] = { DEFAULT: cur };
      } else if (typeof cur !== "object" || cur === null) {
        node[k] = {};
      }
      node = node[k] as Record<string, unknown>;
    }
    const last = segs[segs.length - 1];
    const leaf = { $type: w3cType(t), $value: w3cValue(t) };
    const existing = node[last];
    if (existing && typeof existing === "object") (existing as Record<string, unknown>).DEFAULT = leaf;
    else node[last] = leaf;
  }
  return JSON.stringify(root, null, 2) + "\n";
}

/* ----------------------------- Tailwind ----------------------------- */

export function toTailwind(tokens: Token[]): string {
  const colors: Record<string, unknown> = {};
  const spacing: Record<string, string> = {};
  const borderRadius: Record<string, string> = {};
  const fontSize: Record<string, string> = {};
  const fontWeight: Record<string, string> = {};
  const fontFamily: Record<string, string> = {};
  const lineHeight: Record<string, string> = {};

  const ref = (t: Token) => `var(--${t.name})`;
  const tail = (name: string) => name.split("-").slice(1).join("-") || name;

  for (const t of order(tokens)) {
    if (t.category === "color") {
      const g = groupKeyOf(t.name);
      const step = stepOf(t.name);
      if (g === t.name) {
        colors[t.name] = ref(t);
      } else {
        const bucket = (colors[g] as Record<string, string>) ?? (colors[g] = {});
        (bucket as Record<string, string>)[step] = ref(t);
      }
    } else if (t.category === "spacing") {
      if (spacingKind(t.name) === "radius") borderRadius[tail(t.name)] = ref(t);
      else spacing[tail(t.name)] = ref(t);
    } else if (t.category === "typography") {
      const v = t.value.kind === "raw" ? t.value.raw.trim() : "";
      if (/family|face/.test(t.name) || /,/.test(v)) fontFamily[tail(t.name)] = ref(t);
      else if (/weight/.test(t.name) || /^\d{2,3}$/.test(v)) fontWeight[tail(t.name)] = ref(t);
      else if (/line-?height|leading/.test(t.name)) lineHeight[tail(t.name)] = ref(t);
      else fontSize[tail(t.name)] = ref(t);
    }
  }

  const extend: Record<string, unknown> = {};
  if (Object.keys(colors).length) extend.colors = colors;
  if (Object.keys(spacing).length) extend.spacing = spacing;
  if (Object.keys(borderRadius).length) extend.borderRadius = borderRadius;
  if (Object.keys(fontSize).length) extend.fontSize = fontSize;
  if (Object.keys(fontWeight).length) extend.fontWeight = fontWeight;
  if (Object.keys(fontFamily).length) extend.fontFamily = fontFamily;
  if (Object.keys(lineHeight).length) extend.lineHeight = lineHeight;

  return `// Tailwind theme referencing the exported CSS variables.\nmodule.exports = ${JSON.stringify(
    { theme: { extend } },
    null,
    2,
  )};\n`;
}

/* ----------------------------- dispatch ----------------------------- */

export function exportTokens(tokens: Token[], format: ExportFormat, css: CssOptions): string {
  switch (format) {
    case "css":
      return toCss(tokens, css);
    case "json":
      return toJsonW3C(tokens);
    case "scss":
      return toScss(tokens);
    case "js":
      return toJs(tokens);
    case "tailwind":
      return toTailwind(tokens);
  }
}

function order(tokens: Token[]): Token[] {
  return [...tokens].sort((a, b) => a.order - b.order);
}
