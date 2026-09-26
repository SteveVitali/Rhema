// Usercontent serving policy (REQ-ARCH-24 amended; §13.3). Uploaded bytes are served ONLY from a separate
// registrable domain (`*.rhemausercontent.com`, not a subpath/subdomain of rhema.app) that sets no cookies,
// with `Content-Disposition: attachment` + `Content-Type: application/octet-stream` for everything not on a
// small rendered allowlist (so a hostile uploaded HTML can never execute in a first-party cookied context).

/** Types safe to render inline from the usercontent origin (images only at beta). Everything else downloads. */
export const RENDERED_ALLOWLIST = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** The usercontent origin is a separate registrable domain and never sets cookies. */
export const USERCONTENT_ORIGIN = {
  registrableDomain: "rhemausercontent.com",
  setsCookies: false,
  isSubresourceOfApp: false,
} as const;

/** Response headers for serving an uploaded object of `contentType` from the usercontent origin. */
export function servingHeadersFor(contentType: string): Record<string, string> {
  const base = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const rendered = RENDERED_ALLOWLIST.includes(base);
  return {
    "Content-Type": rendered ? base : "application/octet-stream",
    "Content-Disposition": rendered ? "inline" : "attachment",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-site",
    "Cache-Control": "private, no-store",
    // deliberately NO Set-Cookie — the origin is cookieless.
  };
}
