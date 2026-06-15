// Pure generators for building token scales from scratch — the "create a token
// system" half of the app. Color ramps are produced in OKLCH so steps are
// perceptually even and stay inside the sRGB gamut; numeric scales support
// modular (ratio) and linear progressions.

import { parseColor, rgbToOklch, oklchToHex, maxChroma } from "./color";

/* ------------------------------ color ramps ------------------------------ */

export interface RampStep {
  label: string;
  hex: string;
  L: number;
  C: number;
}

export interface ColorRampOpts {
  seed: string; // any CSS color
  steps: number; // number of stops
  lightLightness: number; // 0..1, lightest end
  darkLightness: number; // 0..1, darkest end
  chromaMult: number; // multiplier on the seed's chroma
}

const LABELS_10 = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];

export function rampLabels(n: number): string[] {
  if (n === 10) return LABELS_10;
  if (n === 11) return [...LABELS_10, "950"];
  if (n === 9) return LABELS_10.slice(1);
  return Array.from({ length: n }, (_, i) => (i === 0 ? "50" : String(i * 100)));
}

/** Hue → conventional color-family name, for suggesting a token prefix. */
export function hueName(h: number): string {
  const hh = ((h % 360) + 360) % 360;
  // Boundaries in OKLCH hue degrees, tuned against common palette anchors
  // (Tailwind blue-500 ≈ 260°, red ≈ 27°, green ≈ 150°).
  const table: [number, string][] = [
    [25, "red"], [55, "orange"], [95, "amber"], [145, "green"], [195, "teal"],
    [230, "cyan"], [275, "blue"], [300, "indigo"], [335, "purple"], [350, "pink"],
    [360, "red"],
  ];
  for (const [max, name] of table) if (hh < max) return name;
  return "gray";
}

export function generateColorRamp(o: ColorRampOpts): RampStep[] {
  const rgb = parseColor(o.seed) ?? { r: 0.3, g: 0.5, b: 0.95, a: 1 };
  const { h, C } = rgbToOklch(rgb);
  // A near-neutral seed has no meaningful hue; keep a touch of chroma so the
  // ramp isn't dead flat, but don't invent a vivid hue.
  const labels = rampLabels(o.steps);
  const n = labels.length;
  const target = C * o.chromaMult;
  return labels.map((label, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const L = o.lightLightness + (o.darkLightness - o.lightLightness) * t;
    const Cc = Math.min(target, maxChroma(L, h));
    return { label, hex: oklchToHex(L, Cc, h), L, C: Cc };
  });
}

export function suggestRampPrefix(seed: string): string {
  const rgb = parseColor(seed);
  if (!rgb) return "color-blue";
  const { C, h } = rgbToOklch(rgb);
  return `color-${C < 0.03 ? "gray" : hueName(h)}`;
}

/* ----------------------------- numeric scales ----------------------------- */

export type ScaleMode = "modular" | "linear";
export type ScaleUnit = "px" | "rem";

export interface NumericScaleOpts {
  base: number;
  ratio: number; // used in modular mode
  step: number; // used in linear mode
  mode: ScaleMode;
  unit: ScaleUnit;
  labels: string[]; // ordered small → large
  baseIndex: number; // index of the label that equals `base`
}

export interface NumericStep {
  label: string;
  value: string; // formatted with unit
  px: number; // numeric px for preview bars
}

const round = (v: number, p = 4) => {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
};

export function generateNumericScale(o: NumericScaleOpts): NumericStep[] {
  return o.labels.map((label, i) => {
    const k = i - o.baseIndex;
    let v = o.mode === "modular" ? o.base * Math.pow(o.ratio, k) : o.base + o.step * k;
    v = Math.max(0, v);
    const display = o.unit === "rem" ? round(v / 16, 4) : Math.round(v * 100) / 100;
    return { label, value: `${display}${o.unit}`, px: v };
  });
}

export const SPACING_LABEL_PRESETS: Record<string, string[]> = {
  "t-shirt": ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"],
  numeric: ["1", "2", "3", "4", "5", "6", "8", "10", "12"],
};

export const TYPE_LABEL_PRESETS: Record<string, string[]> = {
  "t-shirt": ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"],
  semantic: ["caption", "body", "subheading", "heading", "title", "display"],
};

export const RATIO_PRESETS: { label: string; value: number }[] = [
  { label: "Minor third · 1.200", value: 1.2 },
  { label: "Major third · 1.250", value: 1.25 },
  { label: "Perfect fourth · 1.333", value: 1.333 },
  { label: "Golden · 1.618", value: 1.618 },
];
