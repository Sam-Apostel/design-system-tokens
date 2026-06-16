import { useState } from "react";
import type { Token } from "../types";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { toHex } from "../lib/color";
import { OklchEditor } from "./OklchEditor";
import { ContrastInline } from "./ContrastInline";
import { useGenerator } from "../generator";

/** Inline editor for a single token: rename, edit value, relink alias. */
export function TokenEditor({ token, onClose }: { token: Token; onClose: () => void }) {
  const { tokens, byName, dispatch } = useStore();
  const openGenerator = useGenerator();
  const [name, setName] = useState(token.name);

  const isRef = token.value.kind === "ref";
  const r = resolve(token, byName);
  const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;

  const commitName = () => {
    if (name.trim() && name.trim() !== token.name) {
      dispatch({ type: "rename", id: token.id, name: name.trim() });
    }
  };

  // Candidate aliases: every other token (avoid self).
  const linkTargets = tokens
    .filter((t) => t.id !== token.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="editor">
      <div className="field">
        <label>Name</label>
        <input
          value={name}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitName();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      {isRef ? (
        <div className="field">
          <label>Linked to (alias)</label>
          <div className="link-row">
            <select
              value={token.value.kind === "ref" ? token.value.ref : ""}
              onChange={(e) => dispatch({ type: "relink", id: token.id, ref: e.target.value })}
            >
              {linkTargets.map((t) => (
                <option key={t.id} value={t.name}>
                  --{t.name}
                </option>
              ))}
            </select>
            <button
              className="btn small"
              title="Convert this alias into a literal value"
              onClick={() => dispatch({ type: "relink", id: token.id, ref: null })}
            >
              Unlink
            </button>
          </div>
          <p className="hint">
            Resolves to <span className="mono">{r.broken ? "⚠ broken" : r.finalRaw}</span>
            {r.chain.length > 1 && (
              <> via {r.chain.map((c) => `--${c}`).join(" → ")}</>
            )}
          </p>
          {rgb && <div className="swatch-lg" style={{ background: toCssDisplay(rgb) }} />}
        </div>
      ) : (
        <div className="field">
          <label>Value</label>
          {rgb ? (
            <OklchEditor
              value={token.value.kind === "raw" ? token.value.raw : toCssDisplay(rgb)}
              onChange={(raw) => dispatch({ type: "setValue", id: token.id, raw })}
            />
          ) : (
            <input
              value={token.value.kind === "raw" ? token.value.raw : ""}
              spellCheck={false}
              onChange={(e) => dispatch({ type: "setValue", id: token.id, raw: e.target.value })}
            />
          )}
          <button
            className="btn small"
            style={{ justifySelf: "start" }}
            onClick={() => {
              const first = linkTargets[0];
              if (first) dispatch({ type: "relink", id: token.id, ref: first.name });
            }}
          >
            Convert to alias →
          </button>
        </div>
      )}

      {rgb && <ContrastInline token={token} rgb={rgb} />}

      {rgb && (
        <button
          className="btn small"
          style={{ justifySelf: "start" }}
          title="Build a full 50–900 tonal ramp seeded from this color"
          onClick={() => openGenerator({ kind: "color", seed: toHex({ ...rgb, a: 1 }) })}
        >
          Generate ramp from this →
        </button>
      )}

      <div className="actions">
        <button className="btn small" onClick={onClose}>
          Done
        </button>
        <div className="spacer" />
        <button
          className="btn small ghost"
          style={{ color: "var(--danger)" }}
          onClick={() => {
            dispatch({ type: "remove", id: token.id });
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
