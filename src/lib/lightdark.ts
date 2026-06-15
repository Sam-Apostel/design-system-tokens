import type { Token } from "../types";
import { parseValue } from "./value";
import { classifyAll } from "./parseCss";
import { splitTopLevelCommas } from "./color";

// Bridge between the CSS light-dark() function and the editor's mode model:
// on import a light-dark(L, D) value becomes a light/dark mode pair; on export
// a light/dark pair collapses back into light-dark().

/** Parse `light-dark(L, D)` into its two argument strings, or null. */
export function parseLightDark(raw: string): [string, string] | null {
  const m = raw.trim().match(/^light-dark\(([\s\S]*)\)$/i);
  if (!m) return null;
  const parts = splitTopLevelCommas(m[1]).map((s) => s.trim());
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

export interface Expanded {
  tokens: Token[];
  modeList: string[];
  activeMode: string;
}

/**
 * If any token uses light-dark(), expand the whole set into light/dark modes.
 * Tokens without light-dark() get the same value in both modes.
 */
export function expandLightDark(tokens: Token[]): Expanded {
  const hasLD = tokens.some((t) => t.value.kind === "raw" && parseLightDark(t.value.raw));
  if (!hasLD) return { tokens, modeList: ["base"], activeMode: "base" };

  const out = tokens.map((t) => {
    if (t.value.kind === "raw") {
      const ld = parseLightDark(t.value.raw);
      if (ld) {
        const light = parseValue(ld[0]);
        const dark = parseValue(ld[1]);
        return { ...t, value: light, modes: { light, dark } };
      }
    }
    return { ...t, modes: { light: t.value, dark: t.value } };
  });
  return { tokens: classifyAll(out), modeList: ["light", "dark"], activeMode: "light" };
}
