// @vitest-environment happy-dom
//
// SPA.17 — the `export` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/16/17, REQ-DAT-4, REQ-SEQ-6/12, REQ-UX-6/16; design/22 §2 `p.export` + design/29
// §route-map). Mounted through the production router (memory history + a stub fetch) at
// `/p/the-piece/export`:
//
//   - the SSR-verbatim vocabulary — heading/lede, format radios, the .md profile + CSL selects,
//     the provenance + AI-use toggles, the never-blocking obligation line/items (incl. the
//     `data-returned` leg), the disclosure/exclusivity notes, the statement preview, the
//     append-only addition form, the standalone `.md`/`.docx` statement links.
//   - the REQ-TST-2 parity leg against the SSR `ExportPage` under a PageDataContext provider —
//     the same fixture, the same manifest hooks.
//   - REQ-BFF-17: `[data-export-form]` is a REAL `method="post"` — no fetch interception; the
//     addition form is the surface's one JSON mutation (`{sentence}` → `{ok,redirect}` → the
//     `?added=1` in-router nav + the `["bff"]` refetch), with the REQ-UX-16 in-flight leg.
//   - the FIRST IDE-framed mount: a "spa" verdict mounts the leaf inside `<IdeChrome>` (`[data-ide]`);
//     "ssr" hands the document back (`SsrHandoff`, no twin fetch); an unframed neighbour keeps
//     the chrome unmounted.
//
// The fixture mirrors the retained SSR spec's (export.test.ts) — the parity leg compares the two
// renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportDialogDto } from "@rhema/api-client";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import type { BffExportTwin } from "./queries.js";
import { axeCheck, restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

// ---- fixture — export.test.ts's DIALOG verbatim --------------------------------------------------

const DIALOG: ExportDialogDto = {
  projectId: "proj_1",
  formats: [
    {
      id: "md",
      label: "Markdown",
      extension: "md",
      blurb: "The canonical file.",
      provenanceAppendix: true },
    {
      id: "txt",
      label: "Plain text",
      extension: "txt",
      blurb: "Text only.",
      provenanceAppendix: false },
    {
      id: "html",
      label: "HTML",
      extension: "html",
      blurb: "A self-contained page.",
      provenanceAppendix: true },
    {
      id: "docx",
      label: "Word (.docx)",
      extension: "docx",
      blurb: "A Word document.",
      provenanceAppendix: true },
    { id: "rtf", label: "RTF", extension: "rtf", blurb: "Rich text.", provenanceAppendix: false },
    {
      id: "pdf",
      label: "PDF",
      extension: "pdf",
      blurb: "Typeset by Typst.",
      provenanceAppendix: true },
    {
      id: "latex",
      label: "LaTeX",
      extension: "tex",
      blurb: "A .tex source file.",
      provenanceAppendix: true },
  ],
  mdProfiles: [
    { id: "substack", label: "Substack", blurb: "Markdown shaped for the Substack editor." },
  ],
  citations: {
    hasBibliography: true,
    styles: [
      { id: "apa", label: "APA" },
      { id: "mla", label: "MLA" },
      { id: "chicago-author-date", label: "Chicago (author-date)" },
      { id: "harvard", label: "Harvard" },
      { id: "vancouver", label: "Vancouver" },
    ] },
  provenance: {
    available: true,
    defaultOn: false,
    label: "Block-level provenance.",
    formats: ["md", "html", "docx", "pdf", "latex"] },
  surfaces: {
    disclosure: true,
    exclusivityReminder: "Confirm this piece is not under review anywhere else." },
  obligations: {
    blockingOpen: 2,
    open: 3,
    line: "2 blocking obligations open",
    items: [
      {
        id: "ob_1",
        title: "Resolve the thesis gap",
        severity: "blocking",
        state: "open",
        findingId: "f_1",
        reviewRunId: "run_9" },
      {
        id: "ob_2",
        title: "Tighten the close",
        severity: "blocking",
        state: "open",
        findingId: "f_2",
        reviewRunId: null },
      {
        id: "ob_3",
        title: "Parked until export",
        severity: "major",
        state: "open",
        findingId: "f_3",
        reviewRunId: "run_9" },
    ],
    returnedIds: ["ob_3"] },
  statement: {
    template: "general",
    generated: [
      "This manuscript was prepared in Rhēma, an editorial-review environment that runs editorial workflows on the text.",
      "At the time this statement was generated, 3 review obligations remained open, 2 of them blocking.",
    ],
    additions: [
      {
        id: "ad_1",
        sentence: "I rewrote the ending myself.",
        createdAt: "2026-09-04T00:00:00.000Z" },
    ],
    markdown: "# AI-use statement\n\n…\n",
    openObligations: 3,
    blockingOpen: 2,
    generatedAt: "2026-09-04T00:00:00.000Z" } };

const TWIN: BffExportTwin = {
  export: {
    slug: "the-piece",
    projectId: "proj_1",
    dialog: DIALOG,
    project: { title: "The Piece", pill: "Edited by you", slug: "the-piece" },
    paperTheme: "light",
    appTheme: "dark",
    ide: {
      projectId: "proj_1",
      palette: JSON.stringify({
        projectSlug: "the-piece",
        goto: [{ label: "Project settings", path: "/p/the-piece/settings" }],
        recentRuns: [],
        settings: [] }),
      paletteSearchUrl: "/p/the-piece/palette-search",
      themeUrl: "/ide/theme",
      paperThemeUrl: "/p/the-piece/paper-theme" } } };

// ---- the mount substrate --------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });
}

interface FetchOpts {
  readonly export?: BffExportTwin | Response;
  /** the addition POST's reply — default `{ok:true, redirect:"/p/the-piece/export?added=1"}`. */
  readonly addition?: { ok: true; redirect?: string };
  /** holds the addition POST open for the REQ-UX-16 in-flight leg. */
  readonly holdAddition?: Promise<Response>;
}

/** Every path the mounts can reach is named; anything else 500s so a surprise read fails loudly. */
function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/p/the-piece/export" && (init?.method ?? "GET") === "GET") {
      const out = opts.export ?? TWIN;
      return out instanceof Response ? out : jsonResponse(200, out);
    }
    if (url === "/p/the-piece/export/addition" && init?.method === "POST") {
      if (opts.holdAddition != null) return opts.holdAddition;
      return jsonResponse(
        200,
        opts.addition ?? { ok: true, redirect: "/p/the-piece/export?added=1" },
      );
    }
    if (url.startsWith("/p/the-piece/palette-search")) return jsonResponse(200, { results: [] });
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(
  surfaces: Record<string, "spa" | "ssr">,
  deviceClass: "desktop" | "phone" = "desktop",
): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_EXPORT = { "/p/$project/export": "spa" } as const;

/** A controllable EventSource — the chrome constructs one only when a leaf publishes a feed. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

/** Node ≥22's built-in localStorage shadows happy-dom's — the chrome's pane persistence needs a
 *  real in-memory Storage (the ide-chrome.dom.test.tsx precedent, verbatim). */
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

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
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
  // router's settled-leaf stamp (REQ-NAVT-2). Bare post-mount selector reads raced that
  // commit — the BL-87 mount-settle flake class.
  await vi.waitFor(() => {
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    }, { timeout: SETTLE_TIMEOUT });
  return { router, queryClient, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");


async function submit(form: Element) {
  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  docNavSpy = stubDocumentNav();
  vi.stubGlobal("localStorage", new MemStorage());
  vi.stubGlobal("EventSource", FakeEventSource);
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

// ---- the surface on the flipped verdict -----------------------------------------------------------

describe("GET /p/:slug/export mounted (SPA.17)", () => {
  const BOOT = bootFor(SPA_EXPORT);

  it("renders the §13.4 dialog verbatim inside the React IDE chrome", async () => {
    await mountAt("/p/the-piece/export", BOOT, makeFetch());
    const main = el()!;
    // the first chrome-carrying flip — the leaf mounts inside [data-ide] (REQ-SEQ-6).
    expect(main.querySelector("[data-ide]")).not.toBeNull();
    expect(main.querySelector("h1")?.textContent).toBe(COPY.export.heading);
    expect(main.textContent).toContain("Take the manuscript out as Markdown");
    const form = main.querySelector<HTMLFormElement>("[data-export-form]");
    expect(form).not.toBeNull();
    // REQ-BFF-17 — the binary leg stays a REAL document POST, never a fetch.
    expect(form!.getAttribute("method")).toBe("post");
    expect(form!.getAttribute("action")).toBe("/p/the-piece/export");
    // R7KIT.3b — the visible controls are primitives; their hidden carriers keep the field names.
    expect(form!.querySelectorAll('input[name="format"]').length).toBe(7);
    expect(form!.querySelector('[role="radio"]')).not.toBeNull();
    expect(form!.querySelector('input[name="format"][value="md"]')).not.toBeNull();
    expect(form!.querySelector('input[name="format"][value="latex"]')).not.toBeNull();
    expect(form!.querySelector('select[name="profile"]')).not.toBeNull();
    // R7FIX.7 (F-R7DEP.2-13) — the declared hooks ride the native <select> carriers themselves
    // (a Radix trigger button shadowed them behind a hidden BubbleSelect the leg cannot drive).
    expect(form!.querySelector('select[data-md-profile]')).not.toBeNull();
    expect(form!.querySelector('select[name="cslStyle"]')).not.toBeNull();
    expect(form!.querySelector('select[data-csl-style]')).not.toBeNull();
    expect(form!.querySelector('input[name="attachAiUse"]')).not.toBeNull();
    expect(form!.querySelector('input[name="attachProvenance"]')).not.toBeNull();
    expect(main.querySelector('[data-provenance-toggle="available"]')).not.toBeNull();
    expect(main.querySelector("[data-disclosure-note]")).not.toBeNull();
    expect(main.querySelector("[data-exclusivity-reminder]")).not.toBeNull();
    // the §11.7 line + item links — informational, never a block; the returned pre_export row marked.
    expect(main.querySelector("[data-obligation-line]")).not.toBeNull();
    expect(main.textContent).toContain("2 blocking obligations open");
    const items = main.querySelectorAll("[data-obligation-items] [data-obligation-id]");
    expect(items.length).toBe(3);
    expect(main.querySelector('[data-obligation-id="ob_1"] a')?.getAttribute("href")).toBe(
      "/p/the-piece/review/run_9",
    );
    expect(main.querySelector('[data-obligation-id="ob_2"] a')).toBeNull();
    expect(main.querySelector('[data-obligation-id="ob_3"]')?.getAttribute("data-returned")).toBe(
      "true",
    );
    // the statement preview + the append-only addition form + the standalone downloads.
    expect(main.querySelector("[data-ai-use]")).not.toBeNull();
    expect(main.querySelector("[data-generated]")?.textContent).toContain(
      "3 review obligations remained open",
    );
    expect(main.querySelector('[data-addition="ad_1"]')?.textContent).toContain(
      "I rewrote the ending myself.",
    );
    expect(main.querySelector('input[name="sentence"]')).not.toBeNull();
    expect(main.querySelector('a[href="/p/the-piece/export/ai-use/md"]')).not.toBeNull();
    expect(main.querySelector('a[href="/p/the-piece/export/ai-use/docx"]')).not.toBeNull();
  });


  it("the ?error=1 flash renders the exportFailed copy through validated search", async () => {
    await mountAt("/p/the-piece/export?error=1", BOOT, makeFetch());
    expect(el()!.querySelector("[data-export-error]")?.textContent).toBe(COPY.export.exportFailed);
  });

  it("phone width suppresses the form (P1.19) — the note renders, no controls", async () => {
    await mountAt("/p/the-piece/export", bootFor(SPA_EXPORT, "phone"), makeFetch());
    const main = el()!;
    expect(main.querySelector("[data-phone-blocked]")).not.toBeNull();
    expect(main.querySelector("[data-export-form]")).toBeNull();
    expect(main.querySelector("[data-obligation-line]")).toBeNull();
  });

  it("a twin 404 lands the route's own not-found", async () => {
    const f = makeFetch({ export: jsonResponse(404, { error: "not_found" }) });
    await mountAt("/p/the-piece/export", BOOT, f);
    expect(el()!.querySelector("[data-export-form]")).toBeNull();
    expect(el()!.textContent).toContain(COPY.notFound.heading);
  });

  it("the export form is never fetch-intercepted — a submit issues no /export fetch (REQ-BFF-17)", async () => {
    const f = makeFetch();
    await mountAt("/p/the-piece/export", BOOT, f);
    const form = await settled<HTMLFormElement>("[data-export-form]");
    await submit(form);
    const exportPosts = f.mock.calls.filter(
      ([u, i]) =>
        String(u) === "/p/the-piece/export" && (i as RequestInit | undefined)?.method === "POST",
    );
    expect(exportPosts.length).toBe(0);
  });

  it("the addition POST rides the JSON branch — {sentence} in, {ok,redirect} lands ?added=1 + refetches", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/p/the-piece/export", BOOT, f);
    const form = await settled<HTMLFormElement>("[data-ai-use] form");
    expect(form.getAttribute("action")).toBe("/p/the-piece/export/addition");
    const input = form.querySelector<HTMLInputElement>('input[name="sentence"]')!;
    input.value = "I rewrote the ending myself.";
    const readsBefore = f.mock.calls.filter(([u]) => u === "/bff/p/the-piece/export").length;
    await submit(form);
    const post = f.mock.calls.find(
      ([u, i]) =>
        String(u) === "/p/the-piece/export/addition" &&
        (i as RequestInit | undefined)?.method === "POST",
    );
    expect(post).toBeDefined();
    const init = post![1] as RequestInit;
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ sentence: "I rewrote the ending myself." });
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toContain("added=1");
    });
    // the ["bff"] invalidation re-asked the dialog — the appended row lands where the SSR 302 put it.
    await vi.waitFor(() => {
      const reads = f.mock.calls.filter(([u]) => u === "/bff/p/the-piece/export").length;
      expect(reads).toBeGreaterThan(readsBefore);
    });
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("REQ-UX-16 — the in-flight addition disables its controls + aria-busy, restored on settle", async () => {
    const d = (() => {
      let resolve!: (v: Response) => void;
      const promise = new Promise<Response>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    })();
    const f = makeFetch({ holdAddition: d.promise });
    await mountAt("/p/the-piece/export", BOOT, f);
    const form = await settled<HTMLFormElement>("[data-ai-use] form");
    form.querySelector<HTMLInputElement>('input[name="sentence"]')!.value = "x";
    await submit(form);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector('input[name="sentence"]')!.disabled).toBe(true);
    d.resolve(jsonResponse(200, { ok: true, redirect: "/p/the-piece/export?added=1" }));
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBeNull());
  });

  it("component axe — the mounted surface (the chrome's own axe leg lives in ide-chrome.dom.test)", async () => {
    await mountAt("/p/the-piece/export", BOOT, makeFetch());
    await axeCheck(await settled("[data-spa-surface]"));
  });
});

// ---- the AND-gate legs (REQ-SEQ-2/6 — the first IDE-framed flip) ------------------------------------

describe("the export + ide-chrome AND-gate", () => {
  it("an unflipped verdict hands the document back — SsrHandoff, no twin fetch, no chrome", async () => {
    const f = makeFetch();
    await mountAt("/p/the-piece/export", bootFor({ "/p/$project/export": "ssr" }), f);
    // the handoff is a document navigation to the leaf's own URL — the server re-decides.
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalledWith("/p/the-piece/export"));
    expect(el()!.querySelector("[data-export-form]")).toBeNull();
    expect(el()!.querySelector("[data-ide]")).toBeNull();
    // and the loader never spent the BFF read it would throw away.
    expect(f.mock.calls.filter(([u]) => u === "/bff/p/the-piece/export").length).toBe(0);
  });

  it("an unframed flipped leaf keeps the chrome unmounted — /p/:slug/settings stays bare", async () => {
    // the settings leaf is a stub (its surface flips with its own ticket) — an "ssr" verdict hands
    // it back while export holds "spa"; the chrome belongs to the framed leaf only.
    const f = makeFetch();
    const { router } = await mountAt(
      "/p/the-piece/export",
      bootFor({ ...SPA_EXPORT, "/p/$project/settings": "ssr" }),
      f,
    );
    expect(el()!.querySelector("[data-ide]")).not.toBeNull();
    await act(async () => {
      router.history.push("/p/the-piece/settings");
      await router.load();
    });
    expect(el()!.querySelector("[data-ide]")).toBeNull();
  });
});
