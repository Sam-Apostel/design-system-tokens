import { useState } from "react";
import { useStore } from "../store";
import { extractDeclarations } from "../lib/parseCss";

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("merge");

  const found = extractDeclarations(text).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Import CSS tokens</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="body">
          <p className="hint" style={{ marginTop: 0 }}>
            Paste any CSS. Custom properties (<span className="mono">--name: value;</span>) are
            extracted from anywhere — selectors, <span className="mono">:root</span>, media queries.
            Groups, layers and categories are inferred automatically.
          </p>
          <textarea
            autoFocus
            spellCheck={false}
            placeholder={":root {\n  --color-brand-500: #3b82f6;\n  --spacing-md: 16px;\n}"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
            <label className="toggle">
              <input
                type="radio"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              Merge with current
            </label>
            <label className="toggle">
              <input
                type="radio"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              Replace everything
            </label>
            <div className="spacer" />
            <span className="hint">{found} declaration{found === 1 ? "" : "s"} detected</span>
          </div>
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={found === 0}
            onClick={() => {
              dispatch({ type: mode === "replace" ? "load" : "merge", css: text });
              onClose();
            }}
          >
            Import {found > 0 ? `${found} token${found === 1 ? "" : "s"}` : ""}
          </button>
        </footer>
      </div>
    </div>
  );
}
