import { useMemo, useState } from "react";
import { useStore } from "../store";

interface FieldDef {
  key: keyof Fields;
  label: string;
  suffix: string; // token name suffix
  placeholder: string;
}

interface Fields {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
}

const FIELDS: FieldDef[] = [
  { key: "family", label: "Font family", suffix: "font-family", placeholder: '"Inter", system-ui, sans-serif' },
  { key: "size", label: "Font size", suffix: "font-size", placeholder: "24px" },
  { key: "weight", label: "Font weight", suffix: "font-weight", placeholder: "700" },
  { key: "lineHeight", label: "Line height", suffix: "line-height", placeholder: "1.2" },
  { key: "letterSpacing", label: "Letter spacing", suffix: "letter-spacing", placeholder: "-0.01em" },
];

const SAMPLE = "The quick brown fox jumps over the lazy dog";

/**
 * Guided form for creating a typography style: one named group of related
 * tokens (`<name>-font-size`, `<name>-font-weight`, …) with a live preview.
 * Only filled fields become tokens.
 */
export function TypeStyleModal({ onClose }: { onClose: () => void }) {
  const { tokens, dispatch } = useStore();
  const [name, setName] = useState("text-heading");
  const [fields, setFields] = useState<Fields>({
    family: "",
    size: "24px",
    weight: "700",
    lineHeight: "1.2",
    letterSpacing: "",
  });

  const set = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const cleanName = name.trim().replace(/^--/, "").replace(/\s+/g, "-");
  const planned = FIELDS.filter((f) => fields[f.key].trim()).map((f) => ({
    name: `${cleanName}-${f.suffix}`,
    value: fields[f.key].trim(),
  }));

  const collision = useMemo(() => {
    const existing = new Set(tokens.map((t) => t.name));
    return planned.filter((p) => existing.has(p.name)).map((p) => p.name);
  }, [planned, tokens]);

  const previewStyle: React.CSSProperties = {
    fontFamily: fields.family || undefined,
    fontSize: fields.size || undefined,
    fontWeight: fields.weight ? Number(fields.weight) || undefined : undefined,
    lineHeight: fields.lineHeight || undefined,
    letterSpacing: fields.letterSpacing || undefined,
  };

  const canCreate = cleanName.length > 0 && planned.length > 0 && collision.length === 0;

  const create = () => {
    for (const p of planned) dispatch({ type: "add", name: p.name, raw: p.value });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>New text style</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>

        <div className="body">
          <div className="type-preview" style={previewStyle}>{SAMPLE}</div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>Style name</label>
            <input
              className="text-input"
              value={name}
              spellCheck={false}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Creates grouped tokens like <span className="mono">--{cleanName || "text-heading"}-font-size</span>.
            </p>
          </div>

          <div className="type-form-grid">
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  className="text-input"
                  value={fields[f.key]}
                  placeholder={f.placeholder}
                  spellCheck={false}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {collision.length > 0 && (
            <p className="hint" style={{ color: "var(--danger)" }}>
              Already exists: {collision.map((c) => `--${c}`).join(", ")}. Rename the style or clear those fields.
            </p>
          )}
          <p className="hint">
            {planned.length} token{planned.length === 1 ? "" : "s"} will be created.
          </p>
        </div>

        <footer>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canCreate} onClick={create}>
            Create style
          </button>
        </footer>
      </div>
    </div>
  );
}
