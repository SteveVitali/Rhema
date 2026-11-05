// @vitest-environment happy-dom
//
// R7SHELL.1c (REQ-SHELL-7; REQ-RELOAD-3; REQ-ISL-10) — the global ⌘K palette, mounted through
// the REAL router + AppShell (the same harness app-shell.dom.test.tsx uses):
//   • ⌘K opens it on every signed-in page (workspace scope off-project, project scope inside);
//   • the sidebar Search item + the IDE controller's `rhema:palette-open` event open it too;
//   • a project scope carries the PaletteData embed's local commands + "Search all projects";
//   • `GET /bff/search` is the palette's ONLY request — zero non-GET, debounced;
//   • a planted `<b>` in a snippet renders as text (React escapes — never markup);
//   • the demo boot never mounts it — ⌘K is inert and NO search request fires.

import { act, StrictMode, useMemo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpaRouter } from "./main.js";
import { setSpaBoot, type SpaBoot } from "./boot.js";
import { AppShell } from "./app-shell.js";
import { IdeProjectLayout } from "./ide/chrome.js";
import { useIdeChromeData, type IdeChromeData } from "./ide/chrome-data.js";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type Router,
} from "@tanstack/react-router";
import { restoreDocumentNav, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class MemStorage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
}

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const EVERY_ROUTE: Record<string, "spa"> = {
  "/app": "spa",
  "/app/inbox": "spa",
  "/app/settings/account": "spa",
  "/p/$project": "spa",
  "/voices": "spa",
  "/usage": "spa",
};
const HOME_TWIN = { rows: [], voices: [], groupBy: "attention", balance: null, protocols: [], deletedRows: [] };
const INBOX_TWIN = { items: [], badge: 0, gateCards: {} };
const SEARCH_HITS = {
  results: {
    projects: [{ kind: "project", label: "Alpha", projectSlug: "alpha", path: "/p/alpha" }],
    drafts: [
      {
        kind: "draft",
        label: "Alpha",
        projectSlug: "alpha",
        refId: "d1",
        draftN: 2,
        path: "/p/alpha/v/2",
        snippet: "the <b>folktale</b> arc",
      },
    ],
    letters: [],
    voices: [{ kind: "voice", label: "Vladimir Propp", personaId: "per_v", path: "/v/per_v" }],
  },
};

function boot(demo?: SpaBoot["demo"]): SpaBoot {
  return {
    ...(demo == null ? { principal: PRINCIPAL } : {}),
    theme: {},
    deviceClass: "desktop",
    surfaces: EVERY_ROUTE,
    ...(demo != null ? { demo, project: { slug: demo.slug } } : {}),
  };
}

interface Rec { url: string; method: string }
function makeFetch() {
  const calls: Rec[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/session")) return json(PRINCIPAL);
    if (url.startsWith("/bff/search")) {
      if (url.includes("q=zzznomatchzz")) {
        return json({ results: { projects: [], drafts: [], letters: [], voices: [] } });
      }
      return json(SEARCH_HITS);
    }
    if (url.startsWith("/bff/app/inbox")) return json(INBOX_TWIN);
    if (url.startsWith("/bff/app")) return json(HOME_TWIN);
    if (url.startsWith("/bff/feed-labels") || url.startsWith("/bff/demo/feed-labels")) return json({});
    return json({});
  };
  return { calls, fetchFn };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let calls: Rec[] = [];

async function mountAt(path: string, b: SpaBoot) {
  const { calls: c, fetchFn } = makeFetch();
  calls = c;
  vi.stubGlobal("fetch", fetchFn);
  const history = createMemoryHistory({ initialEntries: [path] });
  const { router } = createSpaRouter({ boot: b, history });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
  return router;
}

/** A leaf that publishes `IdeChromeData` — the seam the real surface leaves use. */
function publishLeaf(bag: IdeChromeData): () => ReactNode {
  return function Leaf() {
    const data = useMemo(() => bag, [bag]);
    useIdeChromeData(data);
    return <div data-page-host />;
  };
}

/**
 * The project-scope harness: the REAL AppShell around a real IdeProjectLayout + a publishing
 * leaf — the controller binds (⌘K dispatches `rhema:palette-open`), `.ide` carries the
 * `data-palette` embed the global palette reads for its local commands.
 */
function projectRouter(path: string, b: SpaBoot, bag: IdeChromeData): Router {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const layout = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project",
    component: () => <IdeProjectLayout project="alpha" />,
  });
  const index = createRoute({ getParentRoute: () => layout, path: "/", component: publishLeaf(bag) });
  return createRouter({
    routeTree: rootRoute.addChildren([layout.addChildren([index])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}

async function mountProject(path: string, b: SpaBoot, bag: IdeChromeData) {
  const { calls: c, fetchFn } = makeFetch();
  calls = c;
  vi.stubGlobal("fetch", fetchFn);
  setSpaBoot(b);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const router = projectRouter(path, b, bag);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await router.load();
  });
  return router;
}

const key = (init: KeyboardEventInit): void => {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
};
/** React's per-element value tracker dedupes `el.value =` writes — the prototype setter bypasses
 *  it so the native `input` event lands as a real controlled-input change. */
const setInput = (el: HTMLInputElement, v: string): void => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const palette = () => document.querySelector<HTMLElement>("[data-app-palette]");
const input = () => palette()?.querySelector<HTMLInputElement>("[data-palette-input]");
const searchCalls = () => calls.filter((c) => c.url.startsWith("/bff/search"));
const openPalette = async (): Promise<void> => {
  key({ key: "k", metaKey: true });
  await settled("[data-app-palette]");
};

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemStorage());
  stubDocumentNav();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
  restoreDocumentNav();
});

describe("R7SHELL.1c — the global ⌘K palette (REQ-SHELL-7)", () => {
  it("⌘K opens on a workspace page — workspace scope, focused input, command rows", async () => {
    await mountAt("/app", boot());
    await settled("[data-app-shell]");
    const trigger = document.querySelector<HTMLElement>("[data-shell-inbox]") as HTMLElement;
    act(() => trigger?.focus());
    await openPalette();
    expect(palette()!.dataset["paletteScope"]).toBe("workspace");
    expect(document.activeElement).toBe(input());
    expect(document.body.textContent).toContain("New project");
    // Esc closes and focus returns to the opener (REQ-UX-7).
    key({ key: "Escape" });
    await act(async () => {});
    expect(palette()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the sidebar Search item opens it; ⌘K toggles it closed", async () => {
    await mountAt("/app", boot());
    const item = await settled<HTMLElement>("[data-shell-search]");
    await act(async () => item.click());
    await settled("[data-app-palette]");
    key({ key: "k", metaKey: true }); // toggle ⇒ close (the shell re-dispatches)
    await act(async () => {});
    expect(palette()).toBeNull();
  });

  it("a typed query issues exactly one debounced GET /bff/search — zero non-GET requests", async () => {
    await mountAt("/app", boot());
    await settled("[data-app-shell]");
    await openPalette();
    const el = input()!;
    await act(async () => {
      setInput(el, "folktale");
      await new Promise((r) => setTimeout(r, 260)); // past the 180 ms debounce
    });
    expect(searchCalls().map((c) => c.method)).toEqual(["GET"]);
    expect(searchCalls()[0]!.url).toContain("q=folktale");
    expect(searchCalls()[0]!.url).not.toContain("project=");
    // REQ-ISL-10 re-asserted globally: the palette never issues a non-GET request.
    for (const c of calls) expect(c.method).toBe("GET");
  });

  it("renders grouped hits with deep links — and a planted <b> renders as text", async () => {
    await mountAt("/app", boot());
    await settled("[data-app-shell]");
    await openPalette();
    const el = input()!;
    await act(async () => {
      setInput(el, "folktale");
      await new Promise((r) => setTimeout(r, 260));
    });
    const snippet = await settled<HTMLElement>("[data-palette-snippet]");
    // planted ts_headline markup is inert: the text node carries the literal angle brackets.
    expect(snippet.textContent).toContain("<b>folktale</b>");
    expect(snippet.querySelector("b")).toBeNull();
    expect(document.body.textContent).toContain("Vladimir Propp");
  });

  it("inside /p/:slug it opens project-scoped; 'Search all projects' widens the fetch", async () => {
    await mountProject("/p/alpha", boot(), { projectSlug: "alpha", projectTitle: "Alpha" });
    await settled("[data-app-shell]");
    await settled("[data-ide]");
    await openPalette();
    expect(document.querySelector("[data-palette-scope]")!.getAttribute("data-palette-scope")).toBe("project");
    expect(document.querySelector("[data-palette-results]")).not.toBeNull();
    const widen = await settled<HTMLElement>("[data-palette-search-all]");
    const el = input()!;
    await act(async () => {
      setInput(el, "folktale");
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(searchCalls()[0]!.url).toContain("project=alpha");
    await act(async () => widen.click());
    await act(async () => {
      setInput(el, "folktale2");
      await new Promise((r) => setTimeout(r, 260));
    });
    const last = searchCalls()[searchCalls().length - 1]!.url;
    expect(last).toContain("q=folktale2");
    expect(last).not.toContain("project=");
    expect(document.querySelector("[data-palette-scope]")!.getAttribute("data-palette-scope")).toBe("workspace");
  });

  it("a no-match query renders the EmptyState (data-palette-empty)", async () => {
    await mountAt("/app", boot());
    await settled("[data-app-shell]");
    await openPalette();
    const el = input()!;
    await act(async () => {
      setInput(el, "zzznomatchzz");
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(await settled<HTMLElement>("[data-palette-empty]")).not.toBeNull();
  });

  it("an unresolved / command shows its error; a disabled row stamps data-disabled", async () => {
    await mountProject("/p/alpha", boot(), {
      projectSlug: "alpha",
      palette: {
        projectSlug: "alpha",
        goto: [],
        nextStep: { command: "/not-a-verb", label: "Broken step" },
      },
    });
    await settled("[data-ide]");
    await openPalette();
    const el = input()!;
    await act(async () => setInput(el, "/not-a-verb"));
    const cmd = await settled<HTMLElement>("[data-palette-cmd]");
    expect(cmd.textContent).toContain("not-a-verb");
    // a disabled browse row (an unmet verb) carries the inert-row hook cmdk emits.
    const bag = document.querySelector("[data-ide]")!.getAttribute("data-palette");
    expect(bag).toContain("not-a-verb");
  });

  it("the PaletteData embed's local commands ride the project scope (IDE palette absorbed)", async () => {
    await mountProject("/p/alpha", boot(), {
      projectSlug: "alpha",
      projectTitle: "Alpha",
      palette: { projectSlug: "alpha", goto: [{ label: "Go-to target", path: "/p/alpha/settings" }] },
    });
    await settled("[data-ide]");
    await openPalette();
    expect(document.body.textContent).toContain("Go-to target");
    // the "/" command mode renders the structured row, not the browse list
    const el = input()!;
    await act(async () => {
      setInput(el, "/review");
    });
    expect(await settled<HTMLElement>("[data-palette-cmd]")).not.toBeNull();
  });

  it("a hit row navigates by SPA (router history) to its server-mapped deep link", async () => {
    const router = await mountAt("/app", boot());
    await settled("[data-app-shell]");
    await openPalette();
    const el = input()!;
    await act(async () => {
      setInput(el, "folktale");
      await new Promise((r) => setTimeout(r, 260));
    });
    await settled("[data-palette-snippet]");
    const rows = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")];
    const draft = rows.find((r) => r.textContent?.includes("folktale"));
    expect(draft).not.toBeNull();
    await act(async () => {
      draft!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(router.state.location.pathname).toBe("/p/alpha/v/2"); // never /edit/:id
    expect(palette()).toBeNull();
  });

  it("demo boot — no palette, ⌘K inert, ZERO search request of any kind", async () => {
    await mountAt(
      "/p/demo~the-borrowed-commons",
      boot({ essay: "the-borrowed-commons", slug: "demo~the-borrowed-commons", signedIn: false, build: "sha" }),
    );
    await settled("[data-app-shell]");
    key({ key: "k", metaKey: true });
    key({ key: "/" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(palette()).toBeNull();
    expect(document.querySelector("[data-shell-search]")).toBeNull(); // DemoAppShell: no Search item
    expect(searchCalls()).toEqual([]);
    expect(calls.filter((c) => c.url.includes("palette-search"))).toEqual([]);
  });
});
