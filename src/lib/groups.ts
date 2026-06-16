import type { Token } from "../types";

/**
 * Tokens are named hierarchically with `-` separators
 * (e.g. `color-brand-500`). We treat all but the last "leaf-ish" segment as
 * the group path. For ramps we additionally split a trailing numeric/scale
 * step (50, 100, ... or sm/md/lg) so swatches in a ramp line up.
 */

const SCALE_STEP_RE = /^(\d+|[a-z]+)$/i;

export interface RampGroup {
  /** Group key, e.g. "color-blue". */
  key: string;
  tokens: Token[];
  /** True for the synthetic catch-all of one-off colors (no real ramp). */
  misc?: boolean;
}

/** The segment that identifies the step within a ramp (last segment). */
export function stepOf(name: string): string {
  const parts = name.split("-");
  return parts[parts.length - 1];
}

/** Everything before the trailing step — the ramp/group key. */
export function groupKeyOf(name: string): string {
  const parts = name.split("-");
  if (parts.length > 1 && SCALE_STEP_RE.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join("-");
  }
  return name;
}

const NUMERIC_RE = /^\d+$/;
const NAMED_ORDER = ["3xs", "2xs", "xs", "sm", "base", "md", "default", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];

function stepRank(step: string): number {
  if (NUMERIC_RE.test(step)) return parseInt(step, 10);
  const i = NAMED_ORDER.indexOf(step.toLowerCase());
  return i >= 0 ? i * 100 : 1e9; // unknowns sink to the end
}

/**
 * Group tokens into ramps keyed by their group prefix, sorted by scale step.
 * One-off tokens that would each form a ramp of a single swatch are collected
 * into a trailing synthetic "other" group instead of fragmenting the view into
 * dozens of single-item headers.
 */
export function buildRamps(tokens: Token[]): RampGroup[] {
  const map = new Map<string, Token[]>();
  for (const t of tokens) {
    const key = groupKeyOf(t.name);
    const arr = map.get(key);
    if (arr) arr.push(t);
    else map.set(key, [t]);
  }
  const ramps: RampGroup[] = [];
  const loners: Token[] = [];
  for (const [key, arr] of map) {
    if (arr.length === 1) {
      loners.push(arr[0]);
      continue;
    }
    arr.sort((a, b) => stepRank(stepOf(a.name)) - stepRank(stepOf(b.name)) || a.order - b.order);
    ramps.push({ key, tokens: arr });
  }
  ramps.sort((a, b) => a.key.localeCompare(b.key));
  // Only fold when there are several one-offs; a lone leftover keeps its own
  // (real, named) ramp rather than hiding under a meaningless "other".
  if (loners.length >= 2) {
    loners.sort((a, b) => a.name.localeCompare(b.name));
    ramps.push({ key: "other", tokens: loners, misc: true });
  } else if (loners.length === 1) {
    ramps.push({ key: groupKeyOf(loners[0].name), tokens: loners });
    ramps.sort((a, b) => a.key.localeCompare(b.key));
  }
  return ramps;
}

/** Top-level group (first segment), e.g. "color", "spacing", "font". */
export function topGroupOf(name: string): string {
  return name.split("-")[0] || name;
}
