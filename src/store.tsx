import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { Token } from "./types";
import { parseValue, indexByName, resolve } from "./lib/value";
import { tokensFromCss, classifyAll } from "./lib/parseCss";
import { SAMPLE_CSS } from "./lib/sample";

interface State {
  tokens: Token[];
}

type Action =
  | { type: "load"; css: string }
  | { type: "merge"; css: string }
  | { type: "clear" }
  | { type: "rename"; id: string; name: string }
  | { type: "setValue"; id: string; raw: string }
  | { type: "relink"; id: string; ref: string | null } // null = unlink (keep resolved literal)
  | { type: "add"; name: string; raw: string }
  | { type: "remove"; id: string };

let idc = 0;
const newId = () => `u${Date.now().toString(36)}${(idc++).toString(36)}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return { tokens: tokensFromCss(action.css) };

    case "merge": {
      const incoming = tokensFromCss(action.css, state.tokens.length);
      const byName = new Map(state.tokens.map((t) => [t.name, t]));
      let order = state.tokens.length;
      for (const t of incoming) {
        const existing = byName.get(t.name);
        if (existing) byName.set(t.name, { ...existing, value: t.value });
        else byName.set(t.name, { ...t, order: order++ });
      }
      return { tokens: classifyAll([...byName.values()]) };
    }

    case "clear":
      return { tokens: [] };

    case "rename": {
      const target = state.tokens.find((t) => t.id === action.id);
      if (!target) return state;
      const newName = action.name.trim().replace(/^--/, "");
      if (!newName || newName === target.name) return state;
      const oldName = target.name;
      const tokens = state.tokens.map((t) => {
        let next = t;
        if (t.id === action.id) next = { ...next, name: newName };
        // Re-point any aliases that referenced the old name so links survive.
        if (next.value.kind === "ref" && next.value.ref === oldName) {
          next = { ...next, value: { ...next.value, ref: newName } };
        }
        return next;
      });
      return { tokens: classifyAll(tokens) };
    }

    case "setValue": {
      const tokens = state.tokens.map((t) =>
        t.id === action.id ? { ...t, value: parseValue(action.raw) } : t,
      );
      return { tokens: classifyAll(tokens) };
    }

    case "relink": {
      const tokens = state.tokens.map((t) => {
        if (t.id !== action.id) return t;
        if (action.ref === null) {
          // Unlink: bake the currently resolved literal in as a raw value.
          const r = resolve(t, indexByName(state.tokens));
          return { ...t, value: { kind: "raw" as const, raw: r.finalRaw ?? "" } };
        }
        const fallback = t.value.kind === "ref" ? t.value.fallback : undefined;
        return { ...t, value: { kind: "ref" as const, ref: action.ref, fallback } };
      });
      return { tokens: classifyAll(tokens) };
    }

    case "add": {
      const name = action.name.trim().replace(/^--/, "");
      if (!name || state.tokens.some((t) => t.name === name)) return state;
      const token: Token = {
        id: newId(),
        name,
        value: parseValue(action.raw || "#000000"),
        category: "other",
        order: state.tokens.length,
      };
      return { tokens: classifyAll([...state.tokens, token]) };
    }

    case "remove":
      return { tokens: classifyAll(state.tokens.filter((t) => t.id !== action.id)) };

    default:
      return state;
  }
}

interface Store {
  tokens: Token[];
  byName: Map<string, Token>;
  dispatch: React.Dispatch<Action>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    tokens: tokensFromCss(SAMPLE_CSS),
  }));
  const value = useMemo<Store>(
    () => ({ tokens: state.tokens, byName: indexByName(state.tokens), dispatch }),
    [state.tokens],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
