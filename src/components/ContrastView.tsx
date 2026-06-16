import { useMemo, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, contrastRatio, rateContrast, type RGB } from "../lib/color";
import { designedPairings } from "../lib/contrastAudit";

type Metric = "wcag" | "apca";
type Status = "pass" | "large" | "fail";

/**
 * Contrast is checked over *designed* pairings (a foreground over the surfaces
 * it actually sits on) rather than every-color-on-every-color, so it stays
 * usable with hundreds of tokens. A spot-check comparator covers ad-hoc pairs.
 */
export function ContrastView() {
  const { tokens, byName } = useStore();
  const [metric, setMetric] = useState<Metric>("wcag");
  const [show, setShow] = useState<"fail" | "all">("fail");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(60);

  const pairs = useMemo(() => designedPairings(tokens, byName), [tokens, byName]);

  const colorTokens = useMemo(
    () => tokens.filter((t) => t.category === "color" && parseColor(resolve(t, byName).finalRaw ?? "")),
    [tokens, byName],
  );

  const statusOf = (wcag: number, apca: number): Status => {
    const ok = metric === "wcag" ? wcag >= 4.5 : Math.abs(apca) >= 60;
    const large = metric === "wcag" ? wcag >= 3 : Math.abs(apca) >= 45;
    return ok ? "pass" : large ? "large" : "fail";
  };

  const rated = useMemo(
    () =>
      pairs
        .map((p) => ({ ...p, status: statusOf(p.wcag, p.apca) }))
        .sort((a, b) => (metric === "wcag" ? a.wcag - b.wcag : Math.abs(a.apca) - Math.abs(b.apca))),
    [pairs, metric],
  );

  // "soft" pairs (disabled/placeholder/inverse states) are intentionally low or
  // context-specific — kept out of the problem counts and the default list.
  const counts = useMemo(() => {
    let fail = 0, large = 0, pass = 0, soft = 0;
    for (const p of rated) {
      if (p.soft) { soft++; continue; }
      if (p.status === "fail") fail++;
      else if (p.status === "large") large++;
      else pass++;
    }
    return { fail, large, pass, soft };
  }, [rated]);

  const q = query.trim().toLowerCase();
  const filtered = rated
    .filter((p) => (show === "all" ? true : p.status !== "pass" && !p.soft))
    .filter((p) => (q ? p.text.name.toLowerCase().includes(q) || p.surface.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q) : true));
  const shown = filtered.slice(0, limit);

  if (colorTokens.length === 0) {
    return <div className="empty">No color tokens to evaluate.</div>;
  }

  return (
    <div>
      <div className="card">
        <div className="section-title">
          Designed pairings
          <span className="count">({pairs.length})</span>
          <div className="spacer" />
          <div className="seg">
            <button className={metric === "wcag" ? "active" : ""} onClick={() => setMetric("wcag")}>WCAG</button>
            <button className={metric === "apca" ? "active" : ""} onClick={() => setMetric("apca")}>APCA</button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Each foreground token measured over the surface(s) it's actually used on (same component group,
          the foundation text×surface set, and every <span className="mono">--on-X</span> over its fill) —
          not every color on every color. {metric === "wcag" ? "AA needs 4.5:1 (3:1 large)." : "APCA Lc ≥ 60 body, ≥ 45 large."}
        </p>

        <div className="pill-summary" style={{ marginBottom: 12 }}>
          <span className="pill" style={{ borderColor: counts.fail ? "var(--danger)" : undefined }}>
            <b style={{ color: "var(--danger)" }}>{counts.fail}</b> fail
          </span>
          <span className="pill"><b style={{ color: "var(--warning)" }}>{counts.large}</b> large-only</span>
          <span className="pill"><b style={{ color: "var(--success)" }}>{counts.pass}</b> pass</span>
          {counts.soft > 0 && <span className="pill faint" title="Disabled / placeholder / inverse states — low contrast is intentional or context-specific. Shown under 'All'.">{counts.soft} intentional</span>}
        </div>

        <div className="plot-controls" style={{ marginBottom: 12 }}>
          <input
            className="text-input"
            style={{ maxWidth: 260 }}
            placeholder="Filter by token or group…"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="seg">
            <button className={show === "fail" ? "active" : ""} onClick={() => setShow("fail")}>Problems</button>
            <button className={show === "all" ? "active" : ""} onClick={() => setShow("all")}>All</button>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>{filtered.length} shown</span>
        </div>

        {filtered.length === 0 ? (
          <p className="hint">No pairings match — {show === "fail" ? "nothing fails contrast here. 🎉" : "try a different filter."}</p>
        ) : (
          <>
            <div className="pairing-grid">
              {shown.map((p) => (
                <div className={`pairing ${p.status === "fail" ? "fail" : p.status === "large" ? "large" : ""}`} key={`${p.text.name}|${p.surface.name}`}>
                  <span className="pairing-chip" style={{ background: toCssDisplay(p.surface.rgb), color: toCssDisplay(p.text.rgb) }}>Ag</span>
                  <div className="pairing-meta">
                    <div className="mono pairing-names" title={`--${p.text.name} on --${p.surface.name}`}>
                      <span>--{p.text.name}</span>
                      <span className="faint"> on </span>
                      <span>--{p.surface.name}</span>
                    </div>
                    <div className="mono pairing-score">
                      {metric === "wcag" ? `${p.wcag.toFixed(2)}:1` : `Lc ${Math.round(p.apca)}`} ·{" "}
                      <span className={`pairing-tag ${p.status}`}>{p.status === "pass" ? "OK" : p.status === "large" ? "large only" : "fail"}</span>
                      <span className="faint"> · {p.group}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > shown.length && (
              <button className="btn small" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + 100)}>
                Show {Math.min(100, filtered.length - shown.length)} more ({filtered.length - shown.length} hidden)
              </button>
            )}
          </>
        )}
      </div>

      <SpotCheck colorTokens={colorTokens.map((t) => ({ name: t.name, rgb: parseColor(resolve(t, byName).finalRaw ?? "")! }))} />
    </div>
  );
}

/** Ad-hoc check: pick any foreground and background. */
function SpotCheck({ colorTokens }: { colorTokens: { name: string; rgb: RGB }[] }) {
  const findIdx = (re: RegExp, fb: number) => { const i = colorTokens.findIndex((t) => re.test(t.name)); return i >= 0 ? i : fb; };
  const [fg, setFg] = useState(() => colorTokens[findIdx(/^text$/, 0)]?.name ?? colorTokens[0]?.name ?? "");
  const [bg, setBg] = useState(() => colorTokens[findIdx(/^(background|surface)$/, colorTokens.length - 1)]?.name ?? colorTokens[0]?.name ?? "");

  const fgC = colorTokens.find((t) => t.name === fg)?.rgb;
  const bgC = colorTokens.find((t) => t.name === bg)?.rgb;
  const rating = fgC && bgC ? rateContrast(fgC, bgC) : null;
  const ratio = fgC && bgC ? contrastRatio(fgC, bgC) : 0;

  const Select = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div className="field" style={{ flex: 1, minWidth: 160 }}>
      <label>{label}</label>
      <select className="text-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {colorTokens.map((t) => (
          <option key={t.name} value={t.name}>--{t.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="card">
      <div className="section-title">Spot check</div>
      <p className="hint" style={{ marginTop: 0 }}>Compare any two tokens directly.</p>
      <div className="link-row" style={{ alignItems: "flex-end", gap: 12 }}>
        <Select label="Foreground" value={fg} onChange={setFg} />
        <Select label="Background" value={bg} onChange={setBg} />
      </div>
      {rating && bgC && fgC && (
        <div className="create-preview" style={{ marginTop: 16 }}>
          <div style={{ background: toCssDisplay(bgC), color: toCssDisplay(fgC), padding: "18px 22px", borderRadius: 8, border: "1px solid var(--hairline)", flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>The quick brown fox</div>
            <div style={{ fontSize: 13 }}>jumps over the lazy dog</div>
          </div>
          <div className="mono" style={{ textAlign: "right", minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{ratio.toFixed(2)}:1</div>
            <div className={`pairing-tag ${rating.aaNormal ? "pass" : rating.aaLargeOrAaaNormal ? "large" : "fail"}`}>{rating.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}
