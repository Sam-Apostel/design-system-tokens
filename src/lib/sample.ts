// A realistic starter token set used on first load. It includes a primitive
// palette, semantic aliases (layers), spacing and typography — plus a couple
// of intentional "smells" so the linter has something to show.
export const SAMPLE_CSS = `:root {
  /* color — primitives */
  --color-blue-50: #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-300: #93c5fd;
  --color-blue-500: #3b82f6;
  --color-blue-700: #1d4ed8;
  --color-blue-900: #1e3a8a;

  --color-green-100: #dcfce7;
  --color-green-300: #86efac;
  --color-green-500: #22c55e;
  --color-green-700: #15803d;

  --color-red-100: #fee2e2;
  --color-red-500: #ef4444;
  --color-red-700: #b91c1c;

  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-300: #d1d5db;
  --color-gray-500: #6b7280;
  --color-gray-700: #374151;
  --color-gray-900: #111827;

  /* color — semantic layer (aliases) */
  --color-brand-500: var(--color-blue-500);
  --color-bg: var(--color-gray-50);
  --color-surface: #ffffff;
  --color-text: var(--color-gray-900);
  --color-text-muted: var(--color-gray-500);
  --color-border: var(--color-gray-300);
  --color-success: var(--color-green-500);
  --color-danger: var(--color-red-500);
  --color-link: var(--color-brand-500);

  /* spacing scale */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
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
