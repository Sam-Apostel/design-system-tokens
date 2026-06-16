import type { Token } from "../types";
import { resolve } from "./value";

const EASING_KEYWORD_RE = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/i;

/** Value reads as a time: `120ms`, `.4s`, `400ms`. Returns milliseconds or null. */
export function durationMs(raw: string | null): number | null {
  const m = (raw ?? "").trim().match(/^(-?\d*\.?\d+)\s*(ms|s)$/i);
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
  const m = (raw ?? "").trim().match(/^steps\(\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Is this literal an easing of any form (keyword, cubic-bezier, steps)? */
export function isEasingValue(raw: string | null): boolean {
  const s = (raw ?? "").trim();
  return EASING_KEYWORD_RE.test(s) || /^cubic-bezier\(/i.test(s) || /^steps\(/i.test(s);
}

const MOTION_NAME_RE = /(^|[-_])(duration|transition|animation|delay|easing|ease|bezier|motion)([-_]|$)/i;

/** A token that represents motion, by value shape or by name. */
export function isMotionToken(name: string, value: string | null): boolean {
  const v = (value ?? "").trim();
  if (durationMs(v) != null) return true;
  if (isEasingValue(v)) return true;
  return MOTION_NAME_RE.test(name);
}

export interface DurationItem {
  token: Token;
  raw: string | null;
  ms: number | null;
  ref: string | null;
}

export interface EasingItem {
  token: Token;
  raw: string | null;
  ref: string | null;
  points: BezierPoints | null;
  steps: number | null;
}

export function durationItems(tokens: Token[], byName: Map<string, Token>): DurationItem[] {
  const out: DurationItem[] = [];
  for (const t of tokens) {
    if (t.category !== "motion") continue;
    const raw = resolve(t, byName).finalRaw;
    const ms = durationMs(raw);
    if (ms == null) continue;
    out.push({ token: t, raw, ms, ref: t.value.kind === "ref" ? t.value.ref : null });
  }
  return out.sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0) || a.token.name.localeCompare(b.token.name));
}

export function easingItems(tokens: Token[], byName: Map<string, Token>): EasingItem[] {
  const out: EasingItem[] = [];
  for (const t of tokens) {
    if (t.category !== "motion") continue;
    const raw = resolve(t, byName).finalRaw;
    if (!isEasingValue(raw)) continue;
    out.push({
      token: t,
      raw,
      ref: t.value.kind === "ref" ? t.value.ref : null,
      points: easingPoints(raw),
      steps: stepsCount(raw),
    });
  }
  return out.sort((a, b) => a.token.name.localeCompare(b.token.name));
}
