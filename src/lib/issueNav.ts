import type { Token } from "../types";
import type { Tab } from "../nav";
import type { LintIssue } from "./lint";

const TAB_FOR_CATEGORY: Record<string, Tab> = {
  color: "palette",
  spacing: "spacing",
  typography: "typography",
  motion: "motion",
  other: "tokens",
};

/** Which tab best lets the user act on a given lint issue. */
export function tabForIssue(issue: LintIssue, byName: Map<string, Token>): Tab {
  if (issue.rule.startsWith("contrast/")) return "contrast";
  // Lightness-ramp issues are fixable on the Color space tab (drag the stop).
  if (issue.rule === "ramp/uneven-lightness") return "colorspace";
  const cat = byName.get(issue.tokens[0])?.category ?? "other";
  return TAB_FOR_CATEGORY[cat] ?? "tokens";
}
