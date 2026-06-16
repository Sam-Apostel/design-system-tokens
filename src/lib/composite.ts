import type { Token } from "../types";

/**
 * Leaf (the suffix after the group key) → real CSS property. Ordered
 * longest-first so multi-segment leaves win over single-segment ones
 * (e.g. "text-color" before "color", "font-size" before "size").
 */
export const LEAF_TO_CSS_PROP: Array<[leaf: string, prop: string]> = [
  ["font-family", "font-family"],
  ["font-size", "font-size"],
  ["font-weight", "font-weight"],
  ["font-style", "font-style"],
  ["line-height", "line-height"],
  ["letter-spacing", "letter-spacing"],
  ["text-transform", "text-transform"],
  ["text-decoration", "text-decoration"],
  ["text-color", "color"],
  // non-type composites (opt-in via the same mechanism):
  ["background-color", "background-color"],
  ["border-radius", "border-radius"],
  ["border-color", "border-color"],
  ["border-width", "border-width"],
  ["background", "background"],
  // single-segment leaves last so they don't shadow the two-segment ones above:
  ["family", "font-family"],
  ["size", "font-size"],
  ["weight", "font-weight"],
  ["leading", "line-height"],
  ["tracking", "letter-spacing"],
  ["radius", "border-radius"],
  ["padding", "padding"],
  ["gap", "gap"],
  ["color", "color"],
  ["bg", "background"],
];

const PROP_ORDER = [
  "font-family", "font-size", "font-weight", "font-style", "line-height",
  "letter-spacing", "text-transform", "text-decoration", "color", "background-color",
  "background", "border-radius", "border-width", "border-color", "padding", "gap",
];

export interface CompositeMember {
  token: Token;
  /** the CSS property this token maps to, e.g. "font-family" */
  prop: string;
  /** the leaf string matched, e.g. "font-family" or "text-color" */
  leaf: string;
}

export interface CompositeGroup {
  /** prefix shared by all members, e.g. "body-default" */
  key: string;
  members: CompositeMember[];
}

/** Match the LONGEST known leaf that is a trailing `-`-delimited suffix of name. */
function matchLeaf(name: string): { prefix: string; prop: string; leaf: string } | null {
  for (const [leaf, prop] of LEAF_TO_CSS_PROP) {
    if (name === leaf) continue; // no group prefix
    if (name.endsWith("-" + leaf)) {
      const prefix = name.slice(0, name.length - leaf.length - 1);
      if (prefix) return { prefix, prop, leaf };
    }
  }
  return null;
}

/**
 * Group tokens into composite classes. A prefix qualifies only when it owns
 * ≥2 members whose leaves map to DISTINCT CSS props (mirrors the ≥2-prop rule
 * TypographyView uses for "styles"). A token claimed by a longer-key group is
 * never re-used by a shorter one.
 */
export function groupCompositeTokens(tokens: Token[]): CompositeGroup[] {
  const map = new Map<string, CompositeMember[]>();
  for (const t of tokens) {
    const m = matchLeaf(t.name);
    if (!m) continue;
    const arr = map.get(m.prefix) ?? map.set(m.prefix, []).get(m.prefix)!;
    arr.push({ token: t, prop: m.prop, leaf: m.leaf });
  }

  const candidates: CompositeGroup[] = [];
  for (const [key, members] of map) {
    const byProp = new Map<string, CompositeMember>();
    for (const mem of members) if (!byProp.has(mem.prop)) byProp.set(mem.prop, mem);
    const distinct = [...byProp.values()];
    if (distinct.length >= 2) candidates.push({ key, members: distinct });
  }
  // longest key first so "body-default" beats a broader "body" when both qualify.
  candidates.sort(
    (a, b) => b.key.split("-").length - a.key.split("-").length || a.key.localeCompare(b.key),
  );

  const claimed = new Set<string>();
  const result: CompositeGroup[] = [];
  for (const g of candidates) {
    const keptByProp = new Map<string, CompositeMember>();
    for (const mem of g.members) {
      if (claimed.has(mem.token.id)) continue;
      if (!keptByProp.has(mem.prop)) keptByProp.set(mem.prop, mem);
    }
    const finalMembers = [...keptByProp.values()];
    if (finalMembers.length >= 2) {
      finalMembers.forEach((m) => claimed.add(m.token.id));
      finalMembers.sort((a, b) => {
        const ia = PROP_ORDER.indexOf(a.prop);
        const ib = PROP_ORDER.indexOf(b.prop);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      result.push({ key: g.key, members: finalMembers });
    }
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}
