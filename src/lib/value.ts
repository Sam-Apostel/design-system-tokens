import type { Token, TokenValue, ResolvedToken } from "../types";

/** Parse a raw CSS value string into a structured TokenValue. */
export function parseValue(raw: string): TokenValue {
  const v = raw.trim();
  const m = v.match(/^var\(\s*--([A-Za-z0-9-_]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (m) {
    return { kind: "ref", ref: m[1], fallback: m[2]?.trim() };
  }
  return { kind: "raw", raw: v };
}

/** Turn a structured value back into the CSS string used after the colon. */
export function valueToCss(value: TokenValue): string {
  if (value.kind === "raw") return value.raw;
  return value.fallback ? `var(--${value.ref}, ${value.fallback})` : `var(--${value.ref})`;
}

/** Human-facing short text for a value (used in lists). */
export function valueToText(value: TokenValue): string {
  return value.kind === "raw" ? value.raw : `→ ${value.ref}`;
}

/**
 * Substitute every `var(--x)` inside a literal value with x's own resolved
 * literal — including refs nested inside functions like `color-mix(…)` or
 * `light-dark(…)` that the top-level alias chain doesn't follow. This is what
 * lets such composite colors resolve to a concrete value for plotting/theming.
 * Best-effort and cycle-safe (bounded iterations).
 */
export function substituteRefs(raw: string, byName: Map<string, Token>): string {
  if (!raw.includes("var(")) return raw;
  let s = raw;
  for (let i = 0; i < 30; i++) {
    let changed = false;
    s = s.replace(/var\(\s*--([A-Za-z0-9-_]+)\s*(?:,\s*([^()]*?))?\)/g, (_m, name: string, fb?: string) => {
      const t = byName.get(name);
      if (!t) return fb != null && fb.trim() ? (changed = true, fb.trim()) : `var(--${name})`;
      changed = true;
      return valueToCss(t.value);
    });
    if (!changed) break;
  }
  return s;
}

/**
 * Resolve a token's final literal value by following alias chains.
 * Detects cycles and missing references.
 */
export function resolve(token: Token, byName: Map<string, Token>): ResolvedToken {
  const chain: string[] = [];
  const seen = new Set<string>([token.name]);
  let current: Token | undefined = token;

  while (current && current.value.kind === "ref") {
    const next: string = current.value.ref;
    if (seen.has(next)) {
      return { token, finalRaw: null, chain, broken: true }; // cycle
    }
    seen.add(next);
    chain.push(next);
    current = byName.get(next);
    if (!current) {
      return { token, finalRaw: null, chain, broken: true }; // missing
    }
  }

  const lit = current ? (current.value as { raw: string }).raw : null;
  return {
    token,
    // Deep-substitute nested var() so composite values (color-mix, light-dark)
    // resolve to concrete literals downstream consumers can parse.
    finalRaw: lit != null ? substituteRefs(lit, byName) : null,
    chain,
    broken: false,
  };
}

export function indexByName(tokens: Token[]): Map<string, Token> {
  const m = new Map<string, Token>();
  for (const t of tokens) m.set(t.name, t);
  return m;
}
