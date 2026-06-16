import type { Token, TokenCategory } from "../types";
import { resolve } from "./value";
import { parseColor, toHex } from "./color";

export type DupKind = "color" | "literal";

export interface DuplicateGroup {
  /** A representative display literal (first member's resolved value). */
  value: string;
  /** The normalization key (hex for colors, trim+lowercase otherwise). */
  normalizedValue: string;
  kind: DupKind;
  category: TokenCategory;
  /** ≥2 members sharing the normalized value, in source order. */
  tokens: Token[];
  /** False = ≥2 members independently hard-code the literal (true redundancy). */
  allAlias: boolean;
  /** Value is trivial (transparent / 0 / none / inherit / …). */
  trivial: boolean;
}

const TRIVIAL = new Set([
  "transparent", "#00000000", "0", "0px", "0rem", "none", "inherit", "initial", "unset", "currentcolor",
]);

function normalize(finalRaw: string): { key: string; kind: DupKind } {
  const rgb = parseColor(finalRaw);
  if (rgb) return { key: toHex(rgb), kind: "color" }; // #fff == #ffffff == white == rgb(255,255,255)
  return { key: finalRaw.trim().toLowerCase(), kind: "literal" };
}

/** Every distinct resolved value shared by ≥2 tokens, worst (biggest) first. */
export function duplicateValueGroups(tokens: Token[], byName: Map<string, Token>): DuplicateGroup[] {
  const buckets = new Map<string, { members: Token[]; kind: DupKind; display: string }>();
  for (const t of tokens) {
    const r = resolve(t, byName);
    if (r.broken || r.finalRaw == null) continue;
    const finalRaw = r.finalRaw.trim();
    if (!finalRaw) continue;
    const { key, kind } = normalize(finalRaw);
    const b = buckets.get(key);
    if (b) b.members.push(t);
    else buckets.set(key, { members: [t], kind, display: finalRaw });
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, b] of buckets) {
    if (b.members.length < 2) continue;
    // An "independent literal" hard-codes the value with no reference to another
    // token. parseValue() classifies composites like color-mix(var(--x), …) as
    // kind "raw" even though they DO reference a token, so also require the raw
    // string to contain no var() — otherwise such aliasing tokens get mislabeled
    // as redundant.
    const independentLiterals = b.members.filter(
      (t) => t.value.kind === "raw" && !/var\(/i.test(t.value.raw),
    ).length;
    groups.push({
      value: b.display,
      normalizedValue: key,
      kind: b.kind,
      category: b.members[0].category,
      tokens: b.members,
      allAlias: independentLiterals <= 1,
      trivial: TRIVIAL.has(key),
    });
  }

  // Biggest groups first; true-redundancy (allAlias=false) before alias chains;
  // non-trivial before trivial; then by value for stable output.
  groups.sort(
    (a, b) =>
      b.tokens.length - a.tokens.length ||
      Number(a.allAlias) - Number(b.allAlias) ||
      Number(a.trivial) - Number(b.trivial) ||
      a.normalizedValue.localeCompare(b.normalizedValue),
  );
  return groups;
}

export function duplicateSummary(groups: DuplicateGroup[]) {
  const redundantNames = groups.reduce((n, g) => n + g.tokens.length, 0);
  const trueRedundancy = groups.filter((g) => !g.allAlias && !g.trivial).length;
  return { groups: groups.length, redundantNames, trueRedundancy };
}
