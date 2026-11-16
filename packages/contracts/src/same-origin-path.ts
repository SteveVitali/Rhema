// 275_R6WEB.1 (RH-33/RH-34) — the shared same-origin `next` validator.
//
// A `next`/return target is carried through the login gate and the auth callback chain. The
// pre-fix web check was `next.startsWith("/") && !next.startsWith("//")` — it admitted
// `/\evil.example`, which `new URL(next, origin)` folds to `//evil.example` (the WHATWG parser
// treats `\` as a path separator), an off-origin redirect. The honest rule is the RESOLVED
// origin: parse the candidate against the app origin and compare `url.origin` — a relative
// path stays same-origin; `\`, `//`, scheme-relative, and absolute foreign URLs all refuse.

/**
 * The same-origin path+query+hash `raw` resolves to under `origin`, or `null` when it resolves
 * off-origin or does not parse. Absolute same-origin URLs are normalized down to their path —
 * the return value is always a `/…` string safe for `Location` and callbackURL construction.
 */
export function sameOriginPath(raw: string | undefined | null, origin: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
