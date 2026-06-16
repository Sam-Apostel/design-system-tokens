import { useStore } from "../store";
import { TokenEditor } from "./TokenEditor";
import { useEscapeClose } from "../lib/useEscapeClose";

/**
 * Edit a token in a modal — used when there's no token-list sidebar to expand
 * into (narrow viewports), or to edit in place from a view (e.g. a palette
 * swatch) without navigating away and losing scroll position.
 */
export function TokenEditDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { tokens } = useStore();
  useEscapeClose(onClose);
  const token = tokens.find((t) => t.name === name);
  if (!token) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal token-edit-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3 className="mono" style={{ fontSize: 14 }}>--{token.name}</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          <TokenEditor token={token} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
