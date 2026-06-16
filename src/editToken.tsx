import { createContext, useContext } from "react";

/**
 * Open the editor for a token by name. On wide layouts this focuses the token in
 * the current tab's side list; on narrow layouts (no sidebar) it opens a modal.
 * Lets views edit a token in place instead of navigating away.
 */
const Ctx = createContext<(name: string) => void>(() => {});

export const EditProvider = Ctx.Provider;

export function useEditToken(): (name: string) => void {
  return useContext(Ctx);
}
