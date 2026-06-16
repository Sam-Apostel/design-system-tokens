// Prebuilt theme presets. Each is a compact spec; buildPreset() expands it into
// a full tiered token set using the OKLCH ramp generator, emitting the semantic
// names that (a) re-skin the app via the theming contract (see uiTheme.ts) and
// (b) drive the Components preview. Adding a theme = adding a spec — including
// ones later derived from screenshots.

import { generateColorRamp } from "./scale";
import { parseColor, relativeLuminance } from "./color";

export interface PresetSpec {
  id: string;
  name: string;
  blurb: string;
  mode: "light" | "dark";
  /** Neutral ramp: family name, a seed (its hue tints the greys), optional chroma. */
  neutral: { name: string; seed: string; chroma?: number };
  /** Accent ramp: family name + seed. */
  accent: { name: string; seed: string };
  status?: { danger?: string; success?: string; warning?: string; info?: string };
  /** Base control radius in px. */
  radius: number;
  font: { family: string; basePx: number; ratio: number };
  /** Fine-tune the neutral ramp's lightness ends (to hit signature backgrounds). */
  neutralLightL?: number;
  neutralDarkL?: number;
}

export interface PresetPreview {
  bg: string;
  surface: string;
  text: string;
  border: string;
  primary: string;
  primaryFg: string;
  ramp: string[];
}

const round = (x: number) => Math.max(0, Math.round(x));

/** Readable ink to sit on a filled color. */
function onColor(hex: string): string {
  const c = parseColor(hex);
  return c && relativeLuminance(c) > 0.5 ? "#0a0a0a" : "#ffffff";
}

const SPACING = [
  "  --space-xs: 4px;",
  "  --space-sm: 8px;",
  "  --space-md: 12px;",
  "  --space-lg: 16px;",
  "  --space-xl: 24px;",
  "  --space-2xl: 32px;",
  "  --space-3xl: 48px;",
  "  --space-6: 24px;",
  "  --space-card-padding: 24px;",
].join("\n");

function typeBlock(font: PresetSpec["font"]): string {
  const { family, basePx: b, ratio: r } = font;
  const px = (x: number) => `${Math.round(x)}px`;
  return [
    `  --font-family-sans: ${family};`,
    "  --font-weight-regular: 400;",
    "  --font-weight-medium: 500;",
    "  --font-weight-semibold: 600;",
    "  --font-weight-bold: 700;",
    `  --text-display-size: ${px(b * r ** 3)};`,
    "  --text-display-weight: 700;",
    "  --text-display-leading: 1.05;",
    "  --text-display-tracking: -0.02em;",
    `  --text-title-size: ${px(b * r ** 2.1)};`,
    "  --text-title-weight: 600;",
    "  --text-title-leading: 1.1;",
    `  --text-heading-size: ${px(b * r ** 1.4)};`,
    "  --text-heading-weight: 600;",
    "  --text-heading-leading: 1.2;",
    `  --text-subheading-size: ${px(b * r)};`,
    "  --text-subheading-weight: 600;",
    `  --text-body-size: ${px(b)};`,
    "  --text-body-weight: 400;",
    "  --text-body-leading: 1.5;",
    `  --text-body-sm-size: ${px(b / r)};`,
    "  --text-body-sm-weight: 400;",
    `  --text-label-size: ${px(b / r)};`,
    "  --text-label-weight: 500;",
    `  --text-caption-size: ${px(b / r ** 2)};`,
  ].join("\n");
}

export function buildPreset(spec: PresetSpec): { css: string; preview: PresetPreview } {
  const dark = spec.mode === "dark";
  const neutral = generateColorRamp({
    seed: spec.neutral.seed,
    steps: 10,
    chromaMult: spec.neutral.chroma ?? 0.25,
    lightLightness: spec.neutralLightL ?? 0.985,
    darkLightness: spec.neutralDarkL ?? (dark ? 0.16 : 0.2),
  });
  const accent = generateColorRamp({
    seed: spec.accent.seed,
    steps: 10,
    chromaMult: 1,
    lightLightness: 0.97,
    darkLightness: 0.32,
  });
  const nMap: Record<string, string> = Object.fromEntries(neutral.map((s) => [s.label, s.hex]));
  const aMap: Record<string, string> = Object.fromEntries(accent.map((s) => [s.label, s.hex]));
  const N = spec.neutral.name;
  const A = spec.accent.name;

  const status = {
    danger: spec.status?.danger ?? (dark ? "#f87171" : "#dc2626"),
    success: spec.status?.success ?? (dark ? "#4ade80" : "#16a34a"),
    warning: spec.status?.warning ?? (dark ? "#fbbf24" : "#d97706"),
    info: spec.status?.info ?? (dark ? "#60a5fa" : "#2563eb"),
  };

  // Which ramp step plays each semantic role, by mode.
  const m = dark
    ? { bg: "900", surface: "800", raised: "700", sunken: "900", border: "700", fg: "50", muted: "300", secondary: "800", secondaryFg: "100", primary: "400", ring: "400" }
    : { bg: "100", surface: "50", raised: "50", sunken: "100", border: "200", fg: "900", muted: "600", secondary: "100", secondaryFg: "900", primary: "600", ring: "500" };

  const primaryHex = aMap[m.primary];
  const primaryFg = onColor(primaryHex);
  const nref = (k: string) => `var(--${N}-${k})`;
  const aref = (k: string) => `var(--${A}-${k})`;
  const r = spec.radius;

  const lines: string[] = [];
  lines.push(`  /* ${N} — neutral primitives */`);
  neutral.forEach((s) => lines.push(`  --${N}-${s.label}: ${s.hex};`));
  lines.push("");
  lines.push(`  /* ${A} — accent primitives */`);
  accent.forEach((s) => lines.push(`  --${A}-${s.label}: ${s.hex};`));
  lines.push("");
  lines.push("  /* status primitives */");
  lines.push(`  --red-500: ${status.danger};`);
  lines.push(`  --green-500: ${status.success};`);
  lines.push(`  --amber-500: ${status.warning};`);
  lines.push(`  --sky-500: ${status.info};`);
  lines.push("");
  lines.push("  /* semantic — surfaces & text */");
  lines.push(`  --background: ${nref(m.bg)};`);
  lines.push(`  --foreground: ${nref(m.fg)};`);
  lines.push(`  --text: ${nref(m.fg)};`);
  lines.push(`  --text-muted: ${nref(m.muted)};`);
  lines.push(`  --muted-foreground: ${nref(m.muted)};`);
  lines.push(`  --surface: ${nref(m.surface)};`);
  lines.push(`  --surface-raised: ${nref(m.raised)};`);
  lines.push(`  --surface-sunken: ${nref(m.sunken)};`);
  lines.push(`  --card: ${nref(m.surface)};`);
  lines.push(`  --border: ${nref(m.border)};`);
  lines.push(`  --input: ${nref(m.border)};`);
  lines.push(`  --secondary: ${nref(m.secondary)};`);
  lines.push(`  --secondary-foreground: ${nref(m.secondaryFg)};`);
  lines.push("");
  lines.push("  /* semantic — accent & status */");
  lines.push(`  --primary: ${aref(m.primary)};`);
  lines.push(`  --color-primary: ${aref(m.primary)};`);
  lines.push(`  --primary-foreground: ${primaryFg};`);
  lines.push(`  --ring: ${aref(m.ring)};`);
  lines.push(`  --destructive: var(--red-500);`);
  lines.push(`  --destructive-foreground: #ffffff;`);
  lines.push(`  --danger: var(--red-500);`);
  lines.push(`  --success: var(--green-500);`);
  lines.push(`  --warning: var(--amber-500);`);
  lines.push(`  --info: var(--sky-500);`);
  lines.push("");
  lines.push("  /* radius */");
  lines.push(`  --radius-sm: ${round(r / 2)}px;`);
  lines.push(`  --radius-md: ${round(r)}px;`);
  lines.push(`  --radius-lg: ${round(r * 1.7)}px;`);
  lines.push(`  --radius-control: ${round(r)}px;`);
  lines.push(`  --radius-card: ${round(r * 1.7)}px;`);
  lines.push(`  --radius: ${round(r)}px;`);
  lines.push("");
  lines.push("  /* spacing */");
  lines.push(SPACING);
  lines.push("");
  lines.push("  /* elevation */");
  lines.push(`  --shadow-md: ${dark ? "0 4px 18px rgba(0,0,0,0.55)" : "0 4px 14px rgba(15,23,42,0.08)"};`);
  lines.push("");
  lines.push("  /* type */");
  lines.push(typeBlock(spec.font));

  const css = `:root {\n${lines.join("\n")}\n}\n`;
  const preview: PresetPreview = {
    bg: nMap[m.bg],
    surface: nMap[m.surface],
    text: nMap[m.fg],
    border: nMap[m.border],
    primary: primaryHex,
    primaryFg,
    ramp: ["100", "300", "500", "700", "900"].map((k) => aMap[k]),
  };
  return { css, preview };
}

const INTER = '"Inter", system-ui, -apple-system, sans-serif';
const GEIST = '"Geist", "Inter", system-ui, sans-serif';

export const PRESETS: PresetSpec[] = [
  {
    id: "linear",
    name: "Linear",
    blurb: "Near-black UI with a crisp indigo accent and tight type.",
    mode: "dark",
    neutral: { name: "slate", seed: "#3b3d4a", chroma: 0.35 },
    accent: { name: "indigo", seed: "#5e6ad2" },
    radius: 8,
    font: { family: INTER, basePx: 15, ratio: 1.2 },
    neutralDarkL: 0.15,
  },
  {
    id: "vercel",
    name: "Vercel",
    blurb: "Pure monochrome black-and-white with a sharp blue and small radii.",
    mode: "dark",
    neutral: { name: "gray", seed: "#8a8a8a", chroma: 0.04 },
    accent: { name: "blue", seed: "#0070f3" },
    radius: 6,
    font: { family: GEIST, basePx: 14, ratio: 1.25 },
    neutralDarkL: 0.12,
  },
  {
    id: "stripe",
    name: "Stripe",
    blurb: "Bright, airy light theme with the signature blurple and soft corners.",
    mode: "light",
    neutral: { name: "slate", seed: "#5b6472", chroma: 0.3 },
    accent: { name: "blurple", seed: "#635bff" },
    radius: 10,
    font: { family: INTER, basePx: 16, ratio: 1.25 },
  },
  {
    id: "notion",
    name: "Notion",
    blurb: "Warm paper neutrals, near-black ink and a calm blue. Minimal radius.",
    mode: "light",
    neutral: { name: "stone", seed: "#7d7568", chroma: 0.22 },
    accent: { name: "blue", seed: "#2383e2" },
    radius: 4,
    font: { family: INTER, basePx: 16, ratio: 1.2 },
    neutralLightL: 0.99,
  },
  {
    id: "spotify",
    name: "Spotify",
    blurb: "Charcoal black surfaces with the unmistakable electric green.",
    mode: "dark",
    neutral: { name: "gray", seed: "#7a7a7a", chroma: 0.04 },
    accent: { name: "green", seed: "#1db954" },
    radius: 8,
    font: { family: INTER, basePx: 15, ratio: 1.22 },
    neutralDarkL: 0.14,
  },
  {
    id: "github",
    name: "GitHub",
    blurb: "Clean light interface, cool greys and an accessible link blue.",
    mode: "light",
    neutral: { name: "gray", seed: "#5b636d", chroma: 0.12 },
    accent: { name: "blue", seed: "#0969da" },
    radius: 6,
    font: { family: INTER, basePx: 14, ratio: 1.25 },
  },
  {
    id: "dracula",
    name: "Dracula",
    blurb: "The cult dark palette: muted purple-grey with vivid violet and pinks.",
    mode: "dark",
    neutral: { name: "mauve", seed: "#44475a", chroma: 0.4 },
    accent: { name: "purple", seed: "#bd93f9" },
    status: { danger: "#ff5555", success: "#50fa7b", warning: "#f1fa8c", info: "#8be9fd" },
    radius: 8,
    font: { family: INTER, basePx: 15, ratio: 1.25 },
    neutralDarkL: 0.26,
  },
];
