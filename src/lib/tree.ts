import type { Token } from "../types";
import { stepOf } from "./groups";

/**
 * Two-level grouping for the sidebar. Tokens are grouped by their first name
 * segment (top group). Within a top group, a second-level subgroup is created
 * for a shared second segment only when several tokens share it — this nests
 * ramps like `colors-blue-*` under `colors › blue` while leaving one-off tokens
 * (e.g. `gap-gap2x-s`) directly under their top group instead of fragmenting.
 */
export interface SubGroup {
  /** Display label, e.g. "blue". */
  key: string;
  /** Full name prefix, e.g. "colors-blue" — used for group rename. */
  prefix: string;
  tokens: Token[];
}

export interface TopGroup {
  key: string;
  prefix: string;
  /** Tokens that belong straight to the top group (no subgroup). */
  directTokens: Token[];
  subgroups: SubGroup[];
}

const NUMERIC_RE = /^\d+$/;
const NAMED_ORDER = ["3xs", "2xs", "xs", "s", "sm", "base", "m", "md", "default", "ml", "l", "lg", "xl", "2xl", "3xl"];
function stepRank(step: string): number {
  if (NUMERIC_RE.test(step)) return parseInt(step, 10);
  const i = NAMED_ORDER.indexOf(step.toLowerCase());
  return i >= 0 ? i : 500;
}

function sortTokens(a: Token, b: Token): number {
  return stepRank(stepOf(a.name)) - stepRank(stepOf(b.name)) || a.order - b.order;
}

export function buildGroupTree(tokens: Token[]): TopGroup[] {
  const tops = new Map<string, Token[]>();
  for (const t of tokens) {
    const top = t.name.split("-")[0] || t.name;
    (tops.get(top) ?? tops.set(top, []).get(top)!).push(t);
  }

  const result: TopGroup[] = [];
  for (const [top, list] of tops) {
    // Tally candidate subgroups (require >=3 segments to have a real subgroup).
    const subCandidates = new Map<string, Token[]>();
    const rest: Token[] = [];
    for (const t of list) {
      const segs = t.name.split("-");
      if (segs.length >= 3) {
        const sub = segs[1];
        (subCandidates.get(sub) ?? subCandidates.set(sub, []).get(sub)!).push(t);
      } else {
        rest.push(t);
      }
    }

    const subgroups: SubGroup[] = [];
    const directTokens: Token[] = [...rest];
    for (const [sub, toks] of subCandidates) {
      if (toks.length >= 2) {
        subgroups.push({ key: sub, prefix: `${top}-${sub}`, tokens: [...toks].sort(sortTokens) });
      } else {
        directTokens.push(...toks);
      }
    }

    directTokens.sort(sortTokens);
    subgroups.sort((a, b) => a.key.localeCompare(b.key));
    result.push({ key: top, prefix: top, directTokens, subgroups });
  }

  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

/** Strip a known group prefix from a token name to get a short leaf label. */
export function leafLabel(name: string, prefix: string): string {
  if (name === prefix) return name.split("-").pop() || name;
  if (name.startsWith(prefix + "-")) return name.slice(prefix.length + 1);
  return name;
}
