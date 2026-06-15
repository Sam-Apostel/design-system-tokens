import { useMemo, useState } from "react";
import { useStore } from "./store";
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

type Tab = "palette" | "colorspace" | "contrast" | "spacing" | "typography" | "checks" | "tokens";

const TABS: { id: Tab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "colorspace", label: "Color space" },
  { id: "contrast", label: "Contrast" },
  { id: "spacing", label: "Spacing" },
  { id: "typography", label: "Typography" },
  { id: "checks", label: "Checks" },
  { id: "tokens", label: "All tokens" },
];

export default function App() {
  const { tokens } = useStore();
  const [tab, setTab] = useState<Tab>("palette");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const issueCount = useMemo(
    () => lint(tokens).filter((i) => i.severity !== "info").length,
    [tokens],
  );

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot" />
          Token Studio <small>design system tokens</small>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "checks" && issueCount > 0 && <span className="badge">{issueCount}</span>}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}>
          Import CSS
        </button>
        <button className="btn primary" onClick={() => setExporting(true)}>
          Export CSS
        </button>
      </div>

      <Main tab={tab} />

      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {exporting && <ExportModal onClose={() => setExporting(false)} />}
    </div>
  );
}

function Main({ tab }: { tab: Tab }) {
  switch (tab) {
    case "palette":
      return (
        <Split left={<TokenList category="color" title="Color tokens" />}>
          <PaletteView />
        </Split>
      );
    case "colorspace":
      return (
        <Split left={<TokenList category="color" title="Color tokens" />}>
          <ColorSpaceView />
        </Split>
      );
    case "contrast":
      return (
        <Split left={<TokenList category="color" title="Color tokens" />}>
          <ContrastView />
        </Split>
      );
    case "spacing":
      return (
        <Split left={<TokenList category="spacing" title="Spacing tokens" />}>
          <SpacingView />
        </Split>
      );
    case "typography":
      return (
        <Split left={<TokenList category="typography" title="Typography tokens" />}>
          <TypographyView />
        </Split>
      );
    case "checks":
      return (
        <div className="content">
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <LintView />
          </div>
        </div>
      );
    case "tokens":
      return (
        <div className="content">
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <TokenList title="All tokens" />
          </div>
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
