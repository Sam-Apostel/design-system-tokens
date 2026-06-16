// Self-contained color parsing, conversion and formatting.
// Everything is pure (no DOM) so it can be unit-reasoned and run anywhere.
//
// Internal working representation is sRGB with channels in 0..1 plus alpha.

export interface RGB {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  a: number; // 0..1
}

export type ColorSpace = "oklab" | "cielab" | "hsl";

/** A point placed on a 2D chroma plane plus a separate lightness axis. */
export interface SpacePoint {
  lightness: number; // 0..1 normalized for plotting
  x: number; // cartesian chroma-plane X, normalized roughly -1..1
  y: number; // cartesian chroma-plane Y, normalized roughly -1..1
  hue: number; // degrees 0..360
  chroma: number; // 0..1 normalized
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

// A compact dictionary of common CSS named colors. Not exhaustive, but
// covers the names that realistically show up in token files.
const NAMED: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  cyan: "#00ffff",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  gold: "#ffd700",
  indigo: "#4b0082",
  violet: "#ee82ee",
  coral: "#ff7f50",
  salmon: "#fa8072",
  khaki: "#f0e68c",
  crimson: "#dc143c",
  turquoise: "#40e0d0",
  tomato: "#ff6347",
  slategray: "#708090",
  slategrey: "#708090",
  rebeccapurple: "#663399",
};

function parseHex(input: string): RGB | null {
  let h = input.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const num = h.split("").every((c) => /[0-9a-fA-F]/.test(c));
  if (!num) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseNumberList(inner: string): number[] {
  return inner
    .replace(/\//g, " ")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s)));
}

function parseFunc(input: string): RGB | null {
  const m = input.match(/^([a-z]+)\(([^)]*)\)$/i);
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const raw = m[2];

  if (fn === "rgb" || fn === "rgba") {
    const parts = raw
      .replace(/\//g, " ")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const toCh = (s: string) => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s) / 255);
    const r = toCh(parts[0]);
    const g = toCh(parts[1]);
    const b = toCh(parts[2]);
    const a = parts[3] != null ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
  }
  if (fn === "hsl" || fn === "hsla") {
    const parts = raw
      .replace(/\//g, " ")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    const a = parts[3] != null ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    return { ...hslToRgb(h, s, l), a: clamp01(a) };
  }
  if (fn === "oklch") {
    const [L, C, h, alpha] = parseNumberList(raw);
    return { ...oklchToRgb(L, C, h), a: alpha != null ? clamp01(alpha) : 1 };
  }
  if (fn === "oklab") {
    const [L, a, b, alpha] = parseNumberList(raw);
    return { ...oklabToRgb(L, a, b), a: alpha != null ? clamp01(alpha) : 1 };
  }
  return null;
}

/** Split on top-level commas, ignoring commas nested inside parentheses. */
export function splitTopLevelCommas(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

/**
 * Mix two colors by weight `w1` (c2 gets `1 - w1`) in the given interpolation
 * space, mirroring CSS `color-mix()`. Defaults to sRGB.
 */
export function mixColors(c1: RGB, c2: RGB, w1: number, space = "srgb"): RGB {
  const w = clamp01(w1);
  const t = 1 - w;
  const a = c1.a * w + c2.a * t;
  const lerp = (x: number, y: number) => x * w + y * t;
  const lerpHue = (h1: number, h2: number) => {
    let d = (((h2 - h1) % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return (((h1 + d * t) % 360) + 360) % 360; // t is c2's weight
  };
  const sp = space.toLowerCase();
  if (sp === "srgb-linear") {
    return { r: toGamma(lerp(toLinear(c1.r), toLinear(c2.r))), g: toGamma(lerp(toLinear(c1.g), toLinear(c2.g))), b: toGamma(lerp(toLinear(c1.b), toLinear(c2.b))), a };
  }
  if (sp === "hsl") {
    const A = rgbToHsl(c1), B = rgbToHsl(c2);
    return { ...hslToRgb(lerpHue(A.h, B.h), lerp(A.s, B.s), lerp(A.l, B.l)), a };
  }
  if (sp === "oklab") {
    const A = rgbToOklab(c1), B = rgbToOklab(c2);
    return { ...oklabToRgb(lerp(A.L, B.L), lerp(A.a, B.a), lerp(A.b, B.b)), a };
  }
  if (sp === "oklch") {
    const A = rgbToOklch(c1), B = rgbToOklch(c2);
    return { ...oklchToRgb(lerp(A.L, B.L), lerp(A.C, B.C), lerpHue(A.h, B.h)), a };
  }
  if (sp === "lab" || sp === "cielab") {
    const A = rgbToLab(c1), B = rgbToLab(c2);
    return { ...labToRgb(lerp(A.L, B.L), lerp(A.a, B.a), lerp(A.b, B.b)), a };
  }
  if (sp === "lch" || sp === "cielch") {
    const A = rgbToLab(c1), B = rgbToLab(c2);
    const cA = Math.hypot(A.a, A.b), hA = (Math.atan2(A.b, A.a) * 180) / Math.PI;
    const cB = Math.hypot(B.a, B.b), hB = (Math.atan2(B.b, B.a) * 180) / Math.PI;
    const L = lerp(A.L, B.L), C = lerp(cA, cB), h = (lerpHue(hA, hB) * Math.PI) / 180;
    return { ...labToRgb(L, C * Math.cos(h), C * Math.sin(h)), a };
  }
  // default: sRGB (gamma)
  return { r: lerp(c1.r, c2.r), g: lerp(c1.g, c2.g), b: lerp(c1.b, c2.b), a };
}

/** Substitute for `currentColor` when a concrete color is needed for plotting. */
const CURRENT_COLOR_FALLBACK: RGB = { r: 0.5, g: 0.5, b: 0.5, a: 1 };

/** Parse `color-mix(in <space>, C1 [p1%], C2 [p2%])`; operands must be literal. */
function parseColorMix(input: string): RGB | null {
  const m = input.match(/^color-mix\(\s*in\s+([a-z0-9-]+)\s*,\s*([\s\S]+)\)$/i);
  if (!m) return null;
  const space = m[1];
  const parts = splitTopLevelCommas(m[2]);
  if (parts.length !== 2) return null;
  const parseOperand = (raw: string): { rgb: RGB; pct?: number } | null => {
    const pm = raw.trim().match(/^([\s\S]*?)\s+([\d.]+)%\s*$/);
    const colorStr = (pm ? pm[1] : raw).trim();
    const pct = pm ? parseFloat(pm[2]) : undefined;
    const rgb = /^currentcolor$/i.test(colorStr) ? CURRENT_COLOR_FALLBACK : parseColor(colorStr);
    return rgb ? { rgb, pct } : null;
  };
  const a = parseOperand(parts[0]);
  const b = parseOperand(parts[1]);
  if (!a || !b) return null;
  // Resolve weights: missing percentages fill in to sum to 100.
  let w1 = a.pct, w2 = b.pct;
  if (w1 == null && w2 == null) { w1 = 50; w2 = 50; }
  else if (w1 == null) w1 = 100 - (w2 as number);
  else if (w2 == null) w2 = 100 - w1;
  const sum = (w1 as number) + (w2 as number) || 1;
  return mixColors(a.rgb, b.rgb, (w1 as number) / sum, space);
}

/** Parse any supported CSS color string into sRGB, or null if not a color. */
export function parseColor(input: string): RGB | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v in NAMED) return parseHex(NAMED[v]);
  if (v.startsWith("#")) return parseHex(v);
  if (v.startsWith("color-mix(")) return parseColorMix(v);
  if (v.startsWith("light-dark(")) {
    // Render the light (first) argument; per-mode display is handled upstream.
    const m = v.match(/^light-dark\(([\s\S]*)\)$/);
    if (m) {
      const parts = splitTopLevelCommas(m[1]);
      if (parts.length) return parseColor(parts[0].trim());
    }
    return null;
  }
  if (/^[a-z]+\(/.test(v)) return parseFunc(v);
  return null;
}

export function isColor(input: string): boolean {
  return parseColor(input) != null;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const to255 = (v: number) => Math.round(clamp01(v) * 255);

export function toHex(c: RGB): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const base = `#${hex(to255(c.r))}${hex(to255(c.g))}${hex(to255(c.b))}`;
  return c.a < 1 ? base + hex(to255(c.a)) : base;
}

export function toRgbString(c: RGB): string {
  const r = to255(c.r);
  const g = to255(c.g);
  const b = to255(c.b);
  return c.a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(c.a, 3)})` : `rgb(${r}, ${g}, ${b})`;
}

export function toCssDisplay(c: RGB): string {
  // What we render in swatches; always valid CSS.
  return c.a < 1 ? toRgbString(c) : toHex(c);
}

const round = (v: number, p = 4) => {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
};

/* ------------------------------------------------------------------ *
 * sRGB <-> linear
 * ------------------------------------------------------------------ */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/* ------------------------------------------------------------------ *
 * HSL
 * ------------------------------------------------------------------ */

export function hslToRgb(h: number, s: number, l: number): Omit<RGB, "a"> {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

export function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === c.r) h = ((c.g - c.b) / d) % 6;
    else if (max === c.g) h = (c.b - c.r) / d + 2;
    else h = (c.r - c.g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/* ------------------------------------------------------------------ *
 * OKLab / OKLCH (Björn Ottosson)
 * ------------------------------------------------------------------ */

export function rgbToOklab(c: RGB): { L: number; a: number; b: number } {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const bb = toLinear(c.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bb;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bb;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToRgb(L: number, a: number, b: number): Omit<RGB, "a"> {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return { r: clamp01(toGamma(r)), g: clamp01(toGamma(g)), b: clamp01(toGamma(bb)) };
}

export function oklchToRgb(L: number, C: number, h: number): Omit<RGB, "a"> {
  const hr = (h * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(hr), C * Math.sin(hr));
}

export function rgbToOklch(c: RGB): { L: number; C: number; h: number } {
  const { L, a, b } = rgbToOklab(c);
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** Convert OKLCH to a hex string, gamut-clamped into sRGB. */
export function oklchToHex(L: number, C: number, h: number, a = 1): string {
  return toHex({ ...oklchToRgb(L, C, h), a });
}

/** True if an OKLCH triple lands inside the sRGB gamut (no channel clipping). */
export function oklchInGamut(L: number, C: number, h: number): boolean {
  const hr = (h * Math.PI) / 180;
  const l_ = L + 0.3963377774 * (C * Math.cos(hr)) + 0.2158037573 * (C * Math.sin(hr));
  const m_ = L - 0.1055613458 * (C * Math.cos(hr)) - 0.0638541728 * (C * Math.sin(hr));
  const s_ = L - 0.0894841775 * (C * Math.cos(hr)) - 1.291485548 * (C * Math.sin(hr));
  const lin = [l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_];
  const r = 4.0767416621 * lin[0] - 3.3077115913 * lin[1] + 0.2309699292 * lin[2];
  const g = -1.2684380046 * lin[0] + 2.6097574011 * lin[1] - 0.3413193965 * lin[2];
  const b = -0.0041960863 * lin[0] - 0.7034186147 * lin[1] + 1.707614701 * lin[2];
  const eps = 0.0001;
  return [r, g, b].every((v) => v >= -eps && v <= 1 + eps);
}

/**
 * Rotate hue / shift lightness of a color literal, preserving chroma and alpha.
 * Returns a hex string, or null if the input isn't a color. Used to recolor a
 * whole ramp at once (e.g. clone blue-* into teal-* by rotating hue).
 */
export function shiftColor(raw: string, dHue: number, dL = 0): string | null {
  const rgb = parseColor(raw);
  if (!rgb) return null;
  const { L, C, h } = rgbToOklch(rgb);
  const nl = Math.min(1, Math.max(0, L + dL));
  return oklchToHex(nl, C, h + dHue, rgb.a);
}

/** Largest in-gamut chroma for a given L/h, found by binary search. */
export function maxChroma(L: number, h: number): number {
  if (L <= 0 || L >= 1) return 0;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (oklchInGamut(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/* ------------------------------------------------------------------ *
 * CIELAB (D65)
 * ------------------------------------------------------------------ */

export function rgbToLab(c: RGB): { L: number; a: number; b: number } {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const bb = toLinear(c.b);

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * bb) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * bb;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * bb) / 1.08883;

  const e = 216 / 24389;
  const k = 24389 / 27;
  const f = (t: number) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIELAB (D65) → linear sRGB, unclamped (for gamut testing). */
function labLin(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const inv = (f: number, isY: boolean) => {
    const f3 = f * f * f;
    if (isY) return L > k * e ? f3 : L / k;
    return f3 > e ? f3 : (116 * f - 16) / k;
  };
  const x = inv(fx, false) * 0.95047;
  const y = inv(fy, true);
  const z = inv(fz, false) * 1.08883;
  return {
    r: 3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    g: -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    b: 0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  };
}

export function labToRgb(L: number, a: number, b: number): Omit<RGB, "a"> {
  const lin = labLin(L, a, b);
  return { r: clamp01(toGamma(lin.r)), g: clamp01(toGamma(lin.g)), b: clamp01(toGamma(lin.b)) };
}

export function labInGamut(L: number, a: number, b: number): boolean {
  const lin = labLin(L, a, b);
  const eps = 0.001;
  return [lin.r, lin.g, lin.b].every((v) => v >= -eps && v <= 1 + eps);
}

/* ------------------------------------------------------------------ *
 * Plane editing & slicing (interactive color-space plots)
 * ------------------------------------------------------------------ */

/** Which 2D projection of a color space a plot shows. */
export type PlotPlane = "ab" | "LC" | "LH";

const wrapHue = (h: number) => ((h % 360) + 360) % 360;

/**
 * Map a position on a color-space plane back to a color, holding the dimension
 * the plane doesn't show fixed to `base`'s value. (dx, dy) are the plane's data
 * coordinates — same units as toSpacePoint emits per plane. Used for dragging a
 * single stop in the plots.
 */
export function editToRgb(space: ColorSpace, plane: PlotPlane, dx: number, dy: number, base: RGB): RGB {
  if (space === "hsl") {
    const { h, s, l } = rgbToHsl(base);
    if (plane === "ab") return { ...hslToRgb(wrapHue((Math.atan2(dy, dx) * 180) / Math.PI), Math.min(1, Math.hypot(dx, dy)), l), a: base.a };
    if (plane === "LC") return { ...hslToRgb(h, clamp01(dx), clamp01(dy)), a: base.a };
    return { ...hslToRgb(wrapHue(dx), s, clamp01(dy)), a: base.a };
  }
  if (space === "oklab") {
    const o = rgbToOklab(base);
    if (plane === "ab") return { ...oklabToRgb(o.L, dx * 0.4, dy * 0.4), a: base.a };
    if (plane === "LC") {
      const C = Math.max(0, dx * 0.4);
      const hr = Math.atan2(o.b, o.a);
      return { ...oklabToRgb(clamp01(dy), C * Math.cos(hr), C * Math.sin(hr)), a: base.a };
    }
    const C = Math.hypot(o.a, o.b);
    const hr = (dx * Math.PI) / 180;
    return { ...oklabToRgb(clamp01(dy), C * Math.cos(hr), C * Math.sin(hr)), a: base.a };
  }
  const lab = rgbToLab(base);
  if (plane === "ab") return { ...labToRgb(lab.L, dx * 128, dy * 128), a: base.a };
  if (plane === "LC") {
    const C = Math.max(0, dx * 128);
    const hr = Math.atan2(lab.b, lab.a);
    return { ...labToRgb(clamp01(dy) * 100, C * Math.cos(hr), C * Math.sin(hr)), a: base.a };
  }
  const C = Math.hypot(lab.a, lab.b);
  const hr = (dx * Math.PI) / 180;
  return { ...labToRgb(clamp01(dy) * 100, C * Math.cos(hr), C * Math.sin(hr)), a: base.a };
}

/**
 * The color at a point on a plane slice, or null if it's outside the sRGB gamut.
 * `held` is the fixed value of the dimension the plane doesn't show (lightness
 * for "ab", hue° for "LC", chroma for "LH"). Used to paint the plot background.
 */
export function slicePixel(space: ColorSpace, plane: PlotPlane, dx: number, dy: number, held: number): RGB | null {
  if (space === "hsl") {
    if (plane === "ab") {
      const s = Math.hypot(dx, dy);
      if (s > 1) return null;
      return { ...hslToRgb(wrapHue((Math.atan2(dy, dx) * 180) / Math.PI), s, held), a: 1 };
    }
    if (plane === "LC") {
      if (dx < 0 || dx > 1 || dy < 0 || dy > 1) return null;
      return { ...hslToRgb(held, dx, dy), a: 1 };
    }
    if (dy < 0 || dy > 1) return null;
    return { ...hslToRgb(wrapHue(dx), held, dy), a: 1 };
  }
  let L: number, a: number, b: number;
  if (space === "oklab") {
    if (plane === "ab") { L = held; a = dx * 0.4; b = dy * 0.4; }
    else if (plane === "LC") { L = dy; const C = dx * 0.4; if (C < 0) return null; const hr = (held * Math.PI) / 180; a = C * Math.cos(hr); b = C * Math.sin(hr); }
    else { L = dy; const hr = (dx * Math.PI) / 180; a = held * Math.cos(hr); b = held * Math.sin(hr); }
    if (L <= 0 || L >= 1) return null;
    if (!oklchInGamut(L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI)) return null;
    return { ...oklabToRgb(L, a, b), a: 1 };
  }
  if (plane === "ab") { L = held; a = dx * 128; b = dy * 128; }
  else if (plane === "LC") { L = dy * 100; const C = dx * 128; if (C < 0) return null; const hr = (held * Math.PI) / 180; a = C * Math.cos(hr); b = C * Math.sin(hr); }
  else { L = dy * 100; const hr = (dx * Math.PI) / 180; a = held * Math.cos(hr); b = held * Math.sin(hr); }
  if (L <= 0 || L >= 100) return null;
  if (!labInGamut(L, a, b)) return null;
  return { ...labToRgb(L, a, b), a: 1 };
}

/* ------------------------------------------------------------------ *
 * Plot coordinates per color space
 * ------------------------------------------------------------------ */

export function toSpacePoint(c: RGB, space: ColorSpace): SpacePoint {
  if (space === "oklab") {
    const { L, a, b } = rgbToOklab(c);
    const chroma = Math.sqrt(a * a + b * b);
    return {
      lightness: clamp01(L),
      x: a / 0.4,
      y: b / 0.4,
      hue: (Math.atan2(b, a) * 180) / Math.PI,
      chroma: clamp01(chroma / 0.4),
    };
  }
  if (space === "cielab") {
    const { L, a, b } = rgbToLab(c);
    const chroma = Math.sqrt(a * a + b * b);
    return {
      lightness: clamp01(L / 100),
      x: a / 128,
      y: b / 128,
      hue: (Math.atan2(b, a) * 180) / Math.PI,
      chroma: clamp01(chroma / 128),
    };
  }
  // hsl
  const { h, s, l } = rgbToHsl(c);
  const hr = (h * Math.PI) / 180;
  return {
    lightness: clamp01(l),
    x: s * Math.cos(hr),
    y: s * Math.sin(hr),
    hue: h,
    chroma: clamp01(s),
  };
}

/* ------------------------------------------------------------------ *
 * Contrast (WCAG 2.1)
 * ------------------------------------------------------------------ */

export function relativeLuminance(c: RGB): number {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** sRGB page color assumed behind a translucent background when none is known. */
const PAGE_BASE: RGB = { r: 1, g: 1, b: 1, a: 1 };

/** Alpha-composite `fg` over `bg` (straight alpha, sRGB). */
export function compositeOver(fg: RGB, bg: RGB): RGB {
  const fa = fg.a ?? 1;
  if (fa >= 1) return { ...fg, a: 1 };
  const ba = bg.a ?? 1;
  const a = fa + ba * (1 - fa);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const blend = (f: number, b: number) => (f * fa + b * ba * (1 - fa)) / a;
  return { r: blend(fg.r, bg.r), g: blend(fg.g, bg.g), b: blend(fg.b, bg.b), a };
}

/**
 * WCAG contrast ratio, 1..21. `fg` is the foreground (text), `bg` the surface.
 * WCAG is defined on opaque colors, so a translucent foreground is composited
 * over the background first, and a translucent background over an assumed white
 * page — otherwise alpha is silently ignored and the ratio is wildly wrong
 * (e.g. rgba(0,0,0,.1) over white would read 21:1 instead of ~1.2:1).
 */
export function contrastRatio(fg: RGB, bg: RGB): number {
  const bgOpaque = (bg.a ?? 1) >= 1 ? bg : compositeOver(bg, PAGE_BASE);
  const fgOpaque = (fg.a ?? 1) >= 1 ? fg : compositeOver(fg, bgOpaque);
  const la = relativeLuminance(fgOpaque);
  const lb = relativeLuminance(bgOpaque);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastRating {
  ratio: number;
  aaNormal: boolean;
  aaLargeOrAaaNormal: boolean; // ratio >= 4.5 already AA normal; this flags >=3
  aaaNormal: boolean;
  label: string;
}

export function rateContrast(a: RGB, b: RGB): ContrastRating {
  const ratio = contrastRatio(a, b);
  const aaNormal = ratio >= 4.5;
  const aaaNormal = ratio >= 7;
  const aaLarge = ratio >= 3;
  let label = "Fail";
  if (aaaNormal) label = "AAA";
  else if (aaNormal) label = "AA";
  else if (aaLarge) label = "AA Large";
  return { ratio, aaNormal, aaLargeOrAaaNormal: aaLarge, aaaNormal, label };
}

/** Perceptual distance in OKLab — good for detecting near-duplicate colors. */
export function colorDistance(a: RGB, b: RGB): number {
  const oa = rgbToOklab(a);
  const ob = rgbToOklab(b);
  const dL = oa.L - ob.L;
  const da = oa.a - ob.a;
  const db = oa.b - ob.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
