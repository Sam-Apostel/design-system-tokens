import type { TokenCategory } from "../types";
import { isColor } from "./color";
import { isShadowToken } from "./shadows";

const LENGTH_RE = /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in)$/i;
const UNITLESS_NUM_RE = /^-?[\d.]+$/;

const TYPO_NAME_RE =
  /(^|[-_])(font|leading|tracking|line-?height|letter-?spacing|weight|family|typeface|text|type)([-_]|$)/i;
const SPACING_NAME_RE =
  /(^|[-_])(space|spacing|gap|size|sz|radius|rounded|width|height|inset|margin|padding|pad|offset|elevation)([-_]|$)/i;
const COLOR_NAME_RE =
  /(^|[-_])(color|colour|palette|brand|bg|background|fg|foreground|border|surface|shadow|accent|fill|stroke|ink)([-_]|$)/i;

function isLength(v: string): boolean {
  return LENGTH_RE.test(v.trim());
}

function looksLikeFontFamily(v: string): boolean {
  if (!/,/.test(v) || !/[a-z]/i.test(v) || isColor(v)) return false;
  // Exclude comma-bearing values that are actually shadows / gradients /
  // transitions / filters: those carry lengths, colors, or functions, which a
  // real font stack never does.
  if (/#[0-9a-f]{3,8}\b/i.test(v)) return false;
  if (/\b(rgba?|hsla?|okl?ch|oklab|lab|lch|var|calc|color-mix|url|gradient|inset|cubic-bezier)\b/i.test(v)) return false;
  if (/(?:^|\s|,)-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|pt|pc|ch|ex|cm|mm|in|deg|ms|s)\b/i.test(v)) return false;
  if (/\(/.test(v)) return false;
  return true;
}

/**
 * Classify a token using both its resolved literal value and its name.
 * `finalRaw` may be null for broken aliases — then we fall back to name only.
 */
export function classify(name: string, finalRaw: string | null): TokenCategory {
  const v = (finalRaw ?? "").trim();

  if (v && isColor(v)) return "color";

  // Box-shadow / elevation / ring values (offsets + blur + color, possibly
  // multi-layer). These are not colors or lengths, so without this they fall
  // through to "other". A token named *-shadow-color stays a color (handled
  // above) — only real shadow definitions reach here.
  if (isShadowToken(name, v)) return "shadow";

  // A bare percentage whose name reads as a ratio (color-mix amount, opacity,
  // blend) is NOT a spacing/size token — keep it out of the spacing bucket.
  if (/^\d*\.?\d+%$/.test(v) && /(mix|ratio|opacity|amount|percent|alpha|blend|tint|shade)/i.test(name)) {
    return "other";
  }

  if (TYPO_NAME_RE.test(name)) {
    // text/type are also used for colors sometimes; only claim typography
    // when the value is clearly not a color.
    if (!v || !isColor(v)) return "typography";
  }

  if (looksLikeFontFamily(v)) return "typography";

  // Font weights are unitless numbers under a weight-ish name.
  if (UNITLESS_NUM_RE.test(v) && /(weight|font)/i.test(name)) return "typography";

  if (isLength(v)) {
    if (TYPO_NAME_RE.test(name)) return "typography";
    return "spacing";
  }

  if (SPACING_NAME_RE.test(name)) return "spacing";
  if (COLOR_NAME_RE.test(name) && v && isColor(v)) return "color";

  return "other";
}
