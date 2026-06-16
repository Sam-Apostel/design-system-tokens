import type { Token } from "../types";
import { resolve } from "./value";

const EASING_KEYWORD_RE = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/i;
// A time anywhere in the value (covers transition shorthands like "all 0.2s ease").
const TIME_RE = /(?:^|[\s,(])(-?\d*\.?\d+)\s*(ms|s)(?:$|[\s,)])/i;

/** Value reads as a bare time: `120ms`, `.4s`, `400ms`. Returns ms or null. */
export function durationMs(raw: string | null): number | null {
  const m = (raw ?? "").trim().match(/^(-?\d*\.?\d+)\s*(ms|s)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  return m[2].toLowerCase() === "s" ? n * 1000 : n;
}

/** First time found anywhere in the value (bare duration OR transition shorthand). */
export function firstDurationMs(raw: string | null): number | null {
  const s = (raw ?? "").trim();
  const bare = durationMs(s);
  if (bare != null) return bare;
  const m = s.match(TIME_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  return m[2].toLowerCase() === "s" ? n * 1000 : n;
}

export interface BezierPoints {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

const KEYWORD_BEZIER: Record<string, BezierPoints> = {
  linear: { p1x: 0, p1y: 0, p2x: 1, p2y: 1 },
  ease: { p1x: 0.25, p1y: 0.1, p2x: 0.25, p2y: 1 },
  "ease-in": { p1x: 0.42, p1y: 0, p2x: 1, p2y: 1 },
  "ease-out": { p1x: 0, p1y: 0, p2x: 0.58, p2y: 1 },
  "ease-in-out": { p1x: 0.42, p1y: 0, p2x: 0.58, p2y: 1 },
};

/** Map an easing literal to its 4 cubic-bézier control coords, or null (steps). */
export function easingPoints(raw: string | null): BezierPoints | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s in KEYWORD_BEZIER) return KEYWORD_BEZIER[s];
  const m = s.match(/^cubic-bezier\(\s*([^)]+)\)$/);
  if (m) {
    const n = m[1].split(",").map((x) => parseFloat(x.trim()));
    if (n.length === 4 && n.every((v) => isFinite(v))) {
      return { p1x: n[0], p1y: n[1], p2x: n[2], p2y: n[3] };
    }
  }
  return null;
}

/** steps(n[, pos]) → n, else null. */
export function stepsCount(raw: string | null): number | null {
  const m = (raw ?? "").trim().match(/steps\(\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** A bare easing keyword: `ease`, `linear`, … — ambiguous (also a gradient/curve type). */
function isEasingKeyword(raw: string): boolean {
  return EASING_KEYWORD_RE.test(raw);
}

/** cubic-bezier(…) / steps(…) — these literals never appear outside motion. */
function hasUnambiguousEasing(raw: string): boolean {
  return /cubic-bezier\(|steps\(|step-start|step-end/i.test(raw);
}

/** Pull the easing portion out of a value (bare keyword, cubic-bezier, or steps). */
export function extractEasing(raw: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (isEasingKeyword(s)) return s.toLowerCase();
  const fn = s.match(/(cubic-bezier\([^)]*\)|steps\([^)]*\))/i);
  if (fn) return fn[1];
  const kw = s.match(/(?:^|[\s,])(ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)(?:$|[\s,])/i);
  return kw ? kw[1].toLowerCase() : null;
}

/** Is this literal an easing of any form (used to decide the Easings section)? */
export function isEasingValue(raw: string | null): boolean {
  return extractEasing(raw) != null;
}

const MOTION_NAME_RE = /(^|[-_])(duration|transition|animation|delay|easing|ease|bezier|motion)([-_]|$)/i;

/**
 * A token that represents motion. Value-gated like isShadowToken so it doesn't
 * steal tokens from spacing/typography:
 *  - a bare/embedded time or cubic-bezier/steps is unambiguously motion;
 *  - a bare easing keyword (ease/linear) is motion only under a motion-ish name
 *    (it's also a gradient/curve interpolation type);
 *  - a motion-ish name with a non-motion value (a length/number/font) is NOT
 *    motion — let it fall through to its real category. Only an empty/`none`
 *    value (a reset or broken alias) is kept as motion.
 */
export function isMotionToken(name: string, value: string | null): boolean {
  const v = (value ?? "").trim();
  if (firstDurationMs(v) != null) return true;
  if (hasUnambiguousEasing(v)) return true;
  if (isEasingKeyword(v)) return MOTION_NAME_RE.test(name);
  if (MOTION_NAME_RE.test(name)) return v === "" || /^none$/i.test(v);
  return false;
}

export interface DurationItem {
  token: Token;
  raw: string | null;
  ms: number | null;
  /** Clean, non-negative duration string for the animation bar. */
  durationCss: string;
  ref: string | null;
}

export interface EasingItem {
  token: Token;
  raw: string | null;
  ref: string | null;
  /** The easing portion, ready for `animation-timing-function`. */
  easing: string;
  points: BezierPoints | null;
  steps: number | null;
}

export function durationItems(tokens: Token[], byName: Map<string, Token>): DurationItem[] {
  const out: DurationItem[] = [];
  for (const t of tokens) {
    if (t.category !== "motion") continue;
    const raw = resolve(t, byName).finalRaw;
    const ms = firstDurationMs(raw);
    if (ms == null) continue;
    out.push({
      token: t,
      raw,
      ms,
      durationCss: `${Math.max(0, ms)}ms`, // negative times are invalid for animation-duration
      ref: t.value.kind === "ref" ? t.value.ref : null,
    });
  }
  return out.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0) || a.token.name.localeCompare(b.token.name));
}

export function easingItems(tokens: Token[], byName: Map<string, Token>): EasingItem[] {
  const out: EasingItem[] = [];
  for (const t of tokens) {
    if (t.category !== "motion") continue;
    const raw = resolve(t, byName).finalRaw;
    const easing = extractEasing(raw);
    if (!easing) continue;
    out.push({
      token: t,
      raw,
      ref: t.value.kind === "ref" ? t.value.ref : null,
      easing,
      points: easingPoints(easing),
      steps: stepsCount(easing),
    });
  }
  return out.sort((a, b) => a.token.name.localeCompare(b.token.name));
}
