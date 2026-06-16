import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, rgbToOklab } from "../lib/color";
import { tierMap, TIER_LABEL, type Tier } from "../lib/tiers";
import type { Token } from "../types";

const NODE_W = 188;
const COL_GAP = 110;
const ROW_GAP = 12;
const HEAD_H = 30;
const SW = 13; // swatch size
const SW_PER_ROW = 10;
const PAD_TOP = 44;
const PAD = 14;

const TIER_ORDER: Tier[] = ["primitive", "semantic", "component"];

// Two-segment prefixes that read better than their first segment alone.
const COMPOUND = new Set(["side-nav", "hover-card", "action-link"]);

/** The group a token belongs to within its tier (component, ramp family, concept). */
function groupKeyOf(name: string): string {
  const segs = name.split("-");
  if (segs.length > 1 && COMPOUND.has(`${segs[0]}-${segs[1]}`)) return `${segs[0]}-${segs[1]}`;
  return segs[0] || name;
}

interface GroupNode {
  key: string; // `${tier}:${group}`
  tier: Tier;
  label: string;
  tokens: Token[];
  swatches: string[];
  col: number;
  x: number;
  y: number;
  h: number;
  incoming: number;
  outgoing: number;
  hasDangling: boolean;
}

interface GroupEdge {
  from: string; // consumer group key
  to: string; // dependency group key
  weight: number;
}

export function DependencyGraph() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const [onlyLinked, setOnlyLinked] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, edges, width, height, groupCount, danglingGroups } = useMemo(
    () => layout(tokens, byName, onlyLinked),
    [tokens, byName, onlyLinked],
  );

  const nodeByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);

  const active = useMemo(() => {
    if (!hover) return null;
    // Trace the full lineage: everything the hovered group depends on
    // (transitively) plus everything that transitively depends on it — not just
    // immediate neighbours, so "trace it" actually traces the chain.
    const set = new Set<string>([hover]);
    const walk = (dir: "dep" | "con") => {
      const stack = [hover];
      while (stack.length) {
        const n = stack.pop()!;
        for (const e of edges) {
          if (dir === "dep" && e.from === n && !set.has(e.to)) { set.add(e.to); stack.push(e.to); }
          if (dir === "con" && e.to === n && !set.has(e.from)) { set.add(e.from); stack.push(e.from); }
        }
      }
    };
    walk("dep");
    walk("con");
    return set;
  }, [hover, edges]);

  if (tokens.length === 0) return <div className="empty">No tokens to graph.</div>;

  return (
    <div>
      <div className="section-title">
        Dependency graph
        <span className="count">({groupCount} groups · {edges.length} links)</span>
        <div className="spacer" />
        {danglingGroups > 0 && (
          <span className="pill" style={{ borderColor: "rgba(255,107,107,.4)", color: "var(--danger)" }}>
            {danglingGroups} with broken refs
          </span>
        )}
        <label className="toggle">
          <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
          Only linked
        </label>
      </div>
      <p className="hint">
        Tokens are grouped (components by component, primitives by ramp, semantics by concept). Arrows flow
        <b> left → right</b> from a group to the groups that reference it (<b>primitive → semantic → component</b>);
        thicker = more dependencies. Hover a group to trace it; click to open its tokens.
      </p>

      <div className="graph-scroll">
        <svg width={width} height={height} className="graph-svg">
          <defs>
            <marker id="ts-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--plot-line)" />
            </marker>
            <marker id="ts-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {TIER_ORDER.filter((t) => nodes.some((n) => n.tier === t)).map((t) => {
            const col = nodes.find((n) => n.tier === t)!.col;
            return (
              <text key={t} x={PAD + col * (NODE_W + COL_GAP) + NODE_W / 2} y={24} textAnchor="middle" className="graph-col-label">
                {TIER_LABEL[t]}
              </text>
            );
          })}

          {edges.map((e, i) => {
            const dep = nodeByKey.get(e.to); // dependency (referenced)
            const con = nodeByKey.get(e.from); // consumer (references it)
            if (!dep || !con) return null;
            const s = { x: dep.x + NODE_W, y: dep.y + dep.h / 2 };
            const t = { x: con.x, y: con.y + con.h / 2 };
            const dim = active != null && !(active.has(e.from) && active.has(e.to));
            const on = active != null && !dim;
            const cx = COL_GAP * 0.5;
            return (
              <path
                key={i}
                d={`M ${s.x} ${s.y} C ${s.x + cx} ${s.y} ${t.x - cx} ${t.y} ${t.x} ${t.y}`}
                fill="none"
                stroke={dim ? "var(--plot-line-dim)" : on ? "var(--accent)" : "var(--plot-line)"}
                strokeWidth={(on ? 0.8 : 0.5) + Math.min(3.5, Math.sqrt(e.weight))}
                opacity={dim ? 0.5 : 1}
                markerEnd={dim ? undefined : on ? "url(#ts-arrow-on)" : "url(#ts-arrow)"}
              />
            );
          })}

          {nodes.map((n) => {
            const dim = active != null && !active.has(n.key);
            const extra = n.tokens.length - n.swatches.length;
            return (
              <g
                key={n.key}
                transform={`translate(${n.x} ${n.y})`}
                opacity={dim ? 0.28 : 1}
                className="graph-node"
                onMouseEnter={() => setHover(n.key)}
                onMouseLeave={() => setHover((h) => (h === n.key ? null : h))}
                onClick={() => navigate(n.swatches.length ? "palette" : "tokens", n.tokens[0]?.name)}
              >
                <title>{`${n.label} — ${n.tokens.length} token${n.tokens.length === 1 ? "" : "s"}${n.hasDangling ? "\n⚠ has a broken reference" : ""}\n${n.tokens.slice(0, 24).map((t) => "--" + t.name).join("\n")}${n.tokens.length > 24 ? "\n…" : ""}`}</title>
                <rect width={NODE_W} height={n.h} rx={9} className={`graph-rect ${n.hasDangling ? "dangling" : ""} ${n.tier === "primitive" && n.incoming === 0 ? "unused" : ""}`} />
                <text x={11} y={19} className="graph-text" style={{ fontWeight: 600 }}>
                  {clip(n.label, 18)}
                </text>
                <text x={NODE_W - 11} y={19} textAnchor="end" className="graph-text" fill="var(--text-faint)">
                  {n.tokens.length}
                </text>
                {n.swatches.map((c, i) => (
                  <rect
                    key={i}
                    x={11 + (i % SW_PER_ROW) * (SW + 2)}
                    y={HEAD_H + Math.floor(i / SW_PER_ROW) * (SW + 2)}
                    width={SW}
                    height={SW}
                    rx={3}
                    fill={c}
                    stroke="var(--hairline)"
                  />
                ))}
                {extra > 0 && n.swatches.length > 0 && (
                  <text x={11 + (n.swatches.length % SW_PER_ROW) * (SW + 2) + 2} y={HEAD_H + Math.floor(n.swatches.length / SW_PER_ROW) * (SW + 2) + 11} className="graph-text" fill="var(--text-faint)" style={{ fontSize: 10 }}>
                    +{extra}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const MAX_SWATCHES = 30;

function layout(tokens: Token[], byName: Map<string, Token>, onlyLinked: boolean) {
  const tiers = tierMap(tokens);
  const keyOf = (name: string) => {
    const t = tiers.get(name);
    return t ? `${t}:${groupKeyOf(name)}` : null;
  };

  // Build groups.
  const groups = new Map<string, GroupNode>();
  const tokenColor = new Map<string, { css: string; L: number }>();
  for (const t of tokens) {
    const tier = tiers.get(t.name);
    if (!tier) continue;
    const key = `${tier}:${groupKeyOf(t.name)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, tier, label: groupKeyOf(t.name), tokens: [], swatches: [], col: 0, x: 0, y: 0, h: 0, incoming: 0, outgoing: 0, hasDangling: false };
      groups.set(key, g);
    }
    g.tokens.push(t);
    if (t.category === "color") {
      const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
      if (rgb) tokenColor.set(t.name, { css: toCssDisplay(rgb), L: rgbToOklab(rgb).L });
    }
    if (t.value.kind === "ref" && !byName.has(t.value.ref)) g.hasDangling = true;
  }

  // Aggregate group→group edges.
  const edgeMap = new Map<string, GroupEdge>();
  for (const t of tokens) {
    if (t.value.kind !== "ref") continue;
    const from = keyOf(t.name);
    const dep = byName.get(t.value.ref);
    const to = dep ? keyOf(dep.name) : null;
    if (!from || !to || from === to) continue;
    const k = `${from}>${to}`;
    const e = edgeMap.get(k);
    if (e) e.weight++;
    else edgeMap.set(k, { from, to, weight: 1 });
  }
  let edges = [...edgeMap.values()];

  // Degree counts.
  for (const e of edges) {
    const c = groups.get(e.from);
    const d = groups.get(e.to);
    if (c) c.outgoing += e.weight;
    if (d) d.incoming += e.weight;
  }

  // Filter to linked groups if requested.
  let nodes = [...groups.values()];
  if (onlyLinked) {
    const linked = new Set<string>();
    for (const e of edges) { linked.add(e.from); linked.add(e.to); }
    nodes = nodes.filter((n) => linked.has(n.key));
    edges = edges.filter((e) => linked.has(e.from) && linked.has(e.to));
  }

  // Swatches per group (color tokens, light→dark), capped.
  for (const n of nodes) {
    const cols = n.tokens
      .map((t) => tokenColor.get(t.name))
      .filter((x): x is { css: string; L: number } => !!x)
      .sort((a, b) => b.L - a.L)
      .slice(0, MAX_SWATCHES)
      .map((x) => x.css);
    n.swatches = cols;
    const swRows = cols.length ? Math.ceil(cols.length / SW_PER_ROW) : 0;
    n.h = HEAD_H + (swRows ? swRows * (SW + 2) + 6 : 8);
  }

  // Columns by tier (only present tiers).
  const present = TIER_ORDER.filter((t) => nodes.some((n) => n.tier === t));
  const colOf = new Map(present.map((t, i) => [t, i]));

  // Stack each column; bigger groups first so the eye lands on hubs.
  const cursorY = new Map<Tier, number>();
  for (const t of present) cursorY.set(t, PAD_TOP);
  const order = [...nodes].sort((a, b) => b.tokens.length - a.tokens.length || a.label.localeCompare(b.label));
  for (const n of order) {
    n.col = colOf.get(n.tier)!;
    n.x = PAD + n.col * (NODE_W + COL_GAP);
    n.y = cursorY.get(n.tier)!;
    cursorY.set(n.tier, n.y + n.h + ROW_GAP);
  }

  const maxY = Math.max(PAD_TOP, ...present.map((t) => cursorY.get(t) ?? 0));
  const width = PAD * 2 + present.length * NODE_W + Math.max(0, present.length - 1) * COL_GAP;
  const height = maxY + PAD;
  const danglingGroups = nodes.filter((n) => n.hasDangling).length;

  return { nodes, edges, width, height, groupCount: nodes.length, danglingGroups };
}
