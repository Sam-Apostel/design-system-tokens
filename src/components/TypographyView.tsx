import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
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

export function TypographyView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);

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

  if (typo.length === 0) {
    return <div className="empty">No typography tokens detected.</div>;
  }

  const PROP_ORDER: Prop[] = ["family", "size", "weight", "line", "tracking", "other"];

  return (
    <div>
      <div className="section-title">Typography</div>

      {composites.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>
            Text styles <span className="count">({composites.length})</span>
          </div>
          <div className="type-card-grid">
            {composites.map((g) => {
              const find = (p: Prop) => g.list.find((t) => t.prop === p)?.raw ?? undefined;
              const style: React.CSSProperties = {
                fontFamily: find("family") ?? defaultFamily,
                fontSize: find("size"),
                fontWeight: find("weight") ? Number(find("weight")) : undefined,
                lineHeight: find("line"),
                letterSpacing: find("tracking"),
              };
              return (
                <div className="type-card" key={g.key}>
                  <div className="type-card-head">
                    <span className="mono">{g.key}</span>
                    <span className="faint mono">
                      {g.list.map((t) => t.prop).join(" · ")}
                    </span>
                  </div>
                  <div className="type-card-sample" style={style}>
                    {SAMPLE}
                  </div>
                  <div className="type-card-tokens">
                    {g.list.map((t) => (
                      <button
                        key={t.token.id}
                        className="chip-btn mono"
                        onClick={() => navigate("tokens", t.token.name)}
                      >
                        --{t.token.name}: {t.raw}
                        {issues.get(t.token.name) && (
                          <span className={`issue-dot ${issues.get(t.token.name)}`} />
                        )}
                      </button>
                    ))}
                  </div>
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
