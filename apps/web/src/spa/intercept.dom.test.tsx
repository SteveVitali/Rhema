// @vitest-environment happy-dom
//
// NAVC.1 / REQ-NAVT-8 — the delegated click interceptor's guard table, exercised over the
// REAL routeTree (memory history; happy-dom supplies document + window.location). Every row
// of the §2.1 ordered pipeline is covered. Two bookkeeping listeners bracket the
// interceptor's own on `document` (bubble order: pre → interceptor → post): `pre` records
// the claimed-state BEFORE the interceptor decides; `post` records it AFTER — then
// preventDefaults so happy-dom's native anchor navigation (a real fetch + frame teardown)
// never runs inside the suite. A skipped row therefore reads pre=false/post=false with no
// navigate and no navigateDocument; an intercepted row reads post=true with a verbatim
// push-only `navigate({href})` commit; the reloadDocument stubs read post=true +
// `spaRuntime.assign` verbatim; the handoff arm pins A3-OQ1 (the committed slot is eaten by
// `window.location.replace`); `navKey` (`location.state.key`) is asserted throughout — a
// commit rotates it, a skip leaves it stable.

import { createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import { createSpaRouter } from "./main.js";
import { installSpaClickInterceptor } from "./nav-intercept.js";

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

/** A boot with the session seeded (the `_authenticated` gate resolves without `/session`). */
function bootFor(surfaces: Record<string, "spa" | "ssr"> = {}): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

type SpaRouter = ReturnType<typeof createSpaRouter>["router"];
type NavSpy = ReturnType<typeof vi.spyOn>;

const disposers: Array<() => void> = [];
/** The interceptor's own disposer from the latest mount (the bookkeeping pair stays). */
let interceptorDisposer: () => void = () => {};
/** The latest mounted router — `click` snapshots its navKey before dispatch. */
let currentRouter: SpaRouter | undefined;
/** `location.state.key` captured at click dispatch — the navKey-stable pin compares against it. */
let keyAtClick: unknown;
let assignSpy: ReturnType<typeof vi.fn>;
/** `defaultPrevented` seen by the document listener installed BEFORE the interceptor. */
let sawPre: boolean | undefined;
/** `defaultPrevented` seen by the document listener installed AFTER the interceptor. */
let sawPost: boolean | undefined;

/** Answers `{handoff}` POSTs + a generic 200 for every twin GET; records every call. */
function stubFetch(handoffHref: string | null = null) {
  return vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          data: { handoff: handoffHref != null ? { href: handoffHref, inboxItemId: "i1" } : null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
}

/**
 * Mount the interceptor: a real router (memory history) settled on `at`, the document URL
 * moved to match (the interceptor reads `window.location` — the served document's URL), and
 * the ONE delegated listener installed exactly as `mountSpa` does — bracketed by the
 * bookkeeping pair described in the file header.
 */
async function mountInterceptor(at: string, boot: SpaBoot = bootFor(), fetchImpl = stubFetch()) {
  vi.stubGlobal("fetch", fetchImpl);
  const { router } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await router.load();
  window.history.replaceState(null, "", at);
  const pre = (e: Event) => {
    sawPre = e.defaultPrevented;
  };
  const post = (e: Event) => {
    sawPost = e.defaultPrevented;
    e.preventDefault(); // suppress happy-dom's real frame navigation — the suite owns the seam
  };
  document.addEventListener("click", pre);
  const dispose = installSpaClickInterceptor(router);
  interceptorDisposer = dispose;
  document.addEventListener("click", post);
  disposers.push(() => {
    document.removeEventListener("click", pre);
    dispose();
    document.removeEventListener("click", post);
  });
  currentRouter = router;
  return router;
}

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}

function click(el: Element, init: MouseEventInit = {}): MouseEvent {
  sawPre = undefined;
  sawPost = undefined;
  keyAtClick = currentRouter?.state.location.state.key;
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(e);
  return e;
}

const navKey = (router: SpaRouter) => router.state.location.state.key;

/**
 * A skipped activation: nobody claimed the event before the interceptor ran (pre=false),
 * the interceptor left it unclaimed (post=false), the router never navigated, the
 * document-nav seam never fired, and navKey is stable (compared against the snapshot
 * `click()` took at dispatch — never a lazy post-click read).
 */
function expectSkipped(router: SpaRouter, navSpy: NavSpy) {
  expect(sawPre).toBe(false);
  expect(sawPost).toBe(false);
  expect(navSpy).not.toHaveBeenCalled();
  expect(assignSpy).not.toHaveBeenCalled();
  expect(navKey(router)).toBe(keyAtClick);
}

/** An intercepted activation: the interceptor claimed it (post=true) and push-committed. */
async function expectIntercepted(
  router: SpaRouter,
  navSpy: NavSpy,
  href: string,
  pathname: string,
) {
  expect(sawPre).toBe(false);
  expect(sawPost).toBe(true);
  // The call shape is the REQ-NAVM-3 pin: exactly `{href}` — never `replace`,
  // never `resetScroll`, never `viewTransition` (router defaults own them).
  expect(navSpy).toHaveBeenCalledWith({ href });
  await navSpy.mock.results[0]?.value;
  expect(router.state.location.pathname).toBe(pathname);
  expect(assignSpy).not.toHaveBeenCalled();
}

beforeEach(() => {
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
});

afterEach(() => {
  for (const d of disposers.splice(0)) d();
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("REQ-NAVM-1/2 — the §2.1 ordered guard pipeline (pass-through rows)", () => {
  it("ignores clicks that never reach an a[href]", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(document.body.appendChild(document.createElement("div")));
    expectSkipped(router, navSpy);
    click(document.body.appendChild(document.createElement("a"))); // no href
    expectSkipped(router, navSpy);
  });

  it("skips when a handler below already preventDefaulted (REQ-NAVC-10 — onboarding parity)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    const key = navKey(router);
    const a = anchor("/app/inbox");
    a.addEventListener("click", (e) => e.preventDefault());
    click(a);
    expect(sawPre).toBe(true); // claimed by the anchor's own handler BEFORE us
    expect(navSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
    expect(navKey(router)).toBe(key);
  });

  it.each([1, 2])("skips non-primary clicks (button=%i)", async (button) => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/inbox"), { button });
    expectSkipped(router, navSpy);
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
    "skips modified clicks (%s — new-context chords stay native)",
    async (mod) => {
      const router = await mountInterceptor("/usage");
      const navSpy = vi.spyOn(router, "navigate");
      click(anchor("/app/inbox"), { [mod]: true });
      expectSkipped(router, navSpy);
    },
  );

  it("skips anchors inside a contenteditable host; a contenteditable=false island intercepts", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "");
    document.body.appendChild(editable);
    const a = document.createElement("a");
    a.setAttribute("href", "/app/inbox");
    editable.appendChild(a);
    click(a);
    expectSkipped(router, navSpy);
    // contenteditable="false" island — the guard yields to the normal pipeline.
    const island = document.createElement("div");
    island.setAttribute("contenteditable", "false");
    editable.appendChild(island);
    const b = document.createElement("a");
    b.setAttribute("href", "/app/inbox");
    island.appendChild(b);
    click(b);
    await expectIntercepted(router, navSpy, "/app/inbox", "/app/inbox");
  });

  it("target=_blank skips; target=_self intercepts (Link parity, O2-F21)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/inbox", { target: "_blank" }));
    expectSkipped(router, navSpy);
    click(anchor("/app/inbox", { target: "_self" }));
    await expectIntercepted(router, navSpy, "/app/inbox", "/app/inbox");
  });

  it("skips <a download>", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/inbox", { download: "" }));
    expectSkipped(router, navSpy);
  });

  it("skips data-spa-native opt-outs (REQ-NAVM-8)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/inbox", { "data-spa-native": "" }));
    expectSkipped(router, navSpy);
  });

  it.each(["https://else.example/x", "//else.example/x", "mailto:a@b.c", "javascript:void(0)"])(
    "fails closed on foreign/opaque-origin hrefs (%s)",
    async (href) => {
      const router = await mountInterceptor("/usage");
      const navSpy = vi.spyOn(router, "navigate");
      click(anchor(href));
      expectSkipped(router, navSpy);
    },
  );

  it.each(["/usage?a=1#new", "#new", "/usage?a=1"])(
    "hash-only same-path+same-search skips (%s) — native fragment nav, no beforeLoad re-fire",
    async (href) => {
      const router = await mountInterceptor("/usage?a=1#old");
      const navSpy = vi.spyOn(router, "navigate");
      click(anchor(href));
      expectSkipped(router, navSpy);
    },
  );
});

describe("REQ-NAVM-8 / A1-F7 — the non-document GETs stay native", () => {
  it.each([
    "/usage.csv",
    "/p/acme/export/ai-use/md",
    "/p/acme/export/ai-use/docx",
    "/app/settings/data/export/download?id=z",
  ])("%s skips even unmarked (getMatchedRoutes miss / `**` fuzzy)", async (href) => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor(href));
    expectSkipped(router, navSpy);
  });

  it.each([
    ["/usage.csv", { "data-usage-csv": "true", "data-spa-native": "" }],
    ["/p/acme/export/ai-use/md", { "data-spa-native": "" }],
    ["/p/acme/export/ai-use/docx", { "data-spa-native": "" }],
    [
      "/app/settings/data/export/download?id=z",
      { "data-export-download": "true", "data-spa-native": "" },
    ],
  ])("%s skips marked (the shipped emitters carry data-spa-native)", async (href, attrs) => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor(href, attrs));
    expectSkipped(router, navSpy);
  });
});

describe("REQ-NAVM-4 — the server-owned reloadDocument stubs short-circuit to navigateDocument", () => {
  it.each(["/app/usage/r/x", "/p/a/edit/d", "/p/a/f/f"])(
    "%s preventDefaults + document-navs verbatim (never a client commit)",
    async (href) => {
      const router = await mountInterceptor("/usage");
      const navSpy = vi.spyOn(router, "navigate");
      const key = navKey(router);
      click(anchor(href));
      expect(sawPre).toBe(false);
      expect(sawPost).toBe(true); // claimed — the seam is the sole initiator
      expect(assignSpy).toHaveBeenCalledWith(href);
      expect(navSpy).not.toHaveBeenCalled();
      expect(navKey(router)).toBe(key);
    },
  );
});

describe("route identity — in-tree vs native document nav", () => {
  it.each(["/", "/login", "/pricing"])(
    "public funnel %s stays native (not in-tree)",
    async (href) => {
      const router = await mountInterceptor("/usage");
      const navSpy = vi.spyOn(router, "navigate");
      click(anchor(href));
      expectSkipped(router, navSpy);
    },
  );

  it("an unknown SPA-space path stays native — document-nav parity", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/nope"));
    expectSkipped(router, navSpy);
  });

  it.each(["/settings", "/app/settings"])(
    "%s resolves its client redirect in-router (never a doc nav — the spaRouteFor trap)",
    async (href) => {
      const router = await mountInterceptor("/usage");
      const navSpy = vi.spyOn(router, "navigate");
      const key = navKey(router);
      click(anchor(href));
      expect(sawPost).toBe(true);
      expect(navSpy).toHaveBeenCalledWith({ href });
      await navSpy.mock.results[0]?.value;
      expect(router.state.location.pathname).toBe("/app/settings/account");
      expect(navKey(router)).not.toBe(key);
      expect(assignSpy).not.toHaveBeenCalled();
    },
  );
});

describe("the intercepted commit (REQ-NAVM-3 push-only, REQ-NAVC-12 verbatim href)", () => {
  it("a plain in-tree anchor preventDefaults + push-commits; navKey rotates", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    const key = navKey(router);
    click(anchor("/p/acme"));
    await expectIntercepted(router, navSpy, "/p/acme", "/p/acme");
    expect(navKey(router)).not.toBe(key);
  });

  it("clicks at any depth inside the anchor intercept (closest semantics)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    const a = anchor("/app/inbox");
    const span = document.createElement("span");
    span.textContent = "label";
    a.appendChild(span);
    click(span);
    await expectIntercepted(router, navSpy, "/app/inbox", "/app/inbox");
  });

  it("search and hash ride verbatim into the committed location", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/p/a/v/v1?focus=1#finding-x"));
    await expectIntercepted(router, navSpy, "/p/a/v/v1?focus=1#finding-x", "/p/a/v/v1");
    // REQ-NAVC-12 — the href argument to navigate is verbatim; the committed search is the
    // route's own canonical serialization (flagParam JSON-parse renders focus="1").
    expect(router.state.location.searchStr).toContain("focus");
    expect(router.state.location.hash).toBe("finding-x");
  });

  it("a search delta on the current path intercepts (not hash-only)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/usage?archived=1"));
    await expectIntercepted(router, navSpy, "/usage?archived=1", "/usage");
    expect(router.state.location.searchStr).toContain("archived");
  });

  it("absolute same-origin hrefs intercept (origin-equality, not string shape)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor(`${window.location.origin}/app/inbox`));
    await expectIntercepted(router, navSpy, "/app/inbox", "/app/inbox");
  });

  it("synthesized .click() activations intercept (isTrusted is never checked)", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    anchor("/app/inbox").click(); // synthetic — isTrusted is false
    expect(navSpy).toHaveBeenCalledWith({ href: "/app/inbox" });
    await navSpy.mock.results[0]?.value;
    expect(router.state.location.pathname).toBe("/app/inbox");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("§2.8 dead-link fix: /v/:persona is in-tree, the old /voices/<id> shape is not", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/v/p1"));
    await expectIntercepted(router, navSpy, "/v/p1", "/v/p1");
    navSpy.mockClear();
    // The pre-fix state-map href was NOT in-tree — it doc-navved to a 404 (the ridden fix).
    click(anchor("/voices/p1"));
    expectSkipped(router, navSpy);
  });
});

describe("REQ-NAVM-6 — interception never pre-judges the renderer", () => {
  it("intercepts unconditionally under an ssr/absent surfaces verdict — leaves own it", async () => {
    const router = await mountInterceptor("/usage", bootFor({ "/usage": "ssr" }));
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/app/inbox"));
    await expectIntercepted(router, navSpy, "/app/inbox", "/app/inbox");
  });

  it("OQ1 — the handoff arm fires under interception: the push commits, then the reloadDocument redirect eats the slot via location.replace", async () => {
    const fetchMock = stubFetch("/p/acme/r/run9");
    const router = await mountInterceptor(
      "/usage",
      bootFor({ "/usage": "spa", "/p/$project": "spa" }),
      fetchMock,
    );
    const replaceSpy = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    const navSpy = vi.spyOn(router, "navigate");
    click(anchor("/p/acme"));
    expect(sawPost).toBe(true);
    await vi.waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/p/acme/r/run9"));
    // 1. the click pushed (never replace) — the committed slot exists to be eaten.
    expect(navSpy).toHaveBeenNthCalledWith(1, { href: "/p/acme" });
    // 2. router-core 1.171.33 resolves the beforeLoad reloadDocument redirect as a
    //    replace-mode document navigation — the just-committed entry is eaten.
    expect(navSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ href: "/p/acme/r/run9", reloadDocument: true, replace: true }),
    );
    // 3. the leaf pipeline ran: the handoff POST fired exactly as on document entry —
    //    the interceptor never short-circuited the renderer verdict.
    expect(fetchMock).toHaveBeenCalledWith(
      "/bff/p/acme/handoff",
      expect.objectContaining({ method: "POST" }),
    );
    // 4. only the replace arm fired — never assign.
    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe("install contract", () => {
  it("the disposer detaches the one delegated listener", async () => {
    const router = await mountInterceptor("/usage");
    const navSpy = vi.spyOn(router, "navigate");
    interceptorDisposer();
    click(anchor("/app/inbox"));
    expect(sawPost).toBe(false); // unclaimed — the interceptor is gone (post suppresses native nav)
    expect(navSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
