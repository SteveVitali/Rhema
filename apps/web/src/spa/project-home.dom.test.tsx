// @vitest-environment happy-dom
//
// SPA.15 — the `project-home` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/9/11, REQ-DAT-4/12, REQ-UX-6/16; design/22 §2 `app` row; §5.2). Mounted through the
// production router (memory history + a stub fetch) at `/app`: the controls bar, the Voice chips,
// the attention/voice groups, the `?q=` search section, the `?archived=1`/`?deleted=1` sections,
// the delegated JSON POSTs (grouping + the row-menu actions + restore — the forms keep SSR markup;
// the SPA intercepts and invalidates the twin), the GET forms' in-router navigation, the REQ-UX-16
// `aria-busy`/disabled in-flight affordance, the REQ-TST-2 parity leg against `ProjectsPage` under
// PageDataContext on the SAME fixture, the designed error state, the SsrHandoff/no-BFF leg, and
// component axe on the mounted surface.
//
// The twin ships RAW DTOs — the parity leg derives the SSR's `PageData["home"]` through the SAME
// `state-map.ts` helpers the surface uses, so both renderers walk identical facts.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRow, ProjectSearchHitDto, VoiceListRowDto } from "@rhema/api-client";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffAppHomeTwin } from "./queries.js";
import { axeCheck, restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

// ---- fixtures — every conditional branch populated ------------------------------------------------

const VOICE_STATUS = { pill: { label: "Ready", tone: "good" as const } };
const VOICE: VoiceListRowDto = {
  personaId: "pers_1",
  name: "Lead",
  byline: null,
  mode: "self",
  kind: "leaf",
  group: "your_voices",
  readOnly: false,
  sampleCount: 2,
  sources: [],
  projectCount: 1,
  lastBuiltAt: null,
  tier: null,
  members: [],
  registers: [],
  status: { state: "resting", pill: VOICE_STATUS.pill, action: "none", detail: null } };

const STATE_QUIET = { key: "draft" as const, pill: "Draft", overlay: null, suggested: { action: "none", label: null } };
const STATE_NEEDS = {
  key: "outlined" as const,
  pill: "Gate waiting",
  overlay: "needs_you" as const,
  suggested: { action: "review", label: "Review" } };
const STATE_RUNNING = {
  key: "in_review" as const,
  pill: "Reviewing",
  overlay: "running" as const,
  suggested: { action: "watch", label: "Watch" } };
const STATE_READY = {
  key: "reviewed" as const,
  pill: "Reviewed",
  overlay: null,
  suggested: { action: "revise", label: "Revise" } };

const ROW_NEEDS: ProjectRow = {
  id: "proj_needs",
  slug: "alpha-essay",
  title: "Alpha Essay",
  state: STATE_NEEDS,
  headDraftId: "d1",
  headDraftN: 3,
  group: "needs_you",
  needsYouDeadlineAt: "2026-10-10T00:00:00Z",
  protocolId: "proto_1",
  statusLine: "a gate is waiting on you",
  voice: { personaId: "pers_1", name: "Lead", status: { state: "resting", pill: VOICE_STATUS.pill, action: "none", detail: null } } };
const ROW_RUNNING: ProjectRow = {
  id: "proj_run",
  slug: "beta-piece",
  title: "Beta Piece",
  state: STATE_RUNNING,
  group: "running",
  activeRun: { runId: "run_1", state: "running" },
  protocolId: "proto_1",
  statusLine: "a review is running" };
const ROW_READY: ProjectRow = {
  id: "proj_ready",
  slug: "gamma-essay",
  title: "Gamma Essay",
  state: STATE_READY,
  headDraftId: "d2",
  headDraftN: 1,
  group: "ready_to_read",
  protocolId: "proto_2" };
const ROW_QUIET: ProjectRow = {
  id: "proj_quiet",
  slug: "delta-notes",
  title: "Delta Notes",
  state: STATE_QUIET,
  group: "quiet",
  protocolId: "proto_2" };
const ROW_ARCHIVED: ProjectRow = {
  ...ROW_QUIET,
  id: "proj_arch",
  slug: "epsilon-old",
  title: "Epsilon Old",
  archivedAt: "2026-09-01T00:00:00Z" };
const ROW_DELETED: ProjectRow = {
  ...ROW_QUIET,
  id: "proj_del",
  slug: "zeta-gone",
  title: "Zeta Gone",
  deletedAt: "2026-10-01T00:00:00Z" };

const ROWS: ProjectRow[] = [ROW_NEEDS, ROW_RUNNING, ROW_READY, ROW_QUIET, ROW_ARCHIVED];
const PROTOCOLS = [
  { id: "proto_1", name: "Standard", tagline: "", holdYouTo: "", venueBar: { kind: "x", table: [] } },
  { id: "proto_2", name: "Rigorous", tagline: "", holdYouTo: "", venueBar: { kind: "x", table: [] } },
];
const BAL = { spendableCredits: 12_000, heldCredits: 400 };
const HITS: ProjectSearchHitDto[] = [
  { kind: "project", projectId: "proj_needs", slug: "alpha-essay", title: "Alpha Essay", snippet: "the alpha hit" },
];

function twin(over?: Partial<BffAppHomeTwin>): BffAppHomeTwin {
  return {
    rows: ROWS,
    voices: [VOICE],
    groupBy: "attention",
    balance: BAL,
    protocols: PROTOCOLS,
    deletedRows: [],
    ...over };
}

// ---- the fetch stub + the mount harness (the surface-test grammar verbatim) ----------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  home?: BffAppHomeTwin;
  homeStatus?: number;
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
}

function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (path === "/bff/app") {
      if (opts.homeStatus != null && opts.homeStatus !== 200) {
        return jsonResponse(opts.homeStatus, { error: "upstream_unavailable" });
      }
      const q = new URLSearchParams(url.split("?")[1] ?? "");
      const t = opts.home ?? twin();
      return jsonResponse(200, {
        ...t,
        deletedRows: q.get("deleted") === "1" ? (t.deletedRows.length > 0 ? t.deletedRows : [ROW_DELETED]) : [],
        ...(q.get("q") ? { search: { q: q.get("q"), results: HITS } } : {}) });
    }
    if (opts.hold?.[url] != null) return opts.hold[url]!;
    if (url === "/app/grouping") return jsonResponse(200, { ok: true, redirect: "/app" });
    if (url === `/p/${ROW_NEEDS.slug}/archive`) return jsonResponse(200, { ok: true, redirect: "/app" });
    if (url === `/p/${ROW_NEEDS.slug}/duplicate`) {
      return jsonResponse(200, { ok: true, redirect: "/p/alpha-essay-copy" });
    }
    if (url === `/p/${ROW_DELETED.slug}/restore`) {
      return jsonResponse(200, { ok: true, redirect: "/app?deleted=1" });
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_ALL = { "/app": "spa" } as const;

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
const bffAppReads = (f: ReturnType<typeof makeFetch>) =>
  f.mock.calls.filter(([u]) => String(u).split("?")[0] === "/bff/app").length;

/** A deferred Response — the REQ-UX-16 leg holds a mutation in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /app --------------------------------------------------------------------------------------------

describe("GET /app mounted — the §5.2 home (SPA.15; REQ-SEQ-9)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("renders the controls bar, the chips, and the attention groups with the manifest vocabulary", async () => {
    await mountAt("/app", BOOT, makeFetch());
    expect(document.documentElement.getAttribute("data-route")).toBe("/app");
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    const main = el()!;
    // Page chrome — the SSR's Shell + heading verbatim.
    expect(main.querySelector("h1")?.textContent).toBe(COPY.projects.heading);
    // The controls bar: new-project, search form, group-by, filter form, both toggles.
    expect(main.querySelector<HTMLAnchorElement>("[data-new-project]")?.getAttribute("href")).toBe("/app/new");
    const search = main.querySelector<HTMLInputElement>('form[action="/app"] input[name="q"]');
    expect(search).not.toBeNull();
    expect(main.querySelector("form[data-group-by]")?.getAttribute("action")).toBe("/app/grouping");
    expect(main.querySelector("form[data-filter-form]")?.getAttribute("method")).toBe("get");
    expect(main.querySelector("[data-archived-toggle]")?.getAttribute("href")).toBe("/app?archived=1");
    expect(main.querySelector("[data-deleted-toggle]")?.getAttribute("href")).toBe("/app?deleted=1");
    // The Voice chips: All, the voice, Unfiled.
    const chips = [...main.querySelectorAll("[data-voice-filters] a")].map((a) => a.getAttribute("href"));
    expect(chips).toContain("/app");
    expect(chips).toContain("/app?voice=pers_1");
    expect(chips).toContain("/app?voice=unfiled");
    // The attention groups in §5.2 order — Quiet collapsed, its marker + cues present.
    expect(main.querySelector('[data-group="needs_you"]')).not.toBeNull();
    expect(main.querySelector('[data-group="running"]')).not.toBeNull();
    expect(main.querySelector('[data-group="ready_to_read"]')).not.toBeNull();
    const quiet = main.querySelector('details[data-collapsed-group="quiet"]');
    expect(quiet).not.toBeNull();
    expect(quiet!.querySelector("[data-collapsed-marker]")).not.toBeNull();
    expect(quiet!.querySelector("[data-cue-when-closed]")).not.toBeNull();
    // The rows carry the derived indicator + the full menu anatomy.
    expect(main.querySelector('[data-project-row="proj_needs"][data-indicator="needs_you"]')).not.toBeNull();
    expect(main.querySelector('[data-project-row="proj_run"][data-indicator="running"]')).not.toBeNull();
    expect(main.querySelector('[data-project-row="proj_ready"][data-indicator="ready"]')).not.toBeNull();
    expect(main.querySelector('[data-project-row="proj_quiet"][data-indicator="quiet"]')).not.toBeNull();
    const menu = (await settled('[data-project-row="proj_needs"]'));
    expect(menu.querySelectorAll("[data-menu-action]").length).toBeGreaterThanOrEqual(3);
    expect(menu.querySelector('[data-menu-form="archive"]')?.getAttribute("action")).toBe("/p/alpha-essay/archive");
    // The drafts-held row carries its Change-voice disabled reason (§9.6's soft lock).
    expect(menu.querySelector("[data-disabled-reason]")).not.toBeNull();
    // The archived row is out of the groups without ?archived=1; the deleted row never rides the twin.
    expect(main.querySelector('[data-project-row="proj_arch"]')).toBeNull();
    expect(main.querySelector('[data-project-row="proj_del"]')).toBeNull();
    // The level-0 balance chip rides the nav.
    expect(main.textContent).toContain("12,000");
  });

  it("compact (phone) suppresses the new-project affordance — §10.1 verbatim", async () => {
    await mountAt("/app", bootFor({ ...SPA_ALL }, "phone"), makeFetch());
    expect(el()!.querySelector("[data-new-project]")).toBeNull();
    expect(el()!.querySelector("h1")?.textContent).toBe(COPY.projects.heading);
  });

  it("?archived=1 mounts the archived section; ?deleted=1 the restore section + form", async () => {
    const f = makeFetch();
    await mountAt("/app?archived=1&deleted=1", BOOT, f);
    const main = el()!;
    // The deleted read rode the twin's key.
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/app?deleted=1")).toBe(true);
    const arch = main.querySelector("[data-archived-section]");
    expect(arch).not.toBeNull();
    expect(arch!.querySelector('[data-project-row="proj_arch"]')).not.toBeNull();
    // The live sections ride the forms as hidden carries (the SSR's no-JS grammar verbatim).
    expect(main.querySelector('input[name="archived"]')).not.toBeNull();
    expect(main.querySelector('input[name="deleted"]')).not.toBeNull();
    const del = main.querySelector("[data-deleted-section]");
    expect(del).not.toBeNull();
    const row = del!.querySelector('[data-deleted-row="proj_del"]')!;
    const form = row.querySelector<HTMLFormElement>("form[data-restore-form]")!;
    expect(form.getAttribute("action")).toBe("/p/zeta-gone/restore");
    expect(form.getAttribute("method")).toBe("post");
  });

  it("?q= rides the twin's key — the search section replaces the groups (server-side read)", async () => {
    const f = makeFetch();
    await mountAt("/app?q=alpha", BOOT, f);
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/app?q=alpha")).toBe(true);
    const main = el()!;
    const results = main.querySelector("[data-search-results]");
    expect(results).not.toBeNull();
    expect(results!.textContent).toContain("Alpha Essay");
    expect(results!.textContent).toContain("the alpha hit");
    expect(main.querySelector('[data-group="needs_you"]')).toBeNull();
    // The search box echoes the live query.
    expect(main.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe("alpha");
  });

  it("the display filters derive client-side — ?voice + ?protocol + ?sort=title, no extra BFF read", async () => {
    const f = makeFetch();
    await mountAt("/app?voice=pers_1&protocol=proto_1&sort=title", BOOT, f);
    const main = el()!;
    // Only proj_needs survives voice=pers_1 ∩ protocol=proto_1 (ready/running are proto_1 but
    // voice-less; the quiet row is proto_2).
    const ids = [...main.querySelectorAll("[data-project-row]")].map((r) => r.getAttribute("data-project-row"));
    expect(ids).toEqual(["proj_needs"]);
    expect(main.querySelector<HTMLSelectElement>('select[name="voice"], input[name="voice"]')).not.toBeNull();
    expect(main.querySelector<HTMLSelectElement>('select[name="protocol"]')?.value).toBe("proto_1");
    expect(main.querySelector<HTMLSelectElement>('select[name="sort"]')?.value).toBe("title");
    // The display filters never ride the wire — every twin read was the bare aggregate path.
    const appUrls = f.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/bff/app"));
    for (const u of appUrls) {
      const qs = new URLSearchParams(u.split("?")[1] ?? "");
      for (const p of ["voice", "protocol", "sort", "archived"]) expect(qs.has(p), u).toBe(false);
    }
  });

  it("?voice=unfiled keeps only voice-less rows", async () => {
    const f = makeFetch();
    await mountAt("/app?voice=unfiled", BOOT, f);
    const ids = [...el()!.querySelectorAll("[data-project-row]")].map((r) => r.getAttribute("data-project-row"));
    expect(ids.sort()).toEqual(["proj_quiet", "proj_ready", "proj_run"].sort());
  });

  it("groupBy=voice renders the voice-group buckets — Unfiled first", async () => {
    const f = makeFetch({ home: twin({ groupBy: "voice" }) });
    await mountAt("/app", BOOT, f);
    const groups = [...el()!.querySelectorAll("[data-voice-group]")].map((g) => g.getAttribute("data-voice-group"));
    expect(groups[0]).toBe("unfiled");
    expect(groups).toContain("pers_1");
  });

  it("the Group-by form POSTs the JSON branch + invalidates the twin (no document nav)", async () => {
    const f = makeFetch();
    await mountAt("/app", BOOT, f);
    const baseline = bffAppReads(f);
    const form = (await settled<HTMLFormElement>("form[data-group-by]"));
    const select = form.querySelector<HTMLSelectElement>('select[name="groupBy"]')!;
    await act(async () => {
      select.value = "voice";
      fireEvent.submit(form);
    });
    const post = f.mock.calls.find(([u]) => String(u) === "/app/grouping");
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ groupBy: "voice" });
    await vi.waitFor(() => expect(bffAppReads(f)).toBeGreaterThan(baseline));
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("a row-menu action POSTs its /p/:slug path as JSON — the envelope's /app redirect navigates in-router", async () => {
    const f = makeFetch();
    await mountAt("/app", BOOT, f);
    const form = (await settled<HTMLFormElement>('[data-menu-form="archive"]'));
    await act(async () => {
      fireEvent.submit(form);
    });
    const post = f.mock.calls.find(([u]) => String(u) === "/p/alpha-essay/archive");
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).headers).toMatchObject({ "content-type": "application/json" });
    // The /app redirect stays in-router — no document nav back to the server.
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("the deleted row's Restore POSTs /p/:slug/restore → the envelope's /app?deleted=1 rides in-router", async () => {
    const f = makeFetch();
    await mountAt("/app?deleted=1", BOOT, f);
    const form = (await settled<HTMLFormElement>("form[data-restore-form]"));
    await act(async () => {
      fireEvent.submit(form);
    });
    const post = f.mock.calls.find(([u]) => String(u) === "/p/zeta-gone/restore");
    expect(post).toBeDefined();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("a search GET form navigates in-router to the same /app?… URL (never a BFF POST)", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app", BOOT, f);
    const form = (await settled<HTMLFormElement>('form[action="/app"][method="get"]'));
    const q = form.querySelector<HTMLInputElement>('input[name="q"]')!;
    await act(async () => {
      q.value = "alpha";
      fireEvent.submit(form);
    });
    expect(router.state.location.pathname).toBe("/app");
    expect(new URLSearchParams(router.state.location.searchStr).get("q")).toBe("alpha");
    // The new key refetches the twin with ?q=.
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/bff/app?q=alpha")).toBe(true),
    );
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("REQ-UX-16 — an in-flight POST marks its form aria-busy + disabled, then releases", async () => {
    const gate = deferred<Response>();
    const f = makeFetch({ hold: { "/app/grouping": gate.promise } });
    await mountAt("/app", BOOT, f);
    const form = (await settled<HTMLFormElement>("form[data-group-by]"));
    await act(async () => {
      fireEvent.submit(form);
    });
    // In-flight: the form is busy + every control disabled — a second submit is refused.
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector<HTMLSelectElement>("select")!.disabled).toBe(true);
    expect(form.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
    const calls = f.mock.calls.filter(([u]) => String(u) === "/app/grouping").length;
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(f.mock.calls.filter(([u]) => String(u) === "/app/grouping").length).toBe(calls);
    // Settle releases the affordance.
    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, redirect: "/app" }));
    });
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBeNull());
    expect(form.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
  });

  it("the empty aggregate renders the designed empty state", async () => {
    await mountAt("/app", BOOT, makeFetch({ home: twin({ rows: [], voices: [] }) }));
    const main = el()!;
    expect(main.textContent).toContain(COPY.projects.empty);
    expect(main.querySelector("[data-project-row]")).toBeNull();
  });


  it("component axe on the mounted surface (REQ-VFY-6)", async () => {
    await mountAt("/app?archived=1&deleted=1", BOOT, makeFetch());
    await axeCheck((await settled("[data-spa-surface]")));
  });

  it("a non-401 twin failure renders the designed error state — not a /login lie", async () => {
    await mountAt("/app", BOOT, makeFetch({ homeStatus: 502 }));
    expect(el()?.querySelector("[data-spa-error]")).not.toBeNull();
    expect(docNavSpy).not.toHaveBeenCalledWith("/login");
  });

  it("an unflipped verdict hands the document back — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt("/app", bootFor({ "/app": "ssr" }), f);
    expect(docNavSpy).toHaveBeenCalledWith("/app");
    expect(el()?.querySelector("[data-new-project]")).toBeNull();
    expect(bffAppReads(f)).toBe(0);
  });
});
