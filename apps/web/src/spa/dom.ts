// SPA.4 — the document-navigation seam. SsrHandoff, the auth gate's 401 leg, and the redirect-only
// routes all leave the SPA by ASSIGNING a location — a real document request so the server re-runs
// its fixed handler order (session gate → redirects → the Page family's forced-SSR check) on the
// same URL (REQ-FW-6 401 leg, design/25 §strangler). The indirection object exists so tests can
// observe the navigation without stubbing `window.location` (happy-dom won't let it be replaced).

/**
 * The one seam every document navigation goes through. Tests assign a spy to `spaRuntime.assign`;
 * production keeps the real `window.location.assign`.
 */
export const spaRuntime: { assign: (href: string) => void } = {
  assign: (href) => {
    window.location.assign(href);
  },
};

/** A hard document navigation — never an in-router fetch (REQ-FW-6, REQ-NAV-4's server redirect leg). */
export function navigateDocument(href: string): void {
  spaRuntime.assign(href);
}
