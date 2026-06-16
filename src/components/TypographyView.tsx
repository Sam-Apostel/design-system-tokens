import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { bestBackgroundFor } from "../lib/contrastAudit";
import { lint, issuesByToken } from "../lib/lint";
import type { Token } from "../types";

type Prop = "family" | "size" | "weight" | "line" | "tracking" | "other";

interface TypoToken {
  token: Token;
  raw: string | null;
  prop: Prop;
  styleKey: string;
}

const PROP_LABEL: Record<Prop, string> = {
  family: "Font families",
  size: "Font sizes",
  weight: "Font weights",
  line: "Line heights",
  tracking: "Letter spacing",
  other: "Other type tokens",
};

const STOP = new Set([
  "font", "text", "type", "typography", "size", "weight", "line", "height",
  "lineheight", "leading", "letter", "spacing", "tracking", "family", "face",
  "color", "colour", "fill", "ink",
]);

function propOf(name: string, value: string | null): Prop {
  const n = name.toLowerCase();
  const v = (value ?? "").trim();
  if (/family|face/.test(n) || (/,/.test(v) && /[a-z]/i.test(v))) return "family";
  if (/weight/.test(n)) return "weight";
  if (/line-?height|leading/.test(n)) return "line";
  if (/letter-?spacing|tracking/.test(n)) return "tracking";
  if (/size/.test(n)) return "size";
  if (/^\d{3}$/.test(v)) return "weight";
  if (/(px|rem|em)$/.test(v)) return "size";
  return "other";
}

function styleKeyOf(name: string): string {
  return name.split("-").filter((s) => !STOP.has(s.toLowerCase())).join("-");
}

const SAMPLE = "The quick brown fox jumps over the lazy dog";

/** First family in a font stack, for a compact label. */
function shortFamily(stack?: string): string {
  if (!stack) return "";
  const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return first || "";
}

export function TypographyView({ onNewStyle }: { onNewStyle?: () => void }) {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const typo = useMemo<TypoToken[]>(
    () =>
      tokens
        .filter((t) => t.category === "typography")
        .map((t) => {
          const raw = resolve(t, byName).finalRaw;
          return { token: t, raw, prop: propOf(t.name, raw), styleKey: styleKeyOf(t.name) };
        }),
    [tokens, byName],
  );

  // Composite styles: a styleKey that combines 2+ distinct properties.
  const composites = useMemo(() => {
    const m = new Map<string, TypoToken[]>();
    for (const tt of typo) {
      if (!tt.styleKey) continue;
      (m.get(tt.styleKey) ?? m.set(tt.styleKey, []).get(tt.styleKey)!).push(tt);
    }
    return [...m.entries()]
      .map(([key, list]) => ({ key, list, props: new Set(list.map((t) => t.prop)) }))
      .filter((g) => g.props.size >= 2)
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [typo]);

  // A type style can carry a text color: a color token named "<style>-color".
  // It's categorized as a color, so we attach it to the style by its key here.
  const styleColors = useMemo(() => {
    const m = new Map<string, { token: Token; raw: string | null }>();
    for (const t of tokens) {
      if (t.category !== "color") continue;
      if (!/-(color|colour|fill|ink)$/i.test(t.name)) continue;
      const key = styleKeyOf(t.name);
      if (key) m.set(key, { token: t, raw: resolve(t, byName).finalRaw });
    }
    return m;
  }, [tokens, byName]);

  const compositeIds = new Set(composites.flatMap((g) => g.list.map((t) => t.token.id)));
  const ramps = useMemo(() => {
    const m = new Map<Prop, TypoToken[]>();
    for (const tt of typo) {
      if (compositeIds.has(tt.token.id)) continue;
      (m.get(tt.prop) ?? m.set(tt.prop, []).get(tt.prop)!).push(tt);
    }
    return m;
  }, [typo]);

  const defaultFamily = typo.find((t) => t.prop === "family")?.raw ?? undefined;
  // Default text color (for styles with no explicit color) — the app-wide --text.
  const defaultTextRgb = useMemo(() => {
    const t = byName.get("text") ?? byName.get("color-text") ?? byName.get("foreground");
    return (t && parseColor(resolve(t, byName).finalRaw ?? "")) || { r: 0.1, g: 0.1, b: 0.1, a: 1 };
  }, [byName]);

  if (typo.length === 0) {
    return (
      <div className="empty">
        No typography tokens yet.
        {onNewStyle && (
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onNewStyle}>
              + New text style
            </button>
          </div>
        )}
      </div>
    );
  }

  const PROP_ORDER: Prop[] = ["family", "size", "weight", "line", "tracking", "other"];

  return (
    <div>
      <div className="section-title">
        Typography
        <div className="spacer" />
        {onNewStyle && (
          <button className="btn small" onClick={onNewStyle}>
            + New text style
          </button>
        )}
      </div>

      {composites.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>
            Text styles <span className="count">({composites.length})</span>
            <span className="faint" style={{ fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
              click a row for its tokens
            </span>
          </div>
          <div className="type-style-list">
            {composites.map((g) => {
              const find = (p: Prop) => g.list.find((t) => t.prop === p)?.raw ?? undefined;
              const colorTok = styleColors.get(g.key);
              const style: React.CSSProperties = {
                fontFamily: find("family") ?? defaultFamily,
                fontSize: find("size"),
                fontWeight: find("weight") ? Number(find("weight")) : undefined,
                lineHeight: find("line"),
                letterSpacing: find("tracking"),
                color: colorTok?.raw ?? undefined,
              };
              const tracking = find("tracking");
              const specs = [find("size"), find("weight"), find("line"), tracking && tracking !== "0" && tracking !== "0rem" ? tracking : null, shortFamily(find("family") ?? defaultFamily)].filter(Boolean);
              // Render the sample on a background its text color is readable on.
              const textRgb = (colorTok && parseColor(colorTok.raw ?? "")) || defaultTextRgb;
              const bg = bestBackgroundFor(textRgb, tokens, byName);
              const open = expanded.has(g.key);
              const allTokens = colorTok ? [...g.list.map((t) => ({ name: t.token.name, raw: t.raw, isRef: t.token.value.kind === "ref", ref: t.token.value.kind === "ref" ? t.token.value.ref : null, swatch: false })), { name: colorTok.token.name, raw: colorTok.raw, isRef: colorTok.token.value.kind === "ref", ref: colorTok.token.value.kind === "ref" ? colorTok.token.value.ref : null, swatch: true }] : g.list.map((t) => ({ name: t.token.name, raw: t.raw, isRef: t.token.value.kind === "ref", ref: t.token.value.kind === "ref" ? t.token.value.ref : null, swatch: false }));
              const sev = allTokens.map((t) => issues.get(t.name)).find(Boolean);
              return (
                <div className="type-style" key={g.key}>
                  <button className="type-style-row" onClick={() => toggle(g.key)} aria-expanded={open}>
                    <span className="type-style-head">
                      <span className="type-style-name mono">
                        {g.key}
                        {sev && <span className={`issue-dot ${sev}`} />}
                      </span>
                      <span className="type-style-specs mono faint">
                        {colorTok && <span className="mini-swatch" style={{ background: colorTok.raw ?? "transparent" }} />}
                        {specs.join(" · ")}
                      </span>
                    </span>
                    <span className="type-style-sample" style={{ ...style, background: toCssDisplay(bg.rgb) }} title={`on --${bg.name.replace(/^#.*/, "(literal)")}`}>{SAMPLE}</span>
                    <span className="type-style-caret">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="type-card-tokens" style={{ padding: "0 14px 12px" }}>
                      {allTokens.map((t) => (
                        <button key={t.name} className="chip-btn mono" onClick={() => navigate("tokens", t.name)}>
                          {t.swatch && <span className="mini-swatch" style={{ background: t.raw ?? "transparent" }} />}
                          --{t.name}: {t.isRef ? `→ ${t.ref}` : t.raw}
                          {issues.get(t.name) && <span className={`issue-dot ${issues.get(t.name)}`} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {PROP_ORDER.filter((p) => ramps.has(p)).map((prop) => (
        <div className="card" key={prop}>
          <div className="section-title">
            {PROP_LABEL[prop]} <span className="count">({ramps.get(prop)!.length})</span>
          </div>
          {ramps.get(prop)!.map(({ token, raw }) => {
            const sev = issues.get(token.name);
            return (
              <div className="type-sample" key={token.id}>
                <div className="lbl">
                  <button className="chip-btn mono" onClick={() => navigate("tokens", token.name)}>
                    --{token.name}
                    {sev && <span className={`issue-dot ${sev}`} />}
                  </button>
                  <span className="muted mono">{raw}</span>
                </div>
                <div style={sampleStyle(prop, raw, defaultFamily)}>
                  {prop === "line" ? `${SAMPLE} ${SAMPLE}` : SAMPLE}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function sampleStyle(prop: Prop, raw: string | null, family?: string): React.CSSProperties {
  const base: React.CSSProperties = { fontFamily: family, fontSize: 20 };
  if (!raw) return base;
  switch (prop) {
    case "family":
      return { fontFamily: raw, fontSize: 22 };
    case "size":
      return { fontFamily: family, fontSize: raw, lineHeight: 1.2 };
    case "weight":
      return { ...base, fontWeight: Number(raw) };
    case "line":
      return { ...base, fontSize: 15, lineHeight: raw, maxWidth: 520 };
    case "tracking":
      return { ...base, letterSpacing: raw };
    default:
      return base;
  }
}
