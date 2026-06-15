---
name: extract-design-tokens
description: >-
  Extract design tokens (colors, spacing, sizing, radii, typography, shadows,
  borders) from ANY codebase and emit them as Token Studio-importable CSS
  custom properties (and optionally W3C Design Tokens JSON). Use when the user
  wants to pull design values out of a project — CSS/SCSS variables, Tailwind
  config, theme objects, styled-components/Emotion themes, MUI/Chakra themes,
  iOS/Android resources, or hardcoded literals — into a single token file that
  can be loaded into Token Studio (https://tokens.sams.land).
---

# Extract design tokens from a codebase

Your goal: produce **one `:root { … }` CSS block** of design tokens that Token
Studio can import directly. Optionally also emit the same tokens as W3C Design
Tokens JSON. Be exhaustive but precise — capture real design decisions, not
every random number.

## Output contract

Token Studio imports CSS custom properties. Emit a single block:

```css
:root {
  /* color — primitives */
  --colors-blue-500: #3b82f6;
  /* color — semantic (alias a primitive with var()) */
  --color-text: var(--colors-gray-900);
  /* spacing */
  --space-4: 1rem;
  /* radius */
  --radius-md: 0.5rem;
  /* typography */
  --font-size-lg: 20px;
  --font-weight-bold: 700;
  --font-family-sans: "Inter", system-ui, sans-serif;
}
```

Rules for the output:
- **Names are kebab-case**, hierarchical, hyphen-separated. The hierarchy drives
  grouping, so name by structure: `colors-blue-500`, `space-4`, `card-radius`.
- **Preserve relationships as aliases.** If a value clearly references another
  token (e.g. a semantic color points at a palette entry, or two tokens share a
  value and one is semantic), emit `var(--other-token)` instead of duplicating
  the literal. This is what makes the layers/links work.
- **Keep units.** `16px`, `1rem`, `0.5rem`, `1.5` (unitless line-height), `700`.
- **Colors** as hex (`#rrggbb[aa]`), `rgb()/rgba()`, `hsl()`, or `oklch()`.
- One declaration per line. No selectors other than `:root`.

## Procedure

1. **Find token sources.** Search broadly, then read the most authoritative
   files (a `tokens.*`, `theme.*`, `variables.*`, `_variables.scss`,
   `tailwind.config.*`, or a design-system package usually wins). Useful probes:

   ```bash
   rg -n --no-heading -g '!node_modules' \
     -e '--[a-z][a-z0-9-]*\s*:' \           # CSS custom properties
     -e '\$[a-z][a-z0-9-]*\s*:' \            # SCSS variables
     -e '@[a-z][a-z0-9-]*\s*:' \             # LESS variables
     -e '#[0-9a-fA-F]{3,8}\b' \              # hex colors
     -e '\b(rgb|rgba|hsl|hsla|oklch)\(' \    # color functions
     -e '(colors?|spacing|radius|radii|fontSize|fontFamily|fontWeight|shadow)\s*[:=]'
   rg --files -g '*tailwind.config*' -g '*theme*' -g '*tokens*' -g '*_variables*' -g '*design-system*'
   ```

   Also consider: Tailwind `theme`/`theme.extend`, CSS-in-JS theme objects,
   MUI `createTheme`, Chakra theme, `:root`/`[data-theme]` blocks, Style
   Dictionary configs, `*.tokens.json`, Figma exports, and platform resources
   (`colors.xml`, `*.xcassets`, Compose `Color.kt`).

2. **Prefer the source of truth.** If the project defines a palette and then
   references it (Tailwind colors, SCSS `$` vars, CSS vars), extract the
   definitions — not every usage site. Skip one-off literals in component code
   unless there's no central source.

3. **Classify and name.**
   - **Primitives**: raw palettes and scales → `colors-<hue>-<step>`,
     `space-<n>`, `radius-<step>`, `font-size-<step>`.
   - **Semantic**: meaning-named values → `color-text`, `color-bg`,
     `surface`, `border`, `primary`. Alias them to primitives via `var()`.
   - **Component**: component-scoped → `card-bg`, `control-radius`,
     `button-text`. Alias to semantics/primitives.

4. **Resolve references into aliases.** When a Tailwind/theme value is
   `colors.blue[500]` or a SCSS var reuses another var, emit `var(--…)`. When two
   tokens resolve to the same literal and one is clearly semantic, alias the
   semantic one to the primitive.

5. **Convert units & color formats** to CSS literals. Figma `{r,g,b,a}` (0–1) →
   hex. Unitless spacing numbers that are clearly px → append `px`. Leave
   line-height/opacity unitless.

6. **Deduplicate.** Collapse exact duplicates; keep the most meaningful name.

7. **Emit** the single `:root { … }` block, grouped with `/* comments */` per
   top-level group and ordered primitives → semantic → component.

## Optional: W3C JSON

If asked, also emit W3C Design Tokens JSON (nest by name segments, `$type` +
`$value`, aliases as `{dot.path}`):

```json
{
  "colors": { "blue": { "500": { "$type": "color", "$value": "#3b82f6" } } },
  "color":  { "text": { "$type": "color", "$value": "{colors.gray.900}" } }
}
```

## Loading into Token Studio

Tell the user they can paste the CSS (or JSON) into **Token Studio →
Import** (https://tokens.sams.land), or drop the saved `.css`/`.json` file onto
the import dialog, to visualize palette/spacing/typography, check contrast,
audit ramp consistency, and re-export.

## Quality checks before finishing

- Every alias target exists in the output (no dangling `var(--x)`).
- No alias cycles.
- Names are unique and kebab-case.
- Color, spacing, and typography are all represented if present in the source.
- Report a short summary: counts per category and any ambiguous values you had
  to guess (e.g. unitless numbers you treated as px).
