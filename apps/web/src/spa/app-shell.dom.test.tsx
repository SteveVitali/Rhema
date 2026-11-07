// @vitest-environment happy-dom
//
// R7SHELL.1a (REQ-SHELL-1/2/6; ADR-128; UXC-3/29/35, D6, F4) — the AppShell, mounted through the
// REAL router (memory history + a stub fetch):
//   • the route-tree census — every `/_authenticated` leaf renders inside AppShell;
//   • one instance — workspace→project→workspace navigation keeps one AppShell mounted;
//   • pending/error/404 render in-shell (the sidebar present);
//   • `/billing` resolves to `/app/settings/billing` in-router (the server 302 is a server test);
//   • per-user collapse persistence + wordmark → `/app` + no `href="/"`;
//   • the <768 desktop top bar + drawer hooks + the hosted-IDE suppression;
//   • the demo-boot variant — zero workspace items, zero session/workspace/credits reads, and
//     "Back to your projects" only when `boot.demo.signedIn`.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ideCss } from "@rhema/tokens";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { restoreDocumentNav, settled, stubDocumentNav } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Node ≥22's built-in localStorage shadows happy-dom's (the ide-chrome.dom.test.tsx precedent). */
class MemStorage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
}

const SPA_DIR = dirname(fileURLToPath(import.meta.url));
const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const EVERY_ROUTE: Record<string, "spa"> = {
  "/app": "spa",
  "/app/inbox": "spa",
  "/app/settings/billing": "spa",
  "/p/$project": "spa",
  "/voices": "spa",
  "/usage": "spa",
};

const HOME_TWIN = {
  rows: [
    { id: "p1", slug: "alpha", title: "Alpha", state: { key: "ready_to_read", pill: "Ready", overlay: null, suggested: { kind: "none" } }, group: "ready_to_read" },
    { id: "p2", slug: "beta", title: "Beta", state: { key: "running", pill: "Running", overlay: null, suggested: { kind: "none" } }, group: "running", activeRun: { runId: "r1", state: "running" } },
  ],
  voices: [],
  groupBy: "attention",
  balance: { spendableCredits: 14855, heldCredits: 0 },
  protocols: [],
  deletedRows: [],
};
const INBOX_TWIN = { items: [], badge: 3, gateCards: {} };
// R7SHELL.2 — a minimal `?view=tree` twin: the current project's facts + a two-section tree.
const TREE_TWIN = {
  project: { title: "Alpha", pill: "Ready", slug: "alpha", headDraftId: "d1", headDraftN: 2, readOnlyProject: null },
  files: {
    sections: [
      {
        key: "drafts",
        sealedCount: 0,
        rows: [
          {
            artifactId: "drafts/v2.md",
            kind: "draft",
            label: "v2",
            level: "SE",
            editMode: "read",
            lock: "editable",
            readOnly: false,
            words: 1200,
            createdAt: "2026-11-01T00:00:00Z",
            provenance: { actor: "you" },
            draftRef: { n: 2, state: "working" },
          },
        ],
        advancedRows: [],
      },
      {
        key: "rounds",
        sealedCount: 0,
        rows: [
          {
            artifactId: "rounds/r1",
            kind: "round",
            label: "Draft review",
            level: "SR",
            editMode: "read",
            lock: "immutable",
            readOnly: false,
            words: null,
            createdAt: "2026-11-01T00:00:00Z",
            provenance: { actor: "agent", runId: "r1", workflow: "Review" },
          },
        ],
        advancedRows: [
          {
            artifactId: "advanced/source.md",
            kind: "source",
            label: "Source",
            level: "I",
            editMode: "read",
            lock: "inspect",
            readOnly: true,
            words: null,
            createdAt: "2026-11-01T00:00:00Z",
            provenance: { actor: "you" },
          },
        ],
      },
    ],
  },
};

function boot(demo?: SpaBoot["demo"], deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return {
    ...(demo == null ? { principal: PRINCIPAL } : {}),
    theme: {},
    deviceClass,
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
    if (url.startsWith("/bff/app/inbox")) return json(INBOX_TWIN);
    if (url.startsWith("/bff/app")) return json(HOME_TWIN);
    if (url.startsWith("/bff/feed-labels") || url.startsWith("/bff/demo/feed-labels")) return json({});
    // R7SHELL.2 — the sidebar project section's `?view=tree` twin (any project slug).
    if (url.startsWith("/bff/p/") && url.includes("view=tree")) return json(TREE_TWIN);
    return new Response(JSON.stringify({ error: "unstubbed" }), { status: 500 });
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

const shell = () => settled<HTMLElement>("[data-app-shell]");

describe("R7SHELL.1a — the AppShell census and mount", () => {
  it("every generated route nests under /_authenticated (a leaf outside it fails the census)", () => {
    // TanStack strips the pathless layout segment from generated ids, so the parentage evidence
    // is `getParentRoute`: every leaf chain must terminate at `AuthenticatedRoute` — exactly ONE
    // route (the layout itself) may name `rootRouteImport` as its parent. Planting a leaf
    // outside the layout adds a second rootRouteImport parent and fails this test.
    const gen = readFileSync(join(SPA_DIR, "routeTree.gen.ts"), "utf8");
    const parents = [...gen.matchAll(/getParentRoute:\s*\(\)\s*=>\s*(\w+)/g)].map((m) => m[1]!);
    expect(parents.length).toBeGreaterThan(30);
    const outside = parents.filter((p) => !p.startsWith("Authenticated"));
    expect(outside, `routes outside the AppShell: ${outside.join(", ")}`).toEqual(["rootRouteImport"]);
    // the layout itself mounts the shell
    const layoutSrc = readFileSync(join(SPA_DIR, "routes", "_authenticated.tsx"), "utf8");
    expect(layoutSrc).toContain("<AppShell>");
    expect(layoutSrc).toContain("<Outlet />");
    // and every leaf file lives under the _authenticated directory
    const routesDir = join(SPA_DIR, "routes");
    for (const f of readdirSync(routesDir)) {
      expect(["__root.tsx", "_authenticated.tsx", "_authenticated"].includes(f), `stray leaf ${f}`).toBe(true);
    }
  });

  it("a workspace leaf renders inside the shell with the full sidebar item set", async () => {
    await mountAt("/app", boot());
    await shell();
    expect(document.querySelector("[data-app-sidebar]")).not.toBeNull();
    expect(document.querySelector("[data-shell-wordmark]")?.getAttribute("href")).toBe("/app");
    for (const hook of ["data-shell-new-project", "data-shell-inbox", "data-shell-voices", "data-shell-usage", "data-shell-settings", "data-shell-all-projects", "data-shell-account", "data-shell-toggle"]) {
      expect(document.querySelector(`[${hook}]`), hook).not.toBeNull();
    }
    // recents ≤ 8 with status dots + the inbox badge
    expect(document.querySelectorAll("[data-shell-recent]").length).toBe(2);
    const dots = document.querySelectorAll<HTMLElement>(".app-shell-dot[data-tone]");
    expect(dots.length).toBe(2);
    expect(dots[0]!.getAttribute("data-tone")).toBe("ready_to_read");
    expect(dots[1]!.getAttribute("data-tone")).toBe("running");
    const badge = await settled<HTMLElement>("[data-shell-inbox] .app-shell-badge");
    expect(badge.textContent).toBe("3");
    // the account menu's item hooks — open it and assert the manifest's set emits
    const account = await settled<HTMLButtonElement>("[data-shell-account]");
    await act(async () => {
      account.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      account.click();
    });
    for (const hook of ["data-shell-billing", "data-shell-pricing", "data-shell-signout"]) {
      await settled(`[${hook}]`);
    }
    for (const t of ["dark", "light", "auto"]) {
      expect(document.querySelector(`[data-shell-theme="${t}"]`)).not.toBeNull();
    }
    // no `href="/"` remains in the SHELL chrome (UXC-3 — leaf headers are 227's).
    expect(document.querySelector('[data-app-sidebar] a[href="/"]')).toBeNull();
    // 248 R7TOUR.2 (REQ-TOUR-4 R7b part, REQ-DWEB-16, S-14) — the sidebar Demo item sits in
    // the nav group after Settings, a DOCUMENT navigation (data-spa-native — the
    // interceptor's opt-out guard lets it load a fresh document) into the demo namespace.
    const demo = document.querySelector<HTMLElement>("[data-shell-demo]");
    expect(demo, "the sidebar Demo item").not.toBeNull();
    expect(demo!.getAttribute("data-spa-native")).not.toBeNull();
    expect(demo!.getAttribute("href")).toBe("/demo/structure-of-political-difference");
    expect(demo!.textContent).toContain("Demo");
    // R7SHELL.1c — Search renders on every signed-in page (the global palette's reach is the
    // whole workspace shell, not only IDE-framed leaves).
    expect(document.querySelector("[data-shell-search]")).not.toBeNull();
  });

  it("one AppShell instance survives workspace → project → workspace navigation", async () => {
    const router = await mountAt("/app", boot());
    const first = await shell();
    await act(async () => {
      await router.navigate({ href: "/p/alpha" });
    });
    await settled("[data-ide]");
    expect(document.querySelector("[data-app-shell]")).toBe(first);
    // the hosted IDE: the rail is never mounted, the sidebar carries the scope's chrome
    expect(document.querySelector("[data-ide-hosted]")).not.toBeNull();
    expect(document.querySelector(".ide-rail")).toBeNull();
    expect(document.querySelector(".ide-phonebar")).toBeNull();
    await act(async () => {
      await router.navigate({ href: "/voices" });
    });
    await shell();
    expect(document.querySelector("[data-app-shell]")).toBe(first);
  });

  it("Search renders inside an IDE-framed leaf too (R7SHELL.1c)", async () => {
    const router = await mountAt("/app", boot());
    await shell();
    await act(async () => {
      await router.navigate({ href: "/p/alpha" });
    });
    await settled("[data-ide]");
    expect(document.querySelector("[data-shell-search]")).not.toBeNull();
  });

  it("R7SHELL.2 — the project scope: current entry expands to the seven items + tree; recents exclude it; no rail/Files strip", async () => {
    await mountAt("/p/alpha", boot());
    await settled("[data-shell-project]");
    // no IDE rail or Files strip anywhere (the removal-catching half of the AC).
    expect(document.querySelector(".ide-rail")).toBeNull();
    expect(document.querySelector(".ide-files")).toBeNull();
    expect(document.querySelector("[data-files]")).toBeNull();
    // the seven items exist as SPA links with the Page item current on /p/alpha.
    for (const key of ["page", "outline", "figures", "versions", "reviews", "export", "settings"]) {
      const item = document.querySelector(`[data-project-item="${key}"]`);
      expect(item, key).not.toBeNull();
      expect(item!.getAttribute("href"), key).toMatch(/^\/p\/alpha/);
    }
    expect(document.querySelector('[data-project-item="page"]')!.getAttribute("aria-current")).toBe("page");
    // the Files tree under the entry — tree roles, no lock glyph.
    expect(document.querySelector("[data-shell-current-project]")).not.toBeNull();
    const tree = await settled('[data-project-tree] [role="tree"]');
    expect(tree).not.toBeNull();
    expect(document.querySelector('[data-project-tree] [role="treeitem"]')).not.toBeNull();
    expect(document.querySelector('[data-files-section="drafts"]')).not.toBeNull();
    expect(document.querySelector('[data-file-row="drafts/v2.md"]')).not.toBeNull();
    expect(document.querySelector("[data-files-advanced]")).not.toBeNull();
    expect(document.querySelectorAll("[data-lock-badge]").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-lock-icon]")).toBeNull();
    // the current project is not repeated in Recent projects.
    expect(document.querySelector('[data-shell-recent="alpha"]')).toBeNull();
    expect(document.querySelector('[data-shell-recent="beta"]')).not.toBeNull();
  });

  it("the in-shell 404 renders inside the shell with the sidebar present", async () => {
    await mountAt("/app/definitely-not-a-route", boot());
    await shell();
    await settled("h1");
    expect(document.querySelector("[data-app-sidebar]")).not.toBeNull();
    expect(document.querySelector("h1")!.textContent).not.toBe("");
  });
});

describe("R7SHELL.1a — /billing, collapse, narrow desktop", () => {
  it("/billing resolves to /app/settings/billing in-router", async () => {
    const router = await mountAt("/app", boot());
    await shell();
    await act(async () => {
      await router.navigate({ href: "/billing" });
    });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/settings/billing");
    });
  });

  it("collapse persists per user and is not shared", async () => {
    const router = await mountAt("/app", boot());
    await shell();
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-sidebar")).toBe("expanded");
    const toggle = await settled<HTMLButtonElement>("[data-shell-toggle]");
    await act(async () => {
      toggle.click();
    });
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-sidebar")).toBe("collapsed");
    expect(localStorage.getItem("rhema:sidebar:v1:u1")).toBe("collapsed");
    // a second user on the same browser does NOT share it
    expect(localStorage.getItem("rhema:sidebar:v1:u2")).toBeNull();
    // reload (remount): the pref survives for u1
    await act(async () => {
      await router.navigate({ href: "/voices" });
    });
    await shell();
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-sidebar")).toBe("collapsed");
  });

  it("the `[` chord toggles the sidebar outside the IDE", async () => {
    await mountAt("/app", boot());
    await shell();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
    });
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-sidebar")).toBe("collapsed");
    // the IDE controller's event path works the same way
    await act(async () => {
      window.dispatchEvent(new CustomEvent("rhema:sidebar-toggle"));
    });
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-sidebar")).toBe("expanded");
  });

  it("the narrow-desktop top bar + drawer hooks render (desktop UA)", async () => {
    await mountAt("/app", boot());
    await shell();
    const bar = document.querySelector("[data-shell-topbar]");
    expect(bar).not.toBeNull();
    const btn = await settled<HTMLButtonElement>("[data-shell-drawer-toggle]");
    await act(async () => {
      btn.click();
    });
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-drawer")).toBe("open");
    expect(document.querySelector("[data-shell-scrim]")).not.toBeNull();
    // the <768 CSS (the emitted stylesheet): the hiding is rescoped off the hosted IDE and the
    // drawer/sheet rules replace it — a regression to `display:none` on hosted panes fails here.
    const css = ideCss();
    expect(css).toContain("[data-ide-hosted]");
    expect(css).toContain(".ide:not([data-ide-hosted]) .ide-panel");
    expect(css).toContain("data-drawer='open'");
    // R7SHELL.2 — no rail/Files rule may exist at any breakpoint.
    expect(css).not.toContain(".ide-rail");
    expect(css).not.toContain(".ide-files");
  });
});

describe("R7SHELL.1a — the demo-boot variant", () => {
  const DEMO = { essay: "the-borrowed-commons", slug: "demo~the-borrowed-commons", signedIn: false, build: "sha1" };

  it.each([false, true])("signedIn=%s — only the demo items render, zero workspace reads", async (signedIn) => {
    await mountAt("/p/demo~the-borrowed-commons", boot({ ...DEMO, signedIn }));
    await shell();
    expect(document.querySelector("[data-app-shell]")!.getAttribute("data-demo")).toBe("1");
    // workspace items are NEVER rendered — and no session/recents/inbox/credits read issued
    for (const hook of ["data-shell-new-project", "data-shell-inbox", "data-shell-voices", "data-shell-usage", "data-shell-settings", "data-shell-account", "data-shell-search"]) {
      expect(document.querySelector(`[${hook}]`), hook).toBeNull();
    }
    for (const c of calls) {
      expect(c.url, `demo boot issued ${c.method} ${c.url}`).not.toMatch(/\/session|\/bff\/app|settings|account|credits/i);
      expect(c.url).toMatch(/^\/bff\/(demo|p\/demo~|feed-labels)/);
    }
    // wordmark is a data-spa-native document link out of the demo
    const wordmark = document.querySelector("[data-shell-wordmark]")!;
    expect(wordmark.getAttribute("href")).toBe("/");
    expect(wordmark.hasAttribute("data-spa-native")).toBe(true);
    // the demo top bar renders; "Back to your projects" only when signed in
    expect(document.querySelector("[data-demo-banner]")).not.toBeNull();
    const back = document.querySelector('[data-demo-exit="back"]');
    if (signedIn) {
      expect(back).not.toBeNull();
      expect(back!.getAttribute("href")).toBe("/app");
      expect(back!.hasAttribute("data-spa-native")).toBe(true);
    } else {
      expect(back).toBeNull();
    }
  });
});
