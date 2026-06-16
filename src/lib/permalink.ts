import type { Token } from "../types";
import { toCss } from "./exporters";
import { deflateSync, inflateSync } from "fflate";

// Share the token set via the URL hash — fully client-side, no storage/server.
// The CSS is DEFLATE-compressed then URL-safe-base64 encoded under #z=… . Token
// sets are highly repetitive (var(--…) everywhere), so this is ~6× smaller than
// the raw encoding, which keeps links under corporate URL-filter / SafeLinks
// limits. Legacy uncompressed links (#t=…) still decode for backward compat.

const PREFIX = "#z="; // compressed
const LEGACY_PREFIX = "#t="; // raw base64 (older links)

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(b: string): Uint8Array {
  const norm = b.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeTokensToHash(tokens: Token[]): string {
  const css = toCss(tokens, { selector: ":root", groupBySection: false });
  const compressed = deflateSync(new TextEncoder().encode(css), { level: 9 });
  return PREFIX + bytesToB64url(compressed);
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
  try {
    if (h.startsWith(PREFIX)) {
      const bytes = inflateSync(b64urlToBytes(h.slice(PREFIX.length)));
      return new TextDecoder().decode(bytes);
    }
    if (h.startsWith(LEGACY_PREFIX)) {
      // Older links stored the CSS as raw URL-safe base64 (no compression).
      return new TextDecoder().decode(b64urlToBytes(h.slice(LEGACY_PREFIX.length)));
    }
  } catch {
    return null;
  }
  return null;
}

/** True when the URL carries a share hash but it couldn't be decoded (truncated
 *  by a URL filter, corrupted on copy, etc.) — lets the app say so rather than
 *  silently opening empty. */
export function hashDecodeFailed(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash;
  if (!h.startsWith(PREFIX) && !h.startsWith(LEGACY_PREFIX)) return false;
  return cssFromHash() === null;
}
