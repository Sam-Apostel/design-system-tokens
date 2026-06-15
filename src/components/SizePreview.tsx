import type { SpacingKind } from "../lib/spacing";

/**
 * A compact, kind-aware visualization of a single length value.
 * `px` is the resolved pixel length; `maxPx` lets a row of previews share a
 * common scale so bars are visually comparable.
 */
export function SizePreview({
  kind,
  px,
  maxPx,
  accent = "var(--accent)",
}: {
  kind: SpacingKind;
  px: number | null;
  maxPx: number;
  accent?: string;
}) {
  if (px == null) return <span className="faint mono">—</span>;

  // Cap the rendered extent so huge values don't blow out the layout.
  const cap = 220;
  const scale = maxPx > cap ? cap / maxPx : 1;
  const shown = Math.max(1, px * scale);

  switch (kind) {
    case "width":
    case "size":
      return (
        <div className="sp-track">
          <span className="sp-bar-h" style={{ width: shown, background: accent }} />
        </div>
      );

    case "height":
      return (
        <div className="sp-height-track">
          <span className="sp-bar-v" style={{ height: Math.min(shown, 120), background: accent }} />
        </div>
      );

    case "gap":
      return (
        <div className="sp-gap">
          <span className="sp-block" />
          <span style={{ width: shown, display: "inline-block" }} />
          <span className="sp-block" />
        </div>
      );

    case "padding": {
      const p = Math.min(px * scale, 40);
      return (
        <div className="sp-pad" style={{ padding: p }}>
          <span className="sp-pad-inner" />
        </div>
      );
    }

    case "radius": {
      const r = Math.min(px, 48);
      return <div className="sp-radius" style={{ borderRadius: r }} />;
    }

    case "stroke": {
      const s = Math.max(0.5, Math.min(px, 24));
      return <div className="sp-stroke" style={{ borderTopWidth: s, borderTopColor: accent }} />;
    }
  }
}
