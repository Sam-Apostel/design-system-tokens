import { createContext, useContext } from "react";
import type { CvdMode } from "./lib/cvd";

const Ctx = createContext<CvdMode>("none");

export const VisionProvider = Ctx.Provider;

/** Current color-vision simulation mode (applied to displayed colors). */
export function useVision(): CvdMode {
  return useContext(Ctx);
}
