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

  return {
    token,
    finalRaw: current ? (current.value as { raw: string }).raw : null,
    chain,
    broken: false,
  };
}

export function indexByName(tokens: Token[]): Map<string, Token> {
  const m = new Map<string, Token>();
  for (const t of tokens) m.set(t.name, t);
  return m;
}
