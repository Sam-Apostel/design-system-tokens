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

/** Parse any supported CSS color string into sRGB, or null if not a color. */
export function parseColor(input: string): RGB | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v in NAMED) return parseHex(NAMED[v]);
  if (v.startsWith("#")) return parseHex(v);
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

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
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
