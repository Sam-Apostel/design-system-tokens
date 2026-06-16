import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { lint, issuesByToken } from "../lib/lint";
import { durationItems, easingItems, type BezierPoints } from "../lib/motion";

export function MotionView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);
  const durations = useMemo(() => durationItems(tokens, byName), [tokens, byName]);
  const easings = useMemo(() => easingItems(tokens, byName), [tokens, byName]);
  const [replay, setReplay] = useState(0);

  if (durations.length === 0 && easings.length === 0) {
    return (
      <div className="empty">
        No motion tokens detected.
        <div className="hint" style={{ marginTop: 8 }}>
          Tokens holding a <span className="mono">duration</span> (e.g. <span className="mono">120ms</span>,{" "}
          <span className="mono">.4s</span>) or an <span className="mono">easing</span> (
          <span className="mono">ease</span>, <span className="mono">cubic-bezier(…)</span>,{" "}
          <span className="mono">steps(…)</span>) show up here. Re-import your set if motion tokens still
          read as “other”.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        Motion
        <div className="spacer" />
        <button className="btn small" onClick={() => setReplay((n) => n + 1)}>↻ Replay</button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Durations play as real animations; easings plot their <span className="mono">cubic-bezier</span> curve
        with a dot driven by the token's timing function. Click any row to open the token.
      </p>

      {durations.length > 0 && (
        <div className="card">
          <div className="section-title">Durations <span className="count">({durations.length})</span></div>
          <div className="motion-dur-list" key={`dur-${replay}`}>
            {durations.map(({ token, raw, ms, durationCss, ref }) => {
              const sev = issues.get(token.name);
              return (
                <div
                  className="motion-dur-row"
                  key={token.id}
                  title={`--${token.name}`}
                  onClick={() => navigate("tokens", token.name)}
                >
                  <div className="motion-dur-track">
                    <div className="motion-dur-bar" style={{ animationDuration: durationCss }} />
                  </div>
                  <div className="motion-meta">
                    <span className="motion-name mono">
                      --{token.name}
                      {sev && <span className={`issue-dot ${sev}`} />}
                    </span>
                    <span className="motion-tags">
                      {ref && <span className="motion-tag">→ {ref}</span>}
                      <span className="motion-tag">{Math.round(ms ?? 0)}ms</span>
                    </span>
                    <span className="motion-val mono faint">{raw ?? "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {easings.length > 0 && (
        <div className="card">
          <div className="section-title">Easings <span className="count">({easings.length})</span></div>
          <div className="motion-ease-grid" key={`ease-${replay}`}>
            {easings.map(({ token, raw, ref, easing, points, steps }) => {
              const sev = issues.get(token.name);
              return (
                <button
                  className="motion-ease-cell"
                  key={token.id}
                  title={raw ?? ""}
                  onClick={() => navigate("tokens", token.name)}
                >
                  <div className="motion-ease-plot">
                    <EasingCurve points={points} />
                    {(points || steps) && (
                      <span className="motion-ease-dot" style={{ animationTimingFunction: easing }} />
                    )}
                  </div>
                  <div className="motion-meta">
                    <span className="motion-name mono">
                      --{token.name}
                      {sev && <span className={`issue-dot ${sev}`} />}
                    </span>
                    <span className="motion-tags">
                      {ref && <span className="motion-tag">→ {ref}</span>}
                      {steps != null && <span className="motion-tag">{steps} steps</span>}
                    </span>
                    <span className="motion-val mono faint">{raw ?? "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Plot a cubic-bézier control curve in a 0..1 box (y axis flipped for screen). */
function EasingCurve({ points }: { points: BezierPoints | null }) {
  const S = 100;
  const fx = (x: number) => x * S;
  const fy = (y: number) => (1 - y) * S; // flip
  return (
    <svg viewBox={`-6 -6 ${S + 12} ${S + 12}`} className="motion-curve-svg" aria-hidden>
      <rect x="0" y="0" width={S} height={S} className="motion-curve-box" />
      <line x1="0" y1={S} x2={S} y2="0" className="motion-curve-ref" />
      {points ? (
        <>
          <line x1="0" y1={S} x2={fx(points.p1x)} y2={fy(points.p1y)} className="motion-curve-handle" />
          <line x1={S} y1="0" x2={fx(points.p2x)} y2={fy(points.p2y)} className="motion-curve-handle" />
          <path
            d={`M 0 ${S} C ${fx(points.p1x)} ${fy(points.p1y)}, ${fx(points.p2x)} ${fy(points.p2y)}, ${S} 0`}
            className="motion-curve-path"
          />
          <circle cx={fx(points.p1x)} cy={fy(points.p1y)} r="3" className="motion-curve-cp" />
          <circle cx={fx(points.p2x)} cy={fy(points.p2y)} r="3" className="motion-curve-cp" />
        </>
      ) : (
        <text x={S / 2} y={S / 2} className="motion-curve-na" textAnchor="middle">steps</text>
      )}
    </svg>
  );
}
