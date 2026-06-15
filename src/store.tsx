import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { Token } from "./types";
import { parseValue, indexByName, resolve } from "./lib/value";
import { tokensFromCss, classifyAll } from "./lib/parseCss";
import { cssFromHash } from "./lib/permalink";

type Action =
  | { type: "load"; css: string }
  | { type: "merge"; css: string }
  | { type: "clear" }
  | { type: "rename"; id: string; name: string }
  | { type: "renameGroup"; oldPrefix: string; newPrefix: string }
  | { type: "setValue"; id: string; raw: string }
  | { type: "relink"; id: string; ref: string | null } // null = unlink (keep resolved literal)
  | { type: "add"; name: string; raw: string }
  | { type: "remove"; id: string }
  | { type: "undo" }
  | { type: "redo" };

let idc = 0;
const newId = () => `u${Date.now().toString(36)}${(idc++).toString(36)}`;

/**
 * Apply a mutating action to a token list. Returns the SAME array reference for
 * no-ops so the history layer can skip them.
 */
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
        if (existing) byName.set(t.name, { ...existing, value: t.value });
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
        let n = t;
        if (t.id === action.id) n = { ...n, name: newName };
        if (n.value.kind === "ref" && n.value.ref === oldName) {
          n = { ...n, value: { ...n.value, ref: newName } };
        }
        return n;
      });
      return classifyAll(next);
    }

    case "renameGroup": {
      const oldP = action.oldPrefix;
      const newP = action.newPrefix.trim().replace(/^--/, "").replace(/-+$/, "");
      if (!newP || newP === oldP) return tokens;
      const remap = (name: string) => {
        if (name === oldP) return newP;
        if (name.startsWith(oldP + "-")) return newP + name.slice(oldP.length);
        return name;
      };
      const next = tokens.map((t) => {
        let n: Token = { ...t, name: remap(t.name) };
        if (n.value.kind === "ref") n = { ...n, value: { ...n.value, ref: remap(n.value.ref) } };
        return n;
      });
      return classifyAll(next);
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

    case "remove":
      return classifyAll(tokens.filter((t) => t.id !== action.id));

    default:
      return tokens;
  }
}

interface HState {
  past: Token[][];
  present: Token[];
  future: Token[][];
}

const HISTORY_LIMIT = 100;

function reducer(state: HState, action: Action): HState {
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    const prev = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
  }
  if (action.type === "redo") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
  }
  const next = mutate(state.present, action);
  if (next === state.present) return state; // no-op, don't record history
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

interface Store {
  tokens: Token[];
  byName: Map<string, Token>;
  dispatch: React.Dispatch<Action>;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initialCss }: { children: ReactNode; initialCss?: string }) {
  // Seed order: explicit prop (tests) → shared URL hash → empty.
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const seed = initialCss ?? cssFromHash() ?? undefined;
    return { past: [], present: seed ? tokensFromCss(seed) : [], future: [] };
  });
  const value = useMemo<Store>(
    () => ({
      tokens: state.present,
      byName: indexByName(state.present),
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
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
