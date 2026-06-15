// Import tokens from JSON: W3C Design Tokens, Tokens Studio, Figma variables
// export, or plain nested objects. Everything is normalized to flat
// `{ name, raw }` declarations and rendered as CSS so it reuses the existing
// parse/classify pipeline.

interface Decl {
  name: string;
  raw: string;
}

const slug = (s: unknown): string =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[\/\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function figmaHex(c: { r: number; g: number; b: number; a?: number }): string {
  const to = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  const base = `#${to(c.r)}${to(c.g)}${to(c.b)}`;
  return c.a != null && c.a < 1 ? base + to(c.a) : base;
}

/** `{group.path}` → `var(--group-path)`, else null. */
function aliasFromCurly(s: string): string | null {
  const m = s.trim().match(/^\{(.+)\}$/);
  if (!m) return null;
  return `var(--${m[1].split(".").map(slug).join("-")})`;
}

const DIMENSION_HINT = /(space|spacing|gap|size|radius|width|height|padding|margin|stroke|inset|offset|elevation)/;

/* ----------------------------- Figma variables ----------------------------- */

interface FigmaVar {
  id: string;
  name: string;
  resolvedType?: string;
  variableCollectionId?: string;
  valuesByMode?: Record<string, unknown>;
}

function isFigma(obj: any): any | null {
  if (obj?.meta?.variables) return obj.meta;
  if (obj?.variables && obj?.variableCollections) return obj;
  return null;
}

function figmaValue(val: unknown, name: string, nameById: Map<string, string>): string {
  if (val && typeof val === "object") {
    const v = val as any;
    if (v.type === "VARIABLE_ALIAS" && v.id) {
      const tn = nameById.get(v.id);
      return tn ? `var(--${tn})` : "";
    }
    if ("r" in v && "g" in v && "b" in v) return figmaHex(v);
  }
  if (typeof val === "number") return DIMENSION_HINT.test(name) ? `${val}px` : String(val);
  if (typeof val === "string") return val;
  if (typeof val === "boolean") return String(val);
  return "";
}

function figmaDecls(fig: any): Decl[] {
  const rawVars = fig.variables;
  const list: FigmaVar[] = Array.isArray(rawVars) ? rawVars : Object.values(rawVars);
  const rawCols = fig.variableCollections;
  const cols: any[] = rawCols ? (Array.isArray(rawCols) ? rawCols : Object.values(rawCols)) : [];
  const colById = new Map(cols.map((c) => [c.id, c]));
  const nameById = new Map(list.map((v) => [v.id, slug(v.name)]));

  const decls: Decl[] = [];
  for (const v of list) {
    const name = nameById.get(v.id)!;
    const modes = v.valuesByMode ?? {};
    const ids = Object.keys(modes);
    if (ids.length === 0) continue;
    const col = v.variableCollectionId ? colById.get(v.variableCollectionId) : undefined;
    const modeId = col?.defaultModeId && modes[col.defaultModeId] !== undefined ? col.defaultModeId : ids[0];
    decls.push({ name, raw: figmaValue(modes[modeId], name, nameById) });
  }
  return decls;
}

/* ----------------------------- W3C / Tokens Studio / nested ----------------------------- */

function isTokenLeaf(node: any): boolean {
  return node && typeof node === "object" && ("$value" in node || "value" in node);
}

function leafType(node: any): string {
  return String(node.$type ?? node.type ?? "");
}

function scalarValue(v: unknown, type: string, name: string): string {
  if (typeof v === "string") return aliasFromCurly(v) ?? v;
  if (typeof v === "number") {
    return type === "dimension" || DIMENSION_HINT.test(name) ? `${v}px` : String(v);
  }
  if (v && typeof v === "object") {
    const o = v as any;
    if ("r" in o && "g" in o && "b" in o) return figmaHex(o);
  }
  return String(v);
}

function walk(node: any, path: string[], out: Decl[]): void {
  if (isTokenLeaf(node)) {
    const name = path.map(slug).join("-");
    const v = "$value" in node ? node.$value : node.value;
    const type = leafType(node);
    // Composite value (e.g. typography) → expand into sub-tokens.
    if (v && typeof v === "object" && !("r" in v && "g" in v && "b" in v) && !Array.isArray(v)) {
      for (const [prop, sub] of Object.entries(v)) {
        out.push({ name: `${name}-${slug(prop)}`, raw: scalarValue(sub, "", `${name}-${prop}`) });
      }
      return;
    }
    out.push({ name, raw: scalarValue(v, type, name) });
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue; // $themes, $metadata, $description…
      walk(child, [...path, key], out);
    }
  }
}

/* ----------------------------- entry points ----------------------------- */

export function declsFromJson(text: string): Decl[] {
  const obj = JSON.parse(text);
  const fig = isFigma(obj);
  const decls: Decl[] = [];
  if (fig) decls.push(...figmaDecls(fig));
  else walk(obj, [], decls);
  return decls.filter((d) => d.name && d.raw !== "");
}

/** Render imported JSON as CSS so it flows through the CSS import path. */
export function jsonToCss(text: string): string {
  const decls = declsFromJson(text);
  return `:root {\n${decls.map((d) => `  --${d.name}: ${d.raw};`).join("\n")}\n}\n`;
}

export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

/** Safe count for live preview; 0 on any parse error. */
export function safeJsonCount(text: string): number {
  try {
    return declsFromJson(text).length;
  } catch {
    return 0;
  }
}
