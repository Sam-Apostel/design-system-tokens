import type { Token } from "../types";
import { resolve, indexByName } from "./value";
import { isColor } from "./color";

export const isAlias = (t: Token): boolean => t.value.kind === "ref";

/**
 * Names that the semantic (alias) layer depends on — i.e. every token that
 * appears anywhere in an alias's resolution chain. Used to find primitives
 * that the upper layer never references.
 */
export function usedBySemanticLayer(tokens: Token[]): Set<string> {
  const byName = indexByName(tokens);
  const used = new Set<string>();
  for (const t of tokens) {
    if (t.value.kind !== "ref") continue;
    const r = resolve(t, byName);
    for (const name of r.chain) used.add(name);
  }
  return used;
}

/** Raw color tokens not referenced (directly or transitively) by any alias. */
export function unusedBaseColors(tokens: Token[]): Set<string> {
  const used = usedBySemanticLayer(tokens);
  const unused = new Set<string>();
  for (const t of tokens) {
    if (t.category !== "color") continue;
    if (t.value.kind !== "raw") continue;
    if (!isColor(t.value.raw)) continue;
    if (!used.has(t.name)) unused.add(t.name);
  }
  return unused;
}
