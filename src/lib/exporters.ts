import type { Token } from "../types";
import { valueToCss } from "./value";
import { topGroupOf } from "./groups";
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
  { id: "tailwind", label: "Tailwind v4", ext: "css", filename: "theme.css" },
];

/* ----------------------------- CSS ----------------------------- */

export interface CssOptions {
  selector: string;
  groupBySection: boolean;
  /** When light/dark modes exist, emit light-dark() instead of a [data-theme] block. */
  lightDark?: boolean;
}

const hasLightDark = (modeList: string[]) => modeList.includes("light") && modeList.includes("dark");

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

/* ----------------------------- Tailwind v4 (@theme) ----------------------------- */

type TokenValue = Token["value"];

/** Drop leading category/property words, keeping at least the final segment. */
function stripLeading(name: string, words: Set<string>): string {
  const segs = name.split("-");
  let i = 0;
  while (i < segs.length - 1 && words.has(segs[i])) i++;
  return segs.slice(i).join("-");
}

const COLOR_WORDS = new Set(["color", "colors", "colour", "colours", "palette"]);
const RADIUS_WORDS = new Set(["radius", "radii", "rounded", "corner"]);
const SPACE_WORDS = new Set(["spacing", "space"]);
const TYPE_WORDS = new Set(["font", "text", "type", "typography"]);

/** Map a token to its Tailwind v4 theme variable name, or null to skip. */
function v4Var(t: Token): string | null {
  if (t.category === "color") return `--color-${stripLeading(t.name, COLOR_WORDS)}`;
  if (t.category === "spacing") {
    if (spacingKind(t.name) === "radius") return `--radius-${stripLeading(t.name, RADIUS_WORDS)}`;
    return `--spacing-${stripLeading(t.name, SPACE_WORDS)}`;
  }
  if (t.category === "typography") {
    const v = t.value.kind === "raw" ? t.value.raw.trim() : "";
    const n = t.name;
    if (/family|face/.test(n) || /,/.test(v)) return `--font-${stripLeading(n, new Set([...TYPE_WORDS, "family", "face"]))}`;
    if (/weight/.test(n) || /^\d{2,3}$/.test(v)) return `--font-weight-${stripLeading(n, new Set([...TYPE_WORDS, "weight"]))}`;
    if (/line-?height|leading/.test(n)) return `--leading-${stripLeading(n, new Set(["line", "height", "leading"]))}`;
    if (/letter-?spacing|tracking/.test(n)) return `--tracking-${stripLeading(n, new Set(["letter", "spacing", "tracking"]))}`;
    return `--text-${stripLeading(n, new Set([...TYPE_WORDS, "size"]))}`;
  }
  return null;
}

export function toTailwindV4(tokens: Token[], modeList: string[] = ["base"]): string {
  const ordered = order(tokens);
  const varMap = new Map<string, string>(); // token name → theme var
  for (const t of ordered) {
    const v = v4Var(t);
    if (v) varMap.set(t.name, v);
  }

  // Alias to another exported token → reference its theme var; else literal.
  const valueCss = (v: TokenValue): string =>
    v.kind === "ref" && varMap.has(v.ref) ? `var(${varMap.get(v.ref)})` : valueToCss(v);
  const modeVal = (t: Token, mode: string): TokenValue => t.modes?.[mode] ?? t.value;

  const first = modeList[0];
  const exported = ordered.filter((t) => varMap.has(t.name));

  let out = "@import \"tailwindcss\";\n\n@theme {\n";
  out += exported.map((t) => `  ${varMap.get(t.name)}: ${valueCss(modeVal(t, first))};`).join("\n");
  out += "\n}\n";

  for (const mode of modeList.slice(1)) {
    const overrides = exported.filter((t) => valueCss(modeVal(t, mode)) !== valueCss(modeVal(t, first)));
    if (overrides.length) {
      out += `\n[data-theme="${mode}"] {\n`;
      out += overrides.map((t) => `  ${varMap.get(t.name)}: ${valueCss(modeVal(t, mode))};`).join("\n");
      out += "\n}\n";
    }
  }
  return out;
}

/* ----------------------------- multi-mode CSS ----------------------------- */

const modeValue = (t: Token, mode: string): TokenValueLike =>
  t.modes?.[mode] ?? t.value;

type TokenValueLike = Token["value"];

/** First mode → :root; each other mode → [data-theme="mode"] with only the overrides. */
export function toCssMultiMode(tokens: Token[], modeList: string[]): string {
  const ordered = order(tokens);
  const [first, ...rest] = modeList;
  const line = (t: Token, mode: string) => `  --${t.name}: ${valueToCss(modeValue(t, mode))};`;

  let out = `:root {\n${ordered.map((t) => line(t, first)).join("\n")}\n}\n`;
  for (const mode of rest) {
    const overrides = ordered.filter(
      (t) => valueToCss(modeValue(t, mode)) !== valueToCss(modeValue(t, first)),
    );
    if (overrides.length) {
      out += `\n[data-theme="${mode}"] {\n${overrides.map((t) => line(t, mode)).join("\n")}\n}\n`;
    }
  }
  return out;
}

/** Light/dark via the CSS light-dark() function in a single :root block. */
export function toCssLightDark(tokens: Token[]): string {
  const ordered = order(tokens);
  const lv = (t: Token) => t.modes?.light ?? t.value;
  const dv = (t: Token) => t.modes?.dark ?? t.value;
  const lines = ordered.map((t) => {
    const l = valueToCss(lv(t));
    const d = valueToCss(dv(t));
    if (t.category === "color" && l !== d) return `  --${t.name}: light-dark(${l}, ${d});`;
    return `  --${t.name}: ${l};`;
  });
  return `:root {\n  color-scheme: light dark;\n${lines.join("\n")}\n}\n`;
}

/* ----------------------------- dispatch ----------------------------- */

export function exportTokens(
  tokens: Token[],
  format: ExportFormat,
  css: CssOptions,
  modeList: string[] = ["base"],
): string {
  switch (format) {
    case "css":
      if (css.lightDark && hasLightDark(modeList)) return toCssLightDark(tokens);
      return modeList.length > 1 ? toCssMultiMode(tokens, modeList) : toCss(tokens, css);
    case "json":
      return toJsonW3C(tokens);
    case "scss":
      return toScss(tokens);
    case "js":
      return toJs(tokens);
    case "tailwind":
      return toTailwindV4(tokens, modeList);
  }
}

function order(tokens: Token[]): Token[] {
  return [...tokens].sort((a, b) => a.order - b.order);
}
