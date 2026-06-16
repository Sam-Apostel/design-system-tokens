import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { NavProvider, type Tab } from "./nav";
import { VisionProvider } from "./vision";
import { GeneratorProvider, type GenRequest } from "./generator";
import { CVD_OPTIONS, CVD_SIM_MODES, cvdMatrixValues, type CvdMode } from "./lib/cvd";
import { lint } from "./lib/lint";
import { tabForIssue } from "./lib/issueNav";
import { shareUrl } from "./lib/permalink";
import { uiThemeVars, THEME_VARS } from "./lib/uiTheme";
import { TokenList } from "./components/TokenList";
import { PaletteView } from "./components/PaletteView";
import { SpacingView } from "./components/SpacingView";
import { ShadowsView } from "./components/ShadowsView";
import { TypographyView } from "./components/TypographyView";
import { ColorSpaceView } from "./components/ColorSpaceView";
import { ContrastView } from "./components/ContrastView";
import { LintView } from "./components/LintView";
import { ImportModal } from "./components/ImportModal";
import { ExportModal } from "./components/ExportModal";
import { EmptyState } from "./components/EmptyState";
import { TypeStyleModal } from "./components/TypeStyleModal";
import { SemanticsView } from "./components/SemanticsView";
import { DependencyGraph } from "./components/DependencyGraph";
import { ComponentsView } from "./components/ComponentsView";
import { CreateTokenModal } from "./components/CreateTokenModal";
import { GeneratorModal } from "./components/GeneratorModal";
import { ThemeGallery } from "./components/ThemeGallery";
import { DocsModal } from "./components/DocsModal";
import type { RecItem } from "./lib/recommendations";

const TABS: { id: Tab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "colorspace", label: "Color space" },
  { id: "contrast", label: "Contrast" },
  { id: "semantics", label: "Semantics" },
  { id: "graph", label: "Graph" },
  { id: "spacing", label: "Spacing" },
  { id: "shadows", label: "Shadows" },
  { id: "typography", label: "Typography" },
  { id: "components", label: "Components" },
  { id: "checks", label: "Checks" },
  { id: "tokens", label: "All tokens" },
];

export default function App() {
  const { tokens, byName, dispatch, canUndo, canRedo, modeList, activeMode } = useStore();
  const [tab, setTab] = useState<Tab>("palette");
  const [focus, setFocus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newTypeStyle, setNewTypeStyle] = useState(false);
  const [generating, setGenerating] = useState<GenRequest | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [createItem, setCreateItem] = useState<RecItem | null>(null);
  const [shared, setShared] = useState(false);
  const [vision, setVision] = useState<CvdMode>("none");
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Dogfood the theming contract: re-skin the app from imported tokens.
  const themed = useMemo(() => uiThemeVars(tokens, byName), [tokens, byName]);
  useEffect(() => {
    const root = document.documentElement;
    for (const v of THEME_VARS) root.style.removeProperty(v);
    for (const [k, val] of Object.entries(themed.vars)) root.style.setProperty(k, val);
    root.style.colorScheme = themed.matched > 0 ? (themed.bgIsLight ? "light" : "dark") : "dark";
  }, [themed]);

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
  const closeMenu = () => setMenuOpen(false);

  return (
    <NavProvider value={nav}>
     <VisionProvider value={vision}>
      <GeneratorProvider value={(req) => setGenerating(req ?? {})}>
      <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
        <defs>
          {CVD_SIM_MODES.map((m) => (
            <filter key={m} id={`cvd-${m}`} colorInterpolationFilters="linearRGB">
              <feColorMatrix type="matrix" values={cvdMatrixValues(m)} />
            </filter>
          ))}
        </defs>
      </svg>
      <div className="app">
        <div className="topbar">
          <div className="brand">
            <span className="dot" />
            <span className="brand-name">Token Studio</span>
            {themed.matched >= 3 && (
              <span
                className="themed-chip"
                title={`The UI is themed from ${themed.matched} of your semantic tokens (active mode).`}
              >
                ✨
              </span>
            )}
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

          <div className="toolbar">
            {vision !== "none" && (
              <button
                className="vision-chip"
                title={`Simulating ${CVD_OPTIONS.find((o) => o.id === vision)?.label}. Click to turn off.`}
                onClick={() => setVision("none")}
              >
                <span className="vision-eye" aria-hidden>◑</span>
                {vision}
                <span className="vision-x" aria-hidden>✕</span>
              </button>
            )}
            {!empty && modeList.length > 1 && (
              <div className="seg mode-switch" title="Theme mode">
                {modeList.map((m) => (
                  <button key={m} className={activeMode === m ? "active" : ""} onClick={() => dispatch({ type: "setMode", name: m })}>
                    {m}
                  </button>
                ))}
              </div>
            )}
            <button className="btn primary" onClick={() => setExporting(true)} disabled={empty}>
              Export
            </button>

            <div className="tb-menu">
              <button
                className="btn icon-btn"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="tb-menu-backdrop" onClick={closeMenu} />
                  <div className="tb-menu-panel" role="menu">
                    <button className="tb-item" onClick={() => { setThemesOpen(true); closeMenu(); }}>Browse themes…</button>
                    <button className="tb-item" onClick={() => { setImporting(true); closeMenu(); }}>Import…</button>
                    <button className="tb-item" onClick={() => { setGenerating({}); closeMenu(); }}>Generate a scale…</button>
                    {!empty && <button className="tb-item" onClick={() => { share(); closeMenu(); }}>{shared ? "Link copied ✓" : "Share link"}</button>}
                    <button className="tb-item" onClick={() => { setDocsOpen(true); closeMenu(); }}>Token guide</button>

                    {!empty && (
                      <>
                        <div className="tb-sep" />
                        <button className="tb-item" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })}>Undo</button>
                        <button className="tb-item" disabled={!canRedo} onClick={() => dispatch({ type: "redo" })}>Redo</button>

                        <div className="tb-sep" />
                        <button className="tb-item" onClick={() => { dispatch({ type: "addMode" }); }}>
                          {modeList.length > 1 ? "Add a mode" : "Split into light / dark"}
                        </button>
                        {modeList.length > 1 && activeMode !== modeList[0] && (
                          <button className="tb-item" onClick={() => dispatch({ type: "removeMode", name: activeMode })}>
                            Remove “{activeMode}” mode
                          </button>
                        )}

                        <div className="tb-sep" />
                        <div className="tb-label">Simulate vision</div>
                        {CVD_OPTIONS.map((o) => (
                          <button
                            key={o.id}
                            className={`tb-item ${vision === o.id ? "active" : ""}`}
                            onClick={() => setVision(o.id)}
                          >
                            {o.label}
                          </button>
                        ))}

                        <div className="tb-sep" />
                        <button
                          className="tb-item danger"
                          onClick={() => {
                            if (confirm("Clear all tokens and start over? This can't be undone with ⌘Z.")) {
                              dispatch({ type: "clear" });
                            }
                            closeMenu();
                          }}
                        >
                          Clear all tokens…
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* The simulated canvas: a CVD filter here re-tints every view (palette,
            color space, components, contrast…) so the toggle is felt everywhere. */}
        <div className="app-canvas" style={vision !== "none" ? { filter: `url(#cvd-${vision})` } : undefined}>
          {empty ? (
            <EmptyState onImport={() => setImporting(true)} onGenerate={() => setGenerating({})} onThemes={() => setThemesOpen(true)} />
          ) : (
            <Main
              tab={tab}
              onNewTypeStyle={() => setNewTypeStyle(true)}
              onCreate={setCreateItem}
              onOpenDocs={() => setDocsOpen(true)}
            />
          )}
        </div>

        {themesOpen && <ThemeGallery onClose={() => setThemesOpen(false)} />}
        {importing && <ImportModal onClose={() => setImporting(false)} />}
        {generating && (
          <GeneratorModal
            onClose={() => setGenerating(null)}
            initialKind={generating.kind}
            initialSeed={generating.seed}
          />
        )}
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
      </GeneratorProvider>
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
    case "graph":
      return (
        <div className="content">
          <DependencyGraph />
        </div>
      );
    case "components":
      return (
        <div className="content">
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <ComponentsView />
          </div>
        </div>
      );
    case "spacing":
      return <Split left={<TokenList category="spacing" title="Spacing tokens" />}><SpacingView /></Split>;
    case "shadows":
      return (
        <div className="content">
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <ShadowsView />
          </div>
        </div>
      );
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
  // The per-tab token list is hidden on mobile by default (the All tokens tab
  // covers editing); a toggle reveals it. Desktop always shows both columns.
  const [showList, setShowList] = useState(false);
  return (
    <div className={`content split ${showList ? "show-list" : ""}`}>
      <button className="btn small split-toggle" onClick={() => setShowList((s) => !s)}>
        {showList ? "Hide token list" : "Edit token list"}
      </button>
      <div className="col list-col">{left}</div>
      <div className="col">{children}</div>
    </div>
  );
}
