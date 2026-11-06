// @vitest-environment happy-dom
//
// 220a R7DEM.4b (REQ-DWEB-6 client half, REQ-DWEB-9/11/16; S-1, S-5, S-7, S-13, S-14) — the
// demo SPA boot contract, mounted through the REAL router (memory history + a stub fetch):
//   • S-1 — the router `rewrite`: `/demo/<essay>/…` resolves the `/p/demo~<essay>/…` route
//     internally while the public URL form survives; answers R3 P7's two open questions
//     (getMatchedRoutes needs the INPUT-rewritten path; navigate({href}) output-rewrites).
//   • the three /login-breakers — a demo boot issues NO `/session` and NO `/bff/feed-labels`
//     request (the demo feed-labels variant warms the shared key); the handoff POST never
//     fires; `onSessionExpired` never navigates a demo boot to /login.
//   • S-13 — demo twin reads carry `?b=<build>`.
//   • the boundary predicate — entry into `/demo*` / `/p/demo~*` from a non-demo boot is a
//     document navigation, and a non-demo href inside a demo boot doc-navs the same way.
//   • the exits — every `data-demo-exit` carries `data-spa-native`.
//   • the phone-UA arm — `deviceClass:"phone"` + every demo routeId "spa" mounts the leaf
//     (never an SsrHandoff) and the PM view is not editable.
//   • S-7 — the imported-image figure row renders `<img>` through the demo asset route.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpaRouter } from "./main.js";
import { installSpaClickInterceptor } from "./nav-intercept.js";
import type { SpaBoot } from "./boot.js";
import type { BffFiguresTwin } from "./queries.js";
import { restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ESSAY = "the-borrowed-commons"; // the committed synthetic fixture (registered, S-12)
const SLUG = `demo~${ESSAY}`;
const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const DEMO = { essay: ESSAY, slug: SLUG, signedIn: false, build: "testsha1" };

/** Every route the demo allowlist owns, marked "spa" — the demo boot's map verbatim. */
const DEMO_SURFACES: Record<string, "spa" | "ssr"> = {
  "/p/$project": "spa",
  "/p/$project/v/$v": "spa",
  "/p/$project/v/$n/diff/$m": "spa",
  "/p/$project/a/$artifactId": "spa",
  "/p/$project/revisions/$cid": "spa",
  "/p/$project/review/$runId": "spa",
  "/p/$project/r/$runId": "spa",
  "/p/$project/figures": "spa",
  "/p/$project/figures/$figureId": "spa",
};

function demoBoot(deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return {
    theme: {},
    deviceClass,
    surfaces: DEMO_SURFACES,
    project: { slug: SLUG },
    readOnlyProject: { reason: "demo" },
    demo: DEMO,
  };
}

function workspaceBoot(): SpaBoot {
  return {
    principal: PRINCIPAL,
    theme: {},
    deviceClass: "desktop",
    surfaces: DEMO_SURFACES,
    project: { slug: "tenant-project" },
  };
}

/** One minimal imported-image list twin — the S-7 `specKind:"image"` row verbatim. */
const IMAGE_ITEM = {
  id: "figure_1_signal_map",
  assetUri: `/bff/demo/asset/${ESSAY}/figures/figure_1_signal_map.png`,
  title: "figure_1_signal_map",
  caption: "",
  specKind: "image" as unknown as "vega_lite",
  kind: "chart" as const,
  badge: null,
  badgeText: null,
  n: 1,
  renderStatus: "rendered",
  hasRender: true,
  insertedInDraftId: null,
  pendingProposal: false,
  latestRunId: null,
};

const FIGURES_TWIN: BffFiguresTwin = {
  figures: { slug: SLUG, items: [IMAGE_ITEM] },
};

/** The image card twin — 218a's `{specKind:"image", provenance:"imported"}` variant verbatim. */
const IMAGE_CARD_TWIN = {
  figure: {
    slug: SLUG,
    headDraftId: null,
    card: {
      id: IMAGE_ITEM.id,
      assetUri: IMAGE_ITEM.assetUri,
      title: "figure_1_signal_map",
      caption: "",
      alt: "figure_1_signal_map",
      sourceLine: "",
      specKind: "image" as const,
      provenance: "imported" as const,
      versions: [{ n: 1, label: "imported" }],
      demo: { notRecorded: ["spec", "svg", "run_provenance", "caption", "source_line"] },
    },
  },
};

const PAGE_TWIN = {
  project: {
    title: "Borrowed Commons",
    pill: "Essay",
    slug: SLUG,
    readOnlyProject: { reason: "demo" },
  },
  gates: [],
  decisions: [],
  approvalOverrides: {},
  explainersDismissed: ["approvals", "evidence"],
  paperTheme: "light",
  ide: {},
  page: {
    slug: SLUG,
    projectId: SLUG,
    readOnly: true,
    doc: {
      draftId: "d_head",
      markdown: "# The Borrowed Commons\n\nA first paragraph of demo prose.\n",
      findings: [],
      proposals: [],
      provenance: null,
      lock: null,
    },
  },
};

interface RecordedCall {
  url: string;
  method: string;
}

/** The demo fetch stub — every call recorded; twins answer, anything unexpected 500s loudly. */
function makeFetch() {
  const calls: RecordedCall[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = raw.split("?")[0]!;
    calls.push({ url, method: init?.method ?? "GET" });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (init?.method === "POST") return json({ error: "demo_read_only" }, 405);
    if (url === "/bff/demo/feed-labels") return json({ t: {}, enums: {} });
    if (url === `/bff/p/${SLUG}/figures`) return json(FIGURES_TWIN);
    if (url === `/bff/p/${SLUG}/figures/${IMAGE_ITEM.id}`) return json(IMAGE_CARD_TWIN);
    if (url === `/bff/p/${SLUG}`) return json(PAGE_TWIN);
    return json({ error: "unstubbed_path" }, 500);
  });
  return { impl, calls };
}

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];
const disposers: Array<() => void> = [];

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
  return { router, queryClient, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

function click(elm: Element): boolean {
  const e = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true });
  elm.dispatchEvent(e);
  return e.defaultPrevented;
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const d of disposers.splice(0)) d();
  for (const r of mounted.splice(0)) act(() => r.unmount());
  restoreDocumentNav();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- S-1 — the router rewrite (REQ-DWEB-9) ------------------------------------------------

describe("the S-1 URL rewrite", () => {
  it("a /demo/<essay>/… URL resolves the internal /p/demo~… route (input rewrite)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    // the leaf matched `/p/$project/figures` on the PUBLIC form — the input rewrite fed it.
    expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures`);
    // …and the address-bar location keeps the public form (output rewrite on the commit).
    expect(f.calls.some((c) => c.url === `/bff/p/${SLUG}/figures`)).toBe(true);
  });

  it("P7 Q1 — navigate({href}) to a raw /p/demo~… anchor output-rewrites to /demo/…", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/${SLUG}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    const a = document.createElement("a");
    a.setAttribute("href", `/p/${SLUG}/figures/${IMAGE_ITEM.id}`);
    document.body.appendChild(a);
    disposers.push(installSpaClickInterceptor(router));
    const prevented = click(a);
    expect(prevented).toBe(true); // intercepted client nav — the demo stays in-document
    await vi.waitFor(
      () => expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures/${IMAGE_ITEM.id}`),
      { timeout: SETTLE_TIMEOUT },
    );
    // publicHref is the address-bar form — the output rewrite's proof.
    expect(router.state.location.publicHref ?? router.state.location.href).toContain(
      `/demo/${ESSAY}/figures/`,
    );
  });

  it("P7 Q2 — getMatchedRoutes needs the INPUT-rewritten path (a raw /demo/… href matches /p/$project)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    const [, , found] = router.getMatchedRoutes(`/demo/${ESSAY}/figures`);
    expect(found == null).toBe(true); // raw path does NOT match — nav-intercept feeds the rewrite
    const [, rawParams2, found2] = router.getMatchedRoutes(`/p/${SLUG}/figures`);
    expect(found2?.id).toBe("/_authenticated/p/$project/figures");
    expect(rawParams2.project).toBe(SLUG);
  });
});

// ---- the /login-breakers (REQ-DWEB-6 client half) -----------------------------------------

describe("the demo boot never reaches /login", () => {
  it("issues no /session or /bff/feed-labels read — logged out", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    expect(f.calls.some((c) => c.url === "/session")).toBe(false);
    expect(f.calls.some((c) => c.url === "/bff/feed-labels")).toBe(false);
    expect(f.calls.some((c) => c.url === "/bff/demo/feed-labels")).toBe(true);
    expect(docNavSpy).not.toHaveBeenCalledWith("/login");
  });

  it("never POSTs the handoff beforeLoad on the project index", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}`, demoBoot(), f.impl);
    await settled("[data-demo-banner]", document, { timeout: SETTLE_TIMEOUT });
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
    expect(f.calls.some((c) => c.url === "/session")).toBe(false);
  });
});

// ---- S-14 — the boundary predicate + the exits (REQ-DWEB-11/16) ----------------------------

describe("document-navigation entry and exit", () => {
  it("a /demo* href clicked from a signed-in (non-demo) SPA page is a document navigation", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/p/tenant-project/figures`, workspaceBoot(), f.impl);
    const a = document.createElement("a");
    a.setAttribute("href", `/demo/${ESSAY}/figures`);
    document.body.appendChild(a);
    disposers.push(installSpaClickInterceptor(router));
    const prevented = click(a);
    // NOT intercepted: the browser takes a real document navigation — the demo can never
    // share the workspace QueryClient (S-14 / REQ-DWEB-16).
    expect(prevented).toBe(false);
    expect(router.state.location.pathname).not.toBe(`/p/${SLUG}/figures`);
    const b = document.createElement("a");
    b.setAttribute("href", `/p/${SLUG}/figures`);
    document.body.appendChild(b);
    expect(click(b)).toBe(false);
  });

  it("a non-demo href inside a demo boot is a document navigation (the exit arm)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    disposers.push(installSpaClickInterceptor(router));
    const a = document.createElement("a");
    a.setAttribute("href", "/app");
    document.body.appendChild(a);
    expect(click(a)).toBe(false); // native document nav — the demo client never follows
    const b = document.createElement("a");
    b.setAttribute("href", "/p/tenant-project");
    document.body.appendChild(b);
    expect(click(b)).toBe(false);
  });

  it("a demo-namespace href inside a demo boot client-navigates (stays in-document)", async () => {
    const f = makeFetch();
    const { router } = await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    await settled(`[data-figure-row="${IMAGE_ITEM.id}"]`);
    disposers.push(installSpaClickInterceptor(router));
    const a = document.createElement("a");
    a.setAttribute("href", `/demo/${ESSAY}/figures/${IMAGE_ITEM.id}`);
    document.body.appendChild(a);
    expect(click(a)).toBe(true); // prevented ⇒ router.navigate committed
    await vi.waitFor(
      () => expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures/${IMAGE_ITEM.id}`),
      { timeout: SETTLE_TIMEOUT },
    );
  });

  it("the demo banner's exits carry data-demo-exit + data-spa-native on every demo surface", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    const banner = await settled("[data-demo-banner]");
    const exits = [...banner.querySelectorAll("[data-demo-exit]")];
    expect(exits.length).toBeGreaterThanOrEqual(2);
    for (const exit of exits) {
      expect(exit.getAttribute("data-spa-native")).not.toBeNull();
      expect(["/signup", "/login", "/app"]).toContain(exit.getAttribute("href"));
    }
    // signedIn boot → the Back-to-projects arm
    const signedIn = await mountAt(
      `/demo/${ESSAY}/figures`,
      { ...demoBoot(), demo: { ...DEMO, signedIn: true } },
      f.impl,
    );
    const banner2 = await settled("[data-demo-banner]", signedIn.rootEl);
    const back = banner2.querySelector('[data-demo-exit="back"]');
    expect(back?.getAttribute("href")).toBe("/app");
    expect(back?.getAttribute("data-spa-native")).not.toBeNull();
  });
});

// ---- S-5 — the phone-UA arm: SPA on every device, PM never editable ------------------------

describe("the phone-UA demo boot (REQ-DWEB-6)", () => {
  it("mounts the SPA leaf with no SsrHandoff and the PM view is not editable", async () => {
    const f = makeFetch();
    const phone = demoBoot("phone");
    await mountAt(`/demo/${ESSAY}`, phone, f.impl);
    // no SsrHandoff: the leaf mounted in-router, never doc-navved back to the server.
    await settled("[data-pm-host]", document, { timeout: SETTLE_TIMEOUT });
    expect(docNavSpy).not.toHaveBeenCalled();
    // the demo twin's readOnly:true (no collab URL) → the PM view is not editable.
    const pm = document.querySelector(".ProseMirror");
    expect(pm?.getAttribute("contenteditable")).not.toBe("true");
    expect(f.calls.some((c) => c.url === "/session")).toBe(false);
    expect(f.calls.some((c) => c.method === "POST")).toBe(false);
  });
});

// ---- S-7 — the imported-image figure row (REQ-DWEB-17 render) ------------------------------

describe("the imported-figure card (S-7)", () => {
  it("renders the fixture's image row through the asset route — no spec/SVG invented", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}/figures`, demoBoot(), f.impl);
    const img = await settled<HTMLImageElement>(`img[data-figure-image="${IMAGE_ITEM.id}"]`);
    expect(img.getAttribute("src")).toBe(IMAGE_ITEM.assetUri);
    expect(el()!.querySelector("[data-figure-card], [data-figure-detail], main")!.innerHTML).not.toContain("<svg");
  });

  it("the image card page renders the asset-route <img> + version labels, no write surface", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}/figures/${IMAGE_ITEM.id}`, demoBoot(), f.impl);
    const img = await settled<HTMLImageElement>(`img[data-figure-image="${IMAGE_ITEM.id}"]`);
    expect(img.getAttribute("src")).toBe(IMAGE_ITEM.assetUri);
    expect(el()!.querySelector("[data-figure-versions]")).not.toBeNull();
    expect(el()!.querySelector('[data-version="1"]')?.textContent).toContain("imported");
    // no spec/SVG/provenance/write surface is invented for the imported variant.
    expect(el()!.querySelector("[data-provenance], [data-figure-spec], form, [data-insert]")).toBeNull();
    expect(el()!.querySelector("[data-figure-card], [data-figure-detail], main")!.innerHTML).not.toContain("<svg");
  });
});
