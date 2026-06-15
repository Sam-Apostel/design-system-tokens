import type { Token } from "../types";
import { parseValue, resolve, indexByName } from "./value";
import { classify } from "./classify";

let counter = 0;
const nextId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Extract all CSS custom property declarations (`--name: value;`) from a blob
 * of CSS. Selectors and at-rules are ignored — we only care about the
 * declarations themselves, wherever they appear.
 *
 * Comments are stripped first so `/* ... *​/` can't swallow declarations.
 */
export function extractDeclarations(css: string): Array<{ name: string; raw: string }> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Array<{ name: string; raw: string }> = [];
  const re = /--([A-Za-z0-9-_]+)\s*:\s*([^;{}]+)\s*(?:;|(?=}))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null) {
    out.push({ name: m[1].trim(), raw: m[2].trim() });
  }
  return out;
}

/**
 * Build a deduplicated, classified token list from CSS text.
 * Later declarations of the same name win (CSS cascade within one scope),
 * matching the mental model of "the effective value".
 */
export function tokensFromCss(css: string, startOrder = 0): Token[] {
  const decls = extractDeclarations(css);
  const map = new Map<string, Token>();
  let order = startOrder;

  for (const d of decls) {
    const existing = map.get(d.name);
    const value = parseValue(d.raw);
    if (existing) {
      existing.value = value; // last wins
    } else {
      map.set(d.name, {
        id: nextId(),
        name: d.name,
        value,
        category: "other",
        order: order++,
      });
    }
  }

  return classifyAll([...map.values()]);
}

/** (Re)compute the category for every token based on resolved values. */
export function classifyAll(tokens: Token[]): Token[] {
  const byName = indexByName(tokens);
  return tokens.map((t) => {
    const r = resolve(t, byName);
    return { ...t, category: classify(t.name, r.finalRaw) };
  });
}
