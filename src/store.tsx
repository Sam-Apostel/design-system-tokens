import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Token, TokenValue } from "./types";
import { parseValue, indexByName, resolve } from "./lib/value";
import { shiftColor } from "./lib/color";
import { tokensFromCss, classifyAll } from "./lib/parseCss";
import { cssFromHash } from "./lib/permalink";
import { expandLightDark } from "./lib/lightdark";

type Action =
  | { type: "load"; css: string }
  | { type: "merge"; css: string }
  | { type: "clear" }
  | { type: "rename"; id: string; name: string }
  | { type: "renameGroup"; oldPrefix: string; newPrefix: string }
  | { type: "removeGroup"; prefix: string }
  | { type: "duplicateGroup"; prefix: string; newPrefix: string; hueShift?: number; lightShift?: number }
  | { type: "setValue"; id: string; raw: string }
  | { type: "relink"; id: string; ref: string | null }
  | { type: "add"; name: string; raw: string }
  | { type: "addMany"; items: { name: string; raw: string }[] }
  | { type: "remove"; id: string }
  | { type: "setMode"; name: string }
  | { type: "addMode" }
  | { type: "removeMode"; name: string }
  | { type: "undo" }
  | { type: "redo" };

let idc = 0;
const newId = () => `u${Date.now().toString(36)}${(idc++).toString(36)}`;

/* --------------------------- mode helpers --------------------------- */

const mapRef = (v: TokenValue, fn: (n: string) => string): TokenValue =>
  v.kind === "ref" ? { ...v, ref: fn(v.ref) } : v;

/** Remap alias targets across a token's value AND every per-mode value. */
function remapTokenRefs(t: Token, fn: (n: string) => string): Token {
  const modes = t.modes
    ? Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, mapRef(v, fn)]))
    : t.modes;
  return { ...t, value: mapRef(t.value, fn), modes };
}

/** Keep per-mode maps consistent with the mode list & active value. */
function syncModes(tokens: Token[], modeList: string[], active: string): Token[] {
  if (modeList.length <= 1) {
    return tokens.map((t) => (t.modes ? { ...t, modes: undefined } : t));
  }
  return tokens.map((t) => {
    const modes: Record<string, TokenValue> = { ...(t.modes ?? {}) };
    for (const m of modeList) {
      if (m === active) modes[m] = t.value;
      else if (!(m in modes)) modes[m] = t.value;
    }
    for (const k of Object.keys(modes)) if (!modeList.includes(k)) delete modes[k];
    return { ...t, modes };
  });
}

/** Point each token's active value at the given mode. */
function remapToMode(tokens: Token[], mode: string): Token[] {
  return tokens.map((t) => (t.modes && t.modes[mode] !== undefined ? { ...t, value: t.modes[mode] } : t));
}

const NAME_POOL = ["light", "dark", "hc", "print", "brand"];
function nextModeName(list: string[]): string {
  return NAME_POOL.find((n) => !list.includes(n)) ?? `mode-${list.length + 1}`;
}

/* --------------------------- token mutations --------------------------- */

function mutate(tokens: Token[], action: Action): Token[] {
  switch (action.type) {
    case "load":
      return tokensFromCss(action.css);

    case "merge": {
      const incoming = tokensFromCss(action.css, tokens.length);
      const byName = new Map(tokens.map((t) => [t.name, t]));
      let order = tokens.length;
      for (const t of incoming) {
        const existing = byName.get(t.name);
        if (existing) byName.set(t.name, { ...existing, value: t.value, modes: undefined });
        else byName.set(t.name, { ...t, order: order++ });
      }
      return classifyAll([...byName.values()]);
    }

    case "clear":
      return tokens.length === 0 ? tokens : [];

    case "rename": {
      const target = tokens.find((t) => t.id === action.id);
      if (!target) return tokens;
      const newName = action.name.trim().replace(/^--/, "");
      if (!newName || newName === target.name) return tokens;
      const oldName = target.name;
      const next = tokens.map((t) => {
        const renamed = t.id === action.id ? { ...t, name: newName } : t;
        return remapTokenRefs(renamed, (n) => (n === oldName ? newName : n));
      });
      return classifyAll(next);
    }

    case "renameGroup": {
      const oldP = action.oldPrefix;
      const newP = action.newPrefix.trim().replace(/^--/, "").replace(/-+$/, "");
      if (!newP || newP === oldP) return tokens;
      const remap = (name: string) =>
        name === oldP ? newP : name.startsWith(oldP + "-") ? newP + name.slice(oldP.length) : name;
      const next = tokens.map((t) => remapTokenRefs({ ...t, name: remap(t.name) }, remap));
      return classifyAll(next);
    }

    case "removeGroup": {
      const p = action.prefix;
      const inGroup = (n: string) => n === p || n.startsWith(p + "-");
      const next = tokens.filter((t) => !inGroup(t.name));
      return next.length === tokens.length ? tokens : classifyAll(next);
    }

    case "duplicateGroup": {
      const p = action.prefix;
      const np = action.newPrefix.trim().replace(/^--/, "").replace(/-+$/, "");
      if (!np || np === p) return tokens;
      const inGroup = (n: string) => n === p || n.startsWith(p + "-");
      const remap = (n: string) => (n === p ? np : np + n.slice(p.length));
      const dH = action.hueShift ?? 0;
      const dL = action.lightShift ?? 0;
      const shiftVal = (v: TokenValue): TokenValue => {
        if (v.kind === "ref") return inGroup(v.ref) ? { ...v, ref: remap(v.ref) } : v;
        if (!dH && !dL) return v;
        const shifted = shiftColor(v.raw, dH, dL);
        return shifted ? { kind: "raw", raw: shifted } : v;
      };
      const existing = new Set(tokens.map((t) => t.name));
      let order = tokens.length;
      const clones: Token[] = [];
      for (const t of tokens) {
        if (!inGroup(t.name)) continue;
        const name = remap(t.name);
        if (existing.has(name)) continue;
        existing.add(name);
        const modes = t.modes
          ? Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, shiftVal(v)]))
          : t.modes;
        clones.push({
          id: newId(),
          name,
          value: shiftVal(t.value),
          modes,
          category: "other",
          order: order++,
        });
      }
      return clones.length ? classifyAll([...tokens, ...clones]) : tokens;
    }

    case "setValue":
      return classifyAll(
        tokens.map((t) => (t.id === action.id ? { ...t, value: parseValue(action.raw) } : t)),
      );

    case "relink": {
      const next = tokens.map((t) => {
        if (t.id !== action.id) return t;
        if (action.ref === null) {
          const r = resolve(t, indexByName(tokens));
          return { ...t, value: { kind: "raw" as const, raw: r.finalRaw ?? "" } };
        }
        const fallback = t.value.kind === "ref" ? t.value.fallback : undefined;
        return { ...t, value: { kind: "ref" as const, ref: action.ref, fallback } };
      });
      return classifyAll(next);
    }

    case "add": {
      const name = action.name.trim().replace(/^--/, "");
      if (!name || tokens.some((t) => t.name === name)) return tokens;
      const token: Token = {
        id: newId(),
        name,
        value: parseValue(action.raw || "#000000"),
        category: "other",
        order: tokens.length,
      };
      return classifyAll([...tokens, token]);
    }

    case "addMany": {
      const existing = new Set(tokens.map((t) => t.name));
      let order = tokens.length;
      const additions: Token[] = [];
      for (const it of action.items) {
        const name = it.name.trim().replace(/^--/, "");
        if (!name || existing.has(name)) continue;
        existing.add(name);
        additions.push({
          id: newId(),
          name,
          value: parseValue(it.raw || "#000000"),
          category: "other",
          order: order++,
        });
      }
      if (!additions.length) return tokens;
      return classifyAll([...tokens, ...additions]);
    }

    case "remove":
      return classifyAll(tokens.filter((t) => t.id !== action.id));

    default:
      return tokens;
  }
}

/* --------------------------- history reducer --------------------------- */

interface Snap {
  tokens: Token[];
  modeList: string[];
  activeMode: string;
}
interface HState {
  past: Snap[];
  present: Snap;
  future: Snap[];
}
const LIMIT = 100;
const record = (s: HState, present: Snap): HState => ({
  past: [...s.past, s.present].slice(-LIMIT),
  present,
  future: [],
});

function addModeSnap(p: Snap): Snap {
  let { tokens, modeList } = p;
  let newList: string[];
  let active: string;
  if (modeList.length <= 1) {
    // First extra mode: relabel the single mode "light" and add "dark".
    newList = ["light", "dark"];
    active = "light";
    tokens = tokens.map((t) => ({ ...t, modes: { light: t.value, dark: t.value } }));
  } else {
    const name = nextModeName(modeList);
    newList = [...modeList, name];
    active = p.activeMode;
    tokens = tokens.map((t) => ({
      ...t,
      modes: { ...(t.modes ?? {}), [name]: t.modes?.[p.activeMode] ?? t.value },
    }));
  }
  tokens = remapToMode(syncModes(tokens, newList, active), active);
  return { tokens: classifyAll(tokens), modeList: newList, activeMode: active };
}

function removeModeSnap(p: Snap, name: string): Snap {
  if (p.modeList.length <= 1) return p;
  const newList = p.modeList.filter((m) => m !== name);
  const active = p.activeMode === name ? newList[0] : p.activeMode;
  let tokens = p.tokens.map((t) => {
    if (!t.modes) return t;
    const modes = { ...t.modes };
    delete modes[name];
    return { ...t, modes };
  });
  if (newList.length <= 1) {
    tokens = tokens.map((t) => ({
      ...t,
      value: t.modes?.[newList[0]] ?? t.value,
      modes: undefined,
    }));
  } else {
    tokens = remapToMode(syncModes(tokens, newList, active), active);
  }
  return { tokens: classifyAll(tokens), modeList: newList, activeMode: active };
}

function mergeSnap(p: Snap, css: string): Snap {
  const inc = expandLightDark(tokensFromCss(css, p.tokens.length));
  const multi = p.modeList.length > 1 || inc.modeList.length > 1;
  const modeList = multi ? ["light", "dark"] : ["base"];
  const active = multi ? (modeList.includes(p.activeMode) ? p.activeMode : "light") : "base";
  const ensure = (toks: Token[]) =>
    multi
      ? toks.map((t) => (t.modes && t.modes.light !== undefined ? t : { ...t, modes: { light: t.value, dark: t.value } }))
      : toks.map((t) => (t.modes ? { ...t, modes: undefined } : t));

  const byName = new Map(ensure(p.tokens).map((t) => [t.name, t]));
  let order = byName.size;
  for (const t of ensure(inc.tokens)) {
    const ex = byName.get(t.name);
    if (ex) byName.set(t.name, { ...ex, value: t.value, modes: t.modes });
    else byName.set(t.name, { ...t, order: order++ });
  }
  let tokens = classifyAll([...byName.values()]);
  tokens = syncModes(remapToMode(tokens, active), modeList, active);
  return { tokens, modeList, activeMode: active };
}

function reducer(state: HState, action: Action): HState {
  switch (action.type) {
    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }
    case "setMode": {
      if (!state.present.modeList.includes(action.name)) return state;
      const tokens = classifyAll(remapToMode(state.present.tokens, action.name));
      return { ...state, present: { ...state.present, tokens, activeMode: action.name } };
    }
    case "addMode":
      return record(state, addModeSnap(state.present));
    case "removeMode":
      return record(state, removeModeSnap(state.present, action.name));
    case "load":
      // Expand light-dark() values into light/dark modes when present.
      return record(state, expandLightDark(tokensFromCss(action.css)));
    case "merge":
      return record(state, mergeSnap(state.present, action.css));
    default: {
      const tokens = mutate(state.present.tokens, action);
      if (tokens === state.present.tokens) return state; // no-op
      let { modeList, activeMode } = state.present;
      if (action.type === "clear") {
        modeList = ["base"];
        activeMode = "base";
      }
      return record(state, { tokens: syncModes(tokens, modeList, activeMode), modeList, activeMode });
    }
  }
}

/* --------------------------- persistence --------------------------- */
// Work is auto-saved to localStorage so a reload doesn't lose it. This stays
// fully client-side — nothing leaves the browser. A shared #t= link still wins
// over local state so opening someone's link shows their tokens, not yours.

const STORAGE_KEY = "token-studio:v1";

function loadPersisted(): Snap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snap;
    if (!snap || !Array.isArray(snap.tokens) || !Array.isArray(snap.modeList)) return null;
    return snap;
  } catch {
    return null;
  }
}

function persist(snap: Snap): void {
  try {
    if (snap.tokens.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* private mode / quota — persistence is best-effort */
  }
}

/* --------------------------- context --------------------------- */

interface Store {
  tokens: Token[];
  byName: Map<string, Token>;
  dispatch: React.Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
  modeList: string[];
  activeMode: string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initialCss }: { children: ReactNode; initialCss?: string }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    // Priority: explicit prop > shared link (#t=) > auto-saved local work > empty.
    const seed = initialCss ?? cssFromHash() ?? undefined;
    const present = seed
      ? expandLightDark(tokensFromCss(seed))
      : loadPersisted() ?? { tokens: [], modeList: ["base"], activeMode: "base" };
    return { past: [], present, future: [] };
  });

  // Auto-save the present snapshot whenever it changes.
  useEffect(() => {
    persist(state.present);
  }, [state.present]);

  const value = useMemo<Store>(
    () => ({
      tokens: state.present.tokens,
      byName: indexByName(state.present.tokens),
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      modeList: state.present.modeList,
      activeMode: state.present.activeMode,
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
