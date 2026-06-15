# Token Studio

A fully client-side web app for **visualizing and editing CSS design system tokens**.
Paste in your CSS custom properties and it figures out the groups, layers, and
categories for you — then lets you edit names and values, relink aliases,
inspect colors across color spaces, check contrast, lint your conventions, and
export raw CSS back out.

> No storage, no sign-in, no server. Everything runs in your browser; nothing is
> persisted or sent anywhere. Refreshing the page starts fresh.

## Features

- **Import any CSS** — custom property declarations (`--name: value;`) are
  extracted from anywhere in the pasted CSS (`:root`, selectors, media queries,
  comments stripped). Merge into the current set or replace it.
- **Automatic groups & layers** — tokens are grouped by their hyphenated name
  (`color-blue-500` → group `color`, ramp `color-blue`, step `500`). Aliases
  (`var(--…)`) are detected and treated as a semantic *layer* over primitives.
- **Edit names & values** — rename tokens (aliases that point at the old name are
  automatically repointed so links survive), edit literal values with a color
  picker for colors, add/delete tokens.
- **Relink layers** — change an alias's target from one token to another
  (`--color-brand-500` → `--color-blue-500`), convert a literal into an alias, or
  unlink an alias back into a literal.
- **Palette view** — swatches grouped into ramps and ordered by scale step, with
  hex and OKLab lightness.
- **Color space view** — a 2D scatter plot showing where each color lands.
  Switch between **OKLab/OKLCH**, **CIELAB**, and **HSL**, and between plot
  planes (chroma plane, lightness × chroma, lightness × hue). Ramps are connected
  so you can spot uneven steps and how colors relate.
- **Contrast matrix** — WCAG 2.1 contrast ratios of every color (as text) over
  background candidates (surface/bg tokens plus white & black), with AA/AAA
  verdicts.
- **Spacing view** — length tokens resolved to comparable bars.
- **Typography view** — live previews of font families, sizes and weights.
- **Checks** — a built-in linter for naming/assignment conventions and
  duplicates (see below).
- **Export** — serialize back to raw CSS under a selector of your choice,
  optionally grouped with section comments. Copy or download.

## Linting rules

The **Checks** tab continuously validates the token set:

| Rule | Severity | What it catches |
| --- | --- | --- |
| `naming/kebab-case` | warning | Names that aren't lowercase words joined by single hyphens |
| `naming/duplicate-name` | error | A token name declared more than once |
| `reference/missing-target` | error | An alias pointing at a token that doesn't exist |
| `reference/cycle` | error | Aliases that form a loop and can't resolve |
| `reference/deep-chain` | warning | Alias chains longer than the configured depth (default 3) |
| `assignment/prefer-alias` | info | Semantic tokens hard-coding a color that an alias could reference |
| `duplicate/identical-value` | info | Multiple tokens sharing the exact same literal value |
| `duplicate/near-color` | warning | Colors that are perceptually near-identical (OKLab distance) |

## Token tiers (primitive → semantic → component)

Token Studio models the layered approach most design systems use, surfaced in the
**Semantics** tab and the in-app **Guide**:

1. **Primitive** — raw, context-free values: color ramps and the spacing scale
   (`colors-blue-500`, `space-4`, `radius-2`). Brand ramps that alias base ramps
   (`brand-500`) still read as primitives.
2. **Semantic** — meaning-based tokens that alias primitives (`surface`,
   `surface-raised`, `text`, `text-muted`, `border`, `primary`). Product code
   should consume these, never raw primitives.
3. **Component** — component-scoped tokens that reference semantics
   (`card-bg`, `card-radius`, `control-height`, `button-bg`).

The **Semantics** tab classifies your tokens into these tiers, scores your
coverage against a curated catalog of recommended semantic & component tokens,
and flags what's missing. Each missing token has a **Create** action that opens a
guided form to alias one of your existing primitives. Tiers are inferred from
token names and value shape (`src/lib/tiers.ts`); the catalog lives in
`src/lib/recommendations.ts`.

## Extracting tokens from an existing codebase

A reusable agent skill lives at
[`.claude/skills/extract-design-tokens/SKILL.md`](.claude/skills/extract-design-tokens/SKILL.md).
Point Claude Code (or any LLM/agent that reads skill files) at a project and it
will pull design values — CSS/SCSS variables, Tailwind config, theme objects,
Figma exports, platform resources — into a single Token Studio-importable
`:root { … }` block (and optionally W3C JSON), preserving primitive → semantic →
component aliases. Paste or drop the result into **Import**.

## Themes / modes

Use the **+ mode** control in the toolbar to split the set into **light / dark**
(and more) modes. Each token keeps a value per mode; switching the active mode
re-previews every view, and editing a value only affects the active mode. CSS
export becomes multi-mode automatically — the first mode populates `:root` and
each other mode becomes a `[data-theme="…"]` block containing only its
overrides. Other export formats emit the active mode's values.

## Dependency graph

The **Graph** tab lays tokens out by tier and draws links from each alias to the
token it references, so you can see the primitive → semantic → component flow,
trace a token's connections on hover, and spot **unused primitives** (nothing
references them) and **dangling aliases** (missing target).

## Token & color model

- A token's value is either a **literal** (`raw`) or an **alias** (`ref`) to
  another token, optionally with a `var()` fallback.
- Aliases are resolved by following the chain to a final literal, with cycle and
  missing-target detection.
- **Classification** uses both the resolved value and the name: anything that
  parses as a color → `color`; font/weight/family/size names → `typography`;
  lengths and spacing/size/radius names → `spacing`; everything else → `other`.
- Color math (`src/lib/color.ts`) is dependency-free and implements sRGB ↔ linear,
  HSL, OKLab/OKLCH, CIELAB, WCAG contrast, and perceptual distance.

## Project structure

```
src/
  lib/
    color.ts      color parsing, conversions, contrast, distance
    value.ts      token value parsing, alias resolution
    classify.ts   category inference (color/spacing/typography/other)
    parseCss.ts   extract & build tokens from CSS text
    groups.ts     group/ramp/step derivation from names
    lint.ts       naming/assignment/duplicate checks
    serialize.ts  tokens → CSS
    sample.ts     starter token set
  components/      one file per view / editor / modal
  store.tsx        reducer + context (single source of truth)
  App.tsx          shell, tabs, layout
```

## Development

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build to dist/
npm run typecheck  # types only
npm run preview    # preview the production build
```

Requires Node 18+ (developed on Node 22). The build output in `dist/` is a static
site — host it anywhere, or open it from any static file server.

## Deployment

Pushing to `main` auto-builds and publishes to **GitHub Pages** via
`.github/workflows/deploy.yml`. One-time setup: in the repository **Settings →
Pages**, set **Source** to **GitHub Actions**. The site is served from a
sub-path, which works out of the box because Vite is configured with
`base: "./"` (relative asset URLs).

## Tech

React 18 + TypeScript + Vite. No runtime dependencies beyond React; all token
parsing, color science, and linting is hand-rolled and pure so it stays fast and
fully client-side.
