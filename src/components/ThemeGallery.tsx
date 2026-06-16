import { useMemo } from "react";
import { useStore } from "../store";
import { useEscapeClose } from "../lib/useEscapeClose";
import { PRESETS, buildPreset, type PresetSpec, type PresetPreview } from "../lib/presets";

/**
 * Browse and load a prebuilt theme. Each preset is expanded into a full token
 * set (primitives + semantic layer + spacing/type); loading one replaces the
 * working tokens, which in turn re-skins the whole app via the theming contract.
 */
export function ThemeGallery({ onClose }: { onClose: () => void }) {
  const { tokens, dispatch } = useStore();
  useEscapeClose(onClose);

  const built = useMemo(() => PRESETS.map((p) => ({ spec: p, ...buildPreset(p) })), []);

  const use = (spec: PresetSpec, css: string) => {
    if (tokens.length > 0 && !confirm(`Load the ${spec.name} theme? This replaces your current tokens.`)) return;
    dispatch({ type: "load", css });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(960px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Themes</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="hint" style={{ margin: 0 }}>Start from a prebuilt token system — then tweak anything.</span>
        </header>
        <div className="body">
          <div className="theme-grid">
            {built.map(({ spec, preview, css }) => (
              <button key={spec.id} className="theme-card" onClick={() => use(spec, css)}>
                <ThemePreview p={preview} mode={spec.mode} />
                <div className="theme-meta">
                  <div className="theme-name">
                    {spec.name}
                    <span className={`theme-mode ${spec.mode}`}>{spec.mode}</span>
                  </div>
                  <div className="theme-blurb">{spec.blurb}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <footer>
          <button className="btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}

/** A tiny faithful UI rendered entirely from the preset's resolved colors. */
function ThemePreview({ p, mode }: { p: PresetPreview; mode: "light" | "dark" }) {
  return (
    <div className="theme-prev" style={{ background: p.bg, colorScheme: mode }}>
      <div className="theme-prev-card" style={{ background: p.surface, borderColor: p.border }}>
        <div className="theme-prev-line" style={{ background: p.text, width: "62%" }} />
        <div className="theme-prev-line" style={{ background: p.text, opacity: 0.45, width: "88%" }} />
        <div className="theme-prev-line" style={{ background: p.text, opacity: 0.45, width: "74%" }} />
        <div className="theme-prev-row">
          <span className="theme-prev-btn" style={{ background: p.primary, color: p.primaryFg }}>Button</span>
          <span className="theme-prev-btn ghost" style={{ borderColor: p.border, color: p.text }}>Cancel</span>
        </div>
      </div>
      <div className="theme-prev-ramp">
        {p.ramp.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
