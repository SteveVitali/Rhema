// @vitest-environment happy-dom
//
// SPA.21 — the `dossier` surface's component contract (REQ-SEQ-9/12, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/4/11, REQ-DAT-1/4/5, REQ-UX-16; design/22 §2 `p.review`/`p.obligationNew` + OQ8(b);
// design/25 `p.review` framed, `p.obligationNew` unframed). Mounted through the production router
// (memory history + a stub fetch): the SSR-verbatim dossier vocabulary (letter/claims/second read/
// rubric/findings list + the Margin/Desk pane bodies + the bulk preview/dispatch arms), the
// client-ported filter port (a `data-findings-filters` submit is an in-router nav that touches NO
// network), every dossier write as a `wantsJson` POST + `{ok,redirect}` envelope nav, the
// `?ferr`/`fmsg`-parity refusal repaint, `aria-busy`/disabled pending controls, the focused
// `?gate=` card with hook-carried presence, the obligations-new sheet (render + refuse + create),
// and the REQ-TST-2 parity leg against `DossierPage` under a PageDataContext provider. Component
// axe covers the mounted surface's interactive subset.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FindingView } from "@rhema/contracts";
import type { GateCardDto, ChatPanelDto } from "@rhema/api-client";
import { hooksForSurface } from "../dom-contract.js";
import { COPY } from "../copy.js";
import type { DossierViewData } from "../dossier-view.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffDossierTwin, BffObligationNewTwin } from "./queries.js";
import { expectManifestEmission, restoreDocumentNav, stubDocumentNav } from "./testkit.js";
import axe from "axe-core";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "the-politics-of-visibility";
const RUN = "run_1";

// ---- fixtures — the SSR spec's dossier (findings-surface.test.ts), verbatim ---------------------

const finding = (over: Partial<FindingView>): FindingView => ({
  id: "f_1",
  correspondenceId: "c_1",
  draftId: "d_1",
  kind: "argument",
  severity: "major",
  origin: "editor",
  anchor: { blockId: "p1", startOffset: 0, endOffset: 4, quote: "the ", confidence: 1 },
  title: "A finding",
  body: "body",
  rubricDims: [],
  provisional: false,
  ...over,
});

const DOSSIER: DossierViewData = {
  slug: SLUG,
  runId: RUN,
  projectTitle: "The Politics of Visibility",
  versionLabel: "Review of v1",
  rigor: "standard",
  openObligations: 0,
  addressedObligations: 0,
  runCard: { runId: RUN, state: "completed", phases: [], spentCredits: 100, capCredits: 840 },
  letterTitle: "The Politics of Visibility",
  letterSections: [{ id: "verdict", title: "Verdict", paragraphs: ["Holds."] }],
  claims: [],
  fetchLog: [],
  findings: [
    finding({ id: "f_1", severity: "blocking", suggestion: { replacement: "better wording" } }),
    finding({ id: "f_2", severity: "note", title: "A note", suggestion: { replacement: "tweak" }, letterSection: "strength" }),
    finding({ id: "f_3", severity: "minor", title: "A minor one" }),
    finding({ id: "f_s", title: "streaming", provisional: true }),
  ],
  rubric: [],
  accessReport: { seat: "editor", mountedPathCount: 0, fetches: 0, deniedAttempts: 0, violations: 0, subagents: [] },
};

/** The focused-gate card (the inbox.dom.test.tsx fixture verbatim — `proceed_as_proposed` +
 *  `presenceDeadlineAt` makes `buildGateCard` answer `autoProceed`, so `useGatePresence` arms). */
const GATE_CARD: GateCardDto = {
  id: "gate_1",
  runId: RUN,
  kind: "approve_plan",
  workflow: "review",
  artifactId: "art_1",
  artifactTitle: "The essay",
  openedAt: "2026-10-01T10:00:00Z",
  deadlineAt: "2026-10-02T12:00:00Z",
  presenceDeadlineAt: "2026-10-01T10:10:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "proceed_as_proposed",
  spentCredits: 40,
  capCredits: 60,
  remainingEstimateCredits: 20,
};

function twinFor(over: Partial<BffDossierTwin> = {}, viewOver: Partial<BffDossierTwin["dossierView"]> = {}): BffDossierTwin {
  return {
    dossier: DOSSIER,
    dossierView: { filters: {}, triage: false, ...viewOver },
    project: { title: DOSSIER.projectTitle, pill: "", slug: SLUG },
    paperTheme: "light",
    ide: { projectId: "proj_pv", inboxCount: 0 },
    ...over,
  };
}

/** The phone-width Desk chat fixture (chat-surfaces.test.ts's CHAT verbatim). */
const CHAT: ChatPanelDto = {
  threads: [{ id: "thr_1", name: "Project chat", isDefault: true, archived: false }],
  activeThreadId: "thr_1",
  turns: [],
  messages: [],
  pins: { pins: [], footprint: 0, cap: 12 },
  sources: [],
  liveRun: null,
  emptyState: {
    page: "quiet",
    deskTab: "chat",
    chips: [
      { id: "research", label: "Research a question", verb: "/research" },
      { id: "thesis", label: "I have a thesis", verb: "chat" },
      { id: "interview", label: "Interview me", verb: "chat" },
      { id: "notes", label: "Paste my notes", verb: "notes" },
    ],
    nextStep: { kind: "sheet", label: "Start", href: "/p/demo/sheet?workflow=research_burst" },
  },
  budgets: { credits: 40, searches: 5, fetches: 10 },
  defaultTier: "base",
};

const OBLIGATION_TWIN: BffObligationNewTwin = {
  obligationNew: { slug: SLUG, projectTitle: DOSSIER.projectTitle, back: `/p/${SLUG}` },
};

// ---- the mount substrate (run-sheet.dom.test.tsx's harness) --------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  /** the twin read — may be a function of the request query (the server re-reads `?disposed`/`?bulk`…). */
  twin?: BffDossierTwin | null | ((query: string) => BffDossierTwin | null);
  mutations?: Record<string, { status?: number; body: unknown } | Promise<Response>>;
}

interface RecordedPost {
  url: string;
  json: Record<string, unknown> | null;
}

function makeFetch(opts: FetchOpts = {}) {
  const posts: RecordedPost[] = [];
  const gets: string[] = [];
  let dossierReads = 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const [path, query] = url.split("?", 2) as [string, string?];
    if (path === "/session") return jsonResponse(200, PRINCIPAL);
    if (path === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (init?.method === "POST") {
      posts.push({ url: path, json: init.body ? JSON.parse(String(init.body)) : null });
      const mut = opts.mutations?.[path];
      if (mut instanceof Promise) return mut;
      if (mut != null) return jsonResponse(mut.status ?? 200, mut.body);
      return jsonResponse(200, { ok: true });
    }
    gets.push(url);
    if (path === `/bff/p/${SLUG}/review/${RUN}`) {
      dossierReads += 1;
      const twin = typeof opts.twin === "function" ? opts.twin(query ?? "") : opts.twin;
      if (twin === null) return jsonResponse(404, { error: "not_found" });
      return jsonResponse(200, twin ?? twinFor());
    }
    if (path === `/bff/p/${SLUG}/obligations/new`) {
      // The twin re-runs the server's `safeBack` verbatim — echo the confined `?back=` so the
      // sheet's serialized `back` is the request's (the route already dropped off-origin values).
      const back = new URLSearchParams(query ?? "").get("back");
      return jsonResponse(200, {
        obligationNew: {
          ...OBLIGATION_TWIN.obligationNew,
          back: back != null && back.startsWith("/p/") ? back : `/p/${SLUG}`,
        },
      });
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
  return { impl, posts, gets, reads: () => dossierReads };
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_DOSSIER = {
  "/p/$project/review/$runId": "spa",
  "/p/$project/obligations/new": "spa",
} as const;

let docNavSpy: ReturnType<typeof vi.fn>;
let beaconSpy: ReturnType<typeof vi.spyOn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"], opts?: { awaitLoad?: boolean }) {
  vi.stubGlobal("fetch", fetchImpl);
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
  if (opts?.awaitLoad !== false) {
    await act(async () => {
      await router.load();
    });
    // flush the query settle + the chrome publish
    await act(async () => {});
  }
  return { router, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

/** Submit one form inside an act — the optional `submitter` rides the field set (the verb/action
 *  button's name+value posts exactly like the native click). */
async function submit(form: Element, submitter?: Element) {
  await act(async () => {
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (submitter != null) Object.defineProperty(ev, "submitter", { value: submitter });
    form.dispatchEvent(ev);
  });
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  // The presence + showcase-anchor pings ride sendBeacon — happy-dom's transport would otherwise
  // hit a real socket. Stubbed for the whole file; the gate/presence legs inspect the calls
  // (the inbox.dom.test.tsx precedent).
  beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
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

// ---- /p/:slug/review/:runId ----------------------------------------------------------------------

describe("GET /p/:slug/review/:runId mounted (SPA.21)", () => {
  const BOOT = bootFor(SPA_DOSSIER);

  it("renders the SSR-verbatim dossier vocabulary — letter, claims, second read, rubric, findings + pane bodies", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const root = el()!;
    expect(root.querySelector("h1")?.textContent).toBe(DOSSIER.projectTitle);
    // the shared article's sections.
    for (const hook of [
      "data-letter-view",
      "data-claims-table",
      "data-second-read",
      "data-rubric",
      "data-findings-list",
      "data-margin-surface",
      "data-findings-desk",
      "data-findings-filters",
      "data-disposition-form",
      "data-bulk-controls",
    ]) {
      expect(root.querySelector(`[${hook}]`), `missing ${hook}`).not.toBeNull();
    }
    // Apply on the two suggestion-carrying cards + obligations + the finding anchors.
    expect(root.querySelectorAll("[data-apply-form]").length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector(`form[action="/p/${SLUG}/review/${RUN}/findings/f_1/apply"]`)).not.toBeNull();
    expect(root.querySelector(`form[action="/p/${SLUG}/findings/f_1/obligations"]`)).not.toBeNull();
    expect(root.querySelector('[data-finding="f_1"],[data-desk-row="f_1"]')).not.toBeNull();
    // the manifest's fixtured hooks (manifest-driven, never an ad-hoc selector list).
    const hooks = hooksForSurface("dossier").filter((e) =>
      [
        "data-letter-view",
        "data-claims-table",
        "data-second-read",
        "data-rubric",
        "data-findings-list",
        "data-findings-filters",
        "data-findings-desk",
        "data-margin-surface",
        "data-disposition-form",
        "data-apply-form",
        "data-bulk-controls",
        "data-finding",
        "data-verb",
        "data-note",
      ].includes(e.hook),
    );
    expectManifestEmission(root, hooks);
  });

  it("paints the pending shell while the twin is in flight", async () => {
    let release: (r: Response) => void = () => undefined;
    const gate = new Promise<Response>((res) => (release = res));
    const impl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.split("?")[0]!;
      if (path === "/session") return jsonResponse(200, PRINCIPAL);
      if (path === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
      if (path === `/bff/p/${SLUG}/review/${RUN}`) return gate;
      return jsonResponse(500, { error: "unstubbed_path" });
    });
    vi.stubGlobal("fetch", impl);
    const rootEl = document.createElement("div");
    rootEl.setAttribute("data-spa-root", "");
    document.body.appendChild(rootEl);
    const { router } = createSpaRouter({
      boot: BOOT,
      history: createMemoryHistory({ initialEntries: [`/p/${SLUG}/review/${RUN}`] }),
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
      expect(rootEl.querySelector("[data-letter-view]")).not.toBeNull();
    } finally {
      release(jsonResponse(200, twinFor())); // idempotent — never leaves a dangling load
    }
  });

  it("ports the findings filters into query-state with NO refetch (?sev=note narrows every surface)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const readsBefore = f.reads();
    const form = el()!.querySelector<HTMLFormElement>("form[data-findings-filters]")!;
    const sev = form.querySelector<HTMLSelectElement>('select[name="sev"]')!;
    await act(async () => {
      fireEvent.change(sev, { target: { value: "note" } });
    });
    await submit(form);
    expect(router.state.location.search).toMatchObject({ sev: "note" });
    // design/22 OQ8(b): the filter keys never ride the twin — no second dossier fetch.
    expect(f.reads()).toBe(readsBefore);
    expect(el()!.querySelector('[data-desk-row="f_2"]')).not.toBeNull();
    expect(el()!.querySelector('[data-desk-row="f_1"]')).toBeNull();
  });

  it("a disposition POST rides the JSON envelope — clicked verb + ?disposed flash nav + refetched truth", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/review/${RUN}/findings/f_1/disposition`]: {
          body: { ok: true, redirect: `/p/${SLUG}/review/${RUN}?disposed=f_1` },
        },
      },
      twin: (q) =>
        q.includes("disposed=")
          ? { ...twinFor(), triage: { savedFindingId: "f_1" } }
          : twinFor(),
    });
    const { router } = await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/f_1/disposition"]`)!;
    const verb = form.querySelector<HTMLElement>('[data-verb="accept"]')!;
    await submit(form, verb);
    const post = f.posts.find((p) => p.url.endsWith("/disposition"));
    expect(post?.json?.["verb"]).toBe("accept");
    // the envelope's redirect is the 302's identical twin — in-router, flash param lands as search.
    await waitFor(() => expect(router.state.location.search).toMatchObject({ disposed: "f_1" }));
    // server truth re-read (the saved marker lands off the refetched twin).
    await waitFor(() => expect(f.reads()).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(el()!.querySelector("[data-disposition-saved]")).not.toBeNull());
  });

  it("Apply/promote/obligations POST the same paths + land the ?applied/?promoted/?obligated flashes", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/review/${RUN}/findings/f_1/apply`]: {
          body: { ok: true, redirect: `/p/${SLUG}/review/${RUN}?applied=f_1#finding-f_1` },
        },
        [`/p/${SLUG}/findings/f_1/obligations`]: {
          body: { ok: true, redirect: `/p/${SLUG}/review/${RUN}?obligated=f_1#finding-f_1` },
        },
      },
    });
    const { router } = await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const applyForm = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/f_1/apply"]`)!;
    await submit(applyForm);
    expect(f.posts.some((p) => p.url.endsWith("/findings/f_1/apply"))).toBe(true);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ applied: "f_1" }));
    // the post-nav refetch re-pends the leaf briefly — wait for the card set to return.
    let oblForm: HTMLFormElement | null = null;
    await waitFor(() => {
      oblForm = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/findings/f_1/obligations"]`);
      expect(oblForm).not.toBeNull();
    });
    await submit(oblForm!);
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/findings/f_1/obligations`);
    expect(post?.json?.["next"]).toBe(`/p/${SLUG}/review/${RUN}`);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ obligated: "f_1" }));
  });

  it("the bulk preview + confirm round through ?bulk= and ?bulkdone= (checked rows only ride only[])", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/review/${RUN}/findings/bulk-preview`]: {
          body: { ok: true, redirect: `/p/${SLUG}/review/${RUN}?bulk=apply_notes#findings` },
        },
        [`/p/${SLUG}/review/${RUN}/findings/bulk`]: {
          body: { ok: true, redirect: `/p/${SLUG}/review/${RUN}?bulkdone=1&bulkskip=0#findings` },
        },
      },
      twin: (q) =>
        q.includes("bulk=apply_notes")
          ? twinFor({}, {
              bulk: {
                action: "apply_notes",
                preview: {
                  action: "apply_notes",
                  rows: [{ findingId: "f_2", title: "A note", severity: "note", disposition: "accept", obligation: "none" }],
                  skipped: [{ findingId: "f_1", title: "A finding", reason: "severity_not_note" }],
                  total: 4,
                },
              },
            })
          : q.includes("bulkdone=")
            ? twinFor({}, { bulkDone: { count: 1, skipped: 0 } })
            : twinFor(),
    });
    const { router } = await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    // the Desk's consolidated affordance posts the preview request.
    const previewForm = [...el()!.querySelectorAll<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/bulk-preview"]`)].find(
      (fm) => fm.querySelector('input[name="action"]')?.getAttribute("value") === "apply_notes",
    )!;
    await submit(previewForm);
    expect(f.posts.some((p) => p.url.endsWith("/findings/bulk-preview") && p.json?.["action"] === "apply_notes")).toBe(true);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ bulk: "apply_notes" }));
    // the refetched twin carries the server's preview — the checklist renders checked-only rows.
    let preview: Element | null = null;
    await waitFor(() => {
      preview = el()!.querySelector("[data-bulk-preview]");
      expect(preview).not.toBeNull();
    });
    const confirmForm = preview!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/bulk"]`)!;
    // uncheck nothing — the checked rows ride `only`; f_2 is the covered row.
    await submit(confirmForm);
    const bulk = f.posts.find((p) => p.url.endsWith("/findings/bulk"));
    expect(bulk?.json?.["action"]).toBe("apply_notes");
    // a single checked `only` box serializes as a scalar — the same shape a document
    // POST produces; the server arm `asArray`s it either way.
    expect([bulk?.json?.["only"]].flat()).toEqual(["f_2"]);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ bulkdone: 1, bulkskip: 0 }));
    await waitFor(() => expect(el()!.querySelector("[data-bulk-done]")).not.toBeNull());
  });

  it("the focused ?gate= card renders at the artifact's head and its decide POST rides the envelope", async () => {
    const f = makeFetch({
      twin: (q) => (q.includes("gate=gate_1") ? twinFor({}, { focusedGate: GATE_CARD }) : twinFor()),
      mutations: {
        [`/p/${SLUG}/gates/gate_1`]: { body: { ok: true, redirect: `/p/${SLUG}` } },
      },
    });
    const { router } = await mountAt(`/p/${SLUG}/review/${RUN}?gate=gate_1`, BOOT, f.impl);
    const section = el()!.querySelector(`[data-focused-gate="gate_1"]`)!;
    expect(section.querySelector("[data-gate-card]")).not.toBeNull();
    // No inline presence <script> under React — `useGatePresence` carries the pings (REQ-SPEC-18).
    expect(section.querySelector("script")).toBeNull();
    expect(
      beaconSpy.mock.calls.some(([url]) => url === `/p/${SLUG}/gates/gate_1/activity`),
    ).toBe(true);
    const form = section.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/gates/gate_1"]`)!;
    const approve = form.querySelector<HTMLElement>('button[name="action"], [name="action"]')!;
    await submit(form, approve);
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/gates/gate_1`);
    expect(post).not.toBeNull();
    expect(post?.json?.["action"]).toBe("approve");
    // the gate's success redirect leaves the dossier — in-router nav to the project.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${SLUG}`));
  });

  it("a refused write repaints the SSR's ferr arm — the notice line + the under-card error", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/review/${RUN}/findings/f_3/disposition`]: {
          status: 422,
          body: { error: "rationale_required", detail: "a rationale is required for rebut" },
        },
      },
    });
    await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/f_3/disposition"]`)!;
    const verb = form.querySelector<HTMLElement>('[data-verb="rebut"]')!;
    await submit(form, verb);
    let notice: Element | null = null;
    await waitFor(() => {
      notice = el()!.querySelector('[data-finding-notice="error"]');
      expect(notice).not.toBeNull();
    });
    expect(notice!.textContent).toContain("a rationale is required for rebut");
    // the same message renders under the refused card (the SSR's `triage.dispositionError` arm).
    await waitFor(() =>
      expect(el()!.querySelector('[data-disposition-error]')?.textContent).toContain("a rationale is required for rebut"),
    );
  });

  it("REQ-UX-16 — a write marks its form aria-busy + disables controls until settle", async () => {
    let release: (r: Response) => void = () => undefined;
    const gate = new Promise<Response>((res) => (release = res));
    const f = makeFetch({
      mutations: { [`/p/${SLUG}/review/${RUN}/findings/f_1/apply`]: gate },
    });
    await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>(`form[action="/p/${SLUG}/review/${RUN}/findings/f_1/apply"]`)!;
    const btn = form.querySelector<HTMLButtonElement>("button")!;
    await act(async () => {
      const ev = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(ev);
    });
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    await act(async () => {
      release(jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/review/${RUN}?applied=f_1` }));
    });
    await act(async () => {});
    // the nav remounts off server truth; the settled form is live again.
    await waitFor(() => {
      const settled = el()!.querySelector(`form[action="/p/${SLUG}/review/${RUN}/findings/f_1/apply"]`);
      expect(settled?.getAttribute("aria-busy") ?? null).toBeNull();
      expect(settled?.querySelector("button")?.disabled).toBe(false);
    });
  });

  it("a finding carrying evidence urls paints the once-per-surface explainer (data-evidence-explainer)", async () => {
    const f = makeFetch({
      twin: twinFor({
        dossier: {
          ...DOSSIER,
          findings: [
            ...DOSSIER.findings,
            finding({ id: "f_e", severity: "note", title: "Cited", evidence: { urls: [{ url: "https://example.test/src" }] } }),
          ] } }) });
    await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    expect(el()!.querySelector("[data-evidence-explainer]")).not.toBeNull();
  });

  it("phone width mounts the Page's own chat section (data-phone-chat — §10.1)", async () => {
    const f = makeFetch({
      twin: twinFor({ ide: { projectId: "proj_pv", inboxCount: 0, chat: CHAT } }) });
    await mountAt(`/p/${SLUG}/review/${RUN}`, bootFor(SPA_DOSSIER, "phone"), f.impl);
    expect(el()!.querySelector("[data-phone-chat]")).not.toBeNull();
  });

  it("an unflipped verdict hands the document back to the server", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/review/${RUN}`, bootFor({ ...SPA_DOSSIER, "/p/$project/review/$runId": "ssr" }), f.impl);
    expect(docNavSpy).toHaveBeenCalledWith(`/p/${SLUG}/review/${RUN}`);
  });

  it("component axe — the dossier's interactive subset (REQ-VFY-6)", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/review/${RUN}`, BOOT, f.impl);
    // Whole-root run (the Margin/Desk pane bodies mount in the chrome, outside
    // `[data-spa-surface]`). `aria-required-children` is disabled for the same reason the
    // ide-chrome test disables it: happy-dom has no layout engine, so CSS-collapsed role
    // containers (`data-ide-menu`, `data-margin-surface`) stay "visible" to the rule; the
    // journey suite's real-browser axe is the authoritative gate for that class.
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

// ---- /p/:slug/obligations/new --------------------------------------------------------------------

describe("GET /p/:slug/obligations/new mounted (SPA.21)", () => {
  const BOOT = bootFor(SPA_DOSSIER);

  it("renders the sheet verbatim + files a JSON obligation + lands ?obligation=new", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/obligations`]: { body: { ok: true, redirect: `/p/${SLUG}?obligation=new` } },
      },
    });
    const { router } = await mountAt(`/p/${SLUG}/obligations/new`, BOOT, f.impl);
    const root = el()!;
    expect(root.querySelector("h1")?.textContent).toBe(COPY.obligation.heading);
    const form = root.querySelector<HTMLFormElement>("form[data-obligation-form]")!;
    expect(form.getAttribute("action")).toBe(`/p/${SLUG}/obligations`);
    const title = form.querySelector<HTMLInputElement>('input[name="title"]')!;
    await act(async () => {
      fireEvent.change(title, { target: { value: "Re-check the census stats" } });
    });
    await submit(form);
    const post = f.posts.find((p) => p.url === `/p/${SLUG}/obligations`);
    expect(post?.json).toMatchObject({ title: "Re-check the census stats", severity: "minor", next: `/p/${SLUG}` });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${SLUG}`));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ obligation: "new" }));
  });

  it("confines + round-trips ?back= — the twin GET rides it and input[name=next] carries it", async () => {
    const f = makeFetch();
    const back = `/p/${SLUG}/review/${RUN}`;
    await mountAt(`/p/${SLUG}/obligations/new?back=${encodeURIComponent(back)}`, BOOT, f.impl);
    // The leaf-owned `back` rides the twin GET verbatim (server re-confines it via safeBack);
    // the serialized `sheet.back` lands in the form's hidden `next` field, not the address bar.
    expect(
      f.gets.some((u) => u.startsWith(`/bff/p/${SLUG}/obligations/new?back=${encodeURIComponent(back)}`)),
    ).toBe(true);
    const form = el()!.querySelector<HTMLFormElement>("form[data-obligation-form]")!;
    expect(form.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe(back);
  });

  it("the 422 refusal lands the same role=alert slot (server detail verbatim)", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/obligations`]: { status: 422, body: { error: "title_required", detail: COPY.obligation.required } },
      },
    });
    await mountAt(`/p/${SLUG}/obligations/new`, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>("form[data-obligation-form]")!;
    // happy-dom doesn't enforce `required` — the leaf posts what it has and renders the refusal.
    await submit(form);
    let alert: Element | null = null;
    await waitFor(() => {
      alert = el()!.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
    });
    expect(alert!.textContent).toBe(COPY.obligation.required);
  });
});

// ---- REQ-TST-2 — the SSR/SPA parity leg ------------------------------------------------------------

