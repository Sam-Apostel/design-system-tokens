import { useMemo, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { spacingKind, lengthToPx } from "../lib/spacing";
import { tierOf } from "../lib/tiers";
import type { CreateKind } from "../lib/recommendations";
import { SizePreview } from "./SizePreview";

/**
 * Guided creator for a single semantic/component token. Defaults to aliasing an
 * existing primitive (the recommended pattern) but allows a raw value too.
 */
export function CreateTokenModal({
  initialName,
  kind,
  desc,
  onClose,
}: {
  initialName: string;
  kind: CreateKind;
  desc?: string;
  onClose: () => void;
}) {
  const { tokens, byName, dispatch } = useStore();
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<"alias" | "raw">("alias");
  const [raw, setRaw] = useState(kind === "color" ? "#000000" : kind === "radius" || kind === "spacing" ? "8px" : "");

  // Candidate source tokens, filtered by the kind and ranked primitives-first.
  const candidates = useMemo(() => {
    let list = tokens;
    if (kind === "color") list = tokens.filter((t) => t.category === "color");
    else if (kind === "radius") {
      const r = tokens.filter((t) => t.category === "spacing" && spacingKind(t.name) === "radius");
      list = r.length ? r : tokens.filter((t) => t.category === "spacing");
    } else if (kind === "spacing") list = tokens.filter((t) => t.category === "spacing");
    return [...list].sort((a, b) => {
      const ta = tierOf(a) === "primitive" ? 0 : 1;
      const tb = tierOf(b) === "primitive" ? 0 : 1;
      return ta - tb || a.name.localeCompare(b.name);
    });
  }, [tokens, kind]);

  const [source, setSource] = useState(candidates[0]?.name ?? "");

  const cleanName = name.trim().replace(/^--/, "").replace(/\s+/g, "-");
  const exists = tokens.some((t) => t.name === cleanName);
  const value = mode === "alias" ? (source ? `var(--${source})` : "") : raw.trim();

  // Preview resolution.
  const resolvedRaw =
    mode === "alias" && source ? resolve(byName.get(source)!, byName).finalRaw : raw.trim();
  const rgb = kind === "color" ? parseColor(resolvedRaw ?? "") : null;
  const px = kind === "radius" || kind === "spacing" ? lengthToPx(resolvedRaw) : null;

  const canCreate = cleanName.length > 0 && !exists && value.length > 0;
  const create = () => {
    dispatch({ type: "add", name: cleanName, raw: value });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Create semantic token</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>

        <div className="body">
          {desc && <p className="hint" style={{ marginTop: 0 }}>{desc}</p>}

          <div className="field" style={{ marginBottom: 14 }}>
            <label>Token name</label>
            <input className="text-input" value={name} spellCheck={false} autoFocus onChange={(e) => setName(e.target.value)} />
            {exists && <p className="hint" style={{ color: "var(--danger)", margin: "4px 0 0" }}>--{cleanName} already exists.</p>}
          </div>

          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={mode === "alias" ? "active" : ""} onClick={() => setMode("alias")}>
              Alias a token
            </button>
            <button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>
              Raw value
            </button>
          </div>

          {mode === "alias" ? (
            <div className="field">
              <label>References (recommended)</label>
              {candidates.length === 0 ? (
                <p className="hint">No suitable tokens to reference yet — switch to a raw value.</p>
              ) : (
                <select className="text-input" value={source} onChange={(e) => setSource(e.target.value)}>
                  {candidates.map((t) => (
                    <option key={t.id} value={t.name}>
                      --{t.name} {tierOf(t) === "primitive" ? "" : `(${tierOf(t)})`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="field">
              <label>Value</label>
              <input className="text-input" value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} />
            </div>
          )}

          <div className="create-preview">
            {rgb ? (
              <span className="swatch-lg" style={{ width: 48, height: 48, background: toCssDisplay(rgb) }} />
            ) : px != null ? (
              <div style={{ width: 200 }}>
                <SizePreview kind={kind === "radius" ? "radius" : "size"} px={px} maxPx={Math.max(px, 64)} />
              </div>
            ) : (
              <span className="faint mono">no preview</span>
            )}
            <div className="mono faint" style={{ fontSize: 12 }}>
              --{cleanName || "name"}: {value || "…"};
            </div>
          </div>
        </div>

        <footer>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canCreate} onClick={create}>Create token</button>
        </footer>
      </div>
    </div>
  );
}
