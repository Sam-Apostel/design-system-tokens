import type { Token } from "../types";

/**
 * Design tokens are layered in tiers:
 *  - primitive: raw, context-free values (color ramps, spacing scale). Brand
 *    ramps that alias base ramps still read as primitives.
 *  - semantic: meaning-based tokens (surface, text, border, primary) that
 *    reference primitives. This is what product code should consume.
 *  - component: component-scoped tokens (card-radius, control-height) that
 *    reference semantics or primitives.
 */
export type Tier = "primitive" | "semantic" | "component";

export const TIERS: Tier[] = ["primitive", "semantic", "component"];

export const TIER_LABEL: Record<Tier, string> = {
  primitive: "Primitive",
  semantic: "Semantic",
  component: "Component",
};

export const TIER_BLURB: Record<Tier, string> = {
  primitive: "Raw, context-free values — color ramps and the spacing scale.",
  semantic: "Meaning-based tokens that reference primitives (surface, text, border…).",
  component: "Component-scoped tokens that reference semantics (card-radius, control-bg…).",
};

const COMPONENT_WORDS = new Set([
  "card", "button", "btn", "control", "input", "field", "modal", "dialog", "tooltip",
  "badge", "chip", "tag", "alert", "banner", "nav", "navbar", "menu", "table", "tab",
  "tabs", "avatar", "checkbox", "radio", "switch", "slider", "toast", "popover", "sheet",
  "accordion", "header", "footer", "sidebar", "dropdown", "select", "pill",
]);

const SEMANTIC_WORDS = new Set([
  "surface", "background", "bg", "text", "fg", "foreground", "border", "outline", "ring",
  "focus", "shadow", "accent", "brand", "primary", "secondary", "tertiary", "muted",
  "subtle", "danger", "error", "success", "warning", "info", "link", "content", "overlay",
  "scrim", "divider", "placeholder", "disabled", "inverse", "raised", "sunken", "elevated",
  "on", "interactive",
]);

/** Classify a token into a tier from its name and value shape. */
export function tierOf(token: Token): Tier {
  const segs = token.name.split("-");
  if (COMPONENT_WORDS.has(segs[0])) return "component";
  // Ramp-shaped names (trailing numeric step) are primitives — including brand
  // ramps that alias base ramps (e.g. brand-500).
  if (/^\d+$/.test(segs[segs.length - 1])) return "primitive";
  if (segs.some((s) => SEMANTIC_WORDS.has(s))) return "semantic";
  if (token.value.kind === "raw") return "primitive";
  return "semantic";
}

export function countByTier(tokens: Token[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { primitive: 0, semantic: 0, component: 0 };
  for (const t of tokens) counts[tierOf(t)]++;
  return counts;
}
