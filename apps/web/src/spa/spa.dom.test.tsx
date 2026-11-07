// @vitest-environment happy-dom
//
// SPA.4 — the skeleton's behavioral contract, exercised against a real mounted router
// (memory history + a stub fetch): unflipped ⇒ SsrHandoff document-nav; 401 ⇒ invalidate +
// `/login` document nav; head manager title/focus/announce + the `[data-route][data-mounted]`
// settle pair; fuzzy not-found for bad params; internal redirect routes. Every leg fails if its
// code is removed.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPA_DOCUMENT_ROUTES } from "@rhema/contracts";
import { createSpaRouter } from "./main.js";
import { HeadManager } from "./head.js";
import type { SpaBoot } from "./boot.js";
import { bffFetch } from "./bff.js";
import { spaRuntime } from "./dom.js";
import { sessionQuery } from "./queries.js";
import { PendingShell } from "./states.js";
import { restoreDocumentNav, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };

function sessionFetch(status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(status === 200 ? PRINCIPAL : { error: "unauthenticated" }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

/**
 * A boot map — `principal` seeded only when `seeded` is set (the seed SKIPS the `/session` fetch;
 * the gate's oracle leg is exercised only with an unseeded query).
 */
function bootFor(surfaces: Record<string, "spa" | "ssr">, seeded = true): SpaBoot {
  return {
    ...(seeded ? { principal: PRINCIPAL } : {}),
    theme: {},
    deviceClass: "desktop",
    surfaces,
  };
}

let docNavSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot | null, fetchImpl = sessionFetch()) {
  vi.stubGlobal("fetch", fetchImpl);
  const el = document.createElement("div");
  el.setAttribute("data-spa-root", "");
  document.body.appendChild(el);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
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
  // REQ-ENG-1 note: NO data-mounted settle gate here — this file owns the marker contract
  // and deliberately mounts unresolved boots (401 → /login document nav, ssr leaves) where
  // the stamp must never land. Its `!` lookups read `[data-route-announcer]` chrome that
  // commits with the provider, not the leaf — outside the mount-settle race class.
  return { router, queryClient, el };
}

beforeEach(() => {
  docNavSpy = stubDocumentNav();
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.documentElement.removeAttribute("data-nav-count");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  restoreDocumentNav();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("router mount + settle markers (REQ-VFY-3)", () => {
  it("a flipped route mounts its leaf and stamps data-route + data-mounted", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    expect(document.documentElement.getAttribute("data-route")).toBe("/usage");
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    expect(document.querySelector("[data-spa-root] h1")?.textContent).toBe("Usage");
  });

  it("stamps data-renderer only where the server put it — the client never writes it", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    expect(document.documentElement.getAttribute("data-renderer")).toBeNull();
  });
});

describe("SsrHandoff (REQ-FW-3/4)", () => {
  it("an unflipped route document-navigates to its own href — the server re-decides", async () => {
    await mountAt("/usage?archived=1", bootFor({ "/usage": "ssr" }));
    expect(docNavSpy).toHaveBeenCalledWith("/usage?archived=1");
  });

  it("a null boot hands every route back — fail-closed", async () => {
    await mountAt("/usage", null);
    expect(docNavSpy).toHaveBeenCalledWith("/usage");
  });

  it("commits replace-mode — the handoff eats the client-committed entry, never a forward-bounce (REQ-NAVM-5)", async () => {
    // Distinct-arm spies at the seam: this is the arm pin, so it observes WHICH member fired
    // (every other assertion goes through the shared docNavSpy — "nav happened, not which").
    const assignArm = vi.fn();
    const replaceArm = vi.fn();
    spaRuntime.assign = assignArm;
    spaRuntime.replace = replaceArm;
    await mountAt("/usage", bootFor({ "/usage": "ssr" }));
    expect(replaceArm).toHaveBeenCalledWith("/usage");
    expect(assignArm).not.toHaveBeenCalled();
  });

  it("the real seam dispatches to window.location.replace — the committed slot is eaten", async () => {
    restoreDocumentNav(); // real arms, so the leaf-level dispatch is observable
    const locReplace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    const locAssign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    await mountAt("/usage?archived=1", bootFor({ "/usage": "ssr" }));
    expect(locReplace).toHaveBeenCalledWith("/usage?archived=1");
    expect(locAssign).not.toHaveBeenCalled();
  });
});

describe("the auth gate (REQ-FW-5, REQ-BND-7)", () => {
  it("a 401 session invalidates ['session'] and document-navigates to /login", async () => {
    const f = sessionFetch(401);
    const { queryClient } = await mountAt("/usage", bootFor({ "/usage": "spa" }, false), f);
    expect(f).toHaveBeenCalledWith("/session", expect.objectContaining({ credentials: "same-origin" }));
    expect(docNavSpy).toHaveBeenCalledWith("/login");
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });

  it("REQ-NAVC-20 — the 401 leg invalidates with refetchType:'none' (never a mid-teardown refetch) and hands the DOCUMENT to /login", async () => {
    const f = sessionFetch(401);
    const { queryClient } = await mountAt("/usage", bootFor({ "/usage": "spa" }, false), f);
    expect(docNavSpy).toHaveBeenCalledWith("/login");
    // Re-drive the seam through any twin 401 (the stub answers 401 to every path): the handler
    // the boot installed must mark the session query stale WITHOUT re-firing it — a refetching
    // invalidation would re-issue the 401ing read against a dying session (Q-A4-2's pin).
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await expect(bffFetch("/bff/anything-401")).rejects.toMatchObject({ status: 401 });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: sessionQuery.queryKey, refetchType: "none" }),
    );
    expect(docNavSpy).toHaveBeenCalledWith("/login");
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });

  it("a live /session answer satisfies the gate — no navigation", async () => {
    const f = sessionFetch(200);
    const { queryClient } = await mountAt("/usage", bootFor({ "/usage": "spa" }, false), f);
    expect(docNavSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(PRINCIPAL);
  });

  it("a boot-seeded principal satisfies the gate without a fetch — a seed, consumed once", async () => {
    const f = sessionFetch(200);
    // SPA.16 — /app/settings/billing is no longer a stub leaf (it legitimately warms its own
    // twin), so the assertion isolates the session seed directly: /session is never fetched.
    await mountAt("/app/settings/billing", bootFor({ "/app/settings/billing": "spa" }), f);
    expect(docNavSpy).not.toHaveBeenCalled();
    expect(f.mock.calls.map((c) => c[0])).not.toContain("/session");
  });
});

describe("the nav-mechanism contract (REQ-NAVT-1/2)", () => {
  it("mounts at data-nav-count=0 — hydration is the seed run, never a transition", async () => {
    // StrictMode double-invokes the mount effect — the key-seed guard means the second run
    // can't count either, so a mounted-at-"0" read pins both hydration AND double-mount.
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("0");
  });

  it("increments once per committed transition — push and replace both count", async () => {
    const { router } = await mountAt(
      "/usage",
      bootFor({ "/usage": "spa", "/app": "spa" }),
    );
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
    await act(async () => {
      await router.navigate({ to: "/usage", replace: true });
    });
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("2");
    // a search-delta commit counts too — it's a distinct committed location
    await act(async () => {
      router.history.push("/usage?archived=1");
      await router.load();
    });
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("3");
  });

  it("a Back pop counts as a committed transition — the restored entry's key differs", async () => {
    const { router } = await mountAt(
      "/usage",
      bootFor({ "/usage": "spa", "/app": "spa" }),
    );
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/usage");
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("2");
  });

  it("data-mounted LEAVES while a nav pends — the mid-transition false-pass is closed (REQ-NAVT-2)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <HeadManager />
          <Outlet />
        </>
      ),
    });
    const routeA = createRoute({
      getParentRoute: () => rootRoute,
      path: "/a",
      component: () => <main data-spa-surface>A</main>,
    });
    const routeB = createRoute({
      getParentRoute: () => rootRoute,
      path: "/b",
      loader: () => gate,
      pendingMs: 0,
      component: () => <main data-spa-surface>B</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([routeA, routeB]),
      history: createMemoryHistory({ initialEntries: ["/a"] }),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounted.push(root);
    await act(async () => {
      root.render(<RouterProvider router={router} />);
      await router.load();
    });
    expect(document.documentElement.hasAttribute("data-mounted")).toBe(true);
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("0");
    // commit the navigation but hold the loader — the pending window is now open.
    let navDone: Promise<unknown> | undefined;
    await act(async () => {
      navDone = router.navigate({ to: "/b" });
      await Promise.resolve();
    });
    expect(router.state.isLoading).toBe(true);
    // data-route already flipped to the pending route, but the mounted marker must be GONE —
    // before REQ-NAVT-2 the stale pair (`/b` + still-mounted) let a settle false-pass.
    expect(document.documentElement.getAttribute("data-route")).toBe("/b");
    expect(document.documentElement.hasAttribute("data-mounted")).toBe(false);
    // the committed transition counted already — the tally is commit-scoped, not resolve-scoped.
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
    release();
    await act(async () => {
      await navDone;
    });
    expect(document.documentElement.hasAttribute("data-mounted")).toBe(true);
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
  });
});

describe("head manager (REQ-BND-8, REQ-UX-7/9)", () => {
  it("rewrites document.title through docMetaFor on nav", async () => {
    // /app is a still-stubbed leaf — the title leg doesn't need a fetch stub for the twin.
    const boot = bootFor({ "/usage": "spa", "/app": "spa" });
    const { router } = await mountAt("/usage", boot);
    expect(document.title).toBe("Usage · Rhēma");
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    expect(document.title).toBe("Projects · Rhēma");
    expect(document.documentElement.getAttribute("data-route")).toBe("/app");
  });

  it("moves focus to the route's h1 and announces via the polite live region", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const h1 = document.querySelector("[data-spa-root] h1");
    expect(document.activeElement).toBe(h1);
    const announcer = document.querySelector("[data-route-announcer]");
    expect(announcer?.getAttribute("aria-live")).toBe("polite");
    expect(announcer?.textContent).toBe("Usage · Rhēma");
  });

  it("REQ-COPY-7 — programmatic route focus lands on the h1 with NO visible ring (inline suppression)", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const h1 = document.querySelector<HTMLElement>("[data-spa-root] h1")!;
    expect(document.activeElement).toBe(h1);
    // The stamp IS the programmatic/keyboard distinction: only HeadManager's focus arm writes it,
    // so the :focus-visible ring in the stylesheet can never paint the heading's full-width box
    // (R5 A4/D7). `tabindex=-1` keeps the h1 out of the tab order.
    expect(h1.style.outlineStyle).toBe("none");
    expect(h1.tabIndex).toBe(-1);
  });

  it("REQ-COPY-7 — the suppression lifts on blur; a direct (keyboard) focus is never stamped", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const h1 = document.querySelector<HTMLElement>("[data-spa-root] h1")!;
    expect(h1.style.outlineStyle).toBe("none");
    h1.blur();
    expect(h1.style.outlineStyle).toBe("");
    // Keyboard focus never passes through the route-focus arm: an element focused directly keeps
    // its inline outline unset, so the stylesheet's 2-px :focus-visible ring still reaches it
    // (REQ-IDE-42 / REQ-UX-7 preserved).
    h1.focus();
    expect(h1.style.outlineStyle).toBe("");
  });

  it("REQ-COPY-7 — a programmatic hash-target focus is suppressed the same way and re-stamps per nav", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const target = document.createElement("div");
    target.id = "deep2";
    document.body.appendChild(target);
    await act(async () => {
      await router.navigate({ href: "/usage#deep2" });
    });
    expect(document.activeElement).toBe(target);
    expect(target.style.outlineStyle).toBe("none");
    expect(target.tabIndex).toBe(-1);
    target.blur();
    expect(target.style.outlineStyle).toBe("");
    // the next committed nav re-stamps the new focus target
    const deeper = document.createElement("div");
    deeper.id = "deep3";
    document.body.appendChild(deeper);
    await act(async () => {
      await router.navigate({ href: "/usage#deep3" });
    });
    expect(deeper.style.outlineStyle).toBe("none");
  });

  it("focuses a hash target over the h1 (deep-link parity)", async () => {
    const anchor = document.createElement("div");
    anchor.id = "report";
    anchor.tabIndex = -1;
    document.body.appendChild(anchor);
    await mountAt("/usage#report", bootFor({ "/usage": "spa" }));
    expect(document.activeElement).toBe(anchor);
  });

  it("REQ-NAVC-16/21 — a MID-navigation hash target wins focus over the h1, same precedence", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const h1 = document.querySelector("[data-spa-root] h1");
    expect(document.activeElement).toBe(h1); // the generic arm held the first commit
    const target = document.createElement("div");
    target.id = "deep";
    document.body.appendChild(target);
    await act(async () => {
      await router.navigate({ href: "/usage#deep" });
    });
    // the hash commit is a committed transition — focus goes to the fragment target, not the h1.
    expect(document.activeElement).toBe(target);
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
  });

  it("REQ-NAVC-21 — a same-title commit re-announces: clear-then-set, never a silent no-op", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const announcer = document.querySelector<HTMLElement>("[data-route-announcer]")!;
    // MutationObserver records carry node lists, not values — read added/removed nodes:
    // a `textContent = ""` write removes the old node; the `= title` write adds the new one.
    const events: string[] = [];
    const mo = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.removedNodes.length > 0) events.push(`removed:${mut.removedNodes[0]?.textContent}`);
        if (mut.addedNodes.length > 0) events.push(`added:${mut.addedNodes[0]?.textContent}`);
      }
    });
    mo.observe(announcer, { childList: true, characterData: true, subtree: true });
    await act(async () => {
      router.history.push("/usage?archived=1");
      await router.load();
    });
    mo.disconnect();
    // the title didn't move ("Usage · Rhēma" both sides) — assistive tech must still hear a
    // navigation, so the region is cleared AND re-set on every committed transition.
    expect(document.title).toBe("Usage · Rhēma");
    expect(events.slice(-2)).toEqual(["removed:Usage · Rhēma", "added:Usage · Rhēma"]);
    expect(announcer.getAttribute("aria-live")).toBe("polite");
  });

  it("REQ-NAVC-21 — a replace commit announces the same way (the announce policy is commit-scoped)", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa", "/app": "spa" }));
    const announcer = document.querySelector<HTMLElement>("[data-route-announcer]")!;
    const mutations: string[] = [];
    const mo = new MutationObserver(() => mutations.push(announcer.textContent ?? ""));
    mo.observe(announcer, { childList: true, characterData: true, subtree: true });
    await act(async () => {
      await router.navigate({ to: "/app", replace: true });
    });
    mo.disconnect();
    expect(document.title).toBe("Projects · Rhēma");
    expect(mutations.at(-1)).toBe("Projects · Rhēma");
    expect(document.documentElement.getAttribute("data-nav-count")).toBe("1");
  });
});

describe("not-found + redirect surfaces (REQ-NAV-2/9/10)", () => {
  it("a bad param value resolves the scoped not-found — no error page", async () => {
    await mountAt("/p/acme/v/abc", bootFor({ "/p/$project/v/$v": "spa" }));
    expect(document.querySelector("[data-spa-root] h1")?.textContent).toBe("Not found");
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("an unknown SPA-space path renders the in-router 404, not a handoff loop", async () => {
    await mountAt("/app/definitely-not-a-route", bootFor({}));
    expect(document.querySelector("[data-spa-root] h1")?.textContent).toBe("Not found");
  });

  it("a path outside SPA space document-navigates — the server owns it", async () => {
    await mountAt("/login", bootFor({ "/usage": "spa" }));
    expect(docNavSpy).toHaveBeenCalledWith("/login");
  });

  it("/settings internal-redirects to /app/settings/account without a document nav", async () => {
    const { router } = await mountAt("/settings", bootFor({ "/app/settings/account": "spa" }));
    expect(router.state.location.pathname).toBe("/app/settings/account");
    expect(docNavSpy).not.toHaveBeenCalled();
  });

  it("REQ-NAVC-23 — a mid-document hop to a surfaces:null path hands off through SsrHandoff", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa" }));
    // `/login` is a contract surfaces:null row AND outside the client tree: a committed
    // in-document hop resolves the fuzzy not-found leaf, which hands the URL back to the
    // server through the same SsrHandoff→replaceDocument seam the initial-mount arm takes —
    // the document boundary is server-owned even when the hop started client-side.
    await act(async () => {
      await router.navigate({ href: "/login" });
    });
    await vi.waitFor(() => expect(docNavSpy).toHaveBeenCalledWith("/login"));
  });

  it("REQ-NAVC-23 — a mid-document hop onto a reloadDocument stub doc-navs through its beforeLoad", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa" }));
    // `/p/a/f/f` is a RELOAD_STUB_IDS member — the route itself throws
    // `redirect({reloadDocument:true})` in beforeLoad. Reached by a CLIENT commit (this leg) or
    // the interceptor's push (OQ1 in intercept.dom.test.tsx), the router resolves it as a
    // replace-mode document navigation — the host slot is eaten, so Back never lands on the
    // transient stub commit.
    const locReplace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    await act(async () => {
      router.navigate({ href: "/p/a/f/f" }).catch(() => undefined);
      await router.load().catch(() => undefined);
    });
    await vi.waitFor(() => expect(locReplace).toHaveBeenCalledWith("/p/a/f/f"));
  });
});

describe("pending + error states (REQ-UX-6)", () => {
  it("a pending route paints skeleton rows — never blank", async () => {
    let resolveLoad!: () => void;
    const gate = new Promise<void>((res) => {
      resolveLoad = res;
    });
    const rootRoute = createRootRoute({ component: Outlet });
    const slowRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/slow",
      loader: () => gate,
      pendingMs: 0,
      pendingComponent: PendingShell,
      component: () => <main data-spa-surface>done</main>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([slowRoute]),
      history: createMemoryHistory({ initialEntries: ["/slow"] }),
    });
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounted.push(root);
    act(() => {
      root.render(<RouterProvider router={router} />);
    });
    expect(el.querySelector('[data-ide-state="loading"]')).not.toBeNull();
    expect(el.textContent).not.toContain("done");
    resolveLoad();
    await act(async () => {
      await router.load();
    });
    expect(el.textContent).toContain("done");
  });

  it("a non-401 loader failure renders the designed error component — not a /login lie", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "session_unavailable" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );
    await mountAt("/usage", bootFor({ "/usage": "spa" }, false), f);
    expect(docNavSpy).not.toHaveBeenCalledWith("/login");
    expect(document.querySelector("[data-spa-root] h1")?.textContent).toBe("Something didn't load");
  });
});

describe("the tree contract (REQ-NAV-1) + router config (REQ-FW-7)", () => {
  it("every SPA_DOCUMENT_ROUTES entry is a registered route — redirect surfaces included", () => {
    const { router } = createSpaRouter({
      boot: bootFor({}),
      history: createMemoryHistory({ initialEntries: ["/usage"] }),
    });
    const registered = new Set(Object.keys(router.routesByPath));
    for (const doc of SPA_DOCUMENT_ROUTES) {
      expect(registered, `missing ${doc.routeId}`).toContain(doc.routeId);
    }
  });

  it("no public/BFF path is registered", () => {
    const { router } = createSpaRouter({
      boot: bootFor({}),
      history: createMemoryHistory({ initialEntries: ["/usage"] }),
    });
    for (const path of ["/", "/login", "/signup", "/pricing", "/invite", "/showcase"]) {
      expect(router.routesByPath[path], path).toBeUndefined();
    }
  });

  it("pins the router's contract options — NO preload (REQ-NAVM-7), scroll restoration, fuzzy not-found", () => {
    const { router } = createSpaRouter({
      boot: bootFor({}),
      history: createMemoryHistory({ initialEntries: ["/usage"] }),
    });
    // REQ-NAVM-7 (NAVC.1) — `defaultPreload:"intent"` is deliberately unset: side-effecting
    // beforeLoad/loader arms (postProjectHandoff POST, confirmEmail, mark-read twins) must
    // never run on hover. A future PRELOAD_SAFE allowlist is gated on a per-route audit.
    expect(router.options.defaultPreload).toBeUndefined();
    expect(router.options.defaultPreloadStaleTime).toBe(0);
    expect(router.options.scrollRestoration).toBe(true);
    // REQ-NAVC-16 (NAVC.4) — `.ide-page` is the ONE inner scroller the router tops on push
    // (packages/ui's IdeShell emits it; the keyed restoration still re-applies it on pops).
    expect(router.options.scrollToTopSelectors).toEqual([".ide-page"]);
    expect(router.options.notFoundMode).toBe("fuzzy");
  });
});

describe("the scroll contract (REQ-NAVC-16)", () => {
  // happy-dom maps window.scrollTo/scrollY onto documentElement.scrollTop and elements carry
  // real scrollTop/scrollTo — the router's scrollRestoration machinery runs unstubbed. Scroll
  // events are dispatched to register each target with the router's tracker (capture listener
  // on document) — that's how a position enters the keyed restoration cache.

  it("history.scrollRestoration flips to manual — the router owns scroll, not the browser", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    expect(window.history.scrollRestoration).toBe("manual");
  });

  it("a push tops the window; a Back pop restores the prior position", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa", "/app": "spa" }));
    window.scrollTo(0, 400);
    document.dispatchEvent(new Event("scroll")); // register the window scroll target
    expect(window.scrollY).toBe(400);
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    expect(router.state.location.pathname).toBe("/app");
    expect(window.scrollY).toBe(0); // top-on-push
    await act(async () => {
      router.history.back();
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/usage");
    expect(window.scrollY).toBe(400); // the keyed cache re-applies — document-nav parity
  });

  it("the .ide-page inner scroller tops on push and restores on pop (scrollToTopSelectors)", async () => {
    const inner = document.createElement("main");
    inner.className = "ide-page";
    document.body.appendChild(inner);
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa", "/app": "spa" }));
    inner.scrollTop = 300;
    inner.dispatchEvent(new Event("scroll")); // element scroll targets register by event
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    // a scrollToTopSelectors element is NOT restored-then-topped — push tops it outright.
    expect(inner.scrollTop).toBe(0);
    await act(async () => {
      router.history.back();
      await router.load();
    });
    // on the pop the selector's keyed entry wins — the inner scroller restores like the window.
    expect(inner.scrollTop).toBe(300);
  });

  it("a hash push favors the fragment target — the cached window position is skipped", async () => {
    const { router } = await mountAt("/usage", bootFor({ "/usage": "spa", "/app": "spa" }));
    window.scrollTo(0, 300);
    document.dispatchEvent(new Event("scroll"));
    const target = document.createElement("div");
    target.id = "report";
    document.body.appendChild(target);
    const siv = vi.spyOn(target, "scrollIntoView").mockImplementation(() => {});
    await act(async () => {
      await router.navigate({ to: "/app" });
    });
    expect(window.scrollY).toBe(0);
    window.scrollTo(0, 200); // a mid-life position — must survive the hash nav untouched
    document.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await router.navigate({ href: "/usage#report" });
    });
    expect(router.state.location.pathname).toBe("/usage");
    expect(router.state.location.hash).toBe("report");
    // the push-arm precedence: scrollIntoView on the hash target, window restore SKIPPED —
    // /usage's cached 300 must NOT be re-applied, and no top-reset fires either.
    expect(siv).toHaveBeenCalled();
    expect(window.scrollY).toBe(200);
  });
});
