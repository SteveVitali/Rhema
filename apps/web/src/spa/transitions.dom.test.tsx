// @vitest-environment happy-dom
//
// NAVC.3 (REQ-NAVC-22 + REQ-NAVC-20's boot-lifecycle pin; REQ-NAVT-5's emission leg) — the
// StrictMode + real-router-hop transition suite. Unlike the per-surface dom tests (one leaf,
// one mount), every leg below drives `router.navigate` on the REAL routeTree and asserts the
// cross-leaf invariants the dormant client-nav machinery must hold:
//
//   • the page-session registry survives leaf unmounts as an IDLE keep-alive entry and is
//     re-acquired — same `data-page-session` (`<bootNonce>.<seq>`), zero re-init, zero twin
//     GETs inside the warm-return TTL (REQ-NAVC-18's `staleTime` leg exercised end-to-end);
//   • the mark-read twin refetches on the SAME round-trip (per-open parity with document nav);
//   • the `published`-flag wrong-projectId window is closed: between two project leaves the
//     chrome's pane-storage bind can never run under `rhema:panes:v2:<u>:<slug>`;
//   • listeners + intervals + the one EventSource balance — a leaf that leaves takes every
//     listener/timer/source with it (StrictMode double-mount included);
//   • `<html data-project>` follows the route; the per-document boot object is the same
//     instance across hops (REQ-NAVC-20).
//
// EventSource is faked (the ide-chrome.dom.test.tsx grammar verbatim) and localStorage is a
// real in-memory Storage so the pane-key legs read/write for real.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedLabelMaps } from "@rhema/ide";
import type { RunReportView } from "@rhema/findings-core";
import { createSpaRouter } from "./main.js";
import { getSpaBoot, type SpaBoot } from "./boot.js";
import { pageSessionRegistry } from "./page-sessions.js";
import type { BffProjectTwin, BffRunReportTwin } from "./queries.js";
import { restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG_A = "alpha-piece";
const SLUG_B = "beta-piece";
const RUN = "run_tl";

// ---- fixtures (the editor.dom.test.tsx + run-report.dom.test.tsx sets, trimmed) ------------------

const DOC_A = {
  draftId: "d_a7",
  draftN: 7,
  origin: "human_revision",
  state: "open",
  baseDraftId: "d_a6",
  baseDraftN: 6,
  markdown: "## Alpha draft\n\nBody text.",
  sha256: "sha_a",
  lock: null,
  findings: [],
  meters: { words: 4, readMin: 1 },
};

const pageTwin = (slug: string, projectId: string, draftId: string): BffProjectTwin =>
  ({
    project: { title: `The ${slug} project`, pill: "", slug, headDraftId: draftId, headDraftN: 7 },
    gates: [],
    decisions: [],
    approvalOverrides: {} as never,
    explainersDismissed: [],
    page: { slug, projectId, doc: { ...DOC_A, draftId } },
    paperTheme: "light",
    ide: { projectId, palette: "{}", paletteSearchUrl: `/p/${slug}/palette-search`, inboxCount: 0 },
  }) as unknown as BffProjectTwin;

const MAPS: FeedLabelMaps = {
  t: {
    "run.state_changed": "Run {to}",
    "usage.tick": "{spentCredits} cr spent",
    "card.meter": "{spentCredits} of {capCredits} cr",
  },
  enums: {},
};

const REPORT_VIEW: RunReportView = {
  runId: RUN,
  workflow: "review",
  state: "completed",
  estimateCredits: 840,
  spentCredits: 520,
  meteredCredits: 660,
  differences: [{ key: "committed", credits: 140 }],
  capCredits: 840,
  refundedCredits: 0,
  estimateRatio: 0.62,
  phases: [
    { key: "reading_the_piece", ordinal: 1, status: "done", seat: "editor", credits: 40, durationMs: 45_000, searches: 0, fetches: 0, subagentLabels: [] },
  ],
  seatSplit: [{ seat: "editor", credits: 220, share: 0.42 }],
  flags: [],
  claims: { checked: 56, verified: 50, creditsPerVerified: 10.4 },
  drivers: [],
  suggestedGuidance: [],
  rateTableVersion: 1,
} as RunReportView;

const FEED_SLICE = {
  runId: RUN,
  eventsUrl: `/p/${SLUG_A}/r/${RUN}/events`,
  density: "details" as const,
  rows: [],
  lastSeq: 41,
};

const reportTwin = (slug: string): BffRunReportTwin =>
  ({
    runReport: { slug, runId: RUN, report: { kind: "ok", report: REPORT_VIEW, projectSlug: slug } },
    project: { title: `The ${slug} project`, pill: "", slug },
    paperTheme: "light",
    ide: { projectId: `proj_${slug}`, inboxCount: 0, feed: FEED_SLICE },
  }) as unknown as BffRunReportTwin;

const NEW_PROJECT_TWIN = { newProject: { protocols: [], voices: [] } };

// ---- the fetch stub + the mount harness (the surface-test grammar) --------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch() {
  const gets: string[] = [];
  const posts: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (path === "/session") return jsonResponse(200, PRINCIPAL);
    if (path === "/bff/feed-labels") return jsonResponse(200, MAPS);
    if (init?.method === "POST") {
      posts.push(path);
      if (/^\/bff\/p\/[^/]+\/handoff$/.test(path)) {
        return jsonResponse(200, { ok: true, data: { handoff: null } });
      }
      return jsonResponse(200, { ok: true });
    }
    gets.push(url);
    if (path === `/bff/p/${SLUG_A}`) return jsonResponse(200, pageTwin(SLUG_A, "proj_alpha", "d_a7"));
    if (path === `/bff/p/${SLUG_B}`) return jsonResponse(200, pageTwin(SLUG_B, "proj_beta", "d_b3"));
    if (path === `/bff/p/${SLUG_A}/r/${RUN}`) return jsonResponse(200, reportTwin(SLUG_A));
    if (path === `/bff/p/${SLUG_B}/r/${RUN}`) return jsonResponse(200, reportTwin(SLUG_B));
    if (path === "/bff/app/new") return jsonResponse(200, NEW_PROJECT_TWIN);
    return jsonResponse(500, { error: `unstubbed_path:${path}` });
  });
  return { impl, gets, posts };
}

/** A controllable EventSource — every construct is recorded (ide-chrome.dom.test.tsx verbatim). */
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

/** Node ≥22's built-in experimental localStorage shadows happy-dom's — a real in-memory Storage. */
class MemStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

// ---- the listener/timer accounting (REQ-NAVC-22's "listener counts, timers" leg) ------------------

/** window/document event types the mounted leaves bind — the balance target. */
const TRACKED_TYPES = [
  "keydown",
  "hashchange", // NAVC.4 — the controller's native-fragment compensation listener (REQ-NAVM-10)
  "visibilitychange",
  "pagehide",
  "rhema:restore-point",
  "rhema:authorship",
  "rhema:ready",
] as const;

const listenerNet = new Map<string, number>();
const liveIntervals = new Set<unknown>();

function snapshotNet(): Map<string, number> {
  return new Map(listenerNet);
}
/** Net adds since `before` — only window/document targets matter (element listeners die with DOM). */
function netSince(before: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of listenerNet) {
    const d = v - (before.get(k) ?? 0);
    if (d !== 0 && !k.startsWith("node:")) out[k] = d;
  }
  return out;
}

/** happy-dom's window/document don't share EventTarget.prototype — spy the four methods directly. */
function spyListenersFor(target: Window | Document, name: "window" | "document"): void {
  const origAdd = target.addEventListener.bind(target);
  const origRemove = target.removeEventListener.bind(target);
  const bump = (type: string, d: 1 | -1) => {
    if (!(TRACKED_TYPES as readonly string[]).includes(type)) return;
    const k = `${name}:${type}`;
    listenerNet.set(k, (listenerNet.get(k) ?? 0) + d);
  };
  vi.spyOn(target, "addEventListener").mockImplementation(((type: string, l: unknown, o?: unknown) => {
    bump(type, 1);
    return origAdd(type, l as EventListener, o as boolean);
  }) as typeof target.addEventListener);
  vi.spyOn(target, "removeEventListener").mockImplementation(((type: string, l: unknown, o?: unknown) => {
    bump(type, -1);
    return origRemove(type, l as EventListener, o as boolean);
  }) as typeof target.removeEventListener);
}

let docNavSpy: ReturnType<typeof vi.fn>;
let storage: MemStorage;
let storageGet: ReturnType<typeof vi.spyOn>;
const mounted: Root[] = [];

const ALL_SPA = {
  "/p/$project": "spa",
  "/p/$project/r/$runId": "spa",
  "/app/new": "spa",
} as const;

function bootFor(): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces: { ...ALL_SPA } };
}

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router, queryClient } = createSpaRouter({
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
    await router.load();
  });
  // flush the query settle + chrome publish + feed bind
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  // REQ-ENG-1 — return only once the match has RESOLVED: `data-mounted` on <html> is the
  // router's settled-leaf stamp (REQ-NAVT-2). Bare post-mount selector reads raced that
  // commit — the BL-87 mount-settle flake class.
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, queryClient, rootEl };
}

async function nav(router: ReturnType<typeof createSpaRouter>["router"], to: string) {
  await act(async () => {
    await router.navigate({ to });
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  FakeEventSource.instances = [];
  listenerNet.clear();
  liveIntervals.clear();
  storage = new MemStorage();
  storageGet = vi.spyOn(storage, "getItem");
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("EventSource", FakeEventSource);
  spyListenersFor(window, "window");
  spyListenersFor(document, "document");
  const origSet = globalThis.setInterval;
  const origClear = globalThis.clearInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms?: number) => {
    const h = origSet(fn, ms);
    liveIntervals.add(h);
    return h;
  }) as typeof setInterval);
  vi.spyOn(globalThis, "clearInterval").mockImplementation(((h: unknown) => {
    liveIntervals.delete(h);
    return origClear(h as Parameters<typeof clearInterval>[0]);
  }) as typeof clearInterval);
  for (const attr of ["data-route", "data-mounted", "data-nav-count", "data-project"]) {
    document.documentElement.removeAttribute(attr);
  }
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  pageSessionRegistry.destroyAll();
  restoreDocumentNav();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const main = () => document.querySelector<HTMLElement>("[data-spa-root]");

describe("REQ-NAVC-22 — the page-session registry across real router hops", () => {
  it("data-page-session stamps <bootNonce>.<seq> on [data-page-root]; a keep-alive leave→return re-acquires the SAME entry with ZERO twin GETs", async () => {
    const f = makeFetch();
    const boot = bootFor();
    const { router } = await mountAt(`/p/${SLUG_A}`, boot, f.impl);

    const pageGets = () => f.gets.filter((u) => u.startsWith(`/bff/p/${SLUG_A}`) && !u.includes("view=tree"));
    const rootEl = await settled<HTMLElement>("[data-page-root]");
    expect(rootEl).not.toBeNull();
    const stamp = rootEl.getAttribute("data-page-session");
    // REQ-NAVT-5 — the `<bootNonce>.<seq>` shape, and it IS the registry entry's identity.
    expect(stamp).toMatch(/^\S+\.\d+$/);
    const entry = pageSessionRegistry.entry("d_a7");
    expect(entry?.sessionId).toBe(stamp);
    expect(entry?.refs).toBe(1); // StrictMode double-mount netted to exactly one hold
    expect(pageGets().length).toBe(1); // the loader's warm GET — nothing else re-fired it

    // Leave to an unframed leaf — the entry parks idle inside the keep-alive window and the
    // stamp leaves with the DOM (the root subtree is gone).
    await nav(router, "/app/new");
    expect(main()!.querySelector("[data-page-root]")).toBeNull();
    expect(pageSessionRegistry.entry("d_a7")?.refs).toBe(0);
    expect(pageSessionRegistry.entry("d_a7")?.sessionId).toBe(stamp); // still the SAME entry

    // Return inside the TTL — re-acquire returns the same entry (same sessionId, same
    // EditorState) and the warm query paints with ZERO new twin GETs (R10 + REQ-NAVC-18).
    await nav(router, `/p/${SLUG_A}`);
    const root2 = await settled<HTMLElement>("[data-page-root]");
    expect(root2.getAttribute("data-page-session")).toBe(stamp);
    expect(pageSessionRegistry.entry("d_a7")).toBe(entry);
    expect(entry?.refs).toBe(1);
    expect(pageGets().length).toBe(1);
    // the handoff POST did refire — it is a navigation-level side effect, not a cached read.
    expect(f.posts.filter((p) => p === `/bff/p/${SLUG_A}/handoff`).length).toBe(2);
    // and the whole round-trip stayed CLIENT-nav — no document navigation fired anywhere.
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("the mark-read twin keeps per-open parity — leave→return RE-fetches /bff/p/:slug/r/:runId (staleTime 0)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG_A}/r/${RUN}`, bootFor(), f.impl);
    const reads = () => f.gets.filter((u) => u.startsWith(`/bff/p/${SLUG_A}/r/${RUN}`)).length;
    // staleTime 0 ⇒ every mount refetches; StrictMode's double-mount may amplify the count —
    // the parity invariant is monotone: each landing adds GETs, none are ever absorbed by cache.
    const afterFirstLanding = reads();
    expect(afterFirstLanding).toBeGreaterThanOrEqual(1);
    await nav(router, "/app/new");
    await nav(router, `/p/${SLUG_A}/r/${RUN}`);
    // REQ-NAVC-18 compensate-by-refetch: every mount re-fires the twin GET — the read-receipt
    // leg (`markInboxRunRead` + view telemetry) sees a landing per open, document-nav parity.
    expect(reads()).toBeGreaterThan(afterFirstLanding);
  });

  it("a HELD entry is never destroyed by another leaf's lifecycle — cross-leaf registry invariants", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG_A}`, bootFor(), f.impl);
    const entryA = pageSessionRegistry.entry("d_a7");
    expect(entryA?.refs).toBe(1);
    // a cross-project hop mounts a SECOND registry entry — the first parks idle, not destroyed.
    await nav(router, `/p/${SLUG_B}`);
    const entryB = pageSessionRegistry.entry("d_b3");
    expect(entryB?.refs).toBe(1);
    expect(entryA?.refs).toBe(0);
    expect(pageSessionRegistry.entry("d_a7")).toBe(entryA);
    // each leaf's root carries ITS OWN session stamp — the seq distinguishes them.
    const stampA = entryA!.sessionId;
    const stampB = entryB!.sessionId;
    expect(stampA).not.toBe(stampB);
    expect((await settled("[data-page-root]")).getAttribute("data-page-session")).toBe(stampB);
    // return to A — its idle entry re-acquires (same stamp), B's parks.
    await nav(router, `/p/${SLUG_A}`);
    expect(pageSessionRegistry.entry("d_a7")?.refs).toBe(1);
    expect(pageSessionRegistry.entry("d_b3")?.refs).toBe(0);
    expect((await settled("[data-page-root]")).getAttribute("data-page-session")).toBe(stampA);
  });
});

describe("REQ-NAVC-22 — the chrome's published-flag wrong-projectId window", () => {
  it("cross-project hops never bind pane storage under the slug — only the published projectId", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG_A}`, bootFor(), f.impl);
    expect(main()!.querySelector("[data-ide]")).not.toBeNull();
    // A's bind read the REAL projectId — never the slug.
    expect(storageGet.mock.calls.map((c) => c[0])).toContain("rhema:panes:v2:u1:proj_alpha");

    storageGet.mockClear();
    await nav(router, `/p/${SLUG_B}`);
    // The closed window: between A's unpublish and B's publish `published` is false, so the
    // bind effect can't run under `data.projectId ?? slug` — `beta-piece` as a projectId would
    // have persisted a stray `rhema:panes:v2:u1:beta-piece` key (REQ-NAVC-22's F12(b) leg).
    const keys = storageGet.mock.calls.map((c) => c[0] as string);
    expect(keys).not.toContain("rhema:panes:v2:u1:beta-piece");
    expect(keys).not.toContain("rhema:authorship:v1:beta-piece");
    expect(keys).toContain("rhema:panes:v2:u1:proj_beta");
    expect(keys).toContain("rhema:authorship:v1:proj_beta");
  });
});

describe("REQ-NAVC-22 — listeners, timers, and the one EventSource", () => {
  it("a framed leaf's window/document listeners + intervals leave with it; StrictMode never doubles them", async () => {
    const f = makeFetch();
    const baseline = snapshotNet();
    const { router } = await mountAt(`/p/${SLUG_A}`, bootFor(), f.impl);
    // mounted: the leaf's chrome listeners bound — plus TWO per-boot singletons that live for
    // the document's whole lifetime by design: the router's scrollRestoration `pagehide` and
    // the QueryClient FocusManager's `visibilitychange` (both die at document unload only).
    const mountedNet = netSince(baseline);
    expect(mountedNet["window:keydown"]).toBeGreaterThanOrEqual(1);
    expect(mountedNet["window:hashchange"]).toBeGreaterThanOrEqual(1); // NAVC.4's fragment compensation
    expect(mountedNet["window:pagehide"]).toBeGreaterThanOrEqual(2); // page-mount + router's per-boot one
    expect(mountedNet["window:rhema:restore-point"]).toBeGreaterThanOrEqual(1);
    expect(mountedNet["window:rhema:authorship"]).toBeGreaterThanOrEqual(1);
    expect(mountedNet["document:visibilitychange"]).toBeGreaterThanOrEqual(1);
    const intervalsWhileMounted = liveIntervals.size;
    expect(intervalsWhileMounted).toBeGreaterThanOrEqual(1); // lock poll + dwell heartbeat
    // leave → every LEAF-owned listener and interval retracts; the two per-boot singletons are
    // the only survivors (named explicitly — anything else left over IS a leak).
    await nav(router, "/app/new");
    const afterLeave = netSince(baseline);
    expect(afterLeave).toEqual({
      "window:keydown": 1,        // R7SHELL.1a — the AppShell's `[`/`]` arm — per-boot lifetime
      "document:keydown": 1,      // R7SHELL.1a — the shell's toggle/listen seam — per-boot lifetime
      "window:pagehide": 1,       // the router's scrollRestoration — per-document lifetime
      "window:visibilitychange": 1, // the QueryClient FocusManager — per-boot lifetime
    });
    expect(liveIntervals.size).toBe(0);
    // return → the SAME set rebinds verbatim — a remount re-arms exactly the same counts,
    // never accumulating duplicates (the StrictMode + keep-alive remount pin).
    await nav(router, `/p/${SLUG_A}`);
    expect(netSince(baseline)).toEqual(mountedNet);
    expect(liveIntervals.size).toBe(intervalsWhileMounted);
  });

  it("SSE churn: exactly one live EventSource per feed publish; leaf swaps close before the next opens", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG_A}/r/${RUN}`, bootFor(), f.impl);
    const live = () => FakeEventSource.instances.filter((i) => !i.closed);
    expect(live().length).toBe(1); // StrictMode double-mount ⇒ still exactly one
    expect(live()[0]!.url).toContain("?after=41");

    // a leaf swap closes the tail before the next leaf settles — zero live in between hops.
    await nav(router, "/app/new");
    expect(live().length).toBe(0);
    expect(FakeEventSource.instances[0]!.closed).toBe(true);

    // return → the twin REFETCHES (mark-read parity) and republishes → a fresh source binds;
    // the count is 2 total, 1 live — never two tails for the same slice, never a leaked source.
    await nav(router, `/p/${SLUG_A}/r/${RUN}`);
    expect(live().length).toBe(1);
    expect(FakeEventSource.instances.length).toBe(2);
    expect(FakeEventSource.instances.filter((i) => i.closed).length).toBe(1);
  });
});

describe("REQ-NAVC-20 — per-document boot + the document-level stamps", () => {
  it("the boot object is the same instance across every client hop — one boot per document", async () => {
    const f = makeFetch();
    const boot = bootFor();
    const { router } = await mountAt(`/p/${SLUG_A}`, boot, f.impl);
    expect(getSpaBoot()).toBe(boot);
    await nav(router, "/app/new");
    expect(getSpaBoot()).toBe(boot);
    await nav(router, `/p/${SLUG_B}/r/${RUN}`);
    expect(getSpaBoot()).toBe(boot);
    // and the boot payload's surface map still drives verdicts — no per-nav re-boot.
    expect(getSpaBoot()?.surfaces["/p/$project"]).toBe("spa");
  });

  it("<html data-project> follows the committed route — a stale project stamp can't survive a cross-project hop", async () => {
    const f = makeFetch();
    // the served document's boot-time stamp (the shell emits it for /p/:slug documents).
    document.documentElement.setAttribute("data-project", SLUG_A);
    const { router } = await mountAt(`/p/${SLUG_A}`, bootFor(), f.impl);
    expect(document.documentElement.getAttribute("data-project")).toBe(SLUG_A);
    await nav(router, `/p/${SLUG_B}`);
    expect(document.documentElement.getAttribute("data-project")).toBe(SLUG_B);
    // outside /p/:slug space the attr leaves entirely — the SSR parity answer.
    await nav(router, "/app/new");
    expect(document.documentElement.getAttribute("data-project")).toBeNull();
  });
});
