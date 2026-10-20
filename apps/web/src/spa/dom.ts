// SPA.4 — the document-navigation seam. SsrHandoff, the auth gate's 401 leg, and the redirect-only
// routes all leave the SPA by ASSIGNING a location — a real document request so the server re-runs
// its fixed handler order (session gate → redirects → the Page family's forced-SSR check) on the
// same URL (REQ-FW-6 401 leg, design/25 §strangler). The indirection object exists so tests can
// observe the navigation without stubbing `window.location` (happy-dom won't let it be replaced).

/**
 * The one seam every document navigation goes through. `assign` pushes a new history entry;
 * `replace` eats the current one. Tests stub BOTH members with the same spy (`stubDocumentNav`
 * in `testkit.ts`) so "a document nav happened" is one observation regardless of which arm
 * carried it — the two members are the whole `window.location` doc-nav vocabulary, so the
 * shared spy is complete coverage, never a partial arm. Production keeps the real
 * `window.location` calls.
 */
export const spaRuntime: { assign: (href: string) => void; replace: (href: string) => void } = {
  assign: (href) => {
    window.location.assign(href);
  },
  replace: (href) => {
    window.location.replace(href);
  },
};

/** A hard document navigation — never an in-router fetch (REQ-FW-6, REQ-NAV-4's server redirect leg). */
export function navigateDocument(href: string): void {
  spaRuntime.assign(href);
}

/**
 * A replace-mode document navigation — the current history entry is eaten, not duplicated
 * (REQ-NAVM-5). SsrHandoff takes this arm: once NAVC.1's interceptor commits the client
 * navigation, the leaf's own URL already occupies the history slot — an `assign` of the same
 * URL would push a duplicate transient entry and Back would bounce forward into the handoff
 * again. Replace lands the server's document verdict over the committed slot.
 */
export function replaceDocument(href: string): void {
  spaRuntime.replace(href);
}
