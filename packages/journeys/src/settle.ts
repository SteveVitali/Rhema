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

/** The `data-renderer` vocabulary — the only two renderers a served document may report. */
export type RendererName = "ssr" | "spa";

/** The request-level override header (`deps.spa`'s consult input — REQ-SEQ-4). */
export const RENDERER_HEADER = "x-rhema-renderer";

/**
 * The scope a settle/assert runs in. `StepCtx` satisfies this structurally — pass `ctx`
 * (`{webBaseUrl, expectRenderer}`) wherever a step has one.
 */
export interface SettleScope {
  /** the web origin — marker asserts apply ONLY to documents on it. */
  readonly webBaseUrl: string;
  /** `--expect-renderer`: when pinned, every settled document must carry this `data-renderer`. */
  readonly expectRenderer?: RendererName | null;
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

/** Extract the `<html data-renderer>` marker from a served document body (the runner's check). */
export function rendererOfDocument(html: string): RendererName | null {
  const m = /<html[^>]*\bdata-renderer="(ssr|spa)"/.exec(html);
  return (m?.[1] as RendererName | undefined) ?? null;
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
  const timeout = wait.timeoutMs ?? 30_000;
  try {
    await page.waitForFunction(
      ([wantRoute, wantRenderer]) => {
        const el = document.documentElement;
        if (!el.hasAttribute("data-mounted")) return false;
        if (wantRoute != null && el.getAttribute("data-route") !== wantRoute) return false;
        if (wantRenderer != null && el.getAttribute("data-renderer") !== wantRenderer)
          return false;
        return true;
      },
      [route, renderer] as const,
      { timeout },
    );
  } catch {
    // name what the document actually settled as — a wrong route/renderer is the diagnostic.
    const observed = await page
      .evaluate(() => ({
        route: document.documentElement.getAttribute("data-route"),
        renderer: document.documentElement.getAttribute("data-renderer"),
        mounted: document.documentElement.hasAttribute("data-mounted"),
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
