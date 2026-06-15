import type { RGB } from "./color";
import { rgbToOklab } from "./color";

export interface RampMetrics {
  /** 0..1 — how uniform the lightness steps are (1 = perfectly even). */
  lightnessEvenness: number;
  /** Total hue spread in degrees across chromatic steps (0 = constant hue). */
  hueDrift: number;
  /** Higher = more problematic; used to sort scales worst-first. */
  unevenness: number;
}

/** Perceptual ramp quality metrics, computed in OKLCH (order = ramp order). */
export function rampMetrics(colors: RGB[]): RampMetrics {
  const oks = colors.map((c) => {
    const o = rgbToOklab(c);
    return { L: o.L, C: Math.hypot(o.a, o.b), H: (Math.atan2(o.b, o.a) * 180) / Math.PI };
  });

  // Lightness step evenness via coefficient of variation of consecutive deltas.
  const Ls = oks.map((o) => o.L);
  let lightnessEvenness = 1;
  if (Ls.length >= 3) {
    const deltas: number[] = [];
    for (let i = 1; i < Ls.length; i++) deltas.push(Math.abs(Ls[i] - Ls[i - 1]));
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    if (mean > 1e-6) {
      const variance = deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length;
      const cv = Math.sqrt(variance) / mean;
      lightnessEvenness = Math.max(0, Math.min(1, 1 - cv));
    }
  }

  // Hue drift over chromatic steps only (near-neutral hues are meaningless).
  const hues = oks.filter((o) => o.C > 0.02).map((o) => o.H);
  const hueDrift = hues.length >= 2 ? circularRange(hues) : 0;

  const unevenness = (1 - lightnessEvenness) + (Math.min(hueDrift, 90) / 90) * 0.7;
  return { lightnessEvenness, hueDrift, unevenness };
}

/** Smallest arc (in degrees) that contains all the given hue angles. */
function circularRange(deg: number[]): number {
  const rad = deg.map((d) => ((d * Math.PI) / 180 + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < rad.length; i++) maxGap = Math.max(maxGap, rad[i] - rad[i - 1]);
  maxGap = Math.max(maxGap, rad[0] + 2 * Math.PI - rad[rad.length - 1]);
  return ((2 * Math.PI - maxGap) * 180) / Math.PI;
}

export interface LightnessStep {
  /** Measured OKLab lightness (0..1). */
  L: number;
  /** Lightness this step would have on a perfectly even ramp. */
  ideal: number;
  /** L − ideal; sign shows whether the step is too light/dark for its position. */
  residual: number;
  /** True when the step deviates enough to call out. */
  flagged: boolean;
}

/**
 * Lightness across a ramp (in ramp order) versus an evenly-distributed ideal
 * line from the first to the last step. Steps whose residual exceeds a
 * range-relative tolerance — or that reverse direction — are flagged.
 */
export function lightnessProfile(colors: RGB[]): LightnessStep[] {
  const Ls = colors.map((c) => rgbToOklab(c).L);
  const n = Ls.length;
  if (n === 0) return [];
  const first = Ls[0];
  const last = Ls[n - 1];
  const span = last - first;
  const tol = Math.max(0.02, Math.abs(span) * 0.12);

  return Ls.map((L, i) => {
    const ideal = n > 1 ? first + (span * i) / (n - 1) : L;
    const residual = L - ideal;
    // Reversal: this step moves opposite to the overall ramp direction.
    const reversal =
      i > 0 && Math.abs(span) > 1e-6 && Math.sign(L - Ls[i - 1]) === -Math.sign(span);
    const flagged = n >= 3 && (Math.abs(residual) > tol || reversal);
    return { L, ideal, residual, flagged };
  });
}

