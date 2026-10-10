// @vitest-environment happy-dom
//
// SPA.22 — the `run-report` surface's component contract (REQ-SEQ-9/12, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/4/11, REQ-BFF-12/16, REQ-DAT-1/4/5, REQ-UX-15/16; design/22 §2 `p.runReport` row +
// §3's stale-state note + note (f)'s live-feed slice). Mounted through the production router
// (memory history + a stub fetch): the SSR-verbatim report vocabulary (the shared `<RunReport>`
// article's Level-3 hooks + the `?advanced=1` Level-4 `data-usage-row`s), the §14.4 refund arms
// (eligible/POST-JSON/`{ok,redirect}` nav, the refused write's invalidate-and-re-read arm — never
// an invented notice), `aria-busy`/disabled pending controls, the LIVE-METER KEY PORT (the twin's
// `ide.feed` slice binds exactly one same-origin EventSource at `?after=<lastSeq>`; `usage.tick`
// patches the Timeline card's `[data-credits]` in place and is exempt from `["bff"]` invalidation,
// a non-tick event converges one debounced re-read — REQ-UX-15 verbatim), the gate-off SsrHandoff,
// and the REQ-TST-2 parity leg against `RunReportPage` under a PageDataContext provider. Component
// axe covers the mounted surface's interactive subset.
//
// REQ-VFY-9 disposition (design/27 §8's class map for this surface's SSR asserts): the document's
// HTML-string legs stay — server.test.ts P1.05 (Level-3/4 render, 404, steering redirects, the SSE
// proxy) + the DEF.4 refund block render the unchanged SSR path; the twin + the wantsJson write
// branches gained real BFF API asserts in the SPA.22 describe. The render-assert class moves to
// this file's mounted component legs; the form-POST legs map to the JSON-envelope mutation legs
// below; the live-meter's island assert (data-feed-events/last-seq) maps to the EventSource leg.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedLabelMaps } from "@rhema/ide";
import type { RunReportDto, TimelineDto } from "@rhema/api-client";
import type { RunReportView } from "@rhema/findings-core";
import { hooksForSurface } from "../dom-contract.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import type { BffRunReportTwin } from "./queries.js";
import { expectManifestEmission } from "./testkit.js";
import axe from "axe-core";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "the-politics-of-visibility";
const RUN = "run_tl";

// ---- fixtures — the SSR spec's report (server.test.ts P1.05 REPORT), verbatim --------------------

const REPORT_VIEW: RunReportView = {
  runId: RUN,
  workflow: "review",
  state: "completed",
  estimateCredits: 840,
  spentCredits: 520,
  // RPT.1 — metered(660) > charged(520) so the reconciliation arms (the metered line + the
  // reasoned difference list) render for real; "committed" is the modelled-debit label.
  meteredCredits: 660,
  differences: [{ key: "committed", credits: 140 }],
  capCredits: 840,
  refundedCredits: 0,
  estimateRatio: 0.62,
  phases: [
    { key: "reading_the_piece", ordinal: 1, status: "done", seat: "editor", credits: 40, durationMs: 45_000, searches: 0, fetches: 0, subagentLabels: [] },
    { key: "checking_claims", ordinal: 2, status: "done", seat: "verifier", credits: 300, durationMs: 120_000, searches: 12, fetches: 40, subagentLabels: [] },
    { key: "editors_letter", ordinal: 3, status: "done", seat: "editor", credits: 180, durationMs: 60_000, searches: 0, fetches: 0, subagentLabels: [] },
  ],
  seatSplit: [
    { seat: "verifier", credits: 300, share: 0.58 },
    { seat: "editor", credits: 220, share: 0.42 },
  ],
  flags: [{ key: "fact_check_dominated", sharePct: 58, phase: "checking_claims", count: 50 }],
  claims: { checked: 56, verified: 50, creditsPerVerified: 10.4 },
  drivers: [{ key: "phase_share", phase: "checking_claims", share: 0.58 }],
  suggestedGuidance: ["guidance.fact_check_dominated"],
  rateTableVersion: 1,
};

const ADVANCED_VIEW = {
  runId: RUN,
  rows: [
    {
      phase: "checking_claims",
      seat: "verifier",
      subagentLabel: null,
      model: "claude-sonnet-4-6",
      modelTier: "balanced",
      credits: 300,
      durationMs: null,
      searches: 12,
      fetches: 40,
      inputTokens: 4000,
      outputTokens: 900,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      providerRequestIds: ["req_1"],
    },
  ],
};

function reportDto(over: Partial<RunReportDto> = {}): RunReportDto {
  return {
    kind: "ok",
    report: REPORT_VIEW,
    projectSlug: SLUG,
    ...over,
  };
}

/** The Timeline pane's live run card — the `data-run-card="run_live"` + `[data-credits]` patch
 *  target `useIdeFeed` looks up (the meter the SSE tick updates in place). */
const LIVE_CARD = {
  runId: "run_live",
  state: "running" as const,
  phases: [
    { key: "reading_the_piece", ordinal: 1, status: "done" as const, credits: 40 },
    { key: "checking_claims", ordinal: 2, status: "running" as const },
  ],
  spentCredits: 40,
  capCredits: 840,
  provisional: true,
  creditFraction: 0.05,
  refundedCredits: 0,
  elapsedMs: 60_000,
  etaBand: null,
  done: 1,
  running: 1,
  total: 6,
  estimateCredits: 840,
  queuePosition: null,
  paused: false,
  waitingGate: null,
  deliverables: [],
  walkthrough: null,
  failureCode: null,
  resumable: false,
  queuedNotes: 0,
  decisions: [],
  actions: ["pause" as const, "stop" as const, "note" as const, "live_feed" as const],
  deliveryLabel: null,
};

const TIMELINE_LIVE: TimelineDto = {
  project: { id: "proj_pv", slug: SLUG, title: "The Politics of Visibility" },
  state: {
    key: "edited_by_you",
    pill: "Edited by you",
    overlay: "running",
    suggested: { action: "revise_using_edits", label: "Revise using your edits" },
  },
  nextStep: { verb: "revise", label: "Revise using your edits", estimateCredits: 1240, headDraftN: 2 },
  rounds: [
    {
      n: 1,
      anchor: { draftId: "d_v1", n: 1, origin: "imported" },
      producedN: null,
      parts: [{ kind: "run" as const, workflow: "review" }],
      runs: [
        {
          runId: "run_live",
          workflow: "review",
          state: "running",
          createdAt: "2026-09-01T12:00:00Z",
          subjectN: 1,
          producedN: null,
          card: LIVE_CARD,
        },
      ],
    },
  ],
  ungrouped: [],
  originChip: null,
};

const FEED_SLICE = {
  runId: "run_live",
  eventsUrl: `/p/${SLUG}/r/run_live/events`,
  density: "details" as const,
  rows: [],
  lastSeq: 41,
};

const MAPS: FeedLabelMaps = {
  t: {
    "run.state_changed": "Run {to}",
    "step.started": "{phase} started",
    "step.finished": "{phase} finished — {credits} cr",
    "usage.tick": "{spentCredits} cr spent",
    "cost.final": "{spentCredits} cr final",
    "card.meter": "{spentCredits} of {capCredits} cr",
    "card.meterProvisional": "≈ {spentCredits} of {capCredits} cr",
  },
  enums: { phase: { checking_claims: "Checking claims", reading_the_piece: "Reading the piece" } },
};

function twinFor(over: Partial<BffRunReportTwin> = {}): BffRunReportTwin {
  return {
    runReport: { slug: SLUG, runId: RUN, report: reportDto() },
    project: { title: "The Politics of Visibility", pill: "", slug: SLUG },
    paperTheme: "light",
    ide: { projectId: "proj_pv", inboxCount: 0 },
    ...over,
  };
}

// ---- the mount substrate (dossier.dom.test.tsx's harness) ----------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  /** the twin read — may be a function of the request query (`?advanced=1` selects Level 4). */
  twin?: BffRunReportTwin | null | ((query: string) => BffRunReportTwin | null);
  mutations?: Record<string, { status?: number; body: unknown } | Promise<Response>>;
}

interface RecordedPost {
  url: string;
  json: Record<string, unknown> | null;
}

function makeFetch(opts: FetchOpts = {}) {
  const posts: RecordedPost[] = [];
  const gets: string[] = [];
  let reportReads = 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const [path, query] = url.split("?", 2) as [string, string?];
    if (path === "/session") return jsonResponse(200, PRINCIPAL);
    if (path === "/bff/feed-labels") return jsonResponse(200, MAPS);
    if (init?.method === "POST") {
      posts.push({ url: path, json: init.body ? JSON.parse(String(init.body)) : null });
      const mut = opts.mutations?.[path];
      if (mut instanceof Promise) return mut;
      if (mut != null) return jsonResponse(mut.status ?? 200, mut.body);
      return jsonResponse(200, { ok: true });
    }
    gets.push(url);
    if (path === `/bff/p/${SLUG}/r/${RUN}`) {
      reportReads += 1;
      const twin = typeof opts.twin === "function" ? opts.twin(query ?? "") : opts.twin;
      if (twin === null) return jsonResponse(404, { error: "not_found" });
      const t = twin ?? twinFor();
      // The twin's `?advanced=1` read carries advancedView — mirror the server's split read.
      return jsonResponse(
        200,
        (query ?? "").includes("advanced=1")
          ? { ...t, runReport: { ...t.runReport, report: { ...t.runReport.report, advancedView: ADVANCED_VIEW } } }
          : t,
      );
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
  return { impl, posts, gets, reads: () => reportReads };
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_REPORT = { "/p/$project/r/$runId": "spa" } as const;

/** A controllable EventSource — the live-meter leg emits frames; every construct is recorded
 *  (the ide-chrome.dom.test.tsx fake verbatim). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  emit(type: string, data: unknown): void {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  close(): void {
    this.closed = true;
  }
}

let assignSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubGlobal("EventSource", FakeEventSource);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const root = createRoot(rootEl);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await router.load();
  });
  // flush the query settle + the chrome publish + the feed bind
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { router, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

/** Submit one form inside an act (the dossier.dom.test.tsx helper verbatim). */
async function submit(form: Element, submitter?: Element) {
  await act(async () => {
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (submitter != null) Object.defineProperty(ev, "submitter", { value: submitter });
    form.dispatchEvent(ev);
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
  vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /p/:slug/r/:runId ---------------------------------------------------------------------------

describe("GET /p/:slug/r/:runId mounted (SPA.22)", () => {
  const BOOT = bootFor(SPA_REPORT);

  it("renders the SSR-verbatim report vocabulary — estimate/metered lines, phase bars, seats, flags, drivers, claims, rate-table link", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    const root = el()!;
    for (const hook of [
      "data-run-report",
      "data-estimate-line",
      "data-metered-line",
      "data-differences",
      "data-difference",
      "data-phase-bars",
      "data-report-phase",
      "data-seat-split",
      "data-seat",
      "data-flags",
      "data-flag",
      "data-drivers",
      "data-driver",
      "data-claims",
      "data-suggested-guidance",
      "data-guidance",
      "data-rate-table-link",
      "data-report-advanced",
    ]) {
      expect(root.querySelector(`[${hook}]`), `missing ${hook}`).not.toBeNull();
    }
    // three phase rows, each with a real duration (never "0 min")
    expect(root.querySelectorAll("[data-report-phase]").length).toBe(3);
    expect(root.textContent).not.toMatch(/·\s*0\s*min\b/);
    // the Advanced affordance is the SSR's identical ?advanced=1 link (Level 4 lazy-loads).
    const advLink = root.querySelector<HTMLAnchorElement>(`a[href="/p/${SLUG}/r/${RUN}?advanced=1"]`);
    expect(advLink).not.toBeNull();
    // the manifest's fixtured hooks (manifest-driven, never an ad-hoc selector list).
    const hooks = hooksForSurface("run-report").filter((e) =>
      [
        "data-run-report",
        "data-estimate-line",
        "data-metered-line",
        "data-differences",
        "data-difference",
        "data-phase-bars",
        "data-report-phase",
        "data-phase-status",
        "data-seat-split",
        "data-seat",
        "data-flags",
        "data-flag",
        "data-drivers",
        "data-driver",
        "data-claims",
        "data-suggested-guidance",
        "data-guidance",
        "data-rate-table-link",
        "data-report-advanced",
      ].includes(e.hook),
    );
    expectManifestEmission(root, hooks);
  });

  it("the ?advanced=1 read rides the twin GET verbatim and renders the Level-4 usage rows", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/r/${RUN}?advanced=1`, BOOT, f.impl);
    // the server-owned key forwards onto the twin — the leaf never computes the Level-4 read.
    expect(f.gets.some((u) => u === `/bff/p/${SLUG}/r/${RUN}?advanced=1`)).toBe(true);
    const root = el()!;
    expect(root.querySelectorAll("[data-usage-row]").length).toBe(1);
    expect(root.textContent).toContain("4,000");
  });

  it("paints the pending shell while the twin is in flight", async () => {
    let release: (r: Response) => void = () => undefined;
    const gate = new Promise<Response>((res) => (release = res));
    const impl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.split("?")[0]!;
      if (path === "/session") return jsonResponse(200, PRINCIPAL);
      if (path === "/bff/feed-labels") return jsonResponse(200, MAPS);
      if (path === `/bff/p/${SLUG}/r/${RUN}`) return gate;
      return jsonResponse(500, { error: "unstubbed_path" });
    });
    vi.stubGlobal("fetch", impl);
    const rootEl = document.createElement("div");
    rootEl.setAttribute("data-spa-root", "");
    document.body.appendChild(rootEl);
    const { router } = createSpaRouter({
      boot: BOOT,
      history: createMemoryHistory({ initialEntries: [`/p/${SLUG}/r/${RUN}`] }),
    });
    const root = createRoot(rootEl);
    mounted.push(root);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <RouterProvider router={router} />
          </StrictMode>,
        );
        void router.load();
      });
      // real timers — the router's defaultPendingMs (~1s) must elapse before the skeleton commits.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1200));
      });
      // REQ-UX-16: the pending leg is the designed skeleton, never blank.
      expect(rootEl.querySelector('[data-ide-state="loading"], [data-spa-surface]')).not.toBeNull();
      release(jsonResponse(200, twinFor()));
      await act(async () => {
        await router.load();
      });
      expect(rootEl.querySelector("[data-run-report]")).not.toBeNull();
    } finally {
      release(jsonResponse(200, twinFor())); // idempotent — never leaves a dangling load
    }
  });

  it("the eligible refund form posts the JSON envelope and the {ok,redirect} lands the #report nav", async () => {
    const f = makeFetch({
      twin: twinFor({
        runReport: {
          slug: SLUG,
          runId: RUN,
          report: reportDto({ refundWindow: { state: "eligible", credits: 160 } }),
        },
      }),
      mutations: {
        [`/p/${SLUG}/r/${RUN}/refund`]: {
          body: { ok: true, redirect: `/p/${SLUG}/r/${RUN}#report` },
        },
      },
    });
    const { router } = await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/r/${RUN}/refund"]`)!;
    expect(form.getAttribute("data-refund-form")).toBe("true");
    expect(el()!.textContent).toContain("Get 160 cr back");
    await submit(form);
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/r/${RUN}/refund`);
    expect(post).not.toBeNull();
    // the envelope's redirect is the 302's identical twin — an in-router nav, never document.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${SLUG}/r/${RUN}`));
    await waitFor(() => expect(router.state.location.hash).toBe("report"));
    expect(assignSpy).not.toHaveBeenCalled();
    // server truth re-read off the invalidate.
    await waitFor(() => expect(f.reads()).toBeGreaterThanOrEqual(2));
  });

  it("a refused refund (409 window closed) is the SSR's silent stale→re-render — invalidate, no invented notice", async () => {
    // The twin reads `f.posts` lazily — the eligible block holds until the POST lands, then the
    // post-decision re-read carries the denied block (the report's own answer). (A plain
    // call-count flip would fire on `useQuery`'s mount refetch, before the form ever renders.)
    const f = makeFetch({
      twin: () =>
        twinFor({
          runReport: {
            slug: SLUG,
            runId: RUN,
            report: reportDto({
              refundWindow:
                f.posts.length > 0
                  ? { state: "denied", credits: 160 }
                  : { state: "eligible", credits: 160 },
            }),
          },
        }),
      mutations: {
        [`/p/${SLUG}/r/${RUN}/refund`]: {
          status: 409,
          body: { error: "window_expired" },
        },
      },
    });
    await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/r/${RUN}/refund"]`)!;
    await submit(form);
    // the 4xx arm: the twin re-reads and the fresh block is the answer — no role=alert, no flash.
    await waitFor(() => expect(f.reads()).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(el()!.querySelector('[data-refund-state="denied"]')).not.toBeNull(),
    );
    expect(el()!.querySelector('[role="alert"]')).toBeNull();
    expect(el()!.querySelector("[data-refund-form]")).toBeNull();
  });

  for (const [state, copy] of [
    ["refunded", "Refunded 160 cr."],
    ["pending_review", "Refund request for 160 cr sent for review."],
    ["denied", "The refund request was declined."],
  ] as const) {
    it(`the ${state} block renders its recorded verdict verbatim, never a live control`, async () => {
      const f = makeFetch({
        twin: twinFor({
          runReport: {
            slug: SLUG,
            runId: RUN,
            report: reportDto({ refundWindow: { state, credits: 160 } }),
          },
        }),
      });
      await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
      const root = el()!;
      expect(root.querySelector(`[data-refund-state="${state}"]`)?.textContent).toBe(copy);
      expect(root.querySelector("[data-refund-form]")).toBeNull();
    });
  }

  it("REQ-UX-16 — the refund write marks its form aria-busy + disables controls until settle", async () => {
    let release: (r: Response) => void = () => undefined;
    const gate = new Promise<Response>((res) => (release = res));
    const f = makeFetch({
      twin: twinFor({
        runReport: {
          slug: SLUG,
          runId: RUN,
          report: reportDto({ refundWindow: { state: "eligible", credits: 160 } }),
        },
      }),
      mutations: { [`/p/${SLUG}/r/${RUN}/refund`]: gate },
    });
    await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/r/${RUN}/refund"]`)!;
    const btn = form.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      const ev = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(ev);
    });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    await act(async () => {
      release(jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/r/${RUN}#report` }));
    });
    await act(async () => {});
    // the nav remounts off server truth; the settled form is live again.
    await waitFor(() => {
      const settled = el()!.querySelector(`form[action="/p/${SLUG}/r/${RUN}/refund"]`);
      expect(settled?.getAttribute("aria-busy") ?? null).toBeNull();
      expect(settled?.querySelector("button")?.disabled).toBe(false);
    });
  });

  it("a worked-example report (§15.3 the seeded Showcase run) renders the banner verbatim", async () => {
    const f = makeFetch({
      twin: twinFor({
        runReport: {
          slug: SLUG,
          runId: RUN,
          report: reportDto({ report: { ...REPORT_VIEW, workedExample: true } }),
        },
      }),
    });
    await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    const banner = el()!.querySelector("[data-worked-example]");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Worked example");
  });

  it("an unflipped verdict hands the document back to the server", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/r/${RUN}`, bootFor({ "/p/$project/r/$runId": "ssr" }), f.impl);
    expect(assignSpy).toHaveBeenCalledWith(`/p/${SLUG}/r/${RUN}`);
  });

  it("the twin's live-feed slice binds exactly one EventSource at ?after=<lastSeq> — usage.tick patches the meter, non-ticks converge one re-read (REQ-UX-15)", async () => {
    const f = makeFetch({
      twin: twinFor({
        ide: {
          projectId: "proj_pv",
          inboxCount: 0,
          activeRun: { runId: "run_live", state: "running" },
          timelineView: TIMELINE_LIVE,
          feed: FEED_SLICE,
        },
      }),
    });
    const { router } = await mountAt(`/p/${SLUG}/r/${RUN}`, BOOT, f.impl);
    // ONE same-origin source, resumed at the replayed lastSeq — never a JSON poll.
    const live = () => FakeEventSource.instances.filter((i) => !i.closed);
    expect(live().length).toBe(1);
    const src = live()[0]!;
    expect(src.url).toBe(`/p/${SLUG}/r/run_live/events?after=41`);
    // the run card is in the chrome's Timeline pane — the tick patches [data-credits] in place.
    const card = document.querySelector(`[data-run-card="run_live"]`);
    expect(card).not.toBeNull();
    const creditsEl = () => card!.querySelector("[data-credits]")?.textContent;
    const readsBefore = f.reads();
    act(() => {
      src.emit("usage.tick", {
        type: "usage.tick",
        seq: 42,
        payload: { spentCredits: 55, capCredits: 840, provisional: true },
      });
    });
    expect(creditsEl()).toContain("55");
    // the tick's truth landed on the card — no bff refetch per tick (the storm REQ-UX-15 bans).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    expect(f.reads()).toBe(readsBefore);
    // a non-tick event schedules ONE debounced ["bff"] invalidation → the twin re-reads.
    act(() => {
      src.emit("step.finished", {
        type: "step.finished",
        seq: 43,
        payload: { phase: "checking_claims", credits: 300 },
      });
    });
    await waitFor(() => expect(f.reads()).toBeGreaterThan(readsBefore));
    // navigating away (unmount) closes the source — at most one live EventSource ever.
    await act(async () => {
      router.history.push(`/p/${SLUG}`);
      await router.load();
    });
    expect(live().length).toBe(0);
  });

  it("component axe — the report's interactive subset (REQ-VFY-6)", async () => {
    const f = makeFetch({
      twin: twinFor({
        runReport: {
          slug: SLUG,
          runId: RUN,
          report: reportDto({ refundWindow: { state: "eligible", credits: 160 } }),
        },
      }),
    });
    await mountAt(`/p/${SLUG}/r/${RUN}?advanced=1`, BOOT, f.impl);
    // Whole-root run (the Timeline/Desk pane bodies mount in the chrome, outside
    // `[data-spa-surface]`). `aria-required-children` is disabled for the same reason the
    // ide-chrome/dossier tests disable it: happy-dom has no layout engine, so CSS-collapsed role
    // containers stay "visible" to the rule; the journey suite's real-browser axe is the
    // authoritative gate for that class.
    const results = await axe.run(el()! as axe.ElementContext, {
      rules: {
        "color-contrast": { enabled: false },
        "aria-required-children": { enabled: false },
      },
    });
    expect(
      results.violations.map((v) => v.id),
      `axe violations: ${results.violations.map((v) => `${v.id} (${v.nodes.length} node(s))`).join(", ")}`,
    ).toEqual([]);
  });
});

// ---- REQ-TST-2 — the SSR/SPA parity leg ----------------------------------------------------------

