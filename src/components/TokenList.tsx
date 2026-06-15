import { useEffect, useMemo, useRef, useState } from "react";
import type { Token, TokenCategory } from "../types";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve, valueToText } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { buildGroupTree, leafLabel, type TopGroup, type SubGroup } from "../lib/tree";
import { lint, issuesByToken, type LintSeverity } from "../lib/lint";
import { spacingKind, lengthToPx } from "../lib/spacing";
import { TokenEditor } from "./TokenEditor";
import { SizePreview } from "./SizePreview";

interface Props {
  category?: TokenCategory;
  title: string;
}

export function TokenList({ category, title }: Props) {
  const { tokens, dispatch } = useStore();
  const { focus, clearFocus } = useNav();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens
      .filter((t) => (category ? t.category === category : true))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true));
  }, [tokens, category, query]);

  const tree = useMemo(() => buildGroupTree(filtered), [filtered]);

  // Name index for resolving values inside rows.
  const indexByNameMemo = useMemo(() => {
    const m = new Map<string, Token>();
    for (const t of tokens) m.set(t.name, t);
    return m;
  }, [tokens]);

  // React to navigation focus: open the editor and scroll it into view.
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!focus) return;
    const target = tokens.find((t) => t.name === focus);
    if (!target) return;
    if (category && target.category !== category) return;
    setEditing(target.id);
    const el = rowRefs.current.get(target.id);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    clearFocus();
  }, [focus, tokens, category, clearFocus]);

  const renderRow = (t: Token) => {
    const r = resolve(t, indexByNameMemo);
    const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
    const isRef = t.value.kind === "ref";
    const sev = issues.get(t.name);
    const showSize = t.category === "spacing";
    const px = showSize ? lengthToPx(r.finalRaw) : null;

    return (
      <div key={t.id}>
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(t.id, el);
          }}
          className={`row ${editing === t.id ? "selected" : ""}`}
          onClick={() => setEditing(editing === t.id ? null : t.id)}
        >
          {showSize ? (
            <span className="row-size">
              <SizePreview kind={spacingKind(t.name)} px={px} maxPx={120} />
            </span>
          ) : rgb ? (
            <span className="swatch">
              <i style={{ background: toCssDisplay(rgb) }} />
            </span>
          ) : (
            <span className="swatch" style={{ background: "transparent" }} />
          )}
          <span className="name" title={t.name}>
            --{t.name}
          </span>
          {sev && <IssueDot sev={sev} />}
          <span className={`val ${isRef ? "ref" : ""}`} title={valueToText(t.value)}>
            {valueToText(t.value)}
          </span>
        </div>
        {editing === t.id && <TokenEditor token={t} onClose={() => setEditing(null)} />}
      </div>
    );
  };

  return (
    <div>
      <div className="section-title">
        {title}
        <span className="count">({filtered.length})</span>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={() => {
            const seed =
              category === "color" ? "#888888" : category === "spacing" ? "8px" : category === "typography" ? "16px" : "";
            dispatch({ type: "add", name: `${category ?? "token"}-new`, raw: seed });
          }}
        >
          + Add
        </button>
      </div>

      <input
        className="text-input search"
        placeholder="Filter by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />

      {tree.length === 0 && <div className="empty">No tokens here yet.</div>}

      {tree.map((top) => (
        <TopGroupView
          key={top.key}
          group={top}
          renderRow={renderRow}
          onRename={(oldPrefix, newPrefix) => dispatch({ type: "renameGroup", oldPrefix, newPrefix })}
        />
      ))}
    </div>
  );
}

function TopGroupView({
  group,
  renderRow,
  onRename,
}: {
  group: TopGroup;
  renderRow: (t: Token) => React.ReactNode;
  onRename: (oldPrefix: string, newPrefix: string) => void;
}) {
  return (
    <div className="token-group">
      <GroupHeader
        label={group.key}
        level="top"
        onCommit={(label) => onRename(group.prefix, label)}
      />
      {group.directTokens.map(renderRow)}
      {group.subgroups.map((sub) => (
        <SubGroupView key={sub.prefix} parent={group.key} sub={sub} renderRow={renderRow} onRename={onRename} />
      ))}
    </div>
  );
}

function SubGroupView({
  parent,
  sub,
  renderRow,
  onRename,
}: {
  parent: string;
  sub: SubGroup;
  renderRow: (t: Token) => React.ReactNode;
  onRename: (oldPrefix: string, newPrefix: string) => void;
}) {
  return (
    <div className="subgroup">
      <GroupHeader
        label={sub.key}
        level="sub"
        onCommit={(label) => onRename(sub.prefix, `${parent}-${label}`)}
      />
      {sub.tokens.map((t) => (
        <div key={t.id} className="sub-row" title={leafLabel(t.name, sub.prefix)}>
          {renderRow(t)}
        </div>
      ))}
    </div>
  );
}

/** Click-to-edit group label. Committing renames the whole group's tokens. */
function GroupHeader({
  label,
  level,
  onCommit,
}: {
  label: string;
  level: "top" | "sub";
  onCommit: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== label) onCommit(v);
    else setValue(label);
  };

  return (
    <div className={`group-header ${level}`}>
      {editing ? (
        <input
          autoFocus
          className="text-input group-edit"
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="group-label"
          title="Click to rename this whole group"
          onClick={() => {
            setValue(label);
            setEditing(true);
          }}
        >
          {label}
          <span className="rename-hint">rename</span>
        </button>
      )}
    </div>
  );
}

function IssueDot({ sev }: { sev: LintSeverity }) {
  return <span className={`issue-dot ${sev}`} title={`${sev} — see Checks`} />;
}
