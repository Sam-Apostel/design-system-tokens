import type { Token } from "../types";
import { resolve } from "./value";
import { parseColor, contrastRatio, type RGB } from "./color";

export interface ColorEntry {
  name: string;
  rgb: RGB;
}

export interface Pairing {
  text: ColorEntry;
  surface: ColorEntry;
  wcag: number; // 1..21
  apca: number; // Lc, signed (negative = light-on-dark)
}

const TEXT_RE = /(^|-)(text|fg|foreground|content|ink|label|heading|body|link)(-|$)/i;
const SURFACE_RE = /(^|-)(bg|background|surface|card|canvas|paper|base|panel|sheet)(-|$)/i;

export const isTextName = (n: string) => TEXT_RE.test(n);
export const isSurfaceName = (n: string) => SURFACE_RE.test(n);

/** The color tokens that read as text/foreground and as surface/background. */
export function colorRoles(tokens: Token[], byName: Map<string, Token>) {
  return {
    texts: entries(tokens, byName, TEXT_RE),
    surfaces: entries(tokens, byName, SURFACE_RE),
  };
}

function entries(tokens: Token[], byName: Map<string, Token>, re: RegExp): ColorEntry[] {
  const out: ColorEntry[] = [];
  for (const t of tokens) {
    if (t.category !== "color") continue;
    if (!re.test(t.name)) continue;
    const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
    if (rgb) out.push({ name: t.name, rgb });
  }
  return out;
}

/**
 * APCA (0.0.98G) lightness contrast Lc. Positive = dark text on light bg,
 * negative = light text on dark bg. |Lc| ≥ ~60 is good for body text,
 * ≥ ~45 for large text.
 */
export function apcaLc(text: RGB, bg: RGB): number {
  const lin = (c: number) => Math.pow(c, 2.4);
  const Y = (c: RGB) => 0.2126729 * lin(c.r) + 0.7151522 * lin(c.g) + 0.072175 * lin(c.b);
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const clampBlack = (y: number) => (y >= blkThrs ? y : y + Math.pow(blkThrs - y, blkClmp));

  const Ytxt = clampBlack(Y(text));
  const Ybg = clampBlack(Y(bg));
  if (Math.abs(Ybg - Ytxt) < 0.0005) return 0;

  let sapc: number;
  let out: number;
  if (Ybg > Ytxt) {
    sapc = (Math.pow(Ybg, 0.56) - Math.pow(Ytxt, 0.57)) * 1.14;
    out = sapc < 0.1 ? 0 : sapc - 0.027;
  } else {
    sapc = (Math.pow(Ybg, 0.65) - Math.pow(Ytxt, 0.62)) * 1.14;
    out = sapc > -0.1 ? 0 : sapc + 0.027;
  }
  return out * 100;
}

/* ------------------------------------------------------------------ *
 * Designed pairings — scalable replacement for the every-text×every-surface
 * cross. Pairs only colors that are actually used together, inferred from
 * naming: a component group's foreground(s) over its background state(s), the
 * app-wide foundation text colors over the foundation surfaces, and each
 * `--on-X` over its `X` fill. This is roughly O(n), not O(n²).
 * ------------------------------------------------------------------ */

export interface DesignedPairing extends Pairing {
  /** Pairing group label (component key, "foundation", or "on-color"). */
  group: string;
  /** Either side is a state where low contrast is often intentional. */
  soft: boolean;
}

const FG_LEADING = new Set(["text", "icon", "link", "placeholder", "label", "heading", "title", "caption"]);
const BG_LEADING = new Set(["background", "surface", "app", "panel", "card", "sheet"]);
const ROLE_TAIL = new Set(["text", "fg", "foreground", "bg", "background", "surface", "color", "ink", "content", "fill"]);
const STATE_TAIL = new Set(["hover", "active", "focus", "focused", "pressed", "disabled", "readonly", "invalid", "selected", "checked", "default", "rest"]);
const SOFT_RE = /(disabled|placeholder|skeleton|readonly|inverse|empty)/i;

function colorRole(name: string): "fg" | "bg" | null {
  const n = name.toLowerCase();
  if (n.startsWith("on-")) return "fg";
  const segs = n.split("-");
  for (let i = segs.length - 1; i >= 0; i--) {
    if (STATE_TAIL.has(segs[i])) continue;
    if (["text", "fg", "foreground", "ink", "content", "color", "caption"].includes(segs[i])) return "fg";
    if (["bg", "background", "surface", "fill", "backdrop", "overlay"].includes(segs[i])) return "bg";
    break;
  }
  if (FG_LEADING.has(segs[0])) return "fg";
  if (BG_LEADING.has(segs[0])) return "bg";
  return null;
}

function pairGroupKey(name: string): string {
  let segs = name.toLowerCase().split("-");
  while (segs.length > 1 && (STATE_TAIL.has(segs[segs.length - 1]) || ROLE_TAIL.has(segs[segs.length - 1]))) {
    segs = segs.slice(0, -1);
  }
  return segs.join("-");
}

export function designedPairings(tokens: Token[], byName: Map<string, Token>): DesignedPairing[] {
  const rgbByName = new Map<string, RGB>();
  for (const t of tokens) {
    if (t.category !== "color") continue;
    const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
    if (rgb) rgbByName.set(t.name, rgb);
  }

  const out = new Map<string, DesignedPairing>();
  const add = (fgName: string, bgName: string, group: string) => {
    if (fgName === bgName) return;
    const fg = rgbByName.get(fgName);
    const bg = rgbByName.get(bgName);
    if (!fg || !bg) return;
    const key = `${fgName}|${bgName}`;
    if (out.has(key)) return;
    out.set(key, {
      text: { name: fgName, rgb: fg },
      surface: { name: bgName, rgb: bg },
      wcag: contrastRatio(fg, bg),
      apca: apcaLc(fg, bg),
      group,
      soft: SOFT_RE.test(fgName) || SOFT_RE.test(bgName),
    });
  };

  const stateKey = (name: string) => name.split("-").filter((s) => STATE_TAIL.has(s)).sort().join("-");
  const entries = [...rgbByName.keys()].map((name) => ({ name, role: colorRole(name), group: pairGroupKey(name), state: stateKey(name) }));

  // A. Component-group pairs: foreground(s) × background state(s) within a group.
  // Only pair when states are compatible — a base (stateless) token pairs with
  // anything, but a hover foreground isn't paired with the active background.
  const byGroup = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.role) continue;
    (byGroup.get(e.group) ?? byGroup.set(e.group, []).get(e.group)!).push(e);
  }
  for (const [g, list] of byGroup) {
    const fgs = list.filter((e) => e.role === "fg");
    const bgs = list.filter((e) => e.role === "bg");
    for (const f of fgs) for (const b of bgs) {
      if (f.state && b.state && f.state !== b.state) continue;
      add(f.name, b.name, g);
    }
  }

  // B. Foundation cross: the GENERAL-PURPOSE text colors over the base surfaces.
  // Exclude state/inverse variants — those are context-specific (e.g. an active
  // nav text is a light color meant for its dark active background, not --surface),
  // so crossing them with foundation surfaces yields false 1:1 failures.
  const isStateful = (name: string) => name.split("-").some((s) => STATE_TAIL.has(s)) || /(^|-)inverse(-|$)/.test(name);
  const fFg = entries.filter((e) => e.role === "fg" && FG_LEADING.has(e.name.split("-")[0]) && !isStateful(e.name) && !e.name.startsWith("on-"));
  const fBg = entries.filter((e) => e.role === "bg" && BG_LEADING.has(e.name.split("-")[0]) && !isStateful(e.name));
  for (const f of fFg) for (const b of fBg) add(f.name, b.name, "foundation");

  // C. on-X over its fill.
  for (const t of tokens) {
    if (!/^on-/.test(t.name)) continue;
    const x = t.name.slice(3);
    const cand = [x, `color-${x}`, `surface-${x}`, `${x}-bg`, `${x}-900`, `${x}-500`].find((n) => rgbByName.has(n));
    if (cand) add(t.name, cand, "on-color");
  }

  return [...out.values()];
}

/**
 * Contrast failures the linter should flag: designed pairings that fall below
 * AA, excluding states where low contrast is intentional (disabled/placeholder/
 * inverse). Scales because it only considers real pairings, not the cross.
 */
export function auditableFailures(tokens: Token[], byName: Map<string, Token>): Pairing[] {
  return designedPairings(tokens, byName).filter(
    (p) => !p.soft && !/overlay|scrim/i.test(p.surface.name) && p.wcag < 4.5,
  );
}
