import type { Token } from "../types";
import { resolve } from "./value";
import { parseColor, toCssDisplay, relativeLuminance } from "./color";

/**
 * The "Token Studio theming contract": import color tokens named like these and
 * the app's own UI adopts them. Each entry maps an app CSS variable to the
 * semantic token names it will accept (in priority order).
 */
export interface ThemeRole {
  cssVar: string;
  names: string[];
  label: string;
}

export const THEME_CONTRACT: ThemeRole[] = [
  { cssVar: "--ts-bg", label: "App background", names: ["background", "bg", "color-bg", "color-background"] },
  { cssVar: "--ts-panel", label: "Panels & cards", names: ["surface", "color-surface"] },
  { cssVar: "--ts-bg-elev", label: "Hover surface", names: ["surface-raised", "surface", "color-surface"] },
  { cssVar: "--ts-bg-elev-2", label: "Raised surface", names: ["surface-raised", "surface"] },
  { cssVar: "--ts-border", label: "Borders", names: ["border", "color-border"] },
  { cssVar: "--ts-border-soft", label: "Soft borders", names: ["border", "color-border"] },
  { cssVar: "--ts-text", label: "Text", names: ["text", "color-text"] },
  { cssVar: "--ts-text-dim", label: "Muted text", names: ["text-muted", "color-text-muted"] },
  { cssVar: "--ts-text-faint", label: "Subtle text", names: ["text-subtle", "text-muted"] },
  { cssVar: "--ts-accent", label: "Accent / primary", names: ["color-primary", "primary", "accent", "brand", "color-brand"] },
  { cssVar: "--ts-danger", label: "Danger", names: ["danger", "error", "color-danger"] },
  { cssVar: "--ts-warning", label: "Warning", names: ["warning", "color-warning"] },
  { cssVar: "--ts-success", label: "Success", names: ["success", "color-success"] },
  { cssVar: "--ts-info", label: "Info", names: ["info", "color-info"] },
];

export const THEME_VARS = [...THEME_CONTRACT.map((r) => r.cssVar), "--ts-on-accent"];

export interface UiTheme {
  vars: Record<string, string>;
  /** Distinct app roles satisfied by the imported tokens. */
  matched: number;
  /** True when the resolved app background is light (drives color-scheme). */
  bgIsLight: boolean;
}

/**
 * Resolve the theming contract against the current tokens (active mode).
 * Returns the CSS variables to inject so the UI matches the imported tokens.
 */
export function uiThemeVars(tokens: Token[], byName: Map<string, Token>): UiTheme {
  const resolved = new Map<string, string>();
  for (const t of tokens) {
    if (t.category !== "color") continue;
    const raw = resolve(t, byName).finalRaw;
    const rgb = raw ? parseColor(raw) : null;
    if (rgb) resolved.set(t.name, toCssDisplay(rgb));
  }

  const vars: Record<string, string> = {};
  let matched = 0;
  for (const role of THEME_CONTRACT) {
    for (const n of role.names) {
      const hit = resolved.get(n);
      if (hit) {
        vars[role.cssVar] = hit;
        matched++;
        break;
      }
    }
  }

  // Readable text/icon color to sit on the accent (e.g. primary buttons).
  const accent = vars["--ts-accent"] ? parseColor(vars["--ts-accent"]) : null;
  if (accent) vars["--ts-on-accent"] = relativeLuminance(accent) > 0.55 ? "#06122a" : "#ffffff";

  let bgIsLight = false;
  const bg = vars["--ts-bg"] ? parseColor(vars["--ts-bg"]) : null;
  if (bg) bgIsLight = relativeLuminance(bg) > 0.45;

  return { vars, matched, bgIsLight };
}
