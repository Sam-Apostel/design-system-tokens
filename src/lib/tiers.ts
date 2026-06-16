import type { Token } from "../types";
import { indexByName } from "./value";

/**
 * Design tokens are layered in tiers:
 *  - primitive: raw, context-free values (color ramps, spacing/radius scales).
 *  - semantic: meaning-based tokens (surface, text, border, primary) that
 *    reference primitives.
 *  - component: component-scoped tokens (button-bg, control-height, toast-text)
 *    that reference semantics.
 *
 * Classification combines name signals with *structure*: the tier a token
 * references largely determines its own tier (a token aliasing a semantic is a
 * component token), which is far more robust across real systems than name
 * heuristics alone.
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
  component: "Component-scoped tokens that reference semantics (button-bg, toast-text…).",
};

// Leading segment marks a component-scoped token.
const COMPONENT_WORDS = new Set([
  "card", "button", "btn", "control", "input", "field", "modal", "dialog", "drawer",
  "sheet", "tooltip", "badge", "chip", "tag", "mention", "alert", "banner", "snackbar",
  "toast", "navbar", "sidebar", "menu", "dropdown", "table", "tab", "tabs", "avatar",
  "checkbox", "radio", "switch", "slider", "toggle", "selection", "popover", "hovercard",
  "accordion", "header", "footer", "panel", "select", "pill", "label", "link", "list",
  "stats", "stat", "thumbnail", "notification", "notifications", "comment", "comments",
  "suggestion", "discussion", "breadcrumb", "pagination", "stepper", "progress", "spinner",
  "skeleton", "calendar", "datepicker", "tree", "page", "section", "stat",
]);

// Two-segment component prefixes whose first segment alone is too generic.
const COMPONENT_COMPOUNDS = new Set(["side-nav", "hover-card", "action-link"]);

// Leading segment marks a meaning/role token (kept semantic even if it aliases
// another semantic — a common, if loose, pattern).
const SEMANTIC_WORDS = new Set([
  "background", "bg", "surface", "text", "fg", "foreground", "border", "outline",
  "ring", "focus", "shadow", "accent", "brand", "primary", "secondary", "tertiary",
  "muted", "subtle", "danger", "error", "success", "warning", "info", "content",
  "overlay", "scrim", "divider", "placeholder", "disabled", "inverse", "icon", "on",
  "color", "selected", "nav", "app", "default", "normal", "elevation", "spacing",
  "rounded", "font", "border", "sub", "interactive",
]);

// Leading segment of a primitive ramp/scale family.
const PRIMITIVE_FAMILIES = new Set([
  "primary", "secondary", "grey", "gray", "slate", "zinc", "neutral", "stone", "blue",
  "red", "green", "amber", "orange", "yellow", "purple", "pink", "violet", "indigo",
  "teal", "cyan", "lime", "emerald", "sky", "rose", "fuchsia", "white", "black",
  "space", "spacing", "radius", "size", "font", "line", "letter", "shadow", "ring",
  "duration", "easing", "z", "opacity", "blur",
]);

const NUMERIC_STEP_RE = /^\d/; // trailing segment starting with a digit (50, 0-5, a7…)

function isComponentName(segs: string[]): boolean {
  if (COMPONENT_WORDS.has(segs[0])) return true;
  if (segs.length > 1 && COMPONENT_COMPOUNDS.has(`${segs[0]}-${segs[1]}`)) return true;
  return false;
}

function isPrimitiveName(name: string, segs: string[]): boolean {
  if (PRIMITIVE_FAMILIES.has(segs[0])) return true;
  // Trailing scale step (e.g. -500, -0-5, -a7) on a ramp family handled above;
  // also catch monochrome singletons.
  if (segs.length > 1 && NUMERIC_STEP_RE.test(segs[segs.length - 1])) return true;
  if (name === "white" || name === "black" || name === "transparent") return true;
  return false;
}

/** Classify one token's tier, using the token graph for structural inference. */
export function tierOf(token: Token, byName?: Map<string, Token>, seen = new Set<string>()): Tier {
  const segs = token.name.split("-");
  if (isComponentName(segs)) return "component";
  if (isPrimitiveName(token.name, segs)) return "primitive";
  if (SEMANTIC_WORDS.has(segs[0])) return "semantic";

  // Structural: a raw value with no role/component name is a leaf primitive
  // only if it truly looks foundational; otherwise treat unknown raws as
  // semantic (they carry meaning, e.g. a one-off brand hex).
  if (token.value.kind === "raw") return "semantic";

  if (!byName) return "semantic";
  if (seen.has(token.name)) return "semantic"; // cycle guard
  seen.add(token.name);
  const target = byName.get(token.value.ref);
  const targetTier = target ? tierOf(target, byName, seen) : null;
  if (targetTier === "primitive") return "semantic";
  if (targetTier === "semantic" || targetTier === "component") return "component";
  return "semantic";
}

export function countByTier(tokens: Token[]): Record<Tier, number> {
  const byName = indexByName(tokens);
  const counts: Record<Tier, number> = { primitive: 0, semantic: 0, component: 0 };
  for (const t of tokens) counts[tierOf(t, byName)]++;
  return counts;
}

/** Tier for every token, computed once (for views that need the whole map). */
export function tierMap(tokens: Token[]): Map<string, Tier> {
  const byName = indexByName(tokens);
  const m = new Map<string, Tier>();
  for (const t of tokens) m.set(t.name, tierOf(t, byName));
  return m;
}
