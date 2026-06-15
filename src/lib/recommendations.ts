import type { Token } from "../types";

/** The kind of value a recommended token should hold (drives the creator UI). */
export type CreateKind = "color" | "radius" | "spacing" | "shadow" | "any";

export interface RecItem {
  key: string; // canonical token name, e.g. "surface-raised"
  group: string; // section, e.g. "Surfaces"
  tier: "semantic" | "component";
  kind: CreateKind;
  desc: string;
}

/**
 * A curated, opinionated catalog of the semantic & component tokens most design
 * systems end up needing. Used to show "what's missing" and seed the creator.
 */
export const RECOMMENDED: RecItem[] = [
  // Surfaces
  { key: "background", group: "Surfaces", tier: "semantic", kind: "color", desc: "App / page background" },
  { key: "surface", group: "Surfaces", tier: "semantic", kind: "color", desc: "Default surface (cards, panels)" },
  { key: "surface-raised", group: "Surfaces", tier: "semantic", kind: "color", desc: "Elevated surface (popovers, menus)" },
  { key: "surface-sunken", group: "Surfaces", tier: "semantic", kind: "color", desc: "Recessed surface (wells, insets)" },
  { key: "overlay", group: "Surfaces", tier: "semantic", kind: "color", desc: "Scrim behind modals" },
  // Text
  { key: "text", group: "Text", tier: "semantic", kind: "color", desc: "Primary text" },
  { key: "text-muted", group: "Text", tier: "semantic", kind: "color", desc: "Secondary text" },
  { key: "text-subtle", group: "Text", tier: "semantic", kind: "color", desc: "Tertiary / placeholder text" },
  { key: "text-inverse", group: "Text", tier: "semantic", kind: "color", desc: "Text on inverted surfaces" },
  { key: "text-raised", group: "Text", tier: "semantic", kind: "color", desc: "Text on a raised surface" },
  // Borders
  { key: "border", group: "Borders", tier: "semantic", kind: "color", desc: "Default border / divider" },
  { key: "border-strong", group: "Borders", tier: "semantic", kind: "color", desc: "High-emphasis border" },
  { key: "focus-ring", group: "Borders", tier: "semantic", kind: "color", desc: "Focus outline color" },
  // Actions
  { key: "primary", group: "Actions", tier: "semantic", kind: "color", desc: "Primary action / brand color" },
  { key: "text-on-primary", group: "Actions", tier: "semantic", kind: "color", desc: "Text / icon on primary" },
  { key: "accent", group: "Actions", tier: "semantic", kind: "color", desc: "Accent / highlight color" },
  { key: "link", group: "Actions", tier: "semantic", kind: "color", desc: "Hyperlink color" },
  // Status
  { key: "success", group: "Status", tier: "semantic", kind: "color", desc: "Success state" },
  { key: "warning", group: "Status", tier: "semantic", kind: "color", desc: "Warning state" },
  { key: "danger", group: "Status", tier: "semantic", kind: "color", desc: "Error / destructive state" },
  { key: "info", group: "Status", tier: "semantic", kind: "color", desc: "Informational state" },
  // Card component
  { key: "card-bg", group: "Card", tier: "component", kind: "color", desc: "Card background" },
  { key: "card-border", group: "Card", tier: "component", kind: "color", desc: "Card border" },
  { key: "card-radius", group: "Card", tier: "component", kind: "radius", desc: "Card corner radius" },
  { key: "card-padding", group: "Card", tier: "component", kind: "spacing", desc: "Card inner padding" },
  // Control component
  { key: "control-bg", group: "Control", tier: "component", kind: "color", desc: "Control / input background" },
  { key: "control-border", group: "Control", tier: "component", kind: "color", desc: "Control border" },
  { key: "control-radius", group: "Control", tier: "component", kind: "radius", desc: "Control corner radius" },
  { key: "control-height", group: "Control", tier: "component", kind: "spacing", desc: "Control height" },
  { key: "control-padding", group: "Control", tier: "component", kind: "spacing", desc: "Control inner padding" },
  // Button component
  { key: "button-bg", group: "Button", tier: "component", kind: "color", desc: "Button background" },
  { key: "button-text", group: "Button", tier: "component", kind: "color", desc: "Button label color" },
  { key: "button-radius", group: "Button", tier: "component", kind: "radius", desc: "Button corner radius" },
];

export interface Coverage {
  item: RecItem;
  present: boolean;
  matches: string[]; // token names that satisfy it
}

function matches(name: string, key: string): boolean {
  const n = name.toLowerCase();
  const k = key.toLowerCase();
  if (n.includes(k)) return true;
  const words = k.split("-");
  const segs = n.split("-");
  return words.every((w) => segs.includes(w));
}

/** Which recommended tokens already exist, and which are missing. */
export function coverage(tokens: Token[]): Coverage[] {
  return RECOMMENDED.map((item) => {
    const m = tokens.filter((t) => matches(t.name, item.key)).map((t) => t.name);
    return { item, present: m.length > 0, matches: m };
  });
}

export interface GroupCoverage {
  group: string;
  items: Coverage[];
  present: number;
  total: number;
}

export function coverageByGroup(tokens: Token[]): GroupCoverage[] {
  const cov = coverage(tokens);
  const order: string[] = [];
  const map = new Map<string, Coverage[]>();
  for (const c of cov) {
    if (!map.has(c.item.group)) {
      map.set(c.item.group, []);
      order.push(c.item.group);
    }
    map.get(c.item.group)!.push(c);
  }
  return order.map((group) => {
    const items = map.get(group)!;
    return { group, items, present: items.filter((i) => i.present).length, total: items.length };
  });
}
