import { useMemo, useState } from "react";
import { useStore } from "../store";
import { exportTokens, FORMATS, type ExportFormat } from "../lib/exporters";
import { useEscapeClose } from "../lib/useEscapeClose";

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { tokens, byName, modeList } = useStore();
  useEscapeClose(onClose);
  const [format, setFormat] = useState<ExportFormat>("css");
  const [selector, setSelector] = useState(":root");
  const [grouped, setGrouped] = useState(true);
  const [lightDark, setLightDark] = useState(true);
  const [resolveVals, setResolveVals] = useState(false);
  const [copied, setCopied] = useState(false);

  const meta = FORMATS.find((f) => f.id === format)!;
  const multiMode = modeList.length > 1;
  const canLightDark = modeList.includes("light") && modeList.includes("dark");
  const code = useMemo(
    () => exportTokens(tokens, format, { selector, groupBySection: grouped, lightDark }, modeList, byName, { resolve: resolveVals }),
    [tokens, format, selector, grouped, lightDark, modeList, byName, resolveVals],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the textarea is selectable as fallback */
    }
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = meta.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Export tokens</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          <div className="seg" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            {FORMATS.map((f) => (
              <button key={f.id} className={format === f.id ? "active" : ""} onClick={() => setFormat(f.id)}>
                {f.label}
              </button>
            ))}
          </div>

          {format === "css" && !multiMode && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
              <div className="field" style={{ flex: "0 0 220px" }}>
                <label>Selector</label>
                <input className="text-input" value={selector} onChange={(e) => setSelector(e.target.value)} spellCheck={false} />
              </div>
              <label className="toggle" style={{ marginTop: 18 }}>
                <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                Group with section comments
              </label>
            </div>
          )}
          {format === "css" && canLightDark && (
            <label className="toggle" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={lightDark} onChange={(e) => setLightDark(e.target.checked)} />
              Use <span className="mono">&nbsp;light-dark()</span>&nbsp; (single :root, follows color-scheme)
            </label>
          )}
          {format === "classes" && (
            <>
              <label className="toggle" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={resolveVals} onChange={(e) => setResolveVals(e.target.checked)} />
                Resolve values <span className="hint" style={{ marginLeft: 6 }}>(off = keep <span className="mono">var(--token)</span> references)</span>
              </label>
              <p className="hint" style={{ marginTop: 0 }}>
                One class per group whose token leaves map to CSS properties (e.g. <span className="mono">body-default-font-size</span> → <span className="mono">.body-default {"{"} font-size {"}"}</span>).
              </p>
            </>
          )}
          {multiMode && format !== "css" && format !== "classes" && (
            <p className="hint" style={{ marginTop: 0 }}>This format exports the active mode's values only.</p>
          )}
          {format === "css" && multiMode && !(canLightDark && lightDark) && (
            <p className="hint" style={{ marginTop: 0 }}>
              :root holds "{modeList[0]}"; other modes become [data-theme="…"] overrides.
            </p>
          )}

          <textarea readOnly value={code} spellCheck={false} onFocus={(e) => e.target.select()} />
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={download}>Download {meta.filename}</button>
          <button className="btn primary" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        </footer>
      </div>
    </div>
  );
}
