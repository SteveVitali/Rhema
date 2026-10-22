// Usercontent serving policy (REQ-ARCH-24 amended 2026-09-17; §13.3). Uploaded bytes are served ONLY
// from the dedicated cookieless origin (`usercontent.rhema.tools` — a distinct host+backend, never a
// subpath of the app; the `*.` wildcard was dropped at Stage B 2026-09-17 — managed certs reject
// wildcard SANs) that sets no cookies, with
// `Content-Disposition: attachment` + `Content-Type: application/octet-stream` for everything not on a
// small rendered allowlist (so a hostile uploaded HTML can never execute in a first-party context).
//
// Amended 2026-09-17: the origin was previously a separate registrable domain (`rhemausercontent.com`);
// the operator's single `rhema.tools` zone makes it a sibling subdomain instead. The cookie boundary
// therefore no longer rests on domain separation — it rests on this origin emitting NO Set-Cookie at
// all and on every auth cookie being host-only `__Host-` (apps/api/src/auth.ts), which the browser
// refuses to let any subdomain shadow or receive.

import { USERCONTENT_RENDERED_TYPES, userContentResponsePolicy } from "@rhema/contracts";

/** Types safe to render inline from the usercontent origin (images only at beta). Everything else
 *  downloads. Re-derived from the contracts module (ADR-113): the SAME allowlist now governs the
 *  legacy origin-header path here and the api's minted-URL `response-content-*` params. */
export const RENDERED_ALLOWLIST: readonly string[] = USERCONTENT_RENDERED_TYPES;

/**
 * The usercontent origin: a distinct host on the app's own zone (amended 2026-09-17 — was a separate
 * registrable domain), a separate LB backend, and never sets cookies. `isSubresourceOfApp` stays
 * false — it is a different ORIGIN, just the same site.
 */
export const USERCONTENT_ORIGIN = {
  host: "usercontent.rhema.tools",
  registrableDomain: "rhema.tools",
  setsCookies: false,
  isSubresourceOfApp: false,
} as const;

/** Response headers for serving an uploaded object of `contentType` from the usercontent origin.
 *  The type/disposition decision is the shared `userContentResponsePolicy` (ADR-113) — the
 *  minted-URL path signs the same two values in; this function additionally emits the headers GCS
 *  cannot (nosniff + CORP + no-store) for the legacy origin-serving shape. */
export function servingHeadersFor(contentType: string): Record<string, string> {
  const policy = userContentResponsePolicy(contentType);
  return {
    "Content-Type": policy.contentType,
    "Content-Disposition": policy.contentDisposition,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cache-Control": "private, no-store",
    // deliberately NO Set-Cookie — the origin is cookieless.
  };
}
