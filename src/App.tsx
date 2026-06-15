import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { NavProvider, type Tab } from "./nav";
import { VisionProvider } from "./vision";
import { CVD_OPTIONS, type CvdMode } from "./lib/cvd";
import { lint } from "./lib/lint";
import { tabForIssue } from "./lib/issueNav";
import { shareUrl } from "./lib/permalink";
import { TokenList } from "./components/TokenList";
import { PaletteView } from "./components/PaletteView";
import { SpacingView } from "./components/SpacingView";
import { TypographyView } from "./components/TypographyView";
import { ColorSpaceView } from "./components/ColorSpaceView";
import { ContrastView } from "./components/ContrastView";
import { LintView } from "./components/LintView";
import { ImportModal } from "./components/ImportModal";
import { ExportModal } from "./components/ExportModal";
import { EmptyState } from "./components/EmptyState";
import { TypeStyleModal } from "./components/TypeStyleModal";
import { SemanticsView } from "./components/SemanticsView";
import { CreateTokenModal } from "./components/CreateTokenModal";
import { DocsModal } from "./components/DocsModal";
import type { RecItem } from "./lib/recommendations";

const TABS: { id: Tab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "colorspace", label: "Color space" },
  { id: "contrast", label: "Contrast" },
  { id: "semantics", label: "Semantics" },
  { id: "spacing", label: "Spacing" },
  { id: "typography", label: "Typography" },
  { id: "checks", label: "Checks" },
  { id: "tokens", label: "All tokens" },
];

export default function App() {
  const { tokens, byName, dispatch, canUndo, canRedo } = useStore();
  const [tab, setTab] = useState<Tab>("palette");
  const [focus, setFocus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newTypeStyle, setNewTypeStyle] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [createItem, setCreateItem] = useState<RecItem | null>(null);
  const [shared, setShared] = useState(false);
  const [vision, setVision] = useState<CvdMode>("none");

  // Undo/redo keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const share = async () => {
    const url = shareUrl(tokens);
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1600);
    } catch {
      /* hash is set even if clipboard is blocked */
    }
  };

  const navigate = useCallback((t: Tab, token?: string) => {
    setTab(t);
    setFocus(token ?? null);
  }, []);
  const clearFocus = useCallback(() => setFocus(null), []);

  // Per-tab issue indicators (errors + warnings only).
  const tabBadges = useMemo(() => {
    const counts: Partial<Record<Tab, number>> = {};
    let total = 0;
    for (const i of lint(tokens)) {
      if (i.severity === "info") continue;
      total++;
      const t = tabForIssue(i, byName);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    counts.checks = total;
    return counts;
  }, [tokens, byName]);

  const nav = useMemo(
    () => ({ tab, focus, setTab, navigate, clearFocus }),
    [tab, focus, navigate, clearFocus],
  );

  const empty = tokens.length === 0;

  const showVision = !empty && (tab === "palette" || tab === "contrast");

  return (
    <NavProvider value={nav}>
     <VisionProvider value={vision}>
      <div className="app">
        <div className="topbar">
          <div className="brand">
            <span className="dot" />
            Token Studio <small>design system tokens</small>
          </div>
          {!empty && (
            <nav className="tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`tab ${tab === t.id ? "active" : ""}`}
                  onClick={() => navigate(t.id)}
                >
                  {t.label}
                  {tabBadges[t.id] ? <span className={`badge ${t.id === "checks" ? "" : "warn"}`}>{tabBadges[t.id]}</span> : null}
                </button>
              ))}
            </nav>
          )}
          <div className="spacer" />
          {!empty && (
            <div className="seg" title="Undo / redo">
              <button onClick={() => dispatch({ type: "undo" })} disabled={!canUndo} aria-label="Undo">
                ↶
              </button>
              <button onClick={() => dispatch({ type: "redo" })} disabled={!canRedo} aria-label="Redo">
                ↷
              </button>
            </div>
          )}
          {showVision && (
            <select
              className="vision-select"
              value={vision}
              onChange={(e) => setVision(e.target.value as CvdMode)}
              title="Simulate color-vision deficiency"
            >
              {CVD_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <button className="btn ghost" onClick={() => setDocsOpen(true)}>
            Guide
          </button>
          <button className="btn" onClick={() => setImporting(true)}>
            Import
          </button>
          {!empty && (
            <button className="btn" onClick={share}>
              {shared ? "Link copied ✓" : "Share"}
            </button>
          )}
          <button className="btn primary" onClick={() => setExporting(true)} disabled={empty}>
            Export
          </button>
        </div>

        {empty ? (
          <EmptyState onImport={() => setImporting(true)} />
        ) : (
          <Main
            tab={tab}
            onNewTypeStyle={() => setNewTypeStyle(true)}
            onCreate={setCreateItem}
            onOpenDocs={() => setDocsOpen(true)}
          />
        )}

        {importing && <ImportModal onClose={() => setImporting(false)} />}
        {exporting && <ExportModal onClose={() => setExporting(false)} />}
        {newTypeStyle && <TypeStyleModal onClose={() => setNewTypeStyle(false)} />}
        {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}
        {createItem && (
          <CreateTokenModal
            initialName={createItem.key}
            kind={createItem.kind}
            desc={createItem.desc}
            onClose={() => setCreateItem(null)}
          />
        )}
      </div>
     </VisionProvider>
    </NavProvider>
  );
}

function Main({
  tab,
  onNewTypeStyle,
  onCreate,
  onOpenDocs,
}: {
  tab: Tab;
  onNewTypeStyle: () => void;
  onCreate: (item: RecItem) => void;
  onOpenDocs: () => void;
}) {
  switch (tab) {
    case "palette":
      return <Split left={<TokenList category="color" title="Color tokens" />}><PaletteView /></Split>;
    case "colorspace":
      return <Split left={<TokenList category="color" title="Color tokens" />}><ColorSpaceView /></Split>;
    case "contrast":
      return <Split left={<TokenList category="color" title="Color tokens" />}><ContrastView /></Split>;
    case "semantics":
      return (
        <div className="content">
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <SemanticsView onCreate={onCreate} onOpenDocs={onOpenDocs} />
          </div>
        </div>
      );
    case "spacing":
      return <Split left={<TokenList category="spacing" title="Spacing tokens" />}><SpacingView /></Split>;
    case "typography":
      return (
        <Split
          left={
            <TokenList
              category="typography"
              title="Typography tokens"
              onAdd={onNewTypeStyle}
              addLabel="+ New style"
            />
          }
        >
          <TypographyView onNewStyle={onNewTypeStyle} />
        </Split>
      );
    case "checks":
      return (
        <div className="content">
          <div style={{ maxWidth: 860, margin: "0 auto" }}><LintView /></div>
        </div>
      );
    case "tokens":
      return (
        <div className="content">
          <div style={{ maxWidth: 860, margin: "0 auto" }}><TokenList title="All tokens" /></div>
        </div>
      );
  }
}

function Split({ left, children }: { left: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="content split">
      <div className="col">{left}</div>
      <div className="col">{children}</div>
    </div>
  );
}
