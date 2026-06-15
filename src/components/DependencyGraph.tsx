import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { tierOf, TIER_LABEL, type Tier } from "../lib/tiers";
import type { Token } from "../types";

const NODE_W = 196;
const ROW_H = 34;
const COL_GAP = 96;
const PAD_TOP = 44;
const PAD = 12;

const TIER_ORDER: Tier[] = ["primitive", "semantic", "component"];

interface Node {
  token: Token;
  tier: Tier;
  col: number;
  row: number;
  x: number;
  y: number;
  swatch: string | null;
  incoming: number;
  dangling: boolean;
}

interface Edge {
  from: string;
  to: string;
}

export function DependencyGraph() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const [onlyLinked, setOnlyLinked] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, edges, width, height, unused, dangling } = useMemo(
    () => layout(tokens, byName, onlyLinked),
    [tokens, byName, onlyLinked],
  );

  const nodeByName = useMemo(() => new Map(nodes.map((n) => [n.token.name, n])), [nodes]);

  // Which names are connected to the hovered node (incl. itself).
  const active = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const e of edges) {
      if (e.from === hover) set.add(e.to);
      if (e.to === hover) set.add(e.from);
    }
    return set;
  }, [hover, edges]);

  if (tokens.length === 0) return <div className="empty">No tokens to graph.</div>;

  const center = (n: Node) => ({ x: n.x, y: n.y + ROW_H / 2 });

  return (
    <div>
      <div className="section-title">
        Dependency graph
        <span className="count">({edges.length} links)</span>
        <div className="spacer" />
        {unused > 0 && <span className="pill warn-pill">{unused} unused primitive{unused === 1 ? "" : "s"}</span>}
        {dangling > 0 && <span className="pill" style={{ borderColor: "rgba(255,107,107,.4)", color: "var(--danger)" }}>{dangling} dangling</span>}
        <label className="toggle">
          <input type="checkbox" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
          Only linked
        </label>
      </div>
      <p className="hint">
        Each token sits in its tier; arrows point from an alias to the token it references
        (<b>component → semantic → primitive</b>). Hover to trace a token's links. Amber = a primitive
        nothing references; red = an alias whose target is missing.
      </p>

      <div className="graph-scroll">
        <svg width={width} height={height} className="graph-svg">
          {TIER_ORDER.filter((t) => nodes.some((n) => n.tier === t)).map((t) => {
            const col = nodes.find((n) => n.tier === t)!.col;
            return (
              <text key={t} x={PAD + col * (NODE_W + COL_GAP) + NODE_W / 2} y={24} textAnchor="middle" className="graph-col-label">
                {TIER_LABEL[t]}
              </text>
            );
          })}

          {edges.map((e, i) => {
            const a = nodeByName.get(e.from);
            const b = nodeByName.get(e.to);
            if (!a || !b) return null;
            const s = { x: a.x + NODE_W, y: a.y + ROW_H / 2 };
            const t = center(b);
            const dim = active != null && !(active.has(e.from) && active.has(e.to));
            const cx = COL_GAP * 0.5;
            return (
              <path
                key={i}
                d={`M ${s.x} ${s.y} C ${s.x + cx} ${s.y} ${t.x - cx} ${t.y} ${t.x} ${t.y}`}
                fill="none"
                stroke={dim ? "var(--plot-line-dim)" : active ? "var(--accent)" : "var(--plot-line)"}
                strokeWidth={1.4}
              />
            );
          })}

          {nodes.map((n) => {
            const dim = active != null && !active.has(n.token.name);
            return (
              <g
                key={n.token.id}
                transform={`translate(${n.x} ${n.y})`}
                opacity={dim ? 0.25 : 1}
                className="graph-node"
                onMouseEnter={() => setHover(n.token.name)}
                onMouseLeave={() => setHover((h) => (h === n.token.name ? null : h))}
                onClick={() => navigate(n.swatch ? "palette" : "tokens", n.token.name)}
              >
                <rect
                  width={NODE_W}
                  height={ROW_H}
                  rx={7}
                  className={`graph-rect ${n.dangling ? "dangling" : ""} ${n.tier === "primitive" && n.incoming === 0 ? "unused" : ""}`}
                />
                {n.swatch && <rect x={8} y={ROW_H / 2 - 7} width={14} height={14} rx={3} fill={n.swatch} stroke="var(--hairline)" />}
                <text x={n.swatch ? 28 : 10} y={ROW_H / 2 + 4} className="graph-text">
                  {clip(n.token.name, n.swatch ? 20 : 23)}
                </text>
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

function layout(tokens: Token[], byName: Map<string, Token>, onlyLinked: boolean) {
  const edgesAll: Edge[] = [];
  for (const t of tokens) {
    if (t.value.kind === "ref") edgesAll.push({ from: t.name, to: t.value.ref });
  }
  const linked = new Set<string>();
  for (const e of edgesAll) {
    linked.add(e.from);
    if (byName.has(e.to)) linked.add(e.to);
  }

  const visible = tokens.filter((t) => (onlyLinked ? linked.has(t.name) : true));
  const incoming = new Map<string, number>();
  for (const e of edgesAll) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);

  // Assign columns by tier; keep only tiers that have visible nodes.
  const present = TIER_ORDER.filter((t) => visible.some((v) => tierOf(v) === t));
  const colOf = new Map(present.map((t, i) => [t, i]));

  const rows = new Map<Tier, number>();
  const nodes: Node[] = [];
  let unused = 0;
  let danglingCount = 0;

  for (const t of [...visible].sort((a, b) => a.name.localeCompare(b.name))) {
    const tier = tierOf(t);
    const col = colOf.get(tier)!;
    const row = rows.get(tier) ?? 0;
    rows.set(tier, row + 1);
    const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
    const dangling = t.value.kind === "ref" && !byName.has(t.value.ref);
    if (dangling) danglingCount++;
    const inc = incoming.get(t.name) ?? 0;
    if (tier === "primitive" && inc === 0) unused++;
    nodes.push({
      token: t,
      tier,
      col,
      row,
      x: PAD + col * (NODE_W + COL_GAP),
      y: PAD_TOP + row * ROW_H,
      swatch: rgb ? toCssDisplay(rgb) : null,
      incoming: inc,
      dangling,
    });
  }

  const edges = edgesAll.filter((e) => byName.has(e.to) && nodes.some((n) => n.token.name === e.from) && nodes.some((n) => n.token.name === e.to));
  const maxRows = Math.max(1, ...present.map((t) => rows.get(t) ?? 0));
  const width = PAD * 2 + present.length * NODE_W + Math.max(0, present.length - 1) * COL_GAP;
  const height = PAD_TOP + maxRows * ROW_H + PAD;
  return { nodes, edges, width, height, unused, dangling: danglingCount };
}
