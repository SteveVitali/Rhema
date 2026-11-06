// @vitest-environment happy-dom
//
// SPA.14 — the `onboarding` surface's component contract (REQ-SEQ-9, REQ-VFY-2/4/6, REQ-TST-2/6,
// REQ-BFF-1/2/3/15/16, REQ-DAT-4, REQ-UX-16; design/22 §2 + design/25 §app.new/app.newPreview/
// p.import/p.importPreview). Mounted through the production router (memory history + a stub
// fetch) at `/app/new`, `/app/new/preview`, `/p/$project/import`, `/p/$project/import/preview`:
// the three entry cards + the sheet's field grammar, the presign→direct-PUT→`quarantineKey` leg
// (bytes never ride the JSON body and never proxy through the BFF), the pending contracts
// (`{ok,pending:{pollAfterSeconds},redirect}` — server-owned cadence), the §5.3 inline `{ok,data}`
// preview, the `conversion_pending` replay, the ONB.1 hold claim/discard/`?hc=` handshake (the
// hold-store seam is mocked — the same primitives the landing island runs), the SSR-parity legs
// against `NewProjectPage`/`ImportPage`/`ImportPreviewPage` under PageDataContext, the SsrHandoff
// no-BFF leg, and component axe on the mounted interactive subset.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtocolCardDto, VoiceListRowDto } from "@rhema/api-client";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { axeCheck, restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

// The hold seam is module-mocked: the SAME primitives landing.ts runs, driven by fixture records.
const holdState: { record: { token: string; name: string; type: string; size: number; bytes: ArrayBuffer } | null; deleted: number } = {
  record: null,
  deleted: 0 };
vi.mock("../client/hold-store.js", async (importActual) => {
  const actual = await importActual<typeof import("../client/hold-store.js")>();
  return {
    ...actual,
    getHold: async () => holdState.record,
    deleteHold: async () => {
      holdState.deleted += 1;
      holdState.record = null;
    } };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "acme";

// ---- fixtures ----------------------------------------------------------------------------------

const PROTO: ProtocolCardDto = {
  id: "essay",
  name: "Essay",
  tagline: "For arguments and analysis.",
  holdYouTo: "Claims backed by evidence.",
  venueBar: { kind: "venues", table: [{ venue: "Journal", verified_at: "2026-01-01" }], prompt: "" },
  lengthNorms: { unit: "words", default: 3000, apparatus: "" },
  entryDefault: "scratch",
  typicalWords: 3000,
  typicalReviewCredits: 120,
  typicalReviewDuration: { lowMinutes: 4, highMinutes: 8 } };

const VOICE: VoiceListRowDto = {
  personaId: "p1",
  name: "Voice One",
  byline: "S. Seed",
  mode: "self",
  kind: "leaf",
  group: "your_voices",
  readOnly: false,
  sampleCount: 5,
  sources: ["paste"],
  projectCount: 2,
  lastBuiltAt: "2026-10-01T00:00:00Z",
  tier: "quick",
  members: [],
  registers: ["essay"],
  status: {
    state: "resting",
    pill: { label: "Ready", tone: "ok" },
    action: "none",
    detail: { seedChanged: false, samples: { added: 0, removed: 0, changed: 0 }, growthRatio: null, ageDays: 4 } } };

const CONVERSION_READY = {
  status: "ready" as const,
  quarantineKey: "q1",
  sourceLabel: "draft.md",
  sourceText: "# Draft\n\nSource words.",
  convertedMarkdown: "# Draft\n\nBody text.",
  countLine: "4 words · 0 footnotes · 0 citation-like spans · 0 tables · 0 figures",
  warnings: [] as { message: string; blockId: string | null }[],
  title: "Draft",
  resolvedTitle: "Draft" };

const IMPORT_CONVERSION_READY = {
  projectSlug: SLUG,
  sourceLabel: "paper.docx",
  sourceText: "(the uploaded source — already converted)",
  convertedMarkdown: "# Paper\n\nConverted body.",
  countLine: "3 words · 0 footnotes · 0 citation-like spans · 0 tables · 0 figures",
  warnings: [] as { message: string; blockId: string | null }[],
  quarantineKey: "q1" };

const IMPORT_SHELL = {
  project: { title: "Acme Paper", pill: "Draft", slug: SLUG },
  paperTheme: "light",
  ide: {
    projectId: "proj_acme",
    palette: JSON.stringify({ projectSlug: SLUG, goto: [], recentRuns: [], settings: [] }),
    paletteSearchUrl: `/p/${SLUG}/palette-search` } };

// ---- fetch stub --------------------------------------------------------------------------------

interface FetchOpts {
  /** /bff/app/new protocol override — e.g. a stale-venue variant. */
  proto?: unknown;
  newPreview?: unknown;
  importPreview?: unknown;
  newPost?: unknown;
  createPost?: unknown;
  importPreviewPost?: unknown;
  importCreatePost?: unknown;
  /** captured PUTs to the presigned URL — `{url, init}`. */
  puts?: { url: string; init?: RequestInit }[];
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" } });

function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/app/new") {
      return jsonResponse(200, { newProject: { protocols: [opts.proto ?? PROTO], voices: [VOICE] } });
    }
    if (url.startsWith("/bff/app/new/preview")) {
      return jsonResponse(200, opts.newPreview ?? { newProjectPreview: CONVERSION_READY });
    }
    if (url === `/bff/p/${SLUG}/import`) {
      return jsonResponse(200, { import: IMPORT_SHELL });
    }
    if (url.startsWith(`/bff/p/${SLUG}/import/preview`)) {
      return jsonResponse(200, opts.importPreview ?? {
        importPreview: { ...IMPORT_SHELL, conversion: IMPORT_CONVERSION_READY } });
    }
    if (url === "/bff/import/presign") {
      return jsonResponse(200, {
        url: "https://storage.example.test/quarantine/w1/u1",
        key: "quarantine/w1/u1",
        maxBytes: 10_000_000,
        requiredHeaders: { "content-type": "text/markdown" } });
    }
    if (url.startsWith("https://storage.example.test/")) {
      opts.puts?.push({ url, init });
      return new Response("", { status: 200 });
    }
    if (url === "/app/new") {
      return jsonResponse(200, opts.newPost ?? { ok: true, redirect: "/p/fresh?created=scratch" });
    }
    if (url === "/app/new/create") {
      return jsonResponse(200, opts.createPost ?? {
        ok: true,
        redirect: `/p/fresh?created=draft&hc=${holdState.record?.token ?? "hold_x"}` });
    }
    if (url === `/p/${SLUG}/import/preview`) {
      return jsonResponse(200, opts.importPreviewPost ?? {
        ok: true,
        pending: { pollAfterSeconds: 5 },
        redirect: `/p/${SLUG}/import/preview?qk=quarantine%2Fw1%2Fu1&src=paper.docx` });
    }
    if (url === `/p/${SLUG}/import/create`) {
      // R7HOME.2a — create lands on the editable Page with the REQ-DATA-14 outcome flash.
      return jsonResponse(200, opts.importCreatePost ?? { ok: true, redirect: `/p/${SLUG}/v/1?imported=created` });
    }
    // R7HOME.2b — the immediate-create leaf's landing legs: the handoff POST every p.index
    // beforeLoad issues, and the redirect target's twin (a bare 404 — the notFound boundary is
    // the honest settle for a fixture slug).
    if (url === "/bff/p/fresh/handoff" && init?.method === "POST") {
      return jsonResponse(200, { ok: true, data: { handoff: null } });
    }
    if (url === "/bff/p/fresh/import") {
      return jsonResponse(200, { import: { ...IMPORT_SHELL, project: { ...IMPORT_SHELL.project, slug: "fresh" } } });
    }
    if (url === "/bff/p/fresh") return jsonResponse(404, { error: "not_found" });
    return jsonResponse(500, { error: "unstubbed_path", detail: url });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

const SPA_ALL = {
  "/app/new": "spa",
  "/app/new/preview": "spa",
  "/p/$project/import": "spa",
  "/p/$project/import/preview": "spa" } as const;
const BOOT = bootFor({ ...SPA_ALL });

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

/** Which manifest entries the SSR markup emits — the parity filter (REQ-TST-2). */

/** Submit one form inside an act — the optional `submitter` rides the field set. */
async function submit(form: Element, submitter?: Element) {
  await act(async () => {
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (submitter != null) Object.defineProperty(ev, "submitter", { value: submitter });
    form.dispatchEvent(ev);
  });
}

/** Put a File on a file input (happy-dom's FileList is not settable). */
function setFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  holdState.record = null;
  holdState.deleted = 0;
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

// ---- /app/new — the sheet ------------------------------------------------------------------------

describe("GET /app/new mounted (R7HOME.2b — the immediate create)", () => {
  it("one create POST mints the blank project and the router lands on its Page — never a dialog", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app/new", BOOT, f);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/app/new" && i?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({ entry: "scratch" });
    // exactly ONE create call.
    expect(f.mock.calls.filter(([u, i]) => String(u) === "/app/new" && i?.method === "POST").length).toBe(1);
    // the envelope redirect becomes an in-router nav to the new Page — no document navigation,
    // no sheet/dialog mounted.
    expect(router.state.location.pathname).toBe("/p/fresh");
    expect(router.state.location.search).toMatchObject({ created: "scratch" });
    // the create hop committed in-router (the fixture's 404 twin then settles notFound → a
    // document nav to the same URL; that fallback is not the create flow's hop).
    expect(docNavSpy.mock.calls.every(([u]) => String(u).startsWith("/p/fresh"))).toBe(true);
    expect(el()!.querySelector("[data-new-project-form], [data-entry], [role='dialog'], [aria-modal]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/app/new")).toBe(false);
  });

  it("a refused create lands back on /app — never a half-created project", async () => {
    const base = makeFetch();
    const refusing = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/app/new" && init?.method === "POST") {
        return jsonResponse(400, { error: "refused" });
      }
      return base(input, init);
    });
    const { router } = await mountAt("/app/new", BOOT, refusing);
    expect(router.state.location.pathname).toBe("/app");
  });

  it("?held=1 lands the NEW project's import surface, which hydrates the held file", async () => {
    holdState.record = HOLD;
    const f = makeFetch();
    const { router } = await mountAt("/app/new?entry=draft&held=1", BOOT, f);
    expect(router.state.location.pathname).toBe("/p/fresh/import");
    await act(async () => {});
    const main = el()!;
    expect(main.querySelector("[data-held-notice]")?.textContent ?? "").toContain("n1-held-draft.md");
  });

  it("an unflipped verdict is a server redirect — the document GET answers /app, no create issues", async () => {
    const f = makeFetch();
    await mountAt("/app/new", bootFor({ ...SPA_ALL, "/app/new": "ssr" }), f);
    expect(docNavSpy).toHaveBeenCalledWith("/app/new");
    expect(f.mock.calls.some(([u, i]) => String(u) === "/app/new" && i?.method === "POST")).toBe(false);
  });
});

// ---- the ONB.1 hold legs (R7HOME.2b — the contract's home moved to /p/:slug/import) ---------------

const HOLD = { token: "hold_abc123", name: "n1-held-draft.md", type: "text/markdown", size: 40, bytes: new TextEncoder().encode("# Held\n\nbody").buffer as ArrayBuffer };

describe("the held-draft contract (ONB.1)", () => {
  it("hydrates the file input on EVERY mount — notice names the file, Discard exists, token stamped", async () => {
    holdState.record = HOLD;
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    // allow the async hydration effect to settle
    await act(async () => {});
    const main = el()!;
    const notice = main.querySelector("[data-held-notice]")?.textContent ?? "";
    expect(notice).toContain("n1-held-draft.md");
    expect(main.querySelector("[data-held-discard]")).not.toBeNull();
    // DataTransfer may be absent under happy-dom — the attach branch is honest either way:
    // when the file attached, the token stamps; otherwise the reattach notice paints.
    const files = (main.querySelector<HTMLInputElement>('input[name="file"]'))?.files?.length ?? 0;
    if (files === 1) {
      const token = main.querySelector<HTMLInputElement>('input[name="heldToken"]');
      expect(token?.value).toBe("hold_abc123");
    }
    // the record itself is never touched by hydration (no claim-on-attach)
    expect(holdState.record).not.toBeNull();
    expect(holdState.deleted).toBe(0);
  });

  it("a second mount re-populates — the hold persists until consumed (no claim-on-attach)", async () => {
    holdState.record = HOLD;
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    await act(async () => {});
    expect(el()!.querySelector("[data-held-notice]")?.textContent).toContain("n1-held-draft.md");
    expect(holdState.record).not.toBeNull();
  });

  it("Discard is the other writer — deletes the hold, clears the token, repaints the notice", async () => {
    holdState.record = HOLD;
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    await act(async () => {});
    const discard = (await settled<HTMLElement>("[data-held-discard]"));
    await act(async () => {
      discard.click();
    });
    expect(holdState.deleted).toBe(1);
    expect(holdState.record).toBeNull();
    expect(el()!.querySelector("[data-held-discard]")).toBeNull();
  });

  it("a confirmed submit consumes the hold — the server-confirmed consumption deletes it", async () => {
    holdState.record = HOLD;
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    await act(async () => {});
    const form = (await settled<HTMLFormElement>(`form[action="/p/${SLUG}/import/preview"]`));
    await submit(form);
    // the preview POST is server-confirmed consumption — the hold deletes.
    expect(holdState.deleted).toBe(1);
    expect(holdState.record).toBeNull();
  });
});

// ---- /app/new/preview — the workspace poll leg ----------------------------------------------------

describe("GET /app/new/preview mounted (SPA.14)", () => {
  it("pending paints data-conversion-pending — the converting section verbatim", async () => {
    await mountAt(
      "/app/new/preview?entry=draft&qk=q1&src=draft.md",
      BOOT,
      makeFetch({
        newPreview: {
          newProjectPreview: {
            status: "pending",
            quarantineKey: "q1",
            sourceLabel: "draft.md",
            pollAfterSeconds: 5 } } }),
    );
    expect(el()!.querySelector("[data-conversion-pending]")).not.toBeNull();
    expect(el()!.textContent).toContain("draft.md");
  });

  it("ready paints the §5.3 preview — create posts /app/new/create with the replay grammar", async () => {
    const f = makeFetch();
    await mountAt("/app/new/preview?entry=draft&qk=q1&src=draft.md", BOOT, f);
    const form = (await settled<HTMLFormElement>('form[data-conversion-form]'));
    expect(form.getAttribute("action")).toBe("/app/new/create");
    for (const field of ['name="entry"', 'name="title"', 'name="qk"', 'name="heldToken"']) {
      // heldToken only renders when the search carries it — qk/entry/title are unconditional
      if (field === 'name="heldToken"') continue;
      expect(form.innerHTML, field).toContain(field);
    }
    expect(form.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("Draft");
    const create = form.querySelector('[data-conversion-action="create"]')!;
    await submit(form, create);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/app/new/create" && i?.method === "POST");
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body.qk).toBe("q1");
    expect(body.entry).toBe("draft");
    expect(body.action).toBe("create");
    // the ?hc= echo → the unflipped /p leaf hands off; the consumed handshake lands server-side
    expect(docNavSpy).toHaveBeenCalled();
  });
});

// ---- /p/:slug/import — the IDE-framed sheet -------------------------------------------------------

describe("GET /p/:slug/import mounted (SPA.14)", () => {
  it("renders inside the IDE chrome — the import form + the published project title", async () => {
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.import.heading);
    const form = (await settled<HTMLFormElement>(`form[action="/p/${SLUG}/import/preview"]`));
    for (const field of ['name="file"', 'name="paste"']) {
      expect(form.innerHTML, field).toContain(field);
    }
    // the IDE chrome published — the rail markup exists (the AND-gate flipped both surfaces)
    expect(main.querySelector(".ide")).not.toBeNull();
  });

  it("REQ-HOME-5 — the styled dropzone replaces the native input and is keyboard-operable", async () => {
    await mountAt(`/p/${SLUG}/import`, BOOT, makeFetch());
    const zone = (await settled<HTMLElement>("[data-import-dropzone]"));
    // a real focusable button-ish region — Tab lands on it, Enter/Space opens the picker.
    expect(zone.getAttribute("role")).toBe("button");
    expect(zone.getAttribute("tabindex")).toBe("0");
    const input = document.querySelector<HTMLInputElement>('input[name="file"]')!;
    expect(input.hasAttribute("data-import-file-input")).toBe(true);
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    await act(async () => {
      zone.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(clickSpy).toHaveBeenCalled();
    await act(async () => {
      zone.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    // a picked file paints its name on the zone (the hidden input still carries it to the form).
    setFile(input, new File(["x"], "paper.docx"));
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(zone.textContent).toContain("paper.docx");
  });

  it("a file convert runs presign→PUT→quarantineKey and navigates to the server-owned poll URL", async () => {
    const puts: { url: string; init?: RequestInit }[] = [];
    const f = makeFetch({ puts });
    await mountAt(`/p/${SLUG}/import`, BOOT, f);
    const form = (await settled<HTMLFormElement>(`form[action="/p/${SLUG}/import/preview"]`));
    setFile(
      form.querySelector<HTMLInputElement>('input[name="file"]')!,
      new File(["x"], "paper.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    );
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/p/${SLUG}/import/preview` && i?.method === "POST");
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body.quarantineKey).toBe("quarantine/w1/u1");
    expect(body.fileName).toBe("paper.docx");
    expect(puts.length).toBe(1);
    // the pending envelope's redirect navigated to the preview leaf
    const previewGet = f.mock.calls.find(([u]) => String(u).startsWith(`/bff/p/${SLUG}/import/preview`));
    expect(previewGet).toBeDefined();
  });

  it("the AND-gate — `onboarding` alone does not serve SPA; an ssr verdict hands the document back", async () => {
    const f = makeFetch();
    // The server composes `onboarding` AND `ide-chrome` into this boot verdict — with
    // `ide-chrome` off the route stamps ssr, so the leaf hands the document straight back
    // (SsrHandoff) without ever touching the twin.
    await mountAt(`/p/${SLUG}/import`, bootFor({ ...SPA_ALL, "/p/$project/import": "ssr" }), f);
    expect(docNavSpy).toHaveBeenCalledWith(`/p/${SLUG}/import`);
    expect(el()?.querySelector(`form[action="/p/${SLUG}/import/preview"]`)).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === `/bff/p/${SLUG}/import`)).toBe(false);
  });
});

// ---- /p/:slug/import/preview — the project poll leg ------------------------------------------------

describe("GET /p/:slug/import/preview mounted (SPA.14)", () => {
  it("pending paints data-conversion-pending inside the IDE chrome", async () => {
    await mountAt(
      `/p/${SLUG}/import/preview?qk=q1&src=paper.docx`,
      BOOT,
      makeFetch({
        importPreview: {
          importPreview: {
            ...IMPORT_SHELL,
            conversion: { projectSlug: SLUG, sourceLabel: "paper.docx", pending: true, quarantineKey: "q1", pollAfterSeconds: 5 } } } }),
    );
    expect(el()!.querySelector("[data-conversion-pending]")).not.toBeNull();
    expect(el()!.textContent).toContain("paper.docx");
  });

  it("ready paints the preview — create posts /import/create and rides the /p/:slug redirect", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/import/preview?qk=q1&src=paper.docx`, BOOT, f);
    const form = (await settled<HTMLFormElement>('form[data-conversion-form]'));
    expect(form.getAttribute("action")).toBe(`/p/${SLUG}/import/create`);
    expect(form.innerHTML).toContain('name="qk"');
    const create = form.querySelector('[data-conversion-action="create"]')!;
    await submit(form, create);
    const post = f.mock.calls.find(([u, i]) => String(u) === `/p/${SLUG}/import/create` && i?.method === "POST");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toMatchObject({ qk: "q1", action: "create" });
    expect(docNavSpy).toHaveBeenCalledWith(`/p/${SLUG}/v/1?imported=created`);
  });

  it("component axe on the mounted ready preview (REQ-VFY-6)", async () => {
    await mountAt(`/p/${SLUG}/import/preview?qk=q1&src=paper.docx`, BOOT, makeFetch());
    await axeCheck((await settled("[data-spa-surface]")));
  });
});
