// @vitest-environment happy-dom
//
// SPA.18 — the `outline` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/11, REQ-DAT-4/6, REQ-UX-6/16; design/22 §2 `p.outline`/`p.outlinePromote` +
// design/25 §p.outline). Mounted through the production router (memory history + a stub fetch)
// at `/p/:slug/outline` + `/p/:slug/outline/promote`: the SSR-verbatim vocabulary (spine/sections/
// claims/gaps/sources rows, provenance + `[unverified]` badges, the autosave form + status line,
// the draft-estimate + flash rails, the delete affordance + cited note, the promotion sheet's fact
// rails + consent form), the `client/outline.ts` debounce contract ported to a mutation leg, the
// REQ-UX-16 in-flight affordance, the cited-409 in-router flash nav, the phone read-only arm
// (§10.1 verbatim — no `ed.*` fields, no delete, no save), the `SsrHandoff` no-BFF leg, and the
// REQ-TST-2 parity legs against `OutlinePage`/`OutlinePromotePage` under a PageDataContext
// provider. Component axe covers both mounted surfaces.
//
// The fixtures mirror the retained SSR spec's (outline-surfaces.test.ts) — the parity legs compare
// the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffOutlinePromoteTwin, BffOutlineTwin } from "./queries.js";
import { axeCheck, restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

// ---- fixtures — outline-surfaces.test.ts's set, verbatim -----------------------------------------

const OUTLINE_VIEW = {
  thesis: "Visibility is a governance technology.",
  spine: ["c1", "c2", "c3", "c4", "c5"],
  sections: [
    {
      ref: "I",
      title: "Set-up",
      targetWords: 500,
      function: "Stage the commonplace",
      entry: "Seen = good",
      exit: "Seen has a price",
      claims: [
        { id: "c1", text: "Platforms frame visibility as empowerment.", provenanceKind: "thread" as const, provenance: { turnId: "turn_1" }, unverified: false },
        { id: "c2", text: "The burden falls unevenly.", provenanceKind: "source" as const, provenance: { url: "https://example.org/two" }, unverified: true },
      ] },
    {
      ref: "II",
      title: "The argument",
      claims: [
        { id: "c3", text: "Visibility demands legibility.", provenanceKind: "source" as const, provenance: { url: "https://example.org/one" }, unverified: false },
        { id: "c4", text: "Opting out reads as political.", provenanceKind: "generated" as const, provenance: {}, unverified: false },
        { id: "c5", text: "Selective opacity is defensible.", provenanceKind: "user_typed" as const, provenance: {}, unverified: false },
      ] },
  ],
  alternativesConsidered: ["the inverse frame"],
  gaps: [{ id: "g1", needed: "A first-person refusal example", sectionRef: "II" }],
  urls: [{ url: "https://example.org/two", unverified: true }] };

const OUTLINE_TWIN: BffOutlineTwin = {
  outline: {
    slug: "the-politics-of-visibility",
    editable: true,
    saveAction: "/p/the-politics-of-visibility/outline",
    deleteAction: "/p/the-politics-of-visibility/outline/delete",
    draftEstimateCredits: 12,
    outline: OUTLINE_VIEW,
    cited: false } };

const PROMOTE_TWIN: BffOutlinePromoteTwin = {
  outlinePromotion: {
    slug: "the-politics-of-visibility",
    projectTitle: "The Politics of Visibility",
    promotion: {
      slug: "the-politics-of-visibility",
      scope: "thread",
      threadId: "thr_1",
      sources: 3,
      sourceCopies: [{ src: "a.md", dst: "b.md" }],
      urls: ["https://example.org/one", "https://example.org/two"],
      threadTokens: 1200,
      urlsRefetched: 2,
      estimateCredits: 42,
      capCredits: 84,
      modelTier: "base",
      rigor: "standard",
      existing: false },
    scope: "thread",
    threadId: "thr_1" } };

// ---- the mount substrate -------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  outline?: BffOutlineTwin;
  promote?: BffOutlinePromoteTwin;
  /** mutation overrides — action path → envelope/ApiError-ish body + status. */
  mutations?: Record<string, { status?: number; body: unknown }>;
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
  /** the post-mutation outline twin — served once a POST has been recorded (the refetch's
   *  server truth). REQ-ENG-1: gating on the read COUNT raced StrictMode/staleTime-0 mount
   *  refetches — the cited truth could land before the delete ever posted and flake the
   *  settled() wait by legitimately never rendering the delete form. */
  outlineAfter?: BffOutlineTwin;
}

interface RecordedPost {
  url: string;
  json: unknown;
}

/** The fetch stub — GETs answer the twins; POSTs record `{url, json}` for the mutation legs and
 *  answer the `{ok,redirect}` envelope (or the override). Anything unstubbed 500s loudly. */
function makeFetch(opts: FetchOpts = {}) {
  const posts: RecordedPost[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (init?.method === "POST") {
      posts.push({ url: path, json: init.body ? JSON.parse(String(init.body)) : null });
      if (opts.hold?.[path] != null) return opts.hold[path]!;
      const mut = opts.mutations?.[path];
      if (mut != null) return jsonResponse(mut.status ?? 200, mut.body);
      return jsonResponse(200, { ok: true, redirect: "/p/the-politics-of-visibility" });
    }
    if (path === "/bff/p/the-politics-of-visibility/outline") {
      const twin = posts.length > 0 && opts.outlineAfter != null ? opts.outlineAfter : opts.outline;
      return jsonResponse(200, twin ?? OUTLINE_TWIN);
    }
    if (path === "/bff/p/the-politics-of-visibility/outline/promote") {
      return jsonResponse(200, opts.promote ?? PROMOTE_TWIN);
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
  return { impl, posts };
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_OUTLINE = {
  "/p/$project/outline": "spa",
  "/p/$project/outline/promote": "spa" } as const;

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }) });
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
  // REQ-ENG-1 — return only once the match has RESOLVED: `data-mounted` on <html> is the
  // router's settled-leaf stamp (REQ-NAVT-2 — a pending transition carries no stamp). The
  // bare post-mount selector reads below raced that commit and flaked in CI (BL-87 /
  // D-R5REC.1-1 — the non-null-asserted delete-form lookup intermittently found null).
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, queryClient, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");


/** Submit one form inside an act — fireEvent + the mutation's microtask flush. */
async function submit(form: Element) {
  await act(async () => {
    fireEvent.submit(form);
  });
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

// ---- /p/:slug/outline ---------------------------------------------------------------------------

describe("GET /p/:slug/outline mounted (SPA.18)", () => {
  const BOOT = bootFor(SPA_OUTLINE);

  it("renders the editor vocabulary verbatim — sections, claims, badges, gaps, autosave, delete", async () => {
    const f = makeFetch();
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.outlinePage.heading);
    // R7SHELL.1b — the back link is the Project › Surface crumb; none remains in the body.
    const crumb = main.querySelector("[data-page-breadcrumb]");
    expect(crumb?.querySelector('[data-breadcrumb-link]')?.getAttribute("href")).toBe("/p/the-politics-of-visibility");
    expect(crumb?.textContent).toContain(COPY.outlinePage.heading);
    expect(
      [...main.querySelectorAll('a[href="/p/the-politics-of-visibility"]')].every(
        (a) => a.closest("[data-page-breadcrumb]") != null,
      ),
    ).toBe(true);
    expect(main.querySelector("[data-draft-estimate]")?.textContent).toContain("12");
    expect(main.querySelector("form[data-outline-editor][data-autosave]")).not.toBeNull();
    const form = await settled("form[data-outline-editor]");
    expect(form.getAttribute("data-label-saving")).toBe(COPY.outlinePage.savingNote);
    expect(form.getAttribute("data-label-saved")).toBe(COPY.outlinePage.savedNote);
    expect(form.getAttribute("data-label-failed")).toBe(COPY.outlinePage.saveFailedNote);
    expect(form.getAttribute("action")).toBe("/p/the-politics-of-visibility/outline");
    // the shared rows — the manifest's outline bucket.
    expect(main.querySelector("[data-outline-sections]")).not.toBeNull();
    expect(main.querySelector("[data-outline-seclist]")).not.toBeNull();
    expect(main.querySelector("[data-outline-spine]")).not.toBeNull();
    expect(main.querySelector('[data-spine-id="c1"]')).not.toBeNull();
    expect(main.querySelector('[data-outline-section="I"]')).not.toBeNull();
    expect(main.querySelector('[data-outline-section="II"]')).not.toBeNull();
    expect(main.querySelectorAll("[data-outline-claims]").length).toBe(2);
    expect(main.querySelector('[data-outline-claim="c2"]')).not.toBeNull();
    expect(main.querySelector('[data-provenance="source"]')).not.toBeNull();
    expect(main.querySelector("[data-unverified]")).not.toBeNull();
    expect(main.querySelector("[data-alternatives]")).not.toBeNull();
    expect(main.querySelector("[data-outline-gaps]")).not.toBeNull();
    expect(main.querySelector('[data-outline-gap="g1"]')).not.toBeNull();
    expect(main.querySelector("[data-outline-sources]")).not.toBeNull();
    expect(main.querySelector("[data-add-claim]")).not.toBeNull();
    // the autosave affordances + the ed.* grammar.
    expect(main.querySelector("[data-autosave-status]")).not.toBeNull();
    expect(main.querySelector('input[name="ed.values.thesis"]')).not.toBeNull();
    expect(main.querySelector('input[name="ed.gap.g1"]')).not.toBeNull();
    expect(main.querySelector('button[type="submit"]')?.textContent).toBe(COPY.outlinePage.saveLabel);
    expect(main.querySelector("[data-outline-delete]")).not.toBeNull();
    // the React mount owns the form — the island's script tag is never emitted.
    expect(main.innerHTML).not.toContain("/assets/outline.js");
  });

  it("debounces an ed.* edit into ONE JSON POST of the same field map — the island's contract", async () => {
    const f = makeFetch();
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    vi.useFakeTimers();
    try {
      const input = await settled<HTMLInputElement>('input[name="ed.values.thesis"]');
      await act(async () => {
        fireEvent.input(input, { target: { value: "A tighter thesis." } });
      });
      // two edits inside the debounce window collapse to one save.
      await act(async () => {
        fireEvent.input(input, { target: { value: "A tighter thesis!" } });
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(f.posts.length).toBe(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(f.posts.length).toBe(1);
      expect(f.posts[0]!.url).toBe("/p/the-politics-of-visibility/outline");
      expect((f.posts[0]!.json as Record<string, string>)["ed.values.thesis"]).toBe("A tighter thesis!");
      // the status line lands the saved label (the form's own data-label-saved leaf).
      await vi.waitFor(() => {
        expect(el()!.querySelector("[data-autosave-status]")?.textContent).toBe(
          COPY.outlinePage.savedNote,
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed save lands the failed label on the status line", async () => {
    const f = makeFetch({
      mutations: { "/p/the-politics-of-visibility/outline": { status: 422, body: { error: "save_failed" } } } });
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    const form = await settled("form[data-outline-editor]");
    await submit(form);
    expect(el()!.querySelector("[data-autosave-status]")?.textContent).toBe(
      COPY.outlinePage.saveFailedNote,
    );
  });

  it("the explicit Save submit posts the field map immediately (the no-JS path's semantic)", async () => {
    const f = makeFetch();
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    const form = await settled("form[data-outline-editor]");
    await submit(form);
    expect(f.posts.length).toBe(1);
    expect(f.posts[0]!.url).toBe("/p/the-politics-of-visibility/outline");
    expect((f.posts[0]!.json as Record<string, string>)["ed.values.thesis"]).toBe(
      "Visibility is a governance technology.",
    );
    expect(el()!.querySelector("[data-autosave-status]")?.textContent).toBe(
      COPY.outlinePage.savedNote,
    );
  });

  it("delete rides the {ok,redirect} envelope in-router; a 409 navigates to the ?notice=cited flash", async () => {
    const f = makeFetch();
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    await submit(await settled("form[action$='/outline/delete']"));
    expect(f.posts[0]!.url).toBe("/p/the-politics-of-visibility/outline/delete");
    // the redirect target is the (unflipped) project leaf → SsrHandoff → the document nav.
    await vi.waitFor(() => {
      expect(docNavSpy).toHaveBeenCalledWith("/p/the-politics-of-visibility");
    });
  });

  it("delete's cited refusal lands ?notice=cited in-router — the same flash URL the 302 carried", async () => {
    const f = makeFetch({
      mutations: {
        "/p/the-politics-of-visibility/outline/delete": { status: 409, body: { error: "outline_cited" } } },
      // the invalidation's refetch answers the cited truth — the cited note + hidden delete.
      outlineAfter: { outline: { ...OUTLINE_TWIN.outline!, cited: true } } });
    const { router } = await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    await submit(await settled("form[action$='/outline/delete']"));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/p/the-politics-of-visibility/outline");
      expect(router.state.location.searchStr).toContain("notice=cited");
    });
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-notice]")?.textContent).toBe(COPY.outlinePage.citedNote);
      expect(el()!.querySelector("[data-cited-note]")).not.toBeNull();
      expect(el()!.querySelector("[data-outline-delete]")).toBeNull();
    });
  });

  it("REQ-UX-16 — an in-flight delete marks the form aria-busy and disables its control", async () => {
    let release!: () => void;
    const held = new Promise<Response>((res) => {
      release = () => res(jsonResponse(200, { ok: true, redirect: "/p/the-politics-of-visibility" }));
    });
    const f = makeFetch({ hold: { "/p/the-politics-of-visibility/outline/delete": held } });
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, f.impl);
    const form = await settled("form[action$='/outline/delete']");
    fireEvent.submit(form);
    await vi.waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBe("true");
      expect((form.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    });
    release();
    await vi.waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBeNull();
    });
  });

  it("?saved=1 + ?notice=cited render the flash rails (URL state, never payload)", async () => {
    await mountAt("/p/the-politics-of-visibility/outline?saved=1&notice=cited", BOOT, makeFetch().impl);
    const main = el()!;
    expect(main.querySelector("[data-saved-note]")?.textContent).toBe(COPY.outlinePage.savedNote);
    // the leaf maps the flash CODE to the copy leaf — verbatim the document's own mapping.
    expect(main.querySelector("[data-notice]")?.textContent).toBe(COPY.outlinePage.citedNote);
  });

  it("phone boot keeps §10.1 — read-only rows, no ed.* fields, no delete, no Save submit", async () => {
    await mountAt("/p/the-politics-of-visibility/outline", bootFor(SPA_OUTLINE, "phone"), makeFetch().impl);
    const main = el()!;
    expect(main.querySelector("[data-outline-sections]")).not.toBeNull();
    expect(main.querySelector('[data-lever="thesis"]')).not.toBeNull();
    expect(main.querySelectorAll('input[name^="ed."]').length).toBe(0);
    expect(main.querySelector("[data-outline-delete]")).toBeNull();
    expect(main.querySelector("form[data-outline-editor] button[type='submit']")).toBeNull();
    expect(main.querySelector("[data-add-claim]")).toBeNull();
  });

  it("{outline:null} renders the designed not-found arm; a 404 twin → the router's not-found", async () => {
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, makeFetch({ outline: { outline: null } }).impl);
    expect(el()!.querySelector("h1")?.textContent).toBe(COPY.outlinePage.heading);
    expect(el()!.textContent).toContain(COPY.outlinePage.notFound);
  });

  it("component axe on the mounted surface (REQ-VFY-6)", async () => {
    await mountAt("/p/the-politics-of-visibility/outline", BOOT, makeFetch().impl);
    await axeCheck(await settled("[data-spa-surface]"));
  });


  it("unflipped → SsrHandoff — the leaf document-navigates and never fetches the twin", async () => {
    const f = makeFetch();
    await mountAt(
      "/p/the-politics-of-visibility/outline",
      bootFor({ ...SPA_OUTLINE, "/p/$project/outline": "ssr" }),
      f.impl,
    );
    expect(docNavSpy).toHaveBeenCalledWith("/p/the-politics-of-visibility/outline");
    expect(f.impl.mock.calls.some(([u]) => String(u).startsWith("/bff/p/the-politics-of-visibility/outline"))).toBe(false);
  });
});

// ---- /p/:slug/outline/promote --------------------------------------------------------------------

describe("GET /p/:slug/outline/promote mounted (SPA.18)", () => {
  const BOOT = bootFor(SPA_OUTLINE);

  it("renders the consent sheet verbatim — scope line, fact rails, the hidden replays", async () => {
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1", BOOT, makeFetch().impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.promote.heading);
    expect(main.textContent).toContain(COPY.promote.scopeLabel.thread);
    expect(main.querySelector("[data-promotion-sources]")?.textContent).toContain("3 source notes");
    expect(main.querySelector("[data-promotion-urls]")?.textContent).toContain("2 URLs");
    expect(main.querySelector("[data-promotion-estimate]")?.textContent).toContain("42");
    const form = await settled<HTMLFormElement>('form[action$="/outline/promote"]');
    expect(form.querySelector('input[name="scope"]')?.getAttribute("value")).toBe("thread");
    expect(form.querySelector('input[name="threadId"]')?.getAttribute("value")).toBe("thr_1");
    expect(form.querySelector('input[name="slug"]')).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')?.textContent).toBe(COPY.promote.promoteLabel);
  });

  it("scope=turn replays turnId through the hidden field (the SSR field map)", async () => {
    const { threadId: _dropped, ...turnPromotion } = PROMOTE_TWIN.outlinePromotion!.promotion;
    const { threadId: _dropped2, ...turnSheet } = PROMOTE_TWIN.outlinePromotion!;
    const turnTwin: BffOutlinePromoteTwin = {
      outlinePromotion: {
        ...turnSheet,
        promotion: { ...turnPromotion, scope: "turn", turnId: "turn_9" },
        scope: "turn",
        turnId: "turn_9" } };
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=turn&turnId=turn_9", BOOT, makeFetch({ promote: turnTwin }).impl);
    const form = await settled<HTMLFormElement>('form[action$="/outline/promote"]');
    expect(form.querySelector('input[name="scope"]')?.getAttribute("value")).toBe("turn");
    expect(form.querySelector('input[name="turnId"]')?.getAttribute("value")).toBe("turn_9");
    expect(form.querySelector('input[name="threadId"]')).toBeNull();
  });

  it("the Promote click posts the field map JSON and rides {ok,redirect} in-router", async () => {
    const f = makeFetch();
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1", BOOT, f.impl);
    await submit(await settled('form[action$="/outline/promote"]'));
    expect(f.posts.length).toBe(1);
    expect(f.posts[0]!.url).toBe("/p/the-politics-of-visibility/outline/promote");
    expect(f.posts[0]!.json).toEqual({
      scope: "thread",
      threadId: "thr_1",
      slug: "the-politics-of-visibility" });
    // the redirect target is the (unflipped) project leaf → SsrHandoff → document nav.
    await vi.waitFor(() => {
      expect(docNavSpy).toHaveBeenCalledWith("/p/the-politics-of-visibility");
    });
  });

  it("a refused promote renders the sheet's notice arm (the document's re-render verbatim)", async () => {
    const f = makeFetch({
      mutations: {
        "/p/the-politics-of-visibility/outline/promote": { status: 404, body: { error: "thread_not_found" } } } });
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_gone", BOOT, f.impl);
    const form = await settled<HTMLFormElement>('form[action$="/outline/promote"]');
    await submit(form);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-notice]")?.textContent).toBe(COPY.promote.notFound);
      // REQ-UX-16 — the controls re-enable on settle.
      expect(form.getAttribute("aria-busy")).toBeNull();
    });
  });

  it("the started arm renders verbatim when the twin carries it", async () => {
    const f = makeFetch({
      promote: {
        outlinePromotion: { ...PROMOTE_TWIN.outlinePromotion!, started: { runId: "run_1", slug: "the-politics-of-visibility" } } } });
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1", BOOT, f.impl);
    expect(el()!.querySelector("[data-started]")?.textContent).toBe(COPY.promote.startedFmt);
    expect(el()!.querySelector('form[action$="/outline/promote"]')).toBeNull();
  });

  it("{outlinePromotion:null} renders the sheet's not-found arm", async () => {
    await mountAt(
      "/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_gone",
      BOOT,
      makeFetch({ promote: { outlinePromotion: null } }).impl,
    );
    expect(el()!.textContent).toContain(COPY.promote.notFound);
  });

  it("the existing-outline note renders when the twin flags it", async () => {
    const f = makeFetch({
      promote: {
        outlinePromotion: {
          ...PROMOTE_TWIN.outlinePromotion!,
          promotion: { ...PROMOTE_TWIN.outlinePromotion!.promotion, existing: true } } } });
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1", BOOT, f.impl);
    expect(el()!.querySelector("[data-existing]")?.textContent).toBe(COPY.promote.existingNote);
  });

  it("component axe on the mounted sheet (REQ-VFY-6)", async () => {
    await mountAt("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1", BOOT, makeFetch().impl);
    await axeCheck(await settled("[data-spa-surface]"));
  });


  it("unflipped → SsrHandoff — no BFF spend", async () => {
    const f = makeFetch();
    await mountAt(
      "/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1",
      bootFor({ ...SPA_OUTLINE, "/p/$project/outline/promote": "ssr" }),
      f.impl,
    );
    expect(docNavSpy).toHaveBeenCalledWith("/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1");
    expect(f.impl.mock.calls.some(([u]) => String(u).startsWith("/bff/p/the-politics-of-visibility/outline"))).toBe(false);
  });
});
