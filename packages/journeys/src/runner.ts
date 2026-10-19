// JOURNEY.1 — the journey runner (deliverable: "a runner that runs a single step or the registry").
// Per step: a fresh page, console/pageerror/requestfailed capture, the step's assertions, then a
// screenshot into the evidence dir (green proof AND red debt alike). Expected-red semantics: a red
// step that fails is reported `owed` (its owner carries the debt) — never a run failure; a red step
// that PASSES is `ready-to-flip` (its owner flips `expected` in its own PR). A green step failing
// fails the run.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { JourneyStep } from "./registry.js";
import type { MailboxClient } from "./mailbox.js";
import { JourneySessions, stableIdentity, freshIdentity, assertTestIdentity } from "./session.js";
import { marker } from "./nonce.js";
import { spaRouteFor, type SpaSurface } from "@rhema/contracts";
import {
  gatedRouteIds,
  onOurOrigin,
  rendererOfDocument,
  ssrCauseOfDocument,
  type RendererName,
} from "./settle.js";

export interface StepCtx {
  readonly step: JourneyStep;
  readonly nonce: string;
  readonly browser: Browser;
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly mailbox: MailboxClient;
  readonly sessions: JourneySessions;
  /** a fresh anonymous context+page (landing/marketing/phone legs use this) */
  anon(): Promise<{ context: BrowserContext; page: Page }>;
  /** a signed-in context for the run's fresh identity (provisions a flagged tenant on first use) */
  freshUser(tag: string, opts?: { useCache?: boolean }): Promise<{ context: BrowserContext; page: Page; email: string; via: string }>;
  /** a signed-in context for a STABLE returning identity (storageState-cached) */
  returningUser(tag: string): Promise<{ context: BrowserContext; page: Page; email: string; via: string }>;
  /** nonce-namespaced artifact marker (voice names, project titles) */
  marker(name: string): string;
  /** observed console errors + failed requests on the step's pages (attached to the report) */
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  /** record an asset response for the bundle-parity check (auto-wired by the runner) */
  readonly assetHits: { url: string; status: number; contentType: string | null }[];
  /** the run's evidence dir (UX.2 — a multi-surface step commits its own per-width screenshots) */
  readonly outDir: string;
  /**
   * SPA.6 (REQ-VFY-7) — `--expect-renderer`: every same-origin HTML document this step's pages
   * load is checked for `data-renderer="<this>"` by the runner (also asserted inside the settle
   * helpers). `null` ⇒ the run doesn't pin a renderer.
   */
  readonly expectRenderer: RendererName | null;
  /**
   * SPA.17 (design/29 §coexistence) — a `--surface` leg's gated route ids (`gatedRouteIds`),
   * carried so the settle helpers scope the renderer assert identically. `null` ⇒ assert on
   * every settled document.
   */
  readonly rendererScope: ReadonlySet<string> | null;
}

// SPA.28 — `extraHTTPHeaders`/`pinRenderer` retired (REQ-SEQ-4's removal leg): the
// `x-rhema-renderer` channel is deleted, so no runner-created context carries renderer
// headers any more. Steps that roll their own context no longer spread anything.

export type StepFn = (ctx: StepCtx) => Promise<void>;

export type StepOutcome = "pass" | "fail" | "owed" | "ready-to-flip" | "skipped";

export interface StepResult {
  readonly id: string;
  readonly journey: string;
  readonly owner: string;
  readonly expected: "red" | "green";
  readonly paid: boolean;
  outcome: StepOutcome;
  error?: string;
  screenshot?: string;
  consoleErrors: string[];
  failedRequests: string[];
  durationMs: number;
}

export interface JourneyReport {
  readonly tool: "rhema-journeys";
  readonly nonce: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  /** the deploy-provenance assertion result (the report carries what the check saw) */
  provenance: { expected?: string | undefined; observed: Record<string, string | null>; match: boolean };
  /** the spend-guard outcome for paid runs (nightly runs carry zeros) */
  spend: { weeklyMeteredUsd: number | null; capUsd: number; withinCap: boolean };
  /** SPA.6 — the renderer assert the run was invoked with (null when un-pinned). */
  renderer: { expect: RendererName | null };
  results: StepResult[];
  /** every green step passed? (the process exit code) */
  passed: boolean;
}

export interface RunnerDeps {
  readonly browser: Browser;
  readonly webBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly mailbox: MailboxClient;
  readonly stateDir: string;
  readonly outDir: string;
  readonly nonce: string;
  readonly paid: boolean;
  /** chosen steps (registry order preserved) */
  readonly steps: readonly JourneyStep[];
  readonly impls: Readonly<Record<string, StepFn>>;
  readonly provenance: JourneyReport["provenance"];
  readonly spend: JourneyReport["spend"];
  /** REQ-VFY-7 — `data-renderer` every same-origin document must carry (unset ⇒ no assert). */
  readonly expectRenderer?: RendererName;
  /**
   * SPA.17 (design/29 §coexistence) — `--surface <k>` scopes `--expect-renderer` to documents
   * under those surfaces' `SPA_DOCUMENT_ROUTES` route ids; unset ⇒ the every-document assert.
   */
  readonly rendererScope?: readonly SpaSurface[];
  /**
   * MAINT.6 (D-OPS.1-1) — the seeded invite code every fresh session mint submits on the /signup
   * form (`--invite-code` / `RHEMA_INVITE_CODE`). Unset ⇒ mints run the un-seeded path verbatim.
   */
  readonly inviteCode?: string;
}

export async function runJourneys(deps: RunnerDeps): Promise<JourneyReport> {
  await mkdir(deps.outDir, { recursive: true });
  // SPA.17 — a --surface leg's gated route ids; null ⇒ the every-document renderer assert.
  const gatedRoutes = gatedRouteIds(deps.rendererScope);
  // Session pages are wired from INSIDE JourneySessions (onPage fires before the mint's first
  // navigation) — `wireCurrent` swaps in the running step's listener set so a minted page's docs
  // are checked against the step that requested it, never a stale/empty set.
  let wireCurrent: ((page: Page) => void) | undefined;
  const sessions = new JourneySessions({
    browser: deps.browser,
    mailbox: deps.mailbox,
    webBaseUrl: deps.webBaseUrl,
    stateDir: deps.stateDir,
    onPage: (page) => wireCurrent?.(page),
    ...(deps.inviteCode ? { inviteCode: deps.inviteCode } : {}),
  });
  const results: StepResult[] = [];
  const startedAt = new Date().toISOString();

  for (const step of deps.steps) {
    const impl = deps.impls[step.id];
    const t0 = Date.now();
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const assetHits: StepCtx["assetHits"] = [];
    const res: StepResult = {
      id: step.id,
      journey: step.journey,
      owner: step.owner,
      expected: step.expected,
      paid: step.paid,
      outcome: "skipped",
      consoleErrors,
      failedRequests,
      durationMs: 0,
    };
    results.push(res);
    if (step.paid && !deps.paid) {
      res.outcome = "skipped";
      res.error = "paid step — nightly runs exclude it (the weekly --paid leg carries it)";
      continue;
    }
    if (!impl) {
      res.outcome = step.expected === "red" ? "owed" : "fail";
      res.error = `no implementation wired for ${step.id}`;
      continue;
    }

    // REQ-VFY-7 — the renderer assert rides the response stream: every same-origin HTML document
    // response must carry `data-renderer` equal to `--expect-renderer`. Document responses only —
    // client-side route transitions serve no document and change no renderer. Reads are awaited
    // (allSettled) after the impl so a pending body can't race the classification.
    const rendererViolations: string[] = [];
    const docReads: Promise<unknown>[] = [];
    const wirePage = (page: Page): void => {
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => {
        const url = r.url();
        // REQ-TL-13 — the asset ledger covers the WHOLE `/assets/` space, not just the flat island
        // bundles: the Vite SPA emits nested paths (`/assets/spa/assets/<name>-<hash>.{js,css,…}`)
        // that the old `/assets/[^/]+\.js$` regex never saw. Same-origin only; the parity assert in
        // steps.ts keys content-type by extension.
        if (onOurOrigin(url, deps.webBaseUrl) && new URL(url).pathname.startsWith("/assets/")) {
          assetHits.push({ url, status: r.status(), contentType: r.headers()["content-type"] ?? null });
        }
        if (deps.expectRenderer == null) return;
        if (r.request().resourceType() !== "document") return;
        if (r.status() < 200 || r.status() >= 300) return; // redirects/errors carry no marker
        if (!onOurOrigin(url, deps.webBaseUrl)) return;
        if (!(r.headers()["content-type"] ?? "").includes("text/html")) return;
        docReads.push(
          r
            .text()
            .then((body) => {
              // a --surface-scoped leg (design/29 §coexistence) asserts only documents under
              // the gated surfaces' path set — the response carries no data-route yet (the SPA
              // shell stamps it client-side), so membership is read off the request path.
              if (gatedRoutes != null) {
                let routeId: string | null = null;
                try {
                  routeId = spaRouteFor(new URL(url).pathname).routeId;
                } catch {
                  /* an unparseable URL is out of the gated set */
                }
                if (routeId == null || !gatedRoutes.has(routeId)) return;
              }
              const observed = rendererOfDocument(body);
              if (observed !== deps.expectRenderer) {
                // REQ-ED-12 (ARMB-1) — a Page-family forced-SSR verdict (phone UA / showcase row)
                // self-reports `data-ssr-cause`; it is the spec-mandated renderer for that request,
                // not a violation. A gated doc serving ssr WITHOUT the stamp still fails.
                if (observed === "ssr" && ssrCauseOfDocument(body) != null) return;
                let path = url;
                try {
                  path = new URL(url).pathname;
                } catch {
                  /* keep the raw url */
                }
                rendererViolations.push(
                  `${path} served data-renderer=${observed ?? "(absent)"} — expected ${deps.expectRenderer}`,
                );
              }
            })
            .catch(() => {
              rendererViolations.push(`${url}: document body unreadable for the renderer check`);
            }),
        );
      });
    };

    const ctx: StepCtx = {
      step,
      nonce: deps.nonce,
      browser: deps.browser,
      webBaseUrl: deps.webBaseUrl,
      apiBaseUrl: deps.apiBaseUrl,
      mailbox: deps.mailbox,
      sessions,
      consoleErrors,
      failedRequests,
      assetHits,
      outDir: deps.outDir,
      expectRenderer: deps.expectRenderer ?? null,
      rendererScope: gatedRoutes,
      marker: (name) => marker(deps.nonce, name),
      async anon() {
        const context = await deps.browser.newContext({
          baseURL: deps.webBaseUrl,
        });
        const page = await context.newPage();
        wirePage(page);
        return { context, page };
      },
      async freshUser(tag, o) {
        const email = freshIdentity(deps.nonce, tag);
        assertTestIdentity(email);
        // wired by sessions.onPage → wireCurrent — including the mint's own first navigation.
        return sessions.signIn(email, { useCache: o?.useCache ?? false });
      },
      async returningUser(tag) {
        const email = stableIdentity(tag);
        assertTestIdentity(email);
        return sessions.signIn(email, { useCache: true });
      },
    };

    // sessions.onPage routes to THIS step's listeners while the impl runs (cleared at classify).
    wireCurrent = wirePage;
    let stepError: unknown = null;
    try {
      await impl(ctx);
    } catch (e) {
      stepError = e;
    }
    // settle the in-flight renderer checks, then classify: a wrong/absent marker on a green step
    // fails the run exactly like an impl throw (on a red step it reports owed — REQ-VFY-7).
    await Promise.allSettled(docReads);
    wireCurrent = undefined;
    if (stepError == null && rendererViolations.length > 0) {
      stepError = new Error(
        `expect-renderer=${deps.expectRenderer}: ${rendererViolations.join("; ")}`,
      );
    }
    if (stepError == null) {
      res.outcome = step.expected === "green" ? "pass" : "ready-to-flip";
    } else {
      res.error = stepError instanceof Error ? stepError.message : String(stepError);
      res.outcome = step.expected === "red" ? "owed" : "fail";
    }
    res.durationMs = Date.now() - t0;
    try {
      const shot = path.join(deps.outDir, `${step.id.replace(/[^\w.-]/g, "_")}.png`);
      // screenshot the LAST opened page of the run for evidence — the step may own several contexts;
      // pages() enumerates every context of the browser the runner created them from.
      const pages = deps.browser.contexts().flatMap((c) => c.pages());
      const target = pages.at(-1);
      if (target && !target.isClosed()) {
        await target.screenshot({ path: shot, fullPage: true });
        res.screenshot = path.basename(shot);
      }
    } catch {
      // a screenshot is evidence, never a failure cause
    }
    // close contexts the step opened (they're the browser's; anon()/signIn made them all)
    for (const c of deps.browser.contexts()) await c.close().catch(() => undefined);
  }

  // `fail` is only ever assigned to expected-green steps (red failures classify as `owed`).
  const passed = !results.some((r) => r.outcome === "fail");
  const report: JourneyReport = {
    tool: "rhema-journeys",
    nonce: deps.nonce,
    startedAt,
    finishedAt: new Date().toISOString(),
    webBaseUrl: deps.webBaseUrl,
    apiBaseUrl: deps.apiBaseUrl,
    provenance: deps.provenance,
    spend: deps.spend,
    renderer: { expect: deps.expectRenderer ?? null },
    results,
    passed,
  };
  await writeFile(path.join(deps.outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}
