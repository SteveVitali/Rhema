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
}

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
}

export async function runJourneys(deps: RunnerDeps): Promise<JourneyReport> {
  await mkdir(deps.outDir, { recursive: true });
  const sessions = new JourneySessions({
    browser: deps.browser,
    mailbox: deps.mailbox,
    webBaseUrl: deps.webBaseUrl,
    stateDir: deps.stateDir,
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

    const wirePage = (page: Page): void => {
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`));
      page.on("response", (r) => {
        const url = r.url();
        if (/\/assets\/[^/]+\.js$/.test(url)) {
          assetHits.push({ url, status: r.status(), contentType: r.headers()["content-type"] ?? null });
        }
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
      marker: (name) => marker(deps.nonce, name),
      async anon() {
        const context = await deps.browser.newContext({ baseURL: deps.webBaseUrl });
        const page = await context.newPage();
        wirePage(page);
        return { context, page };
      },
      async freshUser(tag, o) {
        const email = freshIdentity(deps.nonce, tag);
        assertTestIdentity(email);
        const s = await sessions.signIn(email, { useCache: o?.useCache ?? false });
        wirePage(s.page);
        return s;
      },
      async returningUser(tag) {
        const email = stableIdentity(tag);
        assertTestIdentity(email);
        const s = await sessions.signIn(email, { useCache: true });
        wirePage(s.page);
        return s;
      },
    };

    try {
      await impl(ctx);
      res.outcome = step.expected === "green" ? "pass" : "ready-to-flip";
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e);
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
    results,
    passed,
  };
  await writeFile(path.join(deps.outDir, "report.json"), JSON.stringify(report, null, 2));
  return report;
}
