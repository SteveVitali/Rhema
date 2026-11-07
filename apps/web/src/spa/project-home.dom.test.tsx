// @vitest-environment happy-dom
//
// R7HOME.1 (REQ-HOME-1; ADR-128; REQ-KIT-3 batch c1; REQ-BFF-1/2/9/11, REQ-DAT-4/12, REQ-UX-6/16;
// REQ-TST-2/6/10). Mounted through the production router (memory history + a stub fetch) at
// `/app`: the flat always-expanded list sorted by last edit, the non-empty-only "Waiting on
// you"/"Running" sections, the retired QUIET/Unfiled/Sheet labels, the instant
// toolbar (search + filter/sort/group-by menus — no Apply), the non-default-only URL params,
// the optimistic lifecycle mutations with Undo + rollback on failure, the paid menu items'
// shared-estimator figures + run-sheet hrefs, and component axe.

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
  status: { state: "resting", pill: { label: "Ready", tone: "good" }, action: "none", detail: null } };

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

const EST = { review: 4095, revise: 2100, factCheck: 1330 };

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
  lastEditedAt: "2026-10-09T00:00:00Z",
  estimates: EST,
  voice: { personaId: "pers_1", name: "Lead", status: { state: "resting", pill: { label: "Ready", tone: "good" }, action: "none", detail: null } } };
const ROW_RUNNING: ProjectRow = {
  id: "proj_run",
  slug: "beta-piece",
  title: "Beta Piece",
  state: STATE_RUNNING,
  group: "running",
  headDraftId: "d3",
  headDraftN: 2,
  activeRun: { runId: "run_1", state: "running" },
  protocolId: "proto_1",
  statusLine: "a review is running",
  lastEditedAt: "2026-10-08T00:00:00Z",
  estimates: EST };
const ROW_READY: ProjectRow = {
  id: "proj_ready",
  slug: "gamma-essay",
  title: "Gamma Essay",
  state: STATE_READY,
  headDraftId: "d2",
  headDraftN: 1,
  group: "ready_to_read",
  protocolId: "proto_2",
  lastEditedAt: "2026-10-07T00:00:00Z",
  estimates: EST };
const ROW_QUIET: ProjectRow = {
  id: "proj_quiet",
  slug: "delta-notes",
  title: "Delta Notes",
  state: STATE_QUIET,
  group: "quiet",
  headDraftId: "d4",
  headDraftN: 5,
  protocolId: "proto_2",
  lastEditedAt: "2026-10-06T00:00:00Z",
  estimates: EST };
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  home?: BffAppHomeTwin;
  homeStatus?: number;
  hold?: Record<string, Promise<Response>>;
  fail?: Record<string, number>;
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
    if (opts.fail?.[path] != null) return jsonResponse(opts.fail[path]!, { error: "conflict" });
    if (url === "/app/grouping") return jsonResponse(200, { ok: true, redirect: "/app" });
    if (url === "/p/alpha-essay/duplicate") {
      return jsonResponse(200, { ok: true, redirect: "/p/alpha-essay-copy" });
    }
    if (/^\/p\/[^/]+\/(archive|unarchive|delete|restore)$/.test(url)) {
      return jsonResponse(200, { ok: true, redirect: "/app" });
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
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, queryClient, el };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");
const bffAppReads = (f: ReturnType<typeof makeFetch>) =>
  f.mock.calls.filter(([u]) => String(u).split("?")[0] === "/bff/app").length;

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

/** Fire a Radix DropdownMenuItem — happy-dom has no real pointer pipeline for the portal. */
async function chooseMenuItem(selector: string) {
  const item = (await settled<HTMLElement>(selector));
  await act(async () => {
    fireEvent.click(item);
  });
  return item;
}

async function openMenu(selector: string) {
  const trigger = (await settled<HTMLElement>(selector));
  await act(async () => {
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
  });
}

describe("GET /app — REQ-HOME-1's flat list (R7HOME.1)", () => {
  const BOOT = bootFor({ ...SPA_ALL });

  it("every row renders expanded: no QUIET/Unfiled/Sheet text; attention only when non-empty", async () => {
    await mountAt("/app", BOOT, makeFetch());
    const main = el()!;
    // Flat list + both attention sections present (fixture has needs_you + running rows).
    expect(main.querySelector("[data-project-list]")).not.toBeNull();
    expect(main.querySelector('[data-attention="needs_you"]')).not.toBeNull();
    expect(main.querySelector('[data-attention="running"]')).not.toBeNull();
    // Every row is visible on load — nothing collapsed.
    for (const id of ["proj_needs", "proj_run", "proj_ready", "proj_quiet"]) {
      expect(main.querySelector(`[data-project-row="${id}"]`)).not.toBeNull();
    }
    // Retired vocabulary never renders — nothing collapsed, no group disclosure.
    expect(main.querySelector("details")).toBeNull();
    expect(main.querySelector("[data-collapsed-group]")).toBeNull();
    expect(main.querySelector("[data-home-toolbar]")).not.toBeNull();
    expect(main.textContent).not.toContain("QUIET");
    expect(main.textContent).not.toContain("with a Voice");
    // Row anatomy: title, protocol, voice (only if set), version+state, edited, status dot.
    const needs = main.querySelector('[data-project-row="proj_needs"]')!;
    expect(needs.textContent).toContain("Alpha Essay");
    expect(needs.textContent).toContain("Standard");
    expect(needs.textContent).toContain("Lead"); // the set voice's name
    expect(needs.textContent).toContain("v3");
    expect(needs.textContent).toContain("Gate waiting");
    expect(needs.querySelector("[data-status-dot]")).not.toBeNull();
    expect(needs.querySelector("[data-edited]")).not.toBeNull();
    expect(needs.getAttribute("data-indicator")).toBe("needs_you");
    expect(needs.querySelector("[data-state-badge]")).not.toBeNull();
    expect(needs.querySelector("[data-row-open]")).not.toBeNull();
    // The voice-less row shows NO voice chip and no "Unfiled" label.
    const quiet = main.querySelector('[data-project-row="proj_quiet"]')!;
    expect(quiet.textContent).not.toContain("Unfiled");
    // "Sheet" chips are gone.
    expect(main.textContent).not.toContain("Sheet");
    // The archived row stays out without ?archived=1.
    expect(main.querySelector('[data-project-row="proj_arch"]')).toBeNull();
  });

  it("the attention sections are ABSENT when empty", async () => {
    await mountAt("/app", BOOT, makeFetch({ home: twin({ rows: [ROW_READY, ROW_QUIET] }) }));
    expect(el()!.querySelector('[data-attention="needs_you"]')).toBeNull();
    expect(el()!.querySelector('[data-attention="running"]')).toBeNull();
    expect(el()!.querySelector("[data-project-list]")).not.toBeNull();
  });

  it("the flat list sorts by last edit (freshest first) under the default sort", async () => {
    const rows = [
      { ...ROW_QUIET, id: "old", slug: "old", title: "Old", lastEditedAt: "2026-01-01T00:00:00Z" },
      { ...ROW_QUIET, id: "new", slug: "new", title: "New", lastEditedAt: "2026-11-01T00:00:00Z" },
    ];
    await mountAt("/app", BOOT, makeFetch({ home: twin({ rows }) }));
    const order = [...el()!.querySelectorAll("[data-project-row]")].map((r) => r.getAttribute("data-project-row"));
    expect(order).toEqual(["new", "old"]);
  });

  it("filter + sort + search apply instantly — no Apply button; URL carries only non-defaults", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app", BOOT, f);
    expect(el()!.textContent).not.toContain("Apply");
    // Filter menu → protocol pick: the URL carries only ?protocol.
    await openMenu("[data-filter-menu]");
    await chooseMenuItem('[data-filter-choice="protocol:proto_1"]');
    await vi.waitFor(() => {
      const qs = new URLSearchParams(router.state.location.searchStr);
      expect(qs.get("protocol")).toBe("proto_1");
      expect(qs.get("archived")).toBeNull();
      expect(qs.get("sort")).toBeNull();
      expect(qs.get("voice")).toBeNull();
    });
    // Sort menu → title: ?sort=title stacks onto the live filter.
    await openMenu("[data-sort-menu]");
    await chooseMenuItem('[data-sort-choice="title"]');
    await vi.waitFor(() => {
      const qs = new URLSearchParams(router.state.location.searchStr);
      expect(qs.get("protocol")).toBe("proto_1");
      expect(qs.get("sort")).toBe("title");
    });
    // Search: the field's submit navigates with only ?q (the display filters stay client-side).
    const form = el()!.querySelector<HTMLFormElement>("form[data-search-form]")!;
    const q = form.querySelector<HTMLInputElement>('input[name="q"]')!;
    expect(q.getAttribute("data-search-field")).toBe("true");
    await act(async () => {
      q.value = "alpha";
      fireEvent.submit(form);
    });
    await vi.waitFor(() =>
      expect(new URLSearchParams(router.state.location.searchStr).get("q")).toBe("alpha"),
    );
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/bff/app?q=alpha")).toBe(true),
    );
    await vi.waitFor(() =>
      expect(el()!.querySelector("[data-search-results]")).not.toBeNull(),
    );
  });

  it("?archived encodes as the clean =1 flag and mounts the archived section", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app", BOOT, f);
    await openMenu("[data-filter-menu]");
    expect(document.querySelector("[data-deleted-toggle]")).not.toBeNull();
    await chooseMenuItem("[data-archived-toggle]");
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toContain("archived=1");
      expect(router.state.location.searchStr).not.toContain("%22");
    });
    await vi.waitFor(() =>
      expect(el()!.querySelector("[data-archived-section]")).not.toBeNull(),
    );
    expect(el()!.querySelector('[data-project-row="proj_arch"]')).not.toBeNull();
  });

  it("archive applies optimistically and Undo restores the row", async () => {
    const gate = deferred<Response>();
    const f = makeFetch({ hold: { "/p/delta-notes/archive": gate.promise } });
    await mountAt("/app", BOOT, f);
    // Optimistic: the row leaves the flat list before the server answers.
    await openMenu(`[data-row-menu="proj_quiet"]`);
    await chooseMenuItem('[data-menu-action="archive"]');
    await vi.waitFor(() =>
      expect(el()!.querySelector('[data-project-row="proj_quiet"]')).toBeNull(),
    );
    // The mutation POSTed the lifecycle path as JSON; the Undo toast carries the inverse.
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/p/delta-notes/archive")).toBe(true),
    );
    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, redirect: "/app" }));
    });
    const undo = (await settled<HTMLElement>("[data-undo]"));
    await act(async () => {
      fireEvent.click(undo);
    });
    // Undo POSTs unarchive; on settle the twin re-reads and the row is back.
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/p/delta-notes/unarchive")).toBe(true),
    );
    await vi.waitFor(() =>
      expect(el()!.querySelector('[data-project-row="proj_quiet"]')).not.toBeNull(),
    );
  });

  it("a failed mutation rolls the row back and raises an error toast", async () => {
    const f = makeFetch({ fail: { "/p/delta-notes/archive": 409 } });
    await mountAt("/app", BOOT, f);
    await openMenu(`[data-row-menu="proj_quiet"]`);
    await chooseMenuItem('[data-menu-action="archive"]');
    // The POST fired; the immediate 409 rolls the optimistic hide back with the error toast.
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/p/delta-notes/archive")).toBe(true),
    );
    await vi.waitFor(() =>
      expect(el()!.querySelector('[data-project-row="proj_quiet"]')).not.toBeNull(),
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(COPY.projectHome.toastFailed),
    );
  });

  it("paid ⋯ items show the shared estimator's figure and open the run sheet — no run creator here", async () => {
    const f = makeFetch();
    await mountAt("/app", BOOT, f);
    await openMenu(`[data-row-menu="proj_ready"]`);
    const item = (await settled<HTMLElement>('[data-menu-action="wf_review"]'));
    const a = item.tagName === "A" ? (item as HTMLAnchorElement) : item.querySelector("a");
    expect(a?.getAttribute("href")).toBe("/p/gamma-essay/run?workflow=review");
    expect(item.textContent).toContain("est. 4,095 cr");
    expect(item.getAttribute("data-menu-est")).toBe("wf_review");
    // No row item posts to a run-creating path.
    expect(f.mock.calls.some(([u]) => String(u).includes("/runs"))).toBe(false);
  });

  it("no disabled no-op items are listed (a draft-less row's menu has no paid verbs)", async () => {
    const noDraft: ProjectRow = { ...ROW_QUIET, id: "nd", slug: "nd", headDraftId: null, headDraftN: null };
    await mountAt("/app", BOOT, makeFetch({ home: twin({ rows: [noDraft] }) }));
    await openMenu('[data-row-menu="nd"]');
    expect(document.querySelector('[data-menu-action="wf_review"]')).toBeNull();
    expect(document.querySelector('[data-menu-action="wf_revise"]')).toBeNull();
  });

  it("lifecycle invalidation is scoped to [bff,app] — other query families are untouched", async () => {
    const f = makeFetch();
    const { queryClient } = await mountAt("/app", BOOT, f);
    queryClient.setQueryData(["bff", "other-surface"], { sentinel: true });
    await openMenu(`[data-row-menu="proj_quiet"]`);
    await chooseMenuItem('[data-menu-action="archive"]');
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/p/delta-notes/archive")).toBe(true),
    );
    expect(queryClient.getQueryData(["bff", "other-surface"])).toEqual({ sentinel: true });
  });

  it("groupBy=voice renders the voice buckets — Unfiled first (the opt-in Group-by)", async () => {
    const f = makeFetch({ home: twin({ groupBy: "voice" }) });
    await mountAt("/app", BOOT, f);
    const groups = [...el()!.querySelectorAll("[data-voice-group]")].map((g) => g.getAttribute("data-voice-group"));
    expect(groups[0]).toBe("unfiled");
    expect(groups).toContain("pers_1");
  });

  it("the Group-by menu posts /app/grouping — the remembered preference", async () => {
    const f = makeFetch();
    await mountAt("/app", BOOT, f);
    await openMenu("[data-group-by]");
    await chooseMenuItem('[data-group-choice="voice"]');
    await vi.waitFor(() => {
      const post = f.mock.calls.find(([u]) => String(u) === "/app/grouping");
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ groupBy: "voice" });
    });
  });

  it("compact (phone) suppresses the new-project affordance — §10.1 verbatim", async () => {
    await mountAt("/app", bootFor({ ...SPA_ALL }, "phone"), makeFetch());
    expect(el()!.querySelector("[data-new-project]")).toBeNull();
  });

  it("?deleted=1 mounts the restore section; Restore posts the inverse lifecycle verb", async () => {
    const f = makeFetch();
    await mountAt("/app?deleted=1", BOOT, f);
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/app?deleted=1")).toBe(true);
    const del = (await settled<HTMLElement>("[data-deleted-section]"));
    expect(del.querySelector('[data-deleted-row="proj_del"]')).not.toBeNull();
    const restore = del.querySelector<HTMLElement>("[data-restore-form]")!;
    await act(async () => {
      fireEvent.click(restore);
    });
    await vi.waitFor(() =>
      expect(f.mock.calls.some(([u]) => String(u) === "/p/zeta-gone/restore")).toBe(true),
    );
  });

  it("the empty aggregate renders the designed EmptyState", async () => {
    await mountAt("/app", BOOT, makeFetch({ home: twin({ rows: [], voices: [] }) }));
    const main = el()!;
    expect(main.textContent).toContain(COPY.projects.empty);
    expect(main.querySelector("[data-project-empty]")).not.toBeNull();
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
