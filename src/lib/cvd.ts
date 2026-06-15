import type { RGB } from "./color";

// Color-vision-deficiency simulation using Machado et al. (2009) matrices at
// full severity, applied in linear-RGB space.

export type CvdMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export const CVD_OPTIONS: { id: CvdMode; label: string }[] = [
  { id: "none", label: "Normal vision" },
  { id: "protanopia", label: "Protanopia (red-blind)" },
  { id: "deuteranopia", label: "Deuteranopia (green-blind)" },
  { id: "tritanopia", label: "Tritanopia (blue-blind)" },
];

type M = [number, number, number, number, number, number, number, number, number];

const MATRICES: Record<Exclude<CvdMode, "none">, M> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Simulate how a color appears under the given color-vision deficiency. */
export function simulateCvd(c: RGB, mode: CvdMode): RGB {
  if (mode === "none") return c;
  const m = MATRICES[mode];
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const nr = m[0] * r + m[1] * g + m[2] * b;
  const ng = m[3] * r + m[4] * g + m[5] * b;
  const nb = m[6] * r + m[7] * g + m[8] * b;
  return { r: toGamma(clamp01(nr)), g: toGamma(clamp01(ng)), b: toGamma(clamp01(nb)), a: c.a };
}
