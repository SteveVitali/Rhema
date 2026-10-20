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
      bootFor({ "/usage": "spa", "/app/new": "spa" }),
    );
    await act(async () => {
      await router.navigate({ to: "/app/new" });
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
      bootFor({ "/usage": "spa", "/app/new": "spa" }),
    );
    await act(async () => {
      await router.navigate({ to: "/app/new" });
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
    // /app/new is a still-stubbed leaf — the title leg doesn't need a fetch stub for the twin.
    const boot = bootFor({ "/usage": "spa", "/app/new": "spa" });
    const { router } = await mountAt("/usage", boot);
    expect(document.title).toBe("Usage · Rhēma");
    await act(async () => {
      await router.navigate({ to: "/app/new" });
    });
    expect(document.title).toBe("New project · Rhēma");
    expect(document.documentElement.getAttribute("data-route")).toBe("/app/new");
  });

  it("moves focus to the route's h1 and announces via the polite live region", async () => {
    await mountAt("/usage", bootFor({ "/usage": "spa" }));
    const h1 = document.querySelector("[data-spa-root] h1");
    expect(document.activeElement).toBe(h1);
    const announcer = document.querySelector("[data-route-announcer]");
    expect(announcer?.getAttribute("aria-live")).toBe("polite");
    expect(announcer?.textContent).toBe("Usage · Rhēma");
  });

  it("focuses a hash target over the h1 (deep-link parity)", async () => {
    const anchor = document.createElement("div");
    anchor.id = "report";
    anchor.tabIndex = -1;
    document.body.appendChild(anchor);
    await mountAt("/usage#report", bootFor({ "/usage": "spa" }));
    expect(document.activeElement).toBe(anchor);
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
    expect(router.options.notFoundMode).toBe("fuzzy");
  });
});
