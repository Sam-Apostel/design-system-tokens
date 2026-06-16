import { useRef, useState } from "react";
import { useStore } from "../store";
import { extractDeclarations } from "../lib/parseCss";
import { looksLikeJson, safeJsonCount, jsonToCss } from "../lib/importJson";
import { useEscapeClose } from "../lib/useEscapeClose";

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { tokens, dispatch } = useStore();
  useEscapeClose(onClose);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("merge");
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const isJson = looksLikeJson(text);
  const found = isJson ? safeJsonCount(text) : extractDeclarations(text).length;
  // Distinguish "valid JSON but nothing importable" from "not valid JSON".
  const jsonParses = isJson && (() => { try { JSON.parse(text); return true; } catch { return false; } })();
  const jsonInvalid = isJson && text.trim().length > 1 && !jsonParses;

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const doImport = () => {
    if (mode === "replace" && tokens.length > 0 &&
        !confirm(`Replace all ${tokens.length} current token${tokens.length === 1 ? "" : "s"}? This can't be undone with ⌘Z.`)) {
      return;
    }
    const css = isJson ? jsonToCss(text) : text;
    dispatch({ type: mode === "replace" ? "load" : "merge", css });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Import tokens</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          <p className="hint" style={{ marginTop: 0 }}>
            Paste or drop <b>CSS</b> custom properties, <b>W3C / Tokens Studio JSON</b>, or a{" "}
            <b>Figma variables</b> export. Groups, layers and categories are inferred automatically.
          </p>

          <div
            className={`dropzone ${dragOver ? "over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            onClick={() => fileInput.current?.click()}
          >
            Drop a <span className="mono">.css</span> / <span className="mono">.json</span> file here, or
            click to choose
            <input
              ref={fileInput}
              type="file"
              accept=".css,.json,text/css,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </div>

          <textarea
            spellCheck={false}
            placeholder={":root {\n  --blue-500: #3b82f6;\n  --primary: var(--blue-500);\n}\n\n— or —\n\n{ \"blue\": { \"500\": { \"$value\": \"#3b82f6\" } } }"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
            <label className="toggle">
              <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
              Merge with current
            </label>
            <label className="toggle">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
              Replace everything
            </label>
            <div className="spacer" />
            <span className="hint">
              {jsonInvalid
                ? "couldn't parse JSON"
                : isJson && jsonParses && found === 0
                  ? "valid JSON, but no importable tokens"
                  : `${isJson ? "JSON" : "CSS"} · ${found} token${found === 1 ? "" : "s"} detected`}
            </span>
          </div>
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={found === 0} onClick={doImport}>
            Import {found > 0 ? `${found} token${found === 1 ? "" : "s"}` : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}

