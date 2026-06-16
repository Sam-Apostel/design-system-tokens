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
import { DuplicateGroupModal } from "./DuplicateGroupModal";

interface Props {
  category?: TokenCategory;
  title: string;
  /** When provided, the "+ Add" button calls this instead of adding a raw token. */
  onAdd?: () => void;
  addLabel?: string;
}

export function TokenList({ category, title, onAdd, addLabel }: Props) {
  const { tokens, dispatch } = useStore();
  const { focus, clearFocus } = useNav();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [dupGroup, setDupGroup] = useState<{ prefix: string; tokens: Token[] } | null>(null);

  const deleteGroup = (prefix: string, count: number) => {
    if (confirm(`Delete all ${count} token${count === 1 ? "" : "s"} under --${prefix}-*? Aliases pointing here will break.`)) {
      dispatch({ type: "removeGroup", prefix });
    }
  };

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

  // After adding a token, reveal it: open its editor and scroll to it.
  useEffect(() => {
    if (!pendingName) return;
    const target = tokens.find((t) => t.name === pendingName);
    if (!target) return;
    setEditing(target.id);
    const el = rowRefs.current.get(target.id);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setPendingName(null);
  }, [pendingName, tokens]);

  const addToken = () => {
    if (onAdd) {
      onAdd();
      return;
    }
    // Unique name so repeated adds never silently no-op.
    const existing = new Set(tokens.map((t) => t.name));
    const base = `${category ?? "token"}-new`;
    let name = base;
    for (let i = 2; existing.has(name); i++) name = `${base}-${i}`;
    const seed =
      category === "color" ? "#888888" : category === "spacing" ? "8px" : category === "typography" ? "16px" : "";
    setQuery(""); // ensure the new token isn't hidden by an active filter
    dispatch({ type: "add", name, raw: seed });
    setPendingName(name);
  };

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
        <button className="btn small" onClick={addToken}>
          {addLabel ?? "+ Add"}
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
          onDuplicate={(prefix, groupTokens) => setDupGroup({ prefix, tokens: groupTokens })}
          onDelete={deleteGroup}
        />
      ))}

      {dupGroup && (
        <DuplicateGroupModal prefix={dupGroup.prefix} tokens={dupGroup.tokens} onClose={() => setDupGroup(null)} />
      )}
    </div>
  );
}

interface GroupActions {
  onDuplicate: (prefix: string, tokens: Token[]) => void;
  onDelete: (prefix: string, count: number) => void;
}

function TopGroupView({
  group,
  renderRow,
  onRename,
  onDuplicate,
  onDelete,
}: {
  group: TopGroup;
  renderRow: (t: Token) => React.ReactNode;
  onRename: (oldPrefix: string, newPrefix: string) => void;
} & GroupActions) {
  const allTokens = [...group.directTokens, ...group.subgroups.flatMap((s) => s.tokens)];
  return (
    <div className="token-group">
      <GroupHeader
        label={group.key}
        level="top"
        onCommit={(label) => onRename(group.prefix, label)}
        onDuplicate={() => onDuplicate(group.prefix, allTokens)}
        onDelete={() => onDelete(group.prefix, allTokens.length)}
      />
      {group.directTokens.map(renderRow)}
      {group.subgroups.map((sub) => (
        <SubGroupView key={sub.prefix} parent={group.key} sub={sub} renderRow={renderRow} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
      ))}
    </div>
  );
}

function SubGroupView({
  parent,
  sub,
  renderRow,
  onRename,
  onDuplicate,
  onDelete,
}: {
  parent: string;
  sub: SubGroup;
  renderRow: (t: Token) => React.ReactNode;
  onRename: (oldPrefix: string, newPrefix: string) => void;
} & GroupActions) {
  return (
    <div className="subgroup">
      <GroupHeader
        label={sub.key}
        level="sub"
        onCommit={(label) => onRename(sub.prefix, `${parent}-${label}`)}
        onDuplicate={() => onDuplicate(sub.prefix, sub.tokens)}
        onDelete={() => onDelete(sub.prefix, sub.tokens.length)}
      />
      {sub.tokens.map((t) => (
        <div key={t.id} className="sub-row" title={leafLabel(t.name, sub.prefix)}>
          {renderRow(t)}
        </div>
      ))}
    </div>
  );
}

/** Click-to-edit group label + a menu for whole-group actions. */
function GroupHeader({
  label,
  level,
  onCommit,
  onDuplicate,
  onDelete,
}: {
  label: string;
  level: "top" | "sub";
  onCommit: (label: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const [menu, setMenu] = useState(false);

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
        <>
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
          <div className="group-menu">
            <button
              className="group-kebab"
              aria-label={`Actions for ${label}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((o) => !o)}
            >
              ⋯
            </button>
            {menu && (
              <>
                <div className="tb-menu-backdrop" onClick={() => setMenu(false)} />
                <div className="tb-menu-panel" role="menu" style={{ left: 0, right: "auto" }}>
                  <button className="tb-item" onClick={() => { onDuplicate(); setMenu(false); }}>Duplicate…</button>
                  <button className="tb-item danger" onClick={() => { onDelete(); setMenu(false); }}>Delete group</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IssueDot({ sev }: { sev: LintSeverity }) {
  return <span className={`issue-dot ${sev}`} title={`${sev} — see Checks`} />;
}
