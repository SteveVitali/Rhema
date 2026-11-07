// R7RELOAD.1 (REQ-RELOAD-6 / REQ-GUARD-3) — the no-document-reload walk harness. A scripted
// walk inside the signed-in app must keep ONE document for its whole length: the helper plants
// a persisted window marker after the entry document settles, then after every segment asserts
// `performance.getEntriesByType("navigation").length === 1` AND the marker still reads — a
// document swap (any `location`/`form`/`redirect` reload) tears both.
//
// Sanctioned document navigations are excluded BY NAME (S-14 + R6 §2 T9–T13): a walk declares
// a segment `sanctioned: "<name>"` and the helper expects — not merely permits — the document
// load, then replants the marker on the fresh document. A document load outside a named
// segment fails the walk. This list is the one 232 (chat send) and 249 (occlusion) consume.

import type { Page } from "playwright";

/** The persisted window marker's key (`window[GUARD3_MARKER]` — a document swap clears it). */
export const GUARD3_MARKER = "__rhemaGuard3Walk";

/**
 * The sanctioned document navigations, by name — the ONLY segments a no-reload walk may
 * declare `sanctioned:` on. Each entry names the spec fact it covers:
 *  - `demo-entry` / `demo-exit` — S-14: crossing the `/demo*`↔workspace boundary is a document
 *    navigation by predicate (the workspace QueryClient is never shared).
 *  - `sidebar-demo` — 248 R7TOUR.2: the AppShell sidebar's `data-shell-demo` item, the
 *    workspace→demo document navigation REQ-TOUR-4's R7b half adds (a `demo-entry` member
 *    named for the control, so a walk can declare it specifically).
 *  - `logout` — the `/logout` POST (R6 T12): the session's sanctioned exit.
 *  - `stripe-handoff` / `oauth-handoff` — the external-checkout/OAuth document hops (T12).
 *  - `binary-export` — `/p/:p/export`, `/usage.csv`, `/export/ai-use/*` download streams (T12).
 *  - `file-passthrough` — `/p/:p/f/:fid` (T10) and `/app/usage/r/:runId` API passthrough.
 *  - `document-stub` — the registered `reloadDocument` server redirects (`/p/:p/edit/:d`, the
 *    `/settings` family of server-owned GETs) — reached only by old bookmarks/links outside
 *    the walk's own controls.
 */
export const SANCTIONED_DOCUMENT_NAVIGATIONS = [
  "demo-entry",
  "demo-exit",
  "sidebar-demo",
  "logout",
  "stripe-handoff",
  "oauth-handoff",
  "binary-export",
  "file-passthrough",
  "document-stub",
] as const;

export type SanctionedDocumentNav = (typeof SANCTIONED_DOCUMENT_NAVIGATIONS)[number];

interface GuardWindow {
  performance: { getEntriesByType(t: string): unknown[] };
  [GUARD3_MARKER]?: string;
}

/** Plant the walk marker on the current document (call once, right after the entry settles). */
export async function plantGuard3Marker(page: Page, marker: string): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      (window as unknown as GuardWindow)[key as typeof GUARD3_MARKER] = value;
    },
    [GUARD3_MARKER, marker] as const,
  );
}

/**
 * The cumulative invariant: the CURRENT document is still the entry document — exactly one
 * navigation entry ever minted (a reload mints a second `type:"reload"` entry) and the planted
 * window marker survived (a document swap loses the window). Read AFTER each walk segment.
 */
export async function assertNoReload(page: Page, marker: string, label: string): Promise<void> {
  const observed = await page.evaluate(
    ([key]) => ({
      navEntries: (window as unknown as GuardWindow).performance.getEntriesByType("navigation")
        .length,
      marker: (window as unknown as GuardWindow)[key as typeof GUARD3_MARKER] ?? null,
    }),
    [GUARD3_MARKER] as const,
  );
  if (observed.navEntries !== 1) {
    throw new Error(
      `GUARD-3 ${label}: performance.getEntriesByType("navigation") returned ${observed.navEntries} ` +
        `entries (want 1) — a document load happened inside the app`,
    );
  }
  if (observed.marker !== marker) {
    throw new Error(
      `GUARD-3 ${label}: the persisted window marker was lost ` +
        `(want ${JSON.stringify(marker)}, read ${JSON.stringify(observed.marker)}) — ` +
        `the document was reloaded`,
    );
  }
}

/**
 * One walk segment. `sanctioned` absent ⇒ the segment must NOT document-navigate: the action
 * runs, then `assertNoReload` proves one document still. `sanctioned: "<name>"` ⇒ the segment
 * is a named document navigation from SANCTIONED_DOCUMENT_NAVIGATIONS: the helper expects the
 * page to be a NEW document (marker gone) after `act()` settles it, replants the marker, and
 * continues — the walk's `documentLoads` count is caller-checked per segment.
 */
export async function guard3Segment(
  page: Page,
  marker: string,
  label: string,
  act: () => Promise<unknown>,
  opts?: { readonly sanctioned?: SanctionedDocumentNav },
): Promise<void> {
  if (opts?.sanctioned != null) {
    await act();
    const lost = await page
      .evaluate(
        ([key]) => (window as unknown as GuardWindow)[key as typeof GUARD3_MARKER] ?? null,
        [GUARD3_MARKER] as const,
      )
      .catch(() => null);
    if (lost === marker) {
      throw new Error(
        `GUARD-3 ${label}: declared sanctioned "${opts.sanctioned}" but no document load happened`,
      );
    }
    await plantGuard3Marker(page, marker);
    await assertNoReload(page, marker, `${label} (post-${opts.sanctioned})`);
    return;
  }
  await act();
  await assertNoReload(page, marker, label);
}
