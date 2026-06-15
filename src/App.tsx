import { useCallback, useMemo, useState } from "react";
import { useStore } from "./store";
import { NavProvider, type Tab } from "./nav";
import { lint } from "./lib/lint";
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

const TABS: { id: Tab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "colorspace", label: "Color space" },
  { id: "contrast", label: "Contrast" },
  { id: "spacing", label: "Spacing" },
  { id: "typography", label: "Typography" },
  { id: "checks", label: "Checks" },
  { id: "tokens", label: "All tokens" },
];

const TAB_FOR_CATEGORY: Record<string, Tab> = {
  color: "palette",
  spacing: "spacing",
  typography: "typography",
  other: "tokens",
};

export default function App() {
  const { tokens, byName } = useStore();
  const [tab, setTab] = useState<Tab>("palette");
  const [focus, setFocus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newTypeStyle, setNewTypeStyle] = useState(false);

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
      const cat = byName.get(i.tokens[0])?.category ?? "other";
      const t = TAB_FOR_CATEGORY[cat] ?? "tokens";
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

  return (
    <NavProvider value={nav}>
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
          <button className="btn" onClick={() => setImporting(true)}>
            Import CSS
          </button>
          <button className="btn primary" onClick={() => setExporting(true)} disabled={empty}>
            Export CSS
          </button>
        </div>

        {empty ? (
          <EmptyState onImport={() => setImporting(true)} />
        ) : (
          <Main tab={tab} onNewTypeStyle={() => setNewTypeStyle(true)} />
        )}

        {importing && <ImportModal onClose={() => setImporting(false)} />}
        {exporting && <ExportModal onClose={() => setExporting(false)} />}
        {newTypeStyle && <TypeStyleModal onClose={() => setNewTypeStyle(false)} />}
      </div>
    </NavProvider>
  );
}

function Main({ tab, onNewTypeStyle }: { tab: Tab; onNewTypeStyle: () => void }) {
  switch (tab) {
    case "palette":
      return <Split left={<TokenList category="color" title="Color tokens" />}><PaletteView /></Split>;
    case "colorspace":
      return <Split left={<TokenList category="color" title="Color tokens" />}><ColorSpaceView /></Split>;
    case "contrast":
      return <Split left={<TokenList category="color" title="Color tokens" />}><ContrastView /></Split>;
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
