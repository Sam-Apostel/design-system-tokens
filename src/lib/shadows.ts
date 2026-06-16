import type { Token } from "../types";
import { resolve } from "./value";

export interface ShadowItem {
  token: Token;
  /** Fully resolved box-shadow literal, ready to drop into `box-shadow`. */
  css: string;
  /** Alias target if this token just references another, else null. */
  ref: string | null;
  /** Number of comma-separated layers (1 for a single shadow). */
  layers: number;
  /** True if every layer is `inset`. */
  inset: boolean;
  /** Rough visual depth (max blur+spread+|offset|, px) for ordering. */
  depth: number;
}

const COLOR_RE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|okl?ch|oklab|lab|lch)\(|\b(?:black|white|currentcolor|transparent)\b/i;
const LEN_RE = /(?:^|[\s,(])-?\d*\.?\d+(?:px|rem|em)\b/gi;

/** A value that reads as a CSS box-shadow: ≥2 lengths and a color (or `none`). */
export function isShadowValue(v: string | null): boolean {
  const s = (v ?? "").trim();
  if (!s) return false;
  // NB: bare "none" is NOT a shadow shape on its own (it's also display/outline/
  // text-decoration: none). Shadow-named tokens set to "none" are handled by
  // isShadowToken's explicit `v === "none"` check instead.
  // Reject other comma/length-bearing values that aren't shadows.
  if (/\b(?:url|gradient|cubic-bezier|calc|translate|rotate|scale|matrix|steps)\b/i.test(s)) return false;
  if (!COLOR_RE.test(s)) return false;
  return (s.match(LEN_RE) ?? []).length >= 2;
}

const SHADOW_NAME_RE = /(^|[-_])(shadow|elevation|elevated|glow)([-_]|$)/i;

/** A token that represents a shadow / elevation, by name or by value shape. */
export function isShadowToken(name: string, value: string | null): boolean {
  const v = (value ?? "").trim();
  if (SHADOW_NAME_RE.test(name)) return v === "none" || isShadowValue(v);
  return isShadowValue(v);
}

function depthOf(css: string): number {
  let max = 0;
  for (const layer of splitLayers(css)) {
    const nums = (layer.match(/-?\d*\.?\d+(?:px|rem|em)/gi) ?? []).map((m) => {
      const n = parseFloat(m);
      return /rem|em/i.test(m) ? n * 16 : n;
    });
    // offset-x offset-y [blur] [spread] — weight blur+spread, plus offset reach.
    const reach = nums.reduce((a, n, i) => a + (i < 2 ? Math.abs(n) * 0.5 : Math.abs(n)), 0);
    if (reach > max) max = reach;
  }
  return max;
}

/** Split a multi-layer shadow on top-level commas (not commas inside `rgb(…)`). */
function splitLayers(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(css.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(css.slice(start).trim());
  return out.filter(Boolean);
}

/** All shadow tokens in the set, resolved and ordered shallow → deep. */
export function shadowItems(tokens: Token[], byName: Map<string, Token>): ShadowItem[] {
  const out: ShadowItem[] = [];
  for (const t of tokens) {
    const css = resolve(t, byName).finalRaw;
    if (!isShadowToken(t.name, css) || !css || css.trim() === "none") continue;
    const layers = splitLayers(css);
    out.push({
      token: t,
      css,
      ref: t.value.kind === "ref" ? t.value.ref : null,
      layers: layers.length,
      inset: layers.every((l) => /\binset\b/i.test(l)),
      depth: depthOf(css),
    });
  }
  return out.sort((a, b) => a.depth - b.depth || a.token.name.localeCompare(b.token.name));
}

/**
 * Group key: peel trailing scale steps and the `shadow`/`elevation` role word so
 * the primitive ramp collapses (shadow-sm/md/raised → "shadow") while component
 * aliases group by their component (dialog-shadow → "dialog").
 */
const STEP = new Set(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "low", "mid", "high", "raised", "overlay", "sticky", "default"]);
const ROLE = new Set(["shadow", "elevation", "elevated", "glow"]);
export function shadowGroupKey(name: string): string {
  let segs = name.split(/[-_]/);
  while (segs.length > 1) {
    const last = segs[segs.length - 1].toLowerCase();
    if (STEP.has(last) || ROLE.has(last) || /^\d+$/.test(last)) segs = segs.slice(0, -1);
    else break;
  }
  return segs.join("-") || name;
}
