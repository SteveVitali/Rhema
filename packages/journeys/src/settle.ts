// SPA.6 — the settle contract (REQ-VFY-3/4/7; design/27 F4/F6; design/29 F5/F6). Every document
// apps/web serves carries `data-renderer="ssr|spa"`, `data-route="<id>"`, and `data-mounted` —
// SSR stamps all three statically (the document is complete at serve), the SPA shell stamps
// `data-renderer="spa"` and flips `data-route`/`data-mounted` after the router resolves. These
// helpers are the ONLY waits journey code may use to observe a document/route settling: they hold
// on BOTH renderers by construction, which is what makes a `--surface` leg-A/B pair assert the
// same contract (design/29 F6 — without SSR-side markers leg A is vacuous).
//
//   gotoOk(page, url, ctx)      — a document GET that must 2xx/3xx, then settle on its markers
//   settleNav(page, ctx, wait)  — post-action settle (a click's document nav OR client nav)
//   reloadSettled(page, ctx)    — a reload, re-asserted through the same markers (a remount assert)
//
// External documents (the Stripe-hosted hand-offs) carry no markers — the helpers scope every
// marker assert to our own origin so a hosted page never trips them.

import type { Page } from "playwright";
import { SPA_DOCUMENT_ROUTES, type SpaSurface } from "@rhema/contracts";

/** The `data-renderer` vocabulary — the only two renderers a served document may report. */
export type RendererName = "ssr" | "spa";

// SPA.28 — `RENDERER_HEADER` ("x-rhema-renderer") retired with the override channel (REQ-SEQ-4's
// removal leg): no context may pin a renderer any more; `--expect-renderer` remains the assert
// (the markers stay contractually true).

/**
 * SPA.17 (design/29 §coexistence) — the route ids a `--surface` leg asserts `--expect-renderer`
 * on. A gated step's traversal documents outside the gated surfaces' path set keep their own
 * flag's verdict — pinning `spa` on an unflipped neighbour's document would lie about the
 * contract (e.g. `export`'s R5 step walks the still-SSR editor doc). `null` ⇒ the every-document
 * assert (an unscoped run keeps its meaning).
 */
export function gatedRouteIds(
  surfaces: readonly SpaSurface[] | null | undefined,
): ReadonlySet<string> | null {
  if (surfaces == null || surfaces.length === 0) return null;
  const wanted = new Set<SpaSurface>(surfaces);
  return new Set(
    SPA_DOCUMENT_ROUTES.filter((r) => r.surfaces?.some((s) => wanted.has(s))).map((r) => r.routeId),
  );
}

/**
 * The scope a settle/assert runs in. `StepCtx` satisfies this structurally — pass `ctx`
 * (`{webBaseUrl, expectRenderer}`) wherever a step has one.
 */
export interface SettleScope {
  /** the web origin — marker asserts apply ONLY to documents on it. */
  readonly webBaseUrl: string;
  /** `--expect-renderer`: when pinned, every settled document must carry this `data-renderer`. */
  readonly expectRenderer?: RendererName | null;
  /**
   * SPA.17 — a `--surface` leg's gated route ids (`gatedRouteIds()`'s result). Non-null scopes
   * the renderer assert to documents whose `data-route` is in the set; `null`/absent asserts
   * every settled document.
   */
  readonly rendererScope?: ReadonlySet<string> | null;
  /**
   * NAVC.2 (REQ-NAVT-3, O2-F20) — the runner's count of same-origin HTML document responses
   * observed on this step's wired pages so far. It counts UNCONDITIONALLY — never gated on
   * `--expect-renderer` — because it is the harness-side half of the nav-mechanism pin: an
   * in-page counter can't see a document boundary (a reload to the same URL resets the page's
   * own `data-nav-count`), so only the response watcher can prove a nav was a document nav.
   * The mechanism-pinned settles (`settleClientNav`/`settleDocumentNav`) fail closed when a
   * scope omits it; the mechanism-agnostic helpers never read it.
   */
  readonly documentLoads?: number;
}

export interface SettleWait {
  /** assert the settled document's `data-route` (the `$param` route id — `spaRouteFor`'s key). */
  readonly route?: string;
  readonly timeoutMs?: number;
}

/** Same-origin check — a marker assert never fires on a foreign host's document. */
export function onOurOrigin(pageUrl: string, webBaseUrl: string): boolean {
  try {
    return new URL(pageUrl).origin === new URL(webBaseUrl).origin;
  } catch {
    return false;
  }
}

/** The REQ-ED-12 forced-SSR cause vocabulary — the only verdicts the Page arm may self-report. */
export type SsrCause = "phone" | "showcase";

/** Extract the `<html data-renderer>` marker from a served document body (the runner's check). */
export function rendererOfDocument(html: string): RendererName | null {
  const m = /<html[^>]*\bdata-renderer="(ssr|spa)"/.exec(html);
  return (m?.[1] as RendererName | undefined) ?? null;
}

/**
 * Extract the REQ-ED-12 `<html data-ssr-cause>` stamp (ARMB-1). Only the Page family's forced-SSR
 * arm emits it — a phone UA or a `showcase: true` row is a server verdict the renderer assert must
 * HONOR, not flag (the `--expect-renderer spa` contract asserts the renderer the spec mandates:
 * spa on every gated doc, ssr on the forced arms). Absent ⇒ this is not a forced verdict — an `ssr`
 * doc without the stamp on a gated route is still a violation.
 */
export function ssrCauseOfDocument(html: string): SsrCause | null {
  const m = /<html[^>]*\bdata-ssr-cause="(phone|showcase)"/.exec(html);
  return (m?.[1] as SsrCause | undefined) ?? null;
}

/**
 * Wait until the current document's `<html>` carries `data-mounted` — plus `data-route`/`data-
 * renderer` equality when named. On SSR the attrs are present at serve (this resolves at
 * domcontentloaded); under the SPA they land after the router's first data paint. No-op on a
 * foreign-origin page (a Stripe-hosted tab has no markers to assert).
 */
export async function awaitMounted(
  page: Page,
  scope: SettleScope,
  wait: SettleWait = {},
): Promise<void> {
  if (!onOurOrigin(page.url(), scope.webBaseUrl)) return;
  const route = wait.route ?? null;
  const renderer = scope.expectRenderer ?? null;
  const gated = scope.rendererScope == null ? null : [...scope.rendererScope];
  const timeout = wait.timeoutMs ?? 30_000;
  try {
    await page.waitForFunction(
      ([wantRoute, wantRenderer, gatedRoutes]) => {
        const el = document.documentElement;
        if (!el.hasAttribute("data-mounted")) return false;
        const docRoute = el.getAttribute("data-route");
        if (wantRoute != null && docRoute !== wantRoute) return false;
        if (wantRenderer != null) {
          // a scoped leg asserts the renderer only under the gated surfaces' path set — a
          // document outside the set reports its own flag's verdict (design/29 §coexistence).
          const assertable = gatedRoutes == null || (docRoute != null && gatedRoutes.indexOf(docRoute) >= 0);
          // REQ-ED-12 — the forced-SSR arm self-reports its cause; waiting on a mandated SSR
          // verdict to flip to spa would just lapse the timeout on a correct document.
          if (
            assertable &&
            el.getAttribute("data-renderer") !== wantRenderer &&
            !el.hasAttribute("data-ssr-cause")
          )
            return false;
        }
        return true;
      },
      [route, renderer, gated] as const,
      { timeout },
    );
  } catch {
    // name what the document actually settled as — a wrong route/renderer is the diagnostic.
    const observed = await page
      .evaluate(() => ({
        route: document.documentElement.getAttribute("data-route"),
        renderer: document.documentElement.getAttribute("data-renderer"),
        mounted: document.documentElement.hasAttribute("data-mounted"),
        ssrCause: document.documentElement.getAttribute("data-ssr-cause"),
      }))
      .catch(() => null);
    throw new Error(
      `settle wait lapsed on ${page.url()}: wanted data-mounted` +
        `${route ? ` + data-route="${route}"` : ""}` +
        `${renderer ? ` + data-renderer="${renderer}"` : ""}` +
        ` — observed ${observed ? JSON.stringify(observed) : "(no document state readable)"}`,
    );
  }
}

/** The canonical "GET must land" — status check first, then the settle contract. */
export async function gotoOk(
  page: Page,
  url: string,
  scope: SettleScope,
  wait: SettleWait = {},
): Promise<void> {
  const r = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!r || r.status() >= 400) throw new Error(`GET ${url} → ${r?.status()}`);
  await awaitMounted(page, scope, wait);
}

/**
 * Post-action settle: let any in-flight document navigation commit (an SSR form POST/anchor nav),
 * then assert the mounted markers. On an SPA client navigation no document load ever commits —
 * `waitForLoadState` resolves immediately and the optional `route` assert is what carries the
 * settle. NEVER used where the action can land on a foreign origin (the Stripe legs keep their
 * raw `waitForLoadState`+URL asserts — those pages are not ours).
 */
export async function settleNav(
  page: Page,
  scope: SettleScope,
  wait: SettleWait = {},
): Promise<void> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: wait.timeoutMs ?? 30_000 })
    .catch(() => undefined);
  await awaitMounted(page, scope, wait);
}

/** A reload re-asserted through the settle contract — the remount assert (REQ-VFY-4). */
export async function reloadSettled(
  page: Page,
  scope: SettleScope,
  wait: SettleWait = {},
): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await awaitMounted(page, scope, wait);
}

// ---------------------------------------------------------------------------
// NAVC.2 — the mechanism-pinned settles (REQ-NAVT-1/3/6). `settleNav`/`gotoOk`/`reloadSettled`
// above stay deliberately mechanism-agnostic (a leg that doesn't care HOW it navigated keeps
// using them); the two helpers below NAME the mechanism, so a journey can prove a click went
// client-side vs document-side instead of merely observing that SOME document settled — the
// blind spot that let zero-client-routing ship (r5_a4 F1/F5).

/**
 * The document's committed-transition tally — `<html data-nav-count>` (REQ-NAVT-1). `null`
 * when the attr is absent/unreadable; legs asserting monotone counts read it directly.
 */
export async function navCountOf(page: Page): Promise<number | null> {
  return page
    .evaluate(() => {
      const raw = document.documentElement.getAttribute("data-nav-count");
      const n = raw == null ? NaN : Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    })
    .catch(() => null);
}

function documentLoadsOf(scope: SettleScope, helper: string): number {
  if (typeof scope.documentLoads !== "number") {
    throw new Error(
      `${helper} requires scope.documentLoads — the runner wires the unconditional ` +
        `document-response counter (REQ-NAVT-3, O2-F20); a scope without it can't pin mechanism`,
    );
  }
  return scope.documentLoads;
}

/**
 * `settleClientNav(page, scope, act, wait)` — `act()` (a click, a keypress — any driver) MUST
 * client-navigate: the CURRENT document's `data-nav-count` increases AND zero document loads
 * are observed. The action-callback shape makes the baseline structurally pre-commit — a
 * post-action snapshot can't exist, since the nav may have already committed by the time a
 * post-action helper ran. The wait requires the pending window to resolve first
 * (`data-mounted` re-stamped — REQ-NAVT-2 keeps it absent while `isLoading`), so a commit
 * that then document-navigates (a `reloadDocument` stub arm) tears the document down mid-wait
 * and fails — the mechanism pin can't false-pass on the transient commit.
 */
export async function settleClientNav(
  page: Page,
  scope: SettleScope,
  act: () => Promise<unknown>,
  wait: SettleWait = {},
): Promise<void> {
  // foreign-origin pages carry no markers at all — run the action and no-op the asserts
  // BEFORE demanding a counter (a hosted-checkout leg shouldn't need the harness wired).
  if (!onOurOrigin(page.url(), scope.webBaseUrl)) {
    await act();
    return;
  }
  documentLoadsOf(scope, "settleClientNav");
  const countBefore = await navCountOf(page);
  if (countBefore == null) {
    throw new Error(
      `settleClientNav: ${page.url()} carries no data-nav-count — REQ-NAVT-1's all-documents stamp is absent`,
    );
  }
  const loadsBefore = scope.documentLoads ?? 0;
  await act();
  const timeout = wait.timeoutMs ?? 30_000;
  try {
    await page.waitForFunction(
      (baseline) => {
        const el = document.documentElement;
        if (!el.hasAttribute("data-mounted")) return false; // pending is unresolved (REQ-NAVT-2)
        const raw = el.getAttribute("data-nav-count");
        const n = raw == null ? NaN : Number.parseInt(raw, 10);
        return Number.isFinite(n) && n > baseline;
      },
      countBefore,
      { timeout },
    );
  } catch {
    const observed = await navCountOf(page);
    throw new Error(
      `settleClientNav lapsed on ${page.url()}: data-nav-count never exceeded ${countBefore} ` +
        `(observed ${observed ?? "absent"}) — the action did not commit an in-document transition ` +
        `(a document nav lands a fresh "0", so a mechanism flip fails here, never silently passes)`,
    );
  }
  await awaitMounted(page, scope, wait);
  const loadsAfter = scope.documentLoads ?? 0;
  if (loadsAfter !== loadsBefore) {
    throw new Error(
      `settleClientNav on ${page.url()}: ${loadsAfter - loadsBefore} document load(s) observed — ` +
        `the action document-navigated, not client-navigated`,
    );
  }
}

/**
 * `settleDocumentNav(page, scope, act, wait)` — the inverse pin: `act()` MUST
 * document-navigate. At least one same-origin HTML document response must land (the runner's
 * unconditional `documentLoads` counter — the only proof that survives the document
 * boundary), then the settle contract asserts the FRESH document's markers. The landed
 * document must carry `data-nav-count` (the all-documents stamp); its value isn't pinned to
 * "0" because a landed leaf may legitimately commit an in-document redirect (e.g. the
 * `/settings` → `/app/settings/account` client redirect) before the wait observes it.
 */
export async function settleDocumentNav(
  page: Page,
  scope: SettleScope,
  act: () => Promise<unknown>,
  wait: SettleWait = {},
): Promise<void> {
  if (!onOurOrigin(page.url(), scope.webBaseUrl)) {
    await act();
    return;
  }
  documentLoadsOf(scope, "settleDocumentNav");
  const loadsBefore = scope.documentLoads ?? 0;
  const timeout = wait.timeoutMs ?? 30_000;
  await act();
  const deadline = Date.now() + timeout;
  while ((scope.documentLoads ?? 0) === loadsBefore) {
    if (Date.now() >= deadline) {
      throw new Error(
        `settleDocumentNav lapsed on ${page.url()}: no same-origin document response observed ` +
          `(documentLoads stayed ${loadsBefore}) — the action did not document-navigate`,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  await page
    .waitForLoadState("domcontentloaded", { timeout })
    .catch(() => undefined);
  await awaitMounted(page, scope, wait);
  const observed = await navCountOf(page);
  if (observed == null) {
    throw new Error(
      `settleDocumentNav: the landed document ${page.url()} carries no data-nav-count — ` +
        `REQ-NAVT-1's all-documents stamp is absent`,
    );
  }
}
