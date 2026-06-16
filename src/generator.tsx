import { createContext, useContext } from "react";

export type GenKind = "color" | "spacing" | "type";
export interface GenRequest {
  kind?: GenKind;
  seed?: string;
}

/** Open the scale generator, optionally pre-seeded (e.g. from a color token). */
const Ctx = createContext<(req?: GenRequest) => void>(() => {});

export const GeneratorProvider = Ctx.Provider;

export function useGenerator(): (req?: GenRequest) => void {
  return useContext(Ctx);
}
