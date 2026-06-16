import type { Token } from "../types";
import { resolve, indexByName } from "./value";
import { isColor, parseColor, colorDistance, toHex, type RGB } from "./color";
import { auditableFailures } from "./contrastAudit";
import { buildRamps } from "./groups";
import { lightnessProfile } from "./rampMetrics";
import { tierMap } from "./tiers";
import { isAlias } from "./relations";

export type LintSeverity = "error" | "warning" | "info";

export interface LintIssue {
  id: string;
  severity: LintSeverity;
  rule: string;
  message: string;
  /** Token names this issue relates to. */
  tokens: string[];
}

export interface LintConfig {
  /** Expected casing for name segments. */
  casing: "kebab";
  /** Max alias chain depth before we warn. */
  maxAliasDepth: number;
  /** OKLab distance under which two distinct colors are "near-duplicate". */
  duplicateThreshold: number;
}

export const DEFAULT_LINT_CONFIG: LintConfig = {
  casing: "kebab",
  maxAliasDepth: 3,
  duplicateThreshold: 0.02,
};

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Run all naming / assignment / duplication checks over the token set.
 * Pure and synchronous so the UI can recompute on every edit.
 */
export function lint(tokens: Token[], config: LintConfig = DEFAULT_LINT_CONFIG): LintIssue[] {
  const issues: LintIssue[] = [];
  const byName = indexByName(tokens);
  let n = 0;
  const push = (i: Omit<LintIssue, "id">) => issues.push({ ...i, id: `l${n++}` });

  // --- Naming convention --------------------------------------------------
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!KEBAB_RE.test(t.name)) {
      push({
        severity: "warning",
        rule: "naming/kebab-case",
        message: `"${t.name}" is not kebab-case (lowercase words separated by single hyphens).`,
        tokens: [t.name],
      });
    }
    if (seen.has(t.name)) {
      push({
        severity: "error",
        rule: "naming/duplicate-name",
        message: `Token name "${t.name}" is declared more than once.`,
        tokens: [t.name],
      });
    }
    seen.add(t.name);
  }

  // --- Assignment / reference health -------------------------------------
  for (const t of tokens) {
    if (t.value.kind !== "ref") continue;
    const r = resolve(t, byName);

    if (r.broken) {
      // Distinguish cycle vs missing target.
      const target = t.value.ref;
      if (!byName.has(target)) {
        push({
          severity: "error",
          rule: "reference/missing-target",
          message: `"${t.name}" aliases "--${target}", which does not exist.`,
          tokens: [t.name],
        });
      } else {
        push({
          severity: "error",
          rule: "reference/cycle",
          message: `"${t.name}" is part of an alias cycle and cannot resolve.`,
          tokens: [t.name, ...r.chain],
        });
      }
      continue;
    }

    if (r.chain.length > config.maxAliasDepth) {
      push({
        severity: "warning",
        rule: "reference/deep-chain",
        message: `"${t.name}" resolves through ${r.chain.length} hops (${r.chain.join(" → ")}). Consider flattening.`,
        tokens: [t.name, ...r.chain],
      });
    }
  }

  // --- Raw literals where an alias likely belongs ------------------------
  // A semantic-looking token (brand/bg/text/...) holding a raw color while an
  // identical primitive exists is usually meant to be an alias.
  const rawColorByHex = new Map<string, string[]>();
  for (const t of tokens) {
    if (t.value.kind !== "raw") continue;
    if (!isColor(t.value.raw)) continue;
    const hex = normHex(t.value.raw);
    if (!hex) continue;
    const arr = rawColorByHex.get(hex);
    if (arr) arr.push(t.name);
    else rawColorByHex.set(hex, [t.name]);
  }
  const SEMANTIC_RE = /(brand|bg|background|fg|foreground|text|surface|border|accent|primary|secondary|danger|success|warning|info|muted)/i;
  for (const [hex, names] of rawColorByHex) {
    if (names.length < 2) continue;
    const hasSemantic = names.some((nm) => SEMANTIC_RE.test(nm));
    if (hasSemantic) {
      push({
        severity: "info",
        rule: "assignment/prefer-alias",
        message: `${names.length} tokens hard-code ${hex} (${names.join(", ")}). Consider pointing semantic tokens at a primitive via var().`,
        tokens: names,
      });
    }
  }

  // --- Exact duplicate raw values ---------------------------------------
  const rawByValue = new Map<string, string[]>();
  for (const t of tokens) {
    if (t.value.kind !== "raw") continue;
    const key = t.value.raw.trim().toLowerCase();
    const arr = rawByValue.get(key);
    if (arr) arr.push(t.name);
    else rawByValue.set(key, [t.name]);
  }
  for (const [val, names] of rawByValue) {
    if (names.length < 2) continue;
    if (isColor(val)) continue; // colors handled by perceptual check below
    push({
      severity: "info",
      rule: "duplicate/identical-value",
      message: `${names.length} tokens share the value "${val}": ${names.join(", ")}.`,
      tokens: names,
    });
  }

  // --- Near-duplicate colors (perceptual) -------------------------------
  const colorTokens = tokens
    .map((t) => {
      const r = resolve(t, byName);
      const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
      return rgb ? { name: t.name, rgb, isRaw: t.value.kind === "raw" } : null;
    })
    .filter((x): x is { name: string; rgb: NonNullable<ReturnType<typeof parseColor>>; isRaw: boolean } => !!x);

  for (let i = 0; i < colorTokens.length; i++) {
    for (let j = i + 1; j < colorTokens.length; j++) {
      const a = colorTokens[i];
      const b = colorTokens[j];
      // Only flag pairs that are both raw primitives (aliases resolving to the
      // same color are expected, not duplicates).
      if (!a.isRaw || !b.isRaw) continue;
      const d = colorDistance(a.rgb, b.rgb);
      if (d > 0 && d < config.duplicateThreshold) {
        push({
          severity: "warning",
          rule: "duplicate/near-color",
          message: `"${a.name}" (${toHex(a.rgb)}) and "${b.name}" (${toHex(b.rgb)}) are perceptually near-identical.`,
          tokens: [a.name, b.name],
        });
      }
    }
  }

  // --- Ramp lightness should step evenly (perceptual, OKLab) ---------------
  // A well-built color ramp moves through lightness in roughly even steps; a
  // step that reverses direction or sits far off the even line reads as a kink.
  // Reuses the same OKLab profile the Color space tab draws.
  const tiers = tierMap(tokens);
  const colorPrimitives = tokens.filter(
    (t) => t.category === "color" && tiers.get(t.name) === "primitive" && !isAlias(t),
  );
  for (const ramp of buildRamps(colorPrimitives)) {
    if (ramp.misc || ramp.tokens.length < 3) continue;
    const rgbs: (RGB | null)[] = ramp.tokens.map((t) => {
      const r = resolve(t, byName);
      return r.finalRaw ? parseColor(r.finalRaw) : null;
    });
    if (rgbs.some((r) => !r)) continue;
    const profile = lightnessProfile(rgbs as RGB[]);
    const flaggedNames = profile.flatMap((p, i) => (p.flagged ? [ramp.tokens[i].name] : []));
    if (flaggedNames.length) {
      push({
        severity: "warning",
        rule: "ramp/uneven-lightness",
        message: `Ramp "${ramp.key}" doesn't step evenly in lightness — ${flaggedNames.join(", ")} deviate from a linear OKLab ramp.`,
        tokens: flaggedNames,
      });
    }
  }

  // --- Semantic contrast (text on surface) ---------------------------------
  for (const p of auditableFailures(tokens, byName)) {
    push({
      severity: p.wcag < 3 ? "error" : "warning",
      rule: "contrast/insufficient",
      message: `"${p.text.name}" on "${p.surface.name}" has ${p.wcag.toFixed(2)}:1 contrast (WCAG AA needs 4.5:1 for normal text).`,
      tokens: [p.text.name, p.surface.name],
    });
  }

  return issues;
}

function normHex(v: string): string | null {
  const rgb = parseColor(v);
  return rgb ? toHex(rgb) : null;
}

export function summarize(issues: LintIssue[]) {
  return {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}

const SEV_RANK: Record<LintSeverity, number> = { info: 0, warning: 1, error: 2 };

/** Highest-severity issue per token name, for inline indicators across views. */
export function issuesByToken(issues: LintIssue[]): Map<string, LintSeverity> {
  const map = new Map<string, LintSeverity>();
  for (const i of issues) {
    for (const name of i.tokens) {
      const cur = map.get(name);
      if (!cur || SEV_RANK[i.severity] > SEV_RANK[cur]) map.set(name, i.severity);
    }
  }
  return map;
}
