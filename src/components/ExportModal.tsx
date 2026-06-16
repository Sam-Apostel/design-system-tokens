import { useMemo, useState } from "react";
import { useStore } from "../store";
import { exportTokens, tailwindProjectFiles, FORMATS, type ExportFormat } from "../lib/exporters";
import { useEscapeClose } from "../lib/useEscapeClose";

// Formats whose output reflects every mode; the rest export the active mode only.
const MODE_AWARE = new Set<ExportFormat>(["css", "tailwind", "tailwind-project"]);

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after the click has been handled, not synchronously, or some
  // browsers cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { tokens, byName, modeList, activeMode } = useStore();
  useEscapeClose(onClose);
  const [format, setFormat] = useState<ExportFormat>("css");
  const [selector, setSelector] = useState(":root");
  const [grouped, setGrouped] = useState(true);
  const [lightDark, setLightDark] = useState(true);
  const [resolveVals, setResolveVals] = useState(false);
  const [copied, setCopied] = useState("");

  const meta = FORMATS.find((f) => f.id === format)!;
  const multiMode = modeList.length > 1;
  const canLightDark = modeList.includes("light") && modeList.includes("dark");

  const code = useMemo(
    () =>
      meta.multiFile
        ? ""
        : exportTokens(tokens, format, { selector, groupBySection: grouped, lightDark }, modeList, byName, { resolve: resolveVals }),
    [meta.multiFile, tokens, format, selector, grouped, lightDark, modeList, byName, resolveVals],
  );

  const files = useMemo(
    () => (format === "tailwind-project" ? tailwindProjectFiles(tokens, byName, modeList) : null),
    [format, tokens, byName, modeList],
  );

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard may be unavailable; the textarea is selectable as fallback */
    }
  };

  const lossyMode = multiMode && !MODE_AWARE.has(format);

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
          {format === "tailwind-project" && (
            <p className="hint" style={{ marginTop: 0 }}>
              Three drop-in files: <span className="mono">primitives.css</span> (raw base values),
              <span className="mono"> theme.css</span> (<span className="mono">@theme</span> mapping semantic/component tokens onto them),
              and <span className="mono"> utilities.css</span> (<span className="mono">@utility</span> classes for composite sets).
            </p>
          )}
          {lossyMode && (
            <p className="hint" style={{ marginTop: 0, color: "var(--warning)" }}>
              ⚠ Exports the active mode (<span className="mono">{activeMode}</span>) only — use CSS or Tailwind to keep all {modeList.length} modes.
            </p>
          )}
          {format === "css" && multiMode && !(canLightDark && lightDark) && (
            <p className="hint" style={{ marginTop: 0 }}>
              :root holds "{modeList[0]}"; other modes become [data-theme="…"] overrides.
            </p>
          )}

          {files ? (
            <div className="export-files">
              {files.map((f) => (
                <div className="export-file" key={f.name}>
                  <div className="export-file-head">
                    <span className="mono">{f.name}</span>
                    <div className="spacer" />
                    <button className="btn small" onClick={() => copy(f.content, f.name)}>{copied === f.name ? "Copied ✓" : "Copy"}</button>
                    <button className="btn small" onClick={() => downloadText(f.name, f.content)}>Download</button>
                  </div>
                  <textarea readOnly value={f.content} spellCheck={false} onFocus={(e) => e.target.select()} />
                </div>
              ))}
            </div>
          ) : (
            <textarea readOnly value={code} spellCheck={false} onFocus={(e) => e.target.select()} />
          )}
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>Close</button>
          {files ? (
            <button className="btn" onClick={() => files.forEach((f) => downloadText(f.name, f.content))}>Download all</button>
          ) : (
            <>
              <button className="btn" onClick={() => downloadText(meta.filename, code)}>Download {meta.filename}</button>
              <button className="btn primary" onClick={() => copy(code, "main")}>{copied === "main" ? "Copied ✓" : "Copy"}</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
