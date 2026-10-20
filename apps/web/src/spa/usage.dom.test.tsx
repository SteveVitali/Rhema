// @vitest-environment happy-dom
//
// SPA.10 — the `usage` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-9/11/17, REQ-DAT-4/6/12, REQ-UX-6). Mounted through the production router (memory
// history + a stub fetch) at both routeIds — `/usage` and `/p/:slug/usage` — plus the
// degrade/empty/404 legs as direct mounts. The REQ-TST-2 parity leg renders the SSR twins under
// a `PageDataContext` provider and asserts every usage manifest hook the SSR emits is emitted by
// the React twin — verbatim DOM vocabulary, no invented hooks. `/usage.csv` stays an `<a href>`
// document nav (REQ-BFF-17 — it is never fetched); the axe leg covers the surface's interactive
// elements (nav + CSV + run-report links).

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageAccountDto, UsageDto, UsageProjectDto } from "@rhema/api-client";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffProjectUsageTwin, BffUsageTwin } from "./queries.js";
import { axeCheck, restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "acme";

// The fixtures mirror the retained SSR spec's (billing-pages.test.ts) shapes exactly — the
// parity assertions compare the two renderers on the SAME data.
const ACCOUNT: UsageAccountDto = {
  level0: { spendableCredits: 3100, heldCredits: 120, plan: "writer", trialState: null, trialDaysLeft: null },
  buckets: [
    { bucket: "included", available: 2000, held: 100, expiresAt: "2026-10-01T00:00:00Z" },
    { bucket: "topup", available: 1100, held: 20, expiresAt: "2027-06-01T00:00:00Z" },
  ],
  monthToDateCredits: 412,
  includedRemaining: 2000,
  includedMonthly: 2500,
  includedRolloverCap: 5000,
  periodStart: "2026-09-01T00:00:00Z",
  periodEnd: "2026-10-01T00:00:00Z",
  warnings: ["Included credits reset in 7 days — 500 over the rollover cap will expire."],
  nextExpiry: { bucket: "included", credits: 500, at: "2026-10-01T00:00:00Z" } };

const USAGE: UsageDto = {
  spendableCredits: 3100,
  heldCredits: 120,
  runs: [
    {
      runId: "run_1",
      projectId: "proj_a",
      workflow: "review",
      state: "delivered",
      estimateCredits: 60,
      capCredits: 90,
      spentCredits: 55,
      createdAt: "2026-09-20T10:00:00Z",
      endedAt: "2026-09-20T10:12:00Z" },
  ] };

const PROJECT_USAGE: UsageProjectDto = {
  projectId: "proj_a",
  projectName: "Alpha Essay",
  totalCredits: 88,
  runs: [
    { runId: "run_1", at: "2026-09-20T10:00:00Z", workflow: "review", state: "delivered", credits: 55, estimateCredits: 60, capCredits: 90 },
    { runId: "run_2", at: "2026-09-21T10:00:00Z", workflow: "chat", state: "delivered", credits: 33, estimateCredits: 30, capCredits: 45 },
  ] };

function usageTwin(over?: Partial<BffUsageTwin>): BffUsageTwin {
  return { usage: USAGE, account: ACCOUNT, ...over };
}
function projectTwin(): BffProjectUsageTwin {
  return { usageProject: { ...PROJECT_USAGE, slug: SLUG } };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

/** The fetch stub — every same-origin path the mount can reach is named; anything else 500s so a
 *  surprise read fails loudly rather than fabricating data. */
function makeFetch(opts: {
  usage?: BffUsageTwin;
  project?: BffProjectUsageTwin;
  projectStatus?: number;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/usage") return jsonResponse(200, opts.usage ?? usageTwin());
    if (url === `/bff/p/${SLUG}/usage`) {
      return opts.projectStatus != null && opts.projectStatus !== 200
        ? jsonResponse(opts.projectStatus, { error: "not_found" })
        : jsonResponse(200, opts.project ?? projectTwin());
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
  vi.stubGlobal("fetch", fetchImpl);
  const el = document.createElement("div");
  el.setAttribute("data-spa-root", "");
  document.body.appendChild(el);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }) });
  const root = createRoot(el);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await router.load();
  });
  // REQ-ENG-1 — return only once the match has RESOLVED: `data-mounted` on <html> is the
  // router's settled-leaf stamp (REQ-NAVT-2). Bare post-mount selector reads raced that
  // commit — the BL-87 mount-settle flake class.
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, queryClient, el };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  restoreDocumentNav();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("GET /usage mounted (REQ-SEQ-9 — the flipped surface)", () => {
  const BOOT = bootFor({ "/usage": "spa", "/p/$project/usage": "spa" });

  it("renders the level-1 glance + account sections and stamps the settle pair", async () => {
    await mountAt("/usage", BOOT, makeFetch());
    expect(document.documentElement.getAttribute("data-route")).toBe("/usage");
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe("Usage");
    expect(document.title).toBe("Usage · Rhēma");
    // The manifest's usage vocabulary, asserted hook-by-hook (also gives every hook its
    // "asserted" leg of the contract gate).
    for (const hook of [
      "data-spa-surface",
      "data-usage-account",
      "data-usage-plan",
      "data-usage-mtd",
      "data-usage-buckets",
      "data-usage-warnings",
      "data-usage-next-expiry",
      "data-usage-csv",
      "data-usage-balance",
      "data-usage-runs",
    ]) {
      expect(main.querySelector(`[${hook}]`), hook).not.toBeNull();
    }
    expect(main.querySelectorAll("[data-usage-bucket]").length).toBe(2);
    expect(main.querySelectorAll("[data-usage-warning]").length).toBe(1);
    expect(main.querySelectorAll("[data-usage-run]").length).toBe(1);
    // Content parity — the same figures the SSR spec asserts on this fixture.
    expect(main.textContent).toContain("412 cr this period");
    expect(main.textContent).toContain("3,100");
    expect(main.querySelector('[data-usage-run="run_1"]')).not.toBeNull();
    // REQ-BFF-17 — the CSV export is a plain document-nav anchor, never a fetch target.
    const csv = main.querySelector<HTMLAnchorElement>("[data-usage-csv]");
    expect(csv?.getAttribute("href")).toBe("/usage.csv");
    expect(csv?.textContent).toBe(COPY.usage.csvCta);
  });

  it("component axe on the mounted surface (REQ-VFY-6)", async () => {
    await mountAt("/usage", BOOT, makeFetch());
    await axeCheck((await settled("[data-spa-surface]")));
  });

  it("beats the SSR dwell heartbeat to /a/dwell — REQ-BETA-10's React-effect port", async () => {
    await mountAt("/usage", BOOT, makeFetch());
    const beacon = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    vi.useFakeTimers();
    try {
      // t0 is the mount instant — 5 s of dwell, then a hide beat (the <4 s guard would drop it
      // if the interval semantics had drifted).
      vi.setSystemTime(Date.now() + 5000);
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      expect(beacon).toHaveBeenCalledTimes(1);
      const [url, blob] = beacon.mock.calls[0]!;
      expect(url).toBe("/a/dwell");
      const body = JSON.parse(await (blob as Blob).text()) as { surface: string; ms: number };
      expect(body.surface).toBe("usage");
      expect(body.ms).toBeGreaterThanOrEqual(4000);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      vi.useRealTimers();
      beacon.mockRestore();
    }
  });


  it("a degraded seam renders the surviving half only — never a fabricated zero (REQ-BFF-9)", async () => {
    await mountAt("/usage", BOOT, makeFetch({ usage: usageTwin({ account: null }) }));
    const main = el()!;
    expect(main.querySelector("[data-usage-account]")).toBeNull();
    expect(main.querySelector("[data-usage-balance]")).not.toBeNull();
  });

  it("both seams degraded still renders the honest chrome (h1 + footer) — no invented figures", async () => {
    await mountAt("/usage", BOOT, makeFetch({ usage: { usage: null, account: null } }));
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe("Usage");
    expect(main.querySelector("[data-usage-balance]")).toBeNull();
    expect(main.querySelector("[data-usage-account]")).toBeNull();
  });

  it("empty runs render the empty state — no table", async () => {
    await mountAt("/usage", BOOT, makeFetch({ usage: usageTwin({ usage: { ...USAGE, runs: [] } }) }));
    const main = el()!;
    expect(main.textContent).toContain(COPY.usage.runEmpty);
    expect(main.querySelector("[data-usage-runs]")).toBeNull();
    expect(main.querySelector("[data-usage-balance]")).not.toBeNull();
  });

  it("an unflipped verdict hands the document back to the server — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt("/usage", bootFor({ "/usage": "ssr" }), f);
    expect(docNavSpy).toHaveBeenCalledWith("/usage");
    expect(el()?.querySelector("[data-usage-balance]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/usage")).toBe(false);
  });
});

describe("GET /p/:slug/usage mounted (REQ-SEQ-9 — the level-2 rollup)", () => {
  const BOOT = bootFor({ "/usage": "spa", "/p/$project/usage": "spa" });

  it("renders the project total + run rows with report links and the back link", async () => {
    await mountAt(`/p/${SLUG}/usage`, BOOT, makeFetch());
    expect(document.documentElement.getAttribute("data-route")).toBe("/p/$project/usage");
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe("Usage — Alpha Essay");
    expect(main.querySelector("[data-project-usage-total]")?.textContent).toBe("88 cr across 2 runs");
    expect(main.querySelector("[data-project-usage-runs]")).not.toBeNull();
    expect(main.querySelector('[data-project-usage-run="run_1"]')).not.toBeNull();
    const report = main.querySelector<HTMLAnchorElement>(
      '[data-project-usage-run="run_1"] a',
    );
    expect(report?.getAttribute("href")).toBe("/app/usage/r/run_1");
    expect(report?.textContent).toBe(COPY.projectUsage.runReportCta);
    const back = main.querySelector<HTMLAnchorElement>("nav a");
    expect(back?.getAttribute("href")).toBe(`/p/${SLUG}`);
    expect(back?.textContent).toBe(COPY.projectUsage.backToProject);
    await axeCheck((await settled("[data-spa-surface]")));
  });


  it("the query key carries the slug — the browser key grammar is [bff, p, slug, usage]", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/usage`, BOOT, f);
    expect(f.mock.calls.some(([u]) => String(u) === `/bff/p/${SLUG}/usage`)).toBe(true);
  });


  it("empty runs render the empty state", async () => {
    const f = makeFetch({
      project: { usageProject: { ...PROJECT_USAGE, totalCredits: 0, runs: [], slug: SLUG } } });
    await mountAt(`/p/${SLUG}/usage`, BOOT, f);
    const main = el()!;
    expect(main.textContent).toContain(COPY.projectUsage.runEmpty);
    expect(main.querySelector("[data-project-usage-runs]")).toBeNull();
  });

  it("an unflipped verdict hands off — and the leaf never spends its BFF read", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/usage`, bootFor({ "/usage": "spa", "/p/$project/usage": "ssr" }), f);
    expect(docNavSpy).toHaveBeenCalledWith(`/p/${SLUG}/usage`);
    expect(f.mock.calls.some(([u]) => String(u) === `/bff/p/${SLUG}/usage`)).toBe(false);
  });
});
