import type { Token } from "../types";
import { valueToCss } from "./value";
import { topGroupOf } from "./groups";

export interface ExportOptions {
  selector: string; // e.g. ":root"
  groupBySection: boolean; // insert blank lines + comments between top groups
}

/** Serialize tokens back into raw CSS, preserving source order. */
export function toCss(tokens: Token[], opts: ExportOptions): string {
  const ordered = [...tokens].sort((a, b) => a.order - b.order);
  const lines: string[] = [];
  let lastGroup: string | null = null;

  for (const t of ordered) {
    if (opts.groupBySection) {
      const g = topGroupOf(t.name);
      if (g !== lastGroup) {
        if (lastGroup !== null) lines.push("");
        lines.push(`  /* ${g} */`);
        lastGroup = g;
      }
    }
    lines.push(`  --${t.name}: ${valueToCss(t.value)};`);
  }

  return `${opts.selector} {\n${lines.join("\n")}\n}\n`;
}
