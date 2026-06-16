import { createContext, useContext } from "react";

export type Tab =
  | "palette"
  | "colorspace"
  | "contrast"
  | "semantics"
  | "graph"
  | "components"
  | "spacing"
  | "shadows"
  | "typography"
  | "checks"
  | "tokens";

export interface Nav {
  tab: Tab;
  /** Token name the active view should reveal/focus, if any. */
  focus: string | null;
  setTab: (tab: Tab) => void;
  /** Jump to a tab and optionally focus a specific token. */
  navigate: (tab: Tab, token?: string) => void;
  clearFocus: () => void;
}

const Ctx = createContext<Nav | null>(null);

export const NavProvider = Ctx.Provider;

export function useNav(): Nav {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
