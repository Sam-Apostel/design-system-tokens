import { useMemo, useState } from "react";
import { useStore } from "../store";
import { exportTokens, FORMATS, type ExportFormat } from "../lib/exporters";

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { tokens, modeList } = useStore();
  const [format, setFormat] = useState<ExportFormat>("css");
  const [selector, setSelector] = useState(":root");
  const [grouped, setGrouped] = useState(true);
  const [copied, setCopied] = useState(false);

  const meta = FORMATS.find((f) => f.id === format)!;
  const multiMode = modeList.length > 1;
  const code = useMemo(
    () => exportTokens(tokens, format, { selector, groupBySection: grouped }, modeList),
    [tokens, format, selector, grouped, modeList],
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
          {multiMode && (
            <p className="hint" style={{ marginTop: 0 }}>
              {format === "css"
                ? `CSS exports all modes: :root holds "${modeList[0]}", others become [data-theme="…"] overrides.`
                : "This format exports the active mode's values only."}
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
