export type TokenCategory = "color" | "spacing" | "typography" | "other";

/** A token value is either a literal ("raw") or an alias to another token. */
export type TokenValue =
  | { kind: "raw"; raw: string }
  | { kind: "ref"; ref: string; fallback?: string };

export interface Token {
  id: string;
  /** Name without the leading `--`, e.g. "color-brand-500". */
  name: string;
  /** The active mode's value. Always mirrors `modes[activeMode]` when modes exist. */
  value: TokenValue;
  /** Per-mode values (light/dark/…). Absent when there's a single mode. */
  modes?: Record<string, TokenValue>;
  category: TokenCategory;
  /** Source order, preserved for stable export. */
  order: number;
}

export interface ResolvedToken {
  token: Token;
  /** Final literal string after following alias chains, or null on cycle/missing. */
  finalRaw: string | null;
  /** Names visited while resolving, in order (excludes the token itself). */
  chain: string[];
  /** True if resolution hit a missing token or a cycle. */
  broken: boolean;
}
