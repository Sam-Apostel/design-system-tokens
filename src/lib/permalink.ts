import type { Token } from "../types";
import { toCss } from "./exporters";

// Share the token set via the URL hash — fully client-side, no storage/server.
// We encode a compact CSS representation as URL-safe base64 under #t=…

const PREFIX = "#t=";

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(b: string): string {
  const norm = b.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeTokensToHash(tokens: Token[]): string {
  const css = toCss(tokens, { selector: ":root", groupBySection: false });
  return PREFIX + b64encode(css);
}

/** Build a full shareable URL for the current tokens. */
export function shareUrl(tokens: Token[]): string {
  const base = window.location.href.split("#")[0];
  return base + encodeTokensToHash(tokens);
}

/** If the current URL hash carries tokens, return the decoded CSS. */
export function cssFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  if (!h.startsWith(PREFIX)) return null;
  try {
    return b64decode(h.slice(PREFIX.length));
  } catch {
    return null;
  }
}
