// R7SYNC.1 — the ticket's Stage-A legs in one file (REQ-SYNC-3/4/5, REQ-SPEED-1…4).
//   • SYNC-3 — the Timeline tab shows the REAL project round log on every project sub-route:
//     a framed leaf whose twin carries `ide.timelineView` renders `[data-timeline-run]` rows
//     (never the empty state), and the unpublished in-project 404 resolves the SAME
//     project-scoped source through the versions twin.
//   • SYNC-4 — a missed `/v/:n` renders the versions picker (existing versions + the record's
//     `· discarded` gap marker) inside the shell, never the bare "Not found / Go home".
//   • SYNC-5 — every duration/credit claim flows the shared estimator (`ide.runHints`, the
//     settings' `protocolCards`, `~{lo}–{hi} min` interpolations) — a grep leg proves no
//     hand-typed range/credit literal exists in the SPA sources.
//   • SPEED-1 — `beforeLoad` issues no POST on project open (source pin); the loader fires
//     the handoff CONCURRENTLY with the twin GET (both in-flight in the same tick).
//   • SPEED-2 — the shell document's first bytes paint the static frame + skeleton rows.
//   • SPEED-3 — PREFETCH_SAFE certification, the hover/focus prefetcher, the scoped-invalidation
//     grep, and the demo-only restriction.
//   • SPEED-4 — Literata normal + Inter preloads in both document heads.

import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpaRouter } from "./main.js";

import type { SpaBoot } from "./boot.js";
import type { BffVersionsTwin } from "./queries.js";
import type { TimelineDto, VersionRailDto } from "@rhema/api-client";
import { SETTLE_TIMEOUT } from "./testkit.js";

// ---- fixtures --------------------------------------------------------------------------------

const SLUG = "the-piece";
const PRINCIPAL = { ok: true, id: "u_1", email: "w@rhema.tools" };

const RUN_CARD = {
  runId: "run_9",
  state: "finished",
  phases: [{ key: "reading_the_piece", ordinal: 1, status: "done", credits: 40 }],
  spentCredits: 840,
  capCredits: 840,
  provisional: false,
  creditFraction: 1,
  refundedCredits: 0,
  elapsedMs: 90_000,
  etaBand: null,
  done: 1,
  running: 0,
  total: 1,
  estimateCredits: 840,
  queuePosition: null,
  paused: false,
  waitingGate: null,
  deliverables: [],
  delivered: null,
  failureCode: null,
  resumable: false,
  queuedNotes: 0,
  decisions: [],
  actions: ["live_feed"],
  deliveryLabel: null,
};

const TIMELINE: TimelineDto = {
  project: { id: "proj_1", slug: SLUG, title: "The Piece" },
  state: { key: "ready_to_read", pill: "Ready to read", overlay: null, suggested: null },
  nextStep: { verb: "revise", label: "Revise using your edits", estimateCredits: 1240, headDraftN: 2 },
  rounds: [
    {
      n: 1,
      anchor: { draftId: "d_v1", n: 1, origin: "imported" },
      producedN: null,
      parts: [{ kind: "run", workflow: "review" }],
      runs: [
        {
          runId: "run_9",
          workflow: "review",
          state: "finished",
          createdAt: "2026-09-01T12:00:00Z",
          subjectN: 1,
          producedN: 2,
          card: RUN_CARD,
        },
      ],
    },
  ],
  ungrouped: [],
  originChip: null,
} as unknown as TimelineDto;

const IDE_BASE = {
  palette: JSON.stringify({ projectSlug: SLUG, goto: [], recentRuns: [], settings: [] }),
  paletteSearchUrl: "/p/the-piece/palette-search",
  themeUrl: "/ide/theme",
  paperThemeUrl: "/p/the-piece/paper-theme",
};

const RAIL: VersionRailDto = {
  workingN: 3,
  chip: { open: 0, addressed: 1 },
  outline: null,
  drafts: [
    {
      draftId: "d_v1",
      n: 1,
      origin: "imported",
      state: "frozen",
      frozen: true,
      frozenAt: "2026-09-01T00:00:00Z",
      createdAt: "2026-09-01T00:00:00Z",
      words: 1200,
      reviewed: true,
      answered: false,
      claimsPendingVerification: false,
      obligations: { open: 0, addressed: 1 },
    },
    {
      draftId: "d_v2",
      n: 2,
      origin: "review",
      state: "discarded",
      frozen: true,
      frozenAt: "2026-09-02T00:00:00Z",
      createdAt: "2026-09-02T00:00:00Z",
      words: 1240,
      reviewed: false,
      answered: false,
      claimsPendingVerification: false,
      obligations: { open: 0, addressed: 0 },
    },
  ],
} as unknown as VersionRailDto;

const VERSIONS_TWIN: BffVersionsTwin = {
  versions: RAIL,
  project: { title: "The Piece", pill: "Ready to read", slug: SLUG, headDraftId: "d_v3", headDraftN: 3 },
  paperTheme: "light",
  ide: { ...IDE_BASE, timelineView: TIMELINE },
};

const DOC = {
  draftId: "d_v2",
  draftN: 2,
  origin: "review",
  state: "frozen",
  baseDraftId: "d_v1",
  baseDraftN: 1,
  markdown: "## A draft\n\nBody text.",
  sha256: "sha_1",
  lock: null,
  findings: [],
  meters: { words: 4, readMin: 1 },
};

const VERSION_TWIN = {
  page: { slug: SLUG, projectId: "proj_1", doc: DOC },
  project: { title: "The Piece", pill: "Ready to read", slug: SLUG, headDraftId: "d_v3" },
  paperTheme: "light",
  ide: { ...IDE_BASE, timelineView: TIMELINE },
} as never;

// ---- mount substrate --------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const requests: string[] = [];
function makeFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === `/bff/p/${SLUG}/versions`) return jsonResponse(200, VERSIONS_TWIN);
    if (url === `/bff/p/${SLUG}/export`) return jsonResponse(200, EXPORT_TWIN);
    if (url === `/bff/p/${SLUG}?view=tree`) return jsonResponse(200, { project: { title: "The Piece", pill: "", slug: SLUG }, files: null });
    if (url === `/bff/p/${SLUG}/v/2`) return jsonResponse(200, VERSION_TWIN);
    if (/^\/bff\/p\/[^/]+\/v\//.test(url)) return jsonResponse(404, { error: "not_found" });
    if (url.startsWith(`/p/${SLUG}/palette-search`)) return jsonResponse(200, { results: [] });
    return jsonResponse(200, {});
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

const mounted: Root[] = [];
async function mountAt(path: string, boot: SpaBoot, fetchImpl = makeFetch()) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router } = createSpaRouter({ boot, history: createMemoryHistory({ initialEntries: [path] }) });
  const root = createRoot(rootEl);
  mounted.push(root);
  await act(async () => {
    root.render(<StrictMode><RouterProvider router={router} /></StrictMode>);
    await router.load();
  });
  await vi.waitFor(
    () => expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull(),
    { timeout: SETTLE_TIMEOUT },
  );
  return { router, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

beforeEach(() => { requests.length = 0; });
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

// ---- REQ-SYNC-3 — the project-scoped Timeline on every sub-route --------------------------------

describe("REQ-SYNC-3 — the Timeline tab reads the project-scoped round log on every sub-route", () => {
  const BOOT = bootFor({ "/p/$project/v/$v": "spa", "/p/$project": "spa" });

  it("a framed leaf with timelineView publishes real run rows — never the empty state", async () => {
    await mountAt(`/p/${SLUG}/v/2`, BOOT);
    await vi.waitFor(() => expect(el()!.querySelector("[data-panel-body='timeline']")).not.toBeNull(), { timeout: SETTLE_TIMEOUT });
    const pane = el()!.querySelector<HTMLElement>("[data-panel-body='timeline']")!;
    expect(pane.querySelector("[data-timeline-run]")).not.toBeNull();
    expect(pane.textContent).not.toContain("No runs yet");
  });

  it("the in-project 404 shows the REAL round log — the versions twin is the one source", async () => {
    await mountAt(`/p/${SLUG}/not-a-route`, BOOT);
    await vi.waitFor(() => expect(el()!.textContent).toContain("Not found"), { timeout: SETTLE_TIMEOUT });
    await vi.waitFor(
      () => expect(el()!.querySelector("[data-panel-body='timeline'] [data-timeline-run]")).not.toBeNull(),
      { timeout: SETTLE_TIMEOUT },
    );
    expect(requests).toContain(`GET /bff/p/${SLUG}/versions`);
  });
});

// ---- REQ-SYNC-4 — the versions picker for a missing version --------------------------------------

describe("REQ-SYNC-4 — a missed /v/:n renders the versions picker inside the shell", () => {
  it("missing v99 lists the existing versions + the record's discarded gap marker", async () => {
    await mountAt(
      `/p/${SLUG}/v/99`,
      bootFor({ "/p/$project/v/$v": "spa", "/p/$project": "spa" }),
    );
    await vi.waitFor(() => expect(el()!.querySelector("[data-version-picker]")).not.toBeNull(), { timeout: SETTLE_TIMEOUT });
    const picker = el()!.querySelector<HTMLElement>("[data-version-picker]")!;
    expect(picker.querySelector("[data-version-missing]")?.textContent).toContain("v99");
    expect(picker.querySelector("[data-version-list]")).not.toBeNull();
    const options = picker.querySelectorAll("[data-version-option]");
    expect(options.length).toBe(2);
    expect(picker.querySelector("[data-version-option='2']")?.textContent).toContain("discarded");
    // the shell's timeline stays truthful on the picker leaf too (SYNC-3's one source)
    await vi.waitFor(
      () => expect(el()!.querySelector("[data-panel-body='timeline'] [data-timeline-run]")).not.toBeNull(),
      { timeout: SETTLE_TIMEOUT },
    );
  });
});

