// A realistic starter token set used on first load. It includes a primitive
// palette, semantic aliases (layers), spacing and typography — plus a couple
// of intentional "smells" so the linter has something to show.
export const SAMPLE_CSS = `:root {
  /* primitives — color ramps (unprefixed, e.g. --green-500) */
  --blue-50: #eff6ff;
  --blue-100: #dbeafe;
  --blue-300: #93c5fd;
  --blue-500: #3b82f6;
  --blue-700: #1d4ed8;
  --blue-900: #1e3a8a;

  --green-100: #dcfce7;
  --green-300: #86efac;
  --green-500: #22c55e;
  --green-700: #15803d;

  --red-100: #fee2e2;
  --red-500: #ef4444;
  --red-700: #b91c1c;

  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-300: #d1d5db;
  --gray-500: #6b7280;
  --gray-700: #374151;
  --gray-900: #111827;

  /* semantic layer (aliases) */
  --brand-500: var(--blue-500);
  --bg: var(--gray-50);
  --surface: #ffffff;
  --surface-raised: #ffffff;
  --text: var(--gray-900);
  --text-muted: var(--gray-500);
  --border: var(--gray-300);
  --primary: var(--brand-500);
  --success: var(--green-500);
  --danger: var(--red-500);
  --link: var(--primary);

  /* spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;

  /* typography */
  --font-family-sans: "Inter", system-ui, sans-serif;
  --font-family-mono: "JetBrains Mono", monospace;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 20px;
  --font-size-xl: 28px;
  --font-size-2xl: 36px;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
}
`;
