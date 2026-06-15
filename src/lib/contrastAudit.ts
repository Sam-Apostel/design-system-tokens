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
const INVERSE_RE = /(inverse|invert|on-|^on$|-on$)/i;

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

/** All text×surface pairings (for the explorer in the Contrast view). */
export function semanticPairings(tokens: Token[], byName: Map<string, Token>) {
  const texts = entries(tokens, byName, TEXT_RE);
  const surfaces = entries(tokens, byName, SURFACE_RE);
  const pairs: Pairing[] = [];
  for (const text of texts) {
    for (const surface of surfaces) {
      pairs.push({ text, surface, wcag: contrastRatio(text.rgb, surface.rgb), apca: apcaLc(text.rgb, surface.rgb) });
    }
  }
  return { texts, surfaces, pairs };
}

/**
 * Conservative subset used by the linter: non-inverse text tokens over
 * non-overlay surfaces, where low contrast is almost certainly a bug.
 */
export function auditableFailures(tokens: Token[], byName: Map<string, Token>): Pairing[] {
  const { pairs } = semanticPairings(tokens, byName);
  return pairs.filter(
    (p) => !INVERSE_RE.test(p.text.name) && !/overlay|scrim/i.test(p.surface.name) && p.wcag < 4.5,
  );
}
