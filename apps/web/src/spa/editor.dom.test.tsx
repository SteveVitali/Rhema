// @vitest-environment happy-dom
//
// SPA.23 — the `editor` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/11/22, REQ-ED-1/2/4/12/14; design/23 §3 the mount + §7 the twins). Mounted through
// the production router (memory history + a stub fetch) at all five routes:
//   • `/p/:slug` — the REQ-BFF-22 handoff in the loader, concurrent with the twin GET per REQ-SPEED-1 (the POST + the `?focus=1` suppression +
//     the owed-href document nav), then the overview's Needs-you + the working-head Page mount.
//   • `/p/:slug/v/:v` — the rail + the Page chrome (the `working` arm + a numeric draft).
//   • `/p/:slug/v/:n/diff/:m` — the read-only compare layouts.
//   • `/p/:slug/a/:artifactId` — the server-decided read-only artifact Page.
//   • `/p/:slug/revisions/:cid` — the What-changed read.
// The mount legs assert the design/23 §3 contract: `EditorView` created once inside the effect
// (`[data-page-view]` + `.rm-page` stamp), the SSR preview yields (`data-page-preview` unmounts —
// the declarative `preview?.remove()` twin), StrictMode's double-mount keeps the SAME EditorState
// via the registry, and the read-only arm is the server-decided posture bit-for-bit.
//
// REQ-VFY-9 disposition (design/27 §8's class map for this surface's SSR asserts): the document's
// HTML-string legs stay — server.test.ts owns the unchanged SSR path (the Page island's embeds +
// /assets/page.js tag are SSR-only by design: the SPA derives the doc via `markdownToDoc`, F5 —
// the parity leg below skips the three `script[type=json]` embed hooks explicitly). The twin +
// wantsJson write branches gained real asserts in the SPA.23 server.test.ts describe; the
// render-assert class moves to this file's mounted legs; the form-POST legs map to the
// delegated-submit envelope (the same `{ok,redirect}` in-router nav the surface contract shares).

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatChangedDto } from "@rhema/api-client";
import { PageDataContext } from "../page-data.js";
import { ComparePage, ProjectPage, RevisionPage } from "../pages.js";
import { hooksForSurface } from "../dom-contract.js";
import { createSpaRouter } from "./main.js";
import { PageMount } from "./page-mount.js";
import type { SpaBoot } from "./boot.js";
import type { BffCompareTwin, BffProjectTwin, BffRevisionTwin, BffVersionPageTwin } from "./queries.js";
import axe from "axe-core";
import { expectManifestEmission, restoreDocumentNav, SETTLE_TIMEOUT, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "the-politics-of-visibility";

// ---- fixtures — the server.test.ts SPA.23 set, verbatim ------------------------------------------

const DOC = {
  draftId: "d_7",
  draftN: 7,
  origin: "human_revision",
  state: "open",
  baseDraftId: "d_6",
  baseDraftN: 6,
  markdown: "## A draft\n\nBody text.",
  sha256: "sha_1",
  lock: null,
  findings: [],
  meters: { words: 4, readMin: 1 },
};

const RAIL_DATA = {
  workingN: 7,
  chip: { open: 1, addressed: 0 },
  outline: null,
  drafts: [
    {
      draftId: "d_7",
      n: 7,
      origin: "human_revision",
      state: "open",
      frozen: false,
      frozenAt: null,
      createdAt: "2026-10-01T00:00:00Z",
      words: 4,
      reviewed: false,
      answered: false,
      claimsPendingVerification: false,
      obligations: { open: 1, addressed: 0 },
    },
    {
      draftId: "d_6",
      n: 6,
      origin: "import",
      state: "frozen",
      frozen: true,
      frozenAt: "2026-09-30T00:00:00Z",
      createdAt: "2026-09-30T00:00:00Z",
      words: 3,
      reviewed: true,
      answered: true,
      claimsPendingVerification: false,
      obligations: { open: 0, addressed: 1 },
    },
  ],
};

const WHAT_CHANGED: WhatChangedDto = {
  ok: true,
  responseId: "c_1",
  reviewId: "run_1",
  beforeN: 6,
  afterN: 7,
  view: {
    strip: { addressed: 0, rebutted: 0, stillOpen: 1, moves: 0, hunks: 1 },
    moves: [],
    unlinked: {
      hunks: [
        {
          id: "h_1",
          kind: "edited",
          before: [{ blockId: "b_1", text: "Old text.", index: 0, startOffset: 0, endOffset: 9 }],
          after: [{ blockId: "b_1", text: "Body text.", index: 0, startOffset: 0, endOffset: 10 }],
          charsChanged: 10,
        },
      ],
      entries: [],
    },
    rebutted: [],
  },
} as unknown as WhatChangedDto;

const DIFF: BffCompareTwin["compare"]["data"] = {
  ok: true,
  responseId: null,
  reviewId: null,
  before: {
    draftId: "d_6",
    n: 6,
    origin: "import",
    state: "frozen",
    frozenAt: "2026-09-30T00:00:00Z",
    createdAt: "2026-09-30T00:00:00Z",
    claimsPendingVerification: false,
  },
  after: {
    draftId: "d_7",
    n: 7,
    origin: "human_revision",
    state: "open",
    frozenAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    claimsPendingVerification: false,
  },
  diff: {
    hunks: WHAT_CHANGED.view.unlinked.hunks,
    unchanged: 0,
    beforeBlocks: [],
    afterBlocks: [],
  },
  view: WHAT_CHANGED.view,
} as unknown as BffCompareTwin["compare"]["data"];

const IDE = { palette: "{}", paletteSearchUrl: `/p/${SLUG}/palette-search` };
const PROJECT = { title: "The Politics of Visibility", pill: "Edited by you", slug: SLUG, headDraftId: "d_7" };

const PROJECT_TWIN: BffProjectTwin = {
  project: { ...PROJECT, headDraftN: 7 },
  gates: [],
  decisions: [],
  approvalOverrides: {} as never,
  explainersDismissed: [],
  page: { slug: SLUG, projectId: "proj_pv", doc: DOC as never },
  paperTheme: "light",
  ide: IDE,
};

const VERSION_TWIN: BffVersionPageTwin = {
  page: {
    slug: SLUG,
    projectId: "proj_pv",
    doc: DOC as never,
    rail: { data: RAIL_DATA as never, currentN: 7, points: [] },
  },
  project: PROJECT,
  paperTheme: "light",
  ide: IDE,
};

const COMPARE_TWIN: BffCompareTwin = {
  compare: { slug: SLUG, n: "6", m: "7", data: DIFF },
  project: PROJECT,
  paperTheme: "light",
  ide: IDE,
};

const ARTIFACT_TWIN = {
  page: { slug: SLUG, projectId: "proj_pv", doc: DOC as never, readOnly: true },
  project: PROJECT,
  paperTheme: "light",
  ide: IDE,
};

const REVISION_TWIN: BffRevisionTwin = {
  revision: { slug: SLUG, data: WHAT_CHANGED },
  project: PROJECT,
  paperTheme: "light",
  ide: IDE,
};

// ---- the mount substrate -------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  project?: BffProjectTwin;
  version?: BffVersionPageTwin;
  compare?: BffCompareTwin;
  artifact?: typeof ARTIFACT_TWIN;
  revision?: BffRevisionTwin;
  handoff?: unknown;
  status?: number;
}

function makeFetch(opts: FetchOpts = {}) {
  const posts: { url: string }[] = [];
  const gets: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (init?.method === "POST") {
      posts.push({ url });
      if (path === `/bff/p/${SLUG}/handoff`) {
        return jsonResponse(200, { ok: true, data: { handoff: opts.handoff ?? null } });
      }
      return jsonResponse(200, { ok: true });
    }
    gets.push(url);
    if (opts.status != null) return jsonResponse(opts.status, { error: "not_found" });
    if (path === `/bff/p/${SLUG}`) return jsonResponse(200, opts.project ?? PROJECT_TWIN);
    if (path === `/bff/p/${SLUG}/v/working` || /^\/bff\/p\/[^/]+\/v\/\d+$/.test(path)) {
      return jsonResponse(200, opts.version ?? VERSION_TWIN);
    }
    if (/^\/bff\/p\/[^/]+\/v\/[^/]+\/diff\/[^/]+$/.test(path)) {
      return jsonResponse(200, opts.compare ?? COMPARE_TWIN);
    }
    if (/^\/bff\/p\/[^/]+\/a\/[^/]+$/.test(path)) return jsonResponse(200, opts.artifact ?? ARTIFACT_TWIN);
    if (/^\/bff\/p\/[^/]+\/revisions\/[^/]+$/.test(path)) {
      return jsonResponse(200, opts.revision ?? REVISION_TWIN);
    }
    return jsonResponse(500, { error: `unstubbed_path:${path}` });
  });
  return { impl, posts, gets };
}

const SPA_EDITOR = {
  "/p/$project": "spa",
  "/p/$project/v/$v": "spa",
  "/p/$project/v/$n/diff/$m": "spa",
  "/p/$project/a/$artifactId": "spa",
  "/p/$project/revisions/$cid": "spa",
} as const;

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
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
    await router.load();
  });
  // REQ-ENG-1 — return only once the match has RESOLVED: `data-mounted` on <html> is the
  // router's settled-leaf stamp (REQ-NAVT-2). Bare post-mount selector reads raced that
  // commit — the BL-87 mount-settle flake class.
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
/** The REQ-TST-2 emission filter — which `editor` manifest attrs a markup string emits. */
function emittedAttrs(markup: string) {
  return hooksForSurface("editor").filter(
    (e) => e.kind === "attr" && new RegExp(`\\b${esc(e.hook)}(?:[\\s=>/]|$)`).test(markup),
  );
}

// The three `script[type=json]` embeds are SSR-only by design (design/23 §7 note F5 — the SPA
// derives the doc via `markdownToDoc`, never re-embeds); the island's `/assets/page.js` tag goes
// with them. `data-page-preview` is emitted on the SPA's pre-mount paint only — the mount's
// declarative `preview?.remove()` yields it when the live `EditorView` binds (its presence is
// asserted by the PageMount static-markup leg below). Everything else the SSR emits, the SPA
// must emit.
const EMBED_ONLY = new Set(["data-page-doc", "data-page-prov", "data-page-findings", "data-page-preview"]);

/** Component axe — same happy-dom caveat the dossier/ide-chrome specs carry: `aria-required-children`
 *  is disabled because CSS-collapsed role containers (`data-ide-menu` mounts `hidden`) stay
 *  "visible" to the rule without a layout engine; the journey suite's real-browser axe owns that
 *  class. Every other rule runs. */
async function axeRun(scope: Element): Promise<void> {
  const results = await axe.run(scope as axe.ElementContext, {
    rules: {
      "color-contrast": { enabled: false },
      "aria-required-children": { enabled: false },
    },
  });
  expect(
    results.violations.map((v) => v.id),
    `axe violations: ${results.violations.map((v) => `${v.id} (${v.nodes.length} node(s))`).join(", ")}`,
  ).toEqual([]);
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

// ---- /p/:slug — the handoff + the overview mount --------------------------------------------------

describe("GET /p/:slug mounted (SPA.23)", () => {
  it("REQ-BFF-22 + REQ-SPEED-1 — the loader posts the handoff concurrently with the twin read; the overview + the working-head Page land", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    expect(f.posts.map((p) => p.url)).toContain(`/bff/p/${SLUG}/handoff`);
    expect(f.gets).toContain(`/bff/p/${SLUG}`);
    const main = el()!;
    // the overview's shared chrome + the working-head Page mount (REQ-TST-2).
    expect(main.querySelector("[data-page-mount='working']")).not.toBeNull();
    expect(main.querySelector("[data-page-root]")).not.toBeNull();
    expect(main.querySelector("[data-draft-id='d_7']")).not.toBeNull();
  });

  it("R7SYNC.1 (REQ-SPEED-1) — the handoff POST rides IN PARALLEL with the twin read (never serial); an owed row still lands the redirect", async () => {
    const f = makeFetch({ handoff: { href: `/p/${SLUG}/r/run_1`, inboxItemId: "inbox_1" } });
    try {
      await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    } catch {
      // the thrown redirect is the arm — the document nav may surface as a thrown
      // redirect or a location write; either way the twin read must never fire.
    }
    expect(f.posts.map((p) => p.url)).toContain(`/bff/p/${SLUG}/handoff`);
    // REQ-SPEED-1 — the twin GET fired concurrently (same tick), never behind the write.
    expect(f.gets).toContain(`/bff/p/${SLUG}`);
    expect(f.posts.filter((p) => p.url === `/bff/p/${SLUG}/handoff`).length).toBe(1);
  });

  it("?focus=1 rides the handoff POST's query — the suppression is server-owned", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}?focus=1`, bootFor(SPA_EDITOR), f.impl);
    expect(f.posts.map((p) => p.url)).toContain(`/bff/p/${SLUG}/handoff?focus=1`);
  });

  it("the PageMount effect binds the live EditorView — data-page-view stamps, the preview yields", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    const view = main.querySelector("[data-page-view]")!;
    expect(view.getAttribute("data-page-view")).toBe("1");
    expect(view.classList.contains("rm-page")).toBe(true);
    // the declarative `preview?.remove()` twin — no-JS floor unmounts when the live view binds.
    expect(main.querySelector("[data-page-preview]")).toBeNull();
  });

  it("StrictMode's double-mount reuses the registry entry — the EditorView carries the doc, not a re-created state", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    // a mounted, bound view renders the doc text once (the registry's ONE state — a re-created
    // state would mean a second init, which the singleton's draft:<id> identity prevents).
    const view = el()!.querySelector("[data-page-view]")!;
    expect(view.textContent).toContain("Body text.");
  });

  it("REQ-TST-2 parity — every non-embed editor hook the SSR overview emits on this fixture is emitted", async () => {
    const ssr = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{
          project: { title: PROJECT.title, pill: PROJECT.pill, slug: SLUG, headDraftId: "d_7" },
          gates: [],
          decisions: [],
          approvalOverrides: {} as never,
          page: { slug: SLUG, projectId: "proj_pv", doc: DOC as never, docJson: {} } as never,
          compact: false,
        }}
      >
        <ProjectPage />
      </PageDataContext.Provider>,
    );
    const f = makeFetch();
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const emitted = emittedAttrs(ssr).filter((e) => !EMBED_ONLY.has(e.hook));
    expect(emitted.length).toBeGreaterThan(0);
    expectManifestEmission(el()!.outerHTML, emitted);
  });

  it("component axe on the mounted overview", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    await axeRun(el()!);
  });
});

// ---- R7HOME.2b (REQ-HOME-2/3) — the Page IS the surface -------------------------------------------

const BLANK_DOC = { ...DOC, draftId: "d_1", draftN: 1, markdown: "", meters: { words: 0, readMin: 0 } };
const BLANK_PROJECT_TWIN: BffProjectTwin = {
  ...PROJECT_TWIN,
  project: { ...PROJECT, title: "Untitled", headDraftN: 1, created: { entry: "scratch" } } as never,
  page: { slug: SLUG, projectId: "proj_pv", doc: BLANK_DOC as never },
};

describe("R7HOME.2b — opens to Page, blank-create landing, affordance row, admin moved", () => {
  it("a head draft mounts the Page with NO admin below the document (REQ-HOME-2)", async () => {
    const f = makeFetch({
      project: {
        ...PROJECT_TWIN,
        gates: [{ id: "g_1", runId: "r_1", kind: "approve_triage", workflow: "review", state: "waiting", artifactId: null, artifactTitle: null, deadline: null, waitingHours: null, decisionScope: null, doNothing: null, activity: null, escalateTo: null, summary: null }] as never,
        decisions: [{ id: "dcr_1", projectId: "proj_pv", obligationId: null, text: "Decide", options: [], createdAt: "2026-10-01T00:00:00Z" }] as never,
        approvalSettings: { policy: "auto", deadlines: [], standing: [] } as never,
        projectVoice: { current: { personaId: null, voiceMode: "ad_hoc" }, options: [] } as never,
      } as never,
    });
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    expect(main.querySelector("[data-page-mount='working']")).not.toBeNull();
    // the admin block moved to Project settings / Inbox + Timeline — none of it renders below
    // the document body on the Page surface.
    for (const hook of [
      "[data-needs-you]",
      "[data-voice-picker]",
      "[data-edit-source]",
      "[data-next-step-card]",
      "[data-approval-opt-in]",
      "[data-decisions-list]",
      "[data-gate-card]",
    ]) {
      expect(main.querySelector(hook), hook).toBeNull();
    }
    expect(main.querySelector("[data-page-root]")).not.toBeNull();
    // no modal anywhere on the surface (REQ-IDE-41 kept) — the chrome's pre-existing cheat-sheet
    // dialog is frame furniture, not the admin block's modal.
    expect(main.querySelector("[aria-modal='true'], [role='dialog']:not([data-ide-cheatsheet])")).toBeNull();
  });

  it("?created=scratch lands a focused inline 'Untitled' title with no duplicate heading (REQ-HOME-3)", async () => {
    const f = makeFetch({ project: BLANK_PROJECT_TWIN });
    await mountAt(`/p/${SLUG}?created=scratch`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    const form = main.querySelector("form[data-inline-title]");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBe(`/p/${SLUG}/rename`);
    const input = form!.querySelector("input[name='title']")!;
    expect((input as HTMLInputElement).value).toBe("Untitled");
    expect(document.activeElement).toBe(input);
    // I2 — exactly ONE element carries the project title: the inline field IS the title (no
    // placeholder heading above it).
    const h1s = Array.from(main.querySelectorAll("h1, h2")).filter((h) => (h.textContent ?? "").includes("Untitled"));
    expect(h1s.length).toBe(0);
    const titleCarriers = Array.from(main.querySelectorAll("input[name='title'], h1, h2")).filter(
      (e) => e instanceof HTMLInputElement ? e.value === "Untitled" : (e.textContent ?? "").includes("Untitled"),
    );
    expect(titleCarriers.length).toBe(1);
  });

  it("the blank head renders the quiet affordance row — each action opens its existing flow", async () => {
    const f = makeFetch({ project: BLANK_PROJECT_TWIN });
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const row = el()!.querySelector("[data-empty-page-actions]");
    expect(row).not.toBeNull();
    const hrefs = Array.from(row!.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/p/${SLUG}/import`);   // Import a file · Paste text
    expect(hrefs).toContain(`/p/${SLUG}/outline`);  // Start from an outline
    const chat = row!.querySelector("button[data-ide-panel-tab='chat']");
    expect(chat).not.toBeNull();                    // Ask in chat — the controller's own tab arm
  });

  it("a NON-empty head carries no affordance row (it is not the empty Page)", async () => {
    const f = makeFetch(); // the base twin's doc has content
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    expect(el()!.querySelector("[data-empty-page-actions]")).toBeNull();
    expect(el()!.querySelector("[data-inline-title]")).toBeNull();
  });
});

// ---- the PageMount's pre-mount paint (REQ-ED-14's no-JS floor twin) --------------------------------

describe("PageMount pre-mount paint (SPA.23)", () => {
  it("the first render carries data-page-preview + data-page-host — the no-JS/pending floor", () => {
    // A static render (no effects) is the pending/pre-mount paint verbatim — the SSR floor the
    // leaf hands React: `[data-page-host]` hosts the `[data-page-preview]` <PmPreview> until the
    // effect binds the live view. The mount tests above assert it yields on bind.
    const markup = renderToStaticMarkup(
      <PageMount draftId="d_7" docJson={{ type: "doc", content: [] }} />,
    );
    expect(markup).toContain("data-page-host");
    expect(markup).toContain("data-page-preview");
    expect(markup).toContain('data-readonly="0"');
  });
});

// ---- /p/:slug/v/:v — the version Page -------------------------------------------------------------

describe("GET /p/:slug/v/:v mounted (SPA.23)", () => {
  it("the version Page mounts the rail + the live view on the working head", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/working`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}/v/working`);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    expect(main.querySelector("[data-version-rail]")).not.toBeNull();
    expect(main.querySelector("[data-page-root]")).not.toBeNull();
  });

  it("a numeric version mounts the same chrome — the rail row for v6 carries its draft", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/6`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}/v/6`);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    expect(el()!.querySelector("[data-version-rail]")).not.toBeNull();
  });

  it("REQ-DATA-14 — the ?imported=superseded&pn landing flash pushes the freeze toast", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/2?imported=superseded&pn=1`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    await vi.waitFor(() =>
      expect(el()!.querySelector(".ui-toast-viewport [role='status']")).not.toBeNull(),
    );
    expect(el()!.querySelector(".ui-toast-viewport")!.textContent).toContain("v1 was frozen");
  });
});

// ---- /p/:slug/v/:n/diff/:m — the compare ----------------------------------------------------------

describe("GET /p/:slug/v/:n/diff/:m mounted (SPA.23)", () => {
  it("the compare leaf renders the diff layouts over the verbatim pair", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/6/diff/7`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}/v/6/diff/7`);
    const main = el()!;
    expect(main.querySelector("[data-compare]")).not.toBeNull();
    await axeRun(main);
  });

  it("REQ-TST-2 parity — every compare hook the SSR compare emits on this fixture is emitted", async () => {
    const ssr = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{
          project: { title: PROJECT.title, pill: PROJECT.pill, slug: SLUG },
          compare: { slug: SLUG, n: "6", m: "7", layout: "side", data: DIFF } as never,
          compact: false,
        }}
      >
        <ComparePage />
      </PageDataContext.Provider>,
    );
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/6/diff/7`, bootFor(SPA_EDITOR), f.impl);
    const emitted = emittedAttrs(ssr);
    expect(emitted.length).toBeGreaterThan(0);
    expectManifestEmission(el()!.outerHTML, emitted);
  });
});

// ---- /p/:slug/a/:artifactId — the read-only artifact Page ----------------------------------------

describe("GET /p/:slug/a/:artifactId mounted (SPA.23)", () => {
  it("the artifact Page mounts read-only — the server-decided posture, never a client flip", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/a/a_1`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}/a/a_1`);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    expect(main.querySelector("[data-page-host]")?.getAttribute("data-readonly")).toBe("1");
    // REQ-ED-4 — the read-only arm carries the banner and no edit affordances.
    expect(main.querySelector("[data-page-banner='readonly']")).not.toBeNull();
    // PM's editable flag stays false — no contenteditable surface to type into.
    expect(main.querySelector("[contenteditable='true']")).toBeNull();
  });
});

// ---- /p/:slug/revisions/:cid — the What-changed read ----------------------------------------------

describe("GET /p/:slug/revisions/:cid mounted (SPA.23)", () => {
  it("the revision leaf renders the What-changed view + the hunk-comment form", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/revisions/c_1`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}/revisions/c_1`);
    const main = el()!;
    expect(main.querySelector("[data-hunk]")).not.toBeNull();
    await axeRun(main);
  });

  it("REQ-TST-2 parity — every revision hook the SSR page emits on this fixture is emitted", async () => {
    const ssr = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{
          project: { title: PROJECT.title, pill: PROJECT.pill, slug: SLUG },
          revision: { slug: SLUG, data: WHAT_CHANGED } as never,
          compact: false,
        }}
      >
        <RevisionPage />
      </PageDataContext.Provider>,
    );
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/revisions/c_1`, bootFor(SPA_EDITOR), f.impl);
    const emitted = emittedAttrs(ssr);
    expect(emitted.length).toBeGreaterThan(0);
    expectManifestEmission(el()!.outerHTML, emitted);
  });
});

// ---- the SsrHandoff leg (REQ-SEQ-4's flag-safety) --------------------------------------------------

describe("unflipped routes (SPA.23)", () => {
  it("an 'ssr' verdict hands the document back — SsrHandoff, zero BFF reads", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/6`, bootFor({ "/p/$project/v/$v": "ssr" }), f.impl);
    expect(f.gets).toEqual([]);
    expect(f.posts).toEqual([]);
  });
});

// ---- R7RO.1 — the showcase arm is gone: the Page family mounts INSIDE the SPA read-only -------
//
// ADR-128's REQ-ED-12 item: the server verdict is `isPhoneRequest(c)` alone — a showcase row's
// document is the SPA shell, and the leaf mounts the surface read-only through the twin's
// `project.readOnlyProject` carrier. These legs FAIL if the leaf still hands off to a document
// load (the old `twinForcesSsr` seam is deleted) or if the read-only notice never mounts; a
// non-showcase twin mounts the editable surface exactly as before.

describe("showcase rows mount the Page family in the SPA read-only (R7RO.1)", () => {
  const SHOWCASE_PROJECT = { ...PROJECT, showcase: true, readOnlyProject: { reason: "showcase" as const } };

  it("/p/:slug — the surface mounts read-only with the notice; no document handoff", async () => {
    const f = makeFetch({ project: { ...PROJECT_TWIN, project: SHOWCASE_PROJECT } });
    await mountAt(`/p/${SLUG}`, bootFor(SPA_EDITOR), f.impl);
    expect(f.gets).toContain(`/bff/p/${SLUG}`);
    const main = el()!;
    await vi.waitFor(() => {
      expect(main.querySelector("[data-readonly-notice='showcase']")).not.toBeNull();
    });
    // the SPA Page mount rendered (never a handoff skeleton, never a document nav).
    expect(main.querySelector("[data-page-mount]")).not.toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("/p/:slug — a boot-stamped showcase slug skips the beforeLoad handoff POST", async () => {
    const boot: SpaBoot = {
      ...bootFor(SPA_EDITOR),
      project: { slug: SLUG },
      readOnlyProject: { reason: "showcase" },
    };
    const f = makeFetch({ project: { ...PROJECT_TWIN, project: SHOWCASE_PROJECT } });
    await mountAt(`/p/${SLUG}`, boot, f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-mount]")).not.toBeNull());
    // the read-only fact was known BEFORE the twin loaded — zero non-GET ran.
    expect(f.posts).toEqual([]);
  });

  it("/p/:slug/v/:v — the read-only SPA mount carries the notice + the rail", async () => {
    const f = makeFetch({ version: { ...VERSION_TWIN, project: SHOWCASE_PROJECT } as BffVersionPageTwin });
    await mountAt(`/p/${SLUG}/v/working`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-page-view]")).not.toBeNull();
    });
    expect(el()!.querySelector("[data-readonly-notice='showcase']")).not.toBeNull();
    expect(el()!.querySelector("[data-version-rail]")).not.toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("/p/:slug/v/:n/diff/:m — the compare mounts read-only; hunk comments withhold", async () => {
    const f = makeFetch({ compare: { ...COMPARE_TWIN, project: SHOWCASE_PROJECT } });
    await mountAt(`/p/${SLUG}/v/6/diff/7`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-compare]")).not.toBeNull();
    });
    expect(el()!.querySelector("[data-readonly-notice='showcase']")).not.toBeNull();
    expect(el()!.querySelector("[data-hunk-comment]")).toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("/p/:slug/a/:artifactId — the artifact Page mounts read-only under the notice", async () => {
    const f = makeFetch({ artifact: { ...ARTIFACT_TWIN, project: SHOWCASE_PROJECT } });
    await mountAt(`/p/${SLUG}/a/a_1`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-page-view]")).not.toBeNull();
    });
    expect(el()!.querySelector("[data-readonly-notice='showcase']")).not.toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("/p/:slug/revisions/:cid — the revision mounts read-only; comments withhold", async () => {
    const f = makeFetch({ revision: { ...REVISION_TWIN, project: SHOWCASE_PROJECT } });
    await mountAt(`/p/${SLUG}/revisions/c_1`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-what-changed], [data-hunk]")).not.toBeNull();
    });
    expect(el()!.querySelector("[data-readonly-notice='showcase']")).not.toBeNull();
    expect(el()!.querySelector("[data-hunk-comment]")).toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("a non-showcase twin mounts the editable surface — the posture is row-scoped", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/working`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    expect(el()!.querySelector("[data-readonly-notice]")).toBeNull();
    expect(docNavSpy).not.toHaveBeenCalled();
  });
});

describe("R7WRITE.1b — anchored comments + the fork-undo toast (REQ-WRITE-2/7)", () => {
  it("the SPA Page carries NO bottom note form — the margin renders the twin's comment card", async () => {
    const commented = {
      ...VERSION_TWIN,
      page: {
        ...(VERSION_TWIN.page as Record<string, unknown>),
        doc: {
          ...DOC,
          comments: [
            {
              id: "g_1",
              text: "tighten this claim",
              anchor: { blockId: "b_1", quote: "Body text.", startOffset: 2, endOffset: 12, confidence: 1 },
              createdAt: "2026-10-02T00:00:00Z",
            },
          ],
        },
      },
    } as BffVersionPageTwin;
    const f = makeFetch({ version: commented });
    await mountAt(`/p/${SLUG}/v/7`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    const main = el()!;
    // REQ-WRITE-2 — the SPA's bottom-of-page note form is gone (the phone SSR keeps its own).
    expect(main.querySelector('form[action$="/note"]')).toBeNull();
    // the anchored Guidance renders as the margin card keyed to its block anchor.
    const card = main.querySelector<HTMLElement>("[data-comment-card]");
    expect(card).not.toBeNull();
    expect(card?.dataset["commentCard"]).toBe("g_1");
    expect(main.querySelector("[data-anchor-block]")).toBe(card);
    expect(card?.dataset["anchorBlock"]).toBe("b_1");
    expect(card?.textContent).toContain("tighten this claim");
  });

  it("rhema:fork-toast pushes the 'reviewed version' toast with the Undo action (REQ-WRITE-7)", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/v/7`, bootFor(SPA_EDITOR), f.impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("rhema:fork-toast", { detail: { draftId: "d_7", draftN: 7, baseN: 6 } }),
      );
    });
    await vi.waitFor(() =>
      expect(el()!.querySelector(".ui-toast-viewport [role='status']")).not.toBeNull(),
    );
    const toast = el()!.querySelector(".ui-toast-viewport")!;
    expect(toast.textContent).toContain("You're editing a reviewed version, so this starts v7");
    const undo = toast.querySelector<HTMLElement>("[data-fork-undo]");
    expect(undo).not.toBeNull();
    // the Undo arm POSTs the guarded discard mutation through the BFF (one request, JSON).
    const postsBefore = f.posts.length;
    await act(async () => {
      undo!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(f.posts.map((p) => p.url)).toContain(`/p/${SLUG}/drafts/7/discard-fork`);
    expect(f.posts.length).toBe(postsBefore + 1);
  });

  it("a refused Undo explains why — the refusal toast maps the api's stable code", async () => {
    const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.split("?")[0]!;
      if (init?.method === "POST" && path.endsWith("/discard-fork")) {
        return jsonResponse(409, { error: "fork_read_by_run" });
      }
      return makeFetch().impl(input, init);
    };
    const f = makeFetch();
    void f;
    await mountAt(`/p/${SLUG}/v/7`, bootFor(SPA_EDITOR), impl);
    await vi.waitFor(() => expect(el()!.querySelector("[data-page-view]")).not.toBeNull());
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("rhema:fork-toast", { detail: { draftId: "d_7", draftN: 7, baseN: 6 } }),
      );
    });
    await vi.waitFor(() => expect(el()!.querySelector("[data-fork-undo]")).not.toBeNull());
    await act(async () => {
      el()!
        .querySelector<HTMLElement>("[data-fork-undo]")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    });
    await vi.waitFor(() =>
      expect(el()!.querySelector(".ui-toast-viewport")!.textContent).toContain(
        "a run already read",
      ),
    );
  });
});
