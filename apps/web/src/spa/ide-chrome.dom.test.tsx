// @vitest-environment happy-dom
//
// SPA.9 — the IDE chrome's behavioral contract (REQ-ISL-9/10/14/15, REQ-NAV-8, REQ-UX-7/8/16,
// REQ-SEQ-2/11/12, REQ-TST-2). Exercised against a real router (memory history) mounting the
// production `IdeProjectLayout` with a leaf that publishes through `useIdeChromeData`:
//
//   - the AND-gate: IDE-framed + flipped ⇒ `.ide`; unframed or unflipped ⇒ bare Outlet.
//   - REQ-TST-2 parity: every `ide-chrome` manifest hook the SSR `<IdeShell>` emits is emitted
//     by the mounted React chrome.
//   - the island port: pane toggles + the verbatim `rhema:panes:v1:u:p` codec, `?focus=1`
//     apply-then-strip, `#finding-` linked selection, menus / cheat sheet / ⌘K palette with
//     REQ-UX-7 focus return — and the §5.12 focus zones (findings chords inert in page/input).
//   - the palette's zero-POST posture: every activation is a router navigation.
//   - the §5.5 SSE tail: `?after=` resume, server-map row formatting, density tabs, usage ticks
//     patching the run card, a debounced `["bff"]` invalidation, fail-closed unknown types, and
//     StrictMode double-mount ⇒ exactly one EventSource (REQ-UX-15).
//   - the skip link + axe on the mounted chrome.

import { act, StrictMode, useMemo, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type Router,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { IdeShell } from "@rhema/ui";
import {
  DEFAULT_PANE_STATE,
  paneStorageKey,
  serializePaneState,
  type FeedLabelMaps,
} from "@rhema/ide";
import { COPY } from "../copy.js";
import { hooksForSurface } from "../dom-contract.js";
import type { SpaBoot } from "./boot.js";
import { setSpaBoot } from "./boot.js";
import { IdeProjectLayout } from "./ide/chrome.js";
import { useIdeChromeData, type IdeChromeData } from "./ide/chrome-data.js";
import { expectManifestEmission } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const MAPS: FeedLabelMaps = {
  t: {
    "phase.started": "Phase {phase} started",
    "phase.finished": "Phase {phase} finished",
    "usage.tick": "{spentCredits} cr spent",
    "card.meter": "{spentCredits} of {capCredits} cr",
    "card.meterProvisional": "≈ {spentCredits} of {capCredits} cr",
  },
  enums: { phase: { research: "Research", write: "Write" } },
};

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return {
    principal: PRINCIPAL,
    theme: {},
    deviceClass: "desktop",
    surfaces,
  };
}
const BOOT = bootFor({ "/p/$project": "spa" });

/** The bag a test leaf publishes — the surface-seam shape the editor/dossier tickets will use. */
const PUBLISH: IdeChromeData = {
  projectId: "p-alpha",
  projectTitle: "Alpha",
  findings: [
    { id: "f1", severity: "blocking", kind: "claim", excerpt: "claim one" },
    { id: "f2", severity: "minor", kind: "claim", excerpt: "claim two" },
  ],
  palette: {
    projectSlug: "alpha",
    goto: [{ label: "Settings", path: "/p/alpha/settings" }],
  },
  paletteSearchUrl: "/p/alpha/palette-search",
};

function makeFetch() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") {
      return new Response(JSON.stringify(PRINCIPAL), { status: 200 });
    }
    if (url === "/bff/feed-labels") {
      return new Response(JSON.stringify(MAPS), { status: 200 });
    }
    if (url.startsWith("/p/alpha/palette-search")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
}

/** A controllable EventSource — the test emits frames; every construct is recorded. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  emit(type: string, data: unknown): void {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  close(): void {
    this.closed = true;
  }
}

/** Node ≥22's built-in experimental localStorage shadows happy-dom's Storage (methods are stub
 *  throws without --localstorage-file) — the tests stub a real in-memory Storage so the pane/
 *  authorship/font persistence legs exercise the real key+codec path. */
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

const mounted: Root[] = [];

/** R7FIX.1 — the controller derives pane geometry from window.innerWidth; happy-dom's default
 *  is 1024 (narrow — overlays by design). Tests set the width they mean BEFORE mount. */
const setWidth = (px: number): void => {
  try {
    (window as { innerWidth: number }).innerWidth = px;
  } catch {
    Object.defineProperty(window, "innerWidth", { value: px, configurable: true, writable: true });
  }
};

function publishLeaf(bag: IdeChromeData | null): () => ReactNode {
  return function TestLeaf() {
    const data = useMemo(() => bag ?? {}, [bag]);
    useIdeChromeData(data);
    return (
      <div data-page-host>
        <input aria-label="leaf note" />
      </div>
    );
  };
}

function plainLeaf(): () => ReactNode {
  return function PlainLeaf() {
    return <div data-page-host />;
  };
}

function buildRouter(path: string, leaf: () => ReactNode = publishLeaf(PUBLISH)): Router {
  const rootRoute = createRootRoute({ component: Outlet });
  const layout = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$project",
    component: function Layout() {
      return <IdeProjectLayout project="alpha" />;
    },
  });
  const index = createRoute({ getParentRoute: () => layout, path: "/", component: leaf });
  const settings = createRoute({ getParentRoute: () => layout, path: "settings", component: plainLeaf() });
  // NAVC.4 — the two path shapes the scroll-preserving nav arms live on: `[`/`]` version
  // stepping needs a `/v/$v` segment; the `?triage` toggle only arms under `/review/$runId`.
  const versioned = createRoute({ getParentRoute: () => layout, path: "v/$v", component: leaf });
  const review = createRoute({ getParentRoute: () => layout, path: "review/$runId", component: leaf });
  const routeTree = rootRoute.addChildren([layout.addChildren([index, settings, versioned, review])]);
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
}

async function mount(
  path = "/p/alpha",
  opts: { leaf?: () => ReactNode; boot?: SpaBoot; router?: Router } = {},
) {
  setSpaBoot(opts.boot ?? BOOT);
  const fetchSpy = makeFetch();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("EventSource", FakeEventSource);
  const el = document.createElement("div");
  el.setAttribute("data-spa-root", "");
  document.body.appendChild(el);
  // `opts.router` lets a test spy before load (e.g. the ?focus=1 strip fires inside mount).
  const router = opts.router ?? buildRouter(path, opts.leaf);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(el);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await router.load();
  });
  return { router, qc, el, fetchSpy };
}

const ide = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-ide]");
const paletteEl = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-ide-palette]");
const key = (init: KeyboardEventInit): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};
const click = (el: Element | null | undefined): void => {
  act(() => {
    (el as HTMLElement).click();
  });
};

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("localStorage", new MemStorage());
  setWidth(1440); // the desktop-default every pre-R7FIX.1 leg assumes
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  document.documentElement.removeAttribute("data-app-theme");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-paper");
  document.documentElement.removeAttribute("data-font");
  document.body.innerHTML = "";
  document.body.focus?.();
  (document.activeElement as HTMLElement | null)?.blur?.();
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  setSpaBoot(null);
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("the ide-chrome AND-gate (REQ-SEQ-2)", () => {
  it("an IDE-framed + flipped leaf mounts .ide inside the layout; palette + cheatsheet embed", async () => {
    await mount("/p/alpha");
    expect(ide()).not.toBeNull();
    expect(paletteEl()).not.toBeNull();
    expect(document.querySelector("[data-ide-cheatsheet]")).not.toBeNull();
    expect(document.querySelector("[data-pane='page'] [data-page-host]")).not.toBeNull();
  });

  it("a flipped leaf that is NOT IDE-framed renders the bare Outlet — no .ide", async () => {
    const router = (await mount("/p/alpha", { boot: bootFor({ "/p/$project": "spa", "/p/$project/settings": "spa" }) })).router;
    await act(async () => {
      router.history.push("/p/alpha/settings");
      await router.load();
    });
    expect(ide()).toBeNull();
  });

  it("an unflipped leaf stays chrome-free — the SSR twin owns the document", async () => {
    await mount("/p/alpha", { boot: bootFor({ "/p/$project": "ssr" }) });
    expect(ide()).toBeNull();
  });
});

describe("REQ-TST-2 — manifest parity with the SSR twin", () => {
  it("every ide-chrome hook the SSR IdeShell emits is emitted by the mounted React chrome", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <IdeShell
        project={{ slug: "alpha", title: "Alpha" }}
        userId="u1"
        projectId="p-alpha"
        findings={[
          { id: "f1", severity: "blocking", kind: "claim", excerpt: "claim one" },
          { id: "f2", severity: "minor", kind: "claim", excerpt: "claim two" },
        ]}
        labels={{ ...COPY.ide, viewMenu: { ...COPY.ide.viewMenu, advanced: COPY.runSheet.advanced } }}
      >
        {null}
      </IdeShell>,
    );
    const { el } = await mount();
    const spaMarkup = (el.querySelector("[data-ide]") as HTMLElement).outerHTML;
    // The parity rule: hooks the SSR twin emits must exist in the React twin (conditional hooks
    // the fixture didn't exercise are skipped — the census isn't a fixture list).
    const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
    const emitted = hooksForSurface("ide-chrome").filter((entry) => {
      if (entry.kind === "attr") return new RegExp(`\\b${esc(entry.hook)}(?:[\\s=>/]|$)`).test(ssrMarkup);
      return false;
    });
    expect(emitted.length).toBeGreaterThan(20);
    expectManifestEmission(spaMarkup, emitted);
    // the skip link is SPA-only chrome the SSR twin doesn't carry — asserted directly.
    expect(el.querySelector("[data-skip-link]")).not.toBeNull();
  });
});

describe("panes + the verbatim pane codec (REQ-ISL-9, REQ-SEQ-11)", () => {
  it("⌘1 collapses Files and persists rhema:panes:v1:u1:p-alpha", async () => {
    await mount();
    expect(ide()?.dataset["files"]).toBe("strip"); // filesOpen=false ⇒ the collapsed strip
    key({ key: "1", metaKey: true });
    expect(ide()?.dataset["files"]).toBe("open");
    const raw = localStorage.getItem(paneStorageKey("u1", "p-alpha"));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { filesOpen?: boolean };
    expect(parsed.filesOpen).toBe(true);
  });

  it("a stored arrangement wins — the same codec the island wrote restores verbatim", async () => {
    localStorage.setItem(
      paneStorageKey("u1", "p-alpha"),
      serializePaneState({ ...DEFAULT_PANE_STATE, filesOpen: true, deskOpen: true, deskTab: "findings" }),
    );
    await mount();
    expect(ide()?.dataset["files"]).toBe("open");
    expect(ide()?.dataset["desk"]).toBe("open");
    expect(ide()?.dataset["deskTab"]).toBe("findings");
  });

  it("the rail toggles write the same token set the SSR island stamped", async () => {
    await mount();
    click(document.querySelector("[data-ide-timeline-toggle]"));
    expect(ide()?.dataset["timeline"]).toBe("closed");
    click(document.querySelector("[data-ide-files-toggle]"));
    expect(ide()?.dataset["files"]).toBe("open");
  });
});

describe("?focus=1 — applied once, then stripped (REQ-SEQ-11)", () => {
  it("view=focus lands for the session and the param leaves the URL — storage keeps 'write' (REQ-WRITE-4)", async () => {
    const { router } = await mount("/p/alpha?focus=1");
    expect(ide()?.dataset["view"]).toBe("focus");
    expect(router.state.location.searchStr).not.toContain("focus");
    // R7FIX.1 — the seeded session view is never persisted: the blob reads 'write'.
    const raw = JSON.parse(localStorage.getItem(paneStorageKey("u1", "p-alpha"))!) as { view?: string };
    expect(raw.view).toBe("write");
  });
});

describe("R7FIX.1 — the pane stopgap (REQ-PANE-0)", () => {
  it("paneLayout() is the runtime geometry source: data-pane-mode/timeline-mode track the width", async () => {
    setWidth(1440);
    await mount();
    expect(ide()?.dataset["paneMode"]).toBe("wide");
    expect(ide()?.dataset["timelineMode"]).toBe("pane");
    expect(ide()?.dataset["timeline"]).toBe("open"); // the wide default still docks
    setWidth(1100);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(ide()?.dataset["paneMode"]).toBe("narrow");
    expect(ide()?.dataset["timelineMode"]).toBe("overlay");
    // REQ-PANE-0 — the persisted wide-mode open intent does NOT auto-open the overlay.
    expect(ide()?.dataset["timeline"]).toBe("closed");
  });

  it("the Timeline is closed by default at 1024–1279 and <1024 — on mount, even with stored open intent", async () => {
    localStorage.setItem(
      paneStorageKey("u1", "p-alpha"),
      serializePaneState({ ...DEFAULT_PANE_STATE, timelineOpen: true }),
    );
    for (const w of [1100, 900]) {
      document.body.innerHTML = "";
      setWidth(w);
      await mount();
      expect(ide()?.dataset["timeline"], `timeline at ${w}`).toBe("closed");
      expect(ide()?.dataset["timelineMode"], `mode at ${w}`).toBe(w < 1024 ? "sheet" : "overlay");
      for (const r of mounted.splice(0)) act(() => r.unmount());
    }
  });

  it("opening the overlay shows the scrim; Esc and outside-click dismiss without persisting", async () => {
    setWidth(1100);
    await mount();
    // open on demand — the View-menu row is the pointer path at this width.
    click(document.querySelector("[data-ide-view-menu]"));
    click(document.querySelector("[data-ide-menu='view'] [data-ide-timeline-toggle]"));
    expect(ide()?.dataset["timeline"]).toBe("open");
    expect(ide()?.dataset["timelineMode"]).toBe("overlay");
    expect(document.querySelector("[data-ide-scrim]")).not.toBeNull();
    expect(document.querySelector("[data-ide-menu='view'] [data-ide-timeline-toggle]")?.getAttribute("aria-checked")).toBe("true");
    // REQ-PANE-0 — nothing about the overlay's open state reaches pane storage.
    const raw = localStorage.getItem(paneStorageKey("u1", "p-alpha"));
    expect(raw == null || !raw.includes('"timelineOpen":true')).toBe(true);
    // Esc closes it.
    key({ key: "Escape" });
    expect(ide()?.dataset["timeline"]).toBe("closed");
    // reopen, then an outside click (the scrim) closes it too.
    key({ key: "2", metaKey: true });
    expect(ide()?.dataset["timeline"]).toBe("open");
    act(() => {
      document.querySelector<HTMLElement>("[data-ide-scrim]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(ide()?.dataset["timeline"]).toBe("closed");
  });

  it("the <1024 drawer: Files opens as a session overlay (scrimmed) and never persists", async () => {
    setWidth(820);
    await mount();
    expect(ide()?.dataset["filesMode"]).toBe("overlay");
    expect(ide()?.dataset["files"]).toBe("strip"); // closed by default
    click(document.querySelector("[data-ide-files-toggle]"));
    expect(ide()?.dataset["files"]).toBe("open");
    const raw = localStorage.getItem(paneStorageKey("u1", "p-alpha"));
    expect(raw == null || !raw.includes('"filesOpen":true')).toBe(true);
  });
});

describe("R7FIX.1 — Focus mode is never a trap (REQ-WRITE-4)", () => {
  it("the exit pill renders; a click leaves focus; Esc leaves focus with no menu open", async () => {
    await mount();
    expect(document.querySelector("[data-ide-focus-exit]")).not.toBeNull();
    expect(document.querySelector("[data-ide-focus-exit]")?.textContent).toBe(COPY.ide.focusExit);
    key({ key: "f", metaKey: true, shiftKey: true });
    expect(ide()?.dataset["view"]).toBe("focus");
    click(document.querySelector("[data-ide-focus-exit]"));
    expect(ide()?.dataset["view"]).toBe("write");
    key({ key: "f", metaKey: true, shiftKey: true });
    expect(ide()?.dataset["view"]).toBe("focus");
    key({ key: "Escape" });
    expect(ide()?.dataset["view"]).toBe("write");
  });

  it("a reload after entering focus restores write — the stored view never carries focus", async () => {
    await mount();
    key({ key: "f", metaKey: true, shiftKey: true });
    expect(ide()?.dataset["view"]).toBe("focus");
    const raw = JSON.parse(localStorage.getItem(paneStorageKey("u1", "p-alpha"))!) as { view?: string };
    expect(raw.view).toBe("write");
    for (const r of mounted.splice(0)) act(() => r.unmount());
    document.body.innerHTML = "";
    await mount();
    expect(ide()?.dataset["view"]).toBe("write");
  });
});

describe("the §5.12 focus zones (REQ-ISL-10)", () => {
  it("findings chords fire in the margin zone: j moves the finding cursor + lights data-selected", async () => {
    await mount();
    // ⌘⇧T triage enters the findings focus ring (desk open + first card focused) — the island's
    // real entry path — then the bare j chord moves the cursor and lights data-selected.
    key({ key: "t", metaKey: true, shiftKey: true });
    const first = document.querySelector<HTMLElement>(".ide-fcard[data-finding-id='f1']");
    expect(document.activeElement).toBe(first);
    key({ key: "j" });
    const second = document.querySelector<HTMLElement>(".ide-fcard[data-finding-id='f2']");
    expect(document.activeElement).toBe(second);
    expect(second?.getAttribute("data-selected")).toBe("true");
    expect(first?.getAttribute("data-selected")).toBeNull();
  });

  it("findings chords are INERT in the page zone — typing never moves a finding cursor", async () => {
    await mount();
    const host = document.querySelector<HTMLElement>("[data-page-host]");
    host?.setAttribute("contenteditable", "true");
    act(() => host?.focus());
    key({ key: "j" });
    key({ key: "a" });
    expect(document.querySelector("[data-selected='true']")).toBeNull();
    expect(document.activeElement).toBe(host);
  });

  it("findings chords are INERT in the input zone — the field keeps its keys", async () => {
    await mount();
    const input = document.querySelector<HTMLElement>("input[aria-label='leaf note']");
    act(() => input?.focus());
    key({ key: "j" });
    key({ key: "d" });
    expect(document.querySelector("[data-selected='true']")).toBeNull();
    // …and the mod chords narrow to overlay-only: ⌘, does NOT navigate away from the field.
    key({ key: ",", metaKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("⌘K works from input focus — the one overlay chord fields keep", async () => {
    await mount();
    const input = document.querySelector<HTMLElement>("input[aria-label='leaf note']");
    act(() => input?.focus());
    key({ key: "k", metaKey: true });
    expect(paletteEl()?.hidden).toBe(false);
    expect(document.activeElement).toBe(paletteEl()?.querySelector("[data-palette-input]"));
  });
});

describe("the ⌘K palette — local-only, zero POST (REQ-ISL-13)", () => {
  it("opens on ⌘K and on bare / — browse rows + the command-mode box both render", async () => {
    await mount();
    key({ key: "k", metaKey: true });
    expect(paletteEl()?.hidden).toBe(false);
    const rows = paletteEl()?.querySelectorAll(".ide-pal-row");
    expect((rows?.length ?? 0) > 0).toBe(true);
    key({ key: "Escape" });
    expect(paletteEl()?.hidden).toBe(true);
    key({ key: "/" });
    expect(paletteEl()?.hidden).toBe(false);
    // "/" seeds command mode (the island's verbatim behavior) — the command box, not browse rows.
    expect(paletteEl()?.querySelector(".ide-pal-command")).not.toBeNull();
  });

  it("filters locally and Enter navigates through the router — every fetch stays GET", async () => {
    const { router, fetchSpy } = await mount();
    key({ key: "k", metaKey: true });
    const input = paletteEl()?.querySelector<HTMLInputElement>("[data-palette-input]");
    await act(async () => {
      input!.value = "set";
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 240)); // the 180 ms search debounce
    });
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    // `/p/:p/settings` is NOT IDE-framed — landing there unmounts the chrome itself.
    expect(router.state.location.pathname).toBe("/p/alpha/settings");
    expect(paletteEl()).toBeNull();
    // REQ-ISL-13: the palette NEVER posts — the search GET is the only fetch it makes.
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method ?? "GET").not.toBe("POST");
    }
  });
});

describe("overlays + REQ-UX-7 focus return (REQ-UX-7/8)", () => {
  it("Escape closes the palette and returns focus to the element that opened it", async () => {
    await mount();
    const toggle = document.querySelector<HTMLElement>("[data-ide-timeline-toggle]");
    act(() => toggle?.focus());
    key({ key: "k", metaKey: true });
    expect(paletteEl()?.hidden).toBe(false);
    key({ key: "Escape" });
    expect(paletteEl()?.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("? opens the cheat sheet, focuses its close control, Escape returns the opener", async () => {
    await mount();
    const toggle = document.querySelector<HTMLElement>("[data-ide-timeline-toggle]");
    act(() => toggle?.focus());
    key({ key: "?" });
    const cheat = document.querySelector<HTMLElement>("[data-ide-cheatsheet]");
    expect(cheat?.hidden).toBe(false);
    expect(document.activeElement).toBe(cheat?.querySelector("[data-ide-cheatsheet-close]"));
    key({ key: "Escape" });
    expect(cheat?.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("the view menu opens on its trigger, Escape closes and returns focus", async () => {
    await mount();
    const trigger = document.querySelector<HTMLElement>("[data-ide-view-menu]");
    click(trigger);
    const menu = document.querySelector<HTMLElement>("[data-ide-menu='view']");
    expect(menu?.hidden).toBe(false);
    // the manifest's menuitemradio role — the view rows are radio-menu semantics.
    expect(menu?.querySelector("[role='menuitemradio']")).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    key({ key: "Escape" });
    expect(menu?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the SSE feed tail (REQ-ISL-14, REQ-BFF-24, REQ-UX-9/15)", () => {
  const FEED: IdeChromeData = {
    ...PUBLISH,
    feed: {
      runId: "r1",
      eventsUrl: "/p/alpha/r/r1/events",
      density: "details",
      rows: [],
      lastSeq: 41,
    },
  };

  async function mountFeed() {
    const ctx = await mount("/p/alpha", { leaf: publishLeaf(FEED) });
    await act(async () => {
      await ctx.qc.ensureQueryData({
        queryKey: ["feed-labels"],
        queryFn: async () => MAPS,
        staleTime: Infinity,
      });
      await new Promise((r) => setTimeout(r, 0)); // flush the useQuery re-render + feed bind
    });
    return ctx;
  }

  it("resumes at ?after=<lastSeq>, renders rows from the server maps, fails closed on unknowns", async () => {
    await mountFeed();
    const src = FakeEventSource.instances[0]!;
    expect(src.url).toBe("/p/alpha/r/r1/events?after=41");
    const rowsUl = document.querySelector("[data-feed-rows]")!;
    act(() => {
      src.emit("phase.started", { type: "phase.started", seq: 42, payload: { phase: "research" }, density: "summary" });
      src.emit("not-a-real-event", { type: "not-a-real-event", seq: 43, payload: {}, density: "summary" });
      src.emit("phase.started", { type: "phase.started", seq: 44, payload: { phase: "write" }, density: "verbose" });
    });
    const lis = rowsUl.querySelectorAll("[data-feed-event]");
    // summary rows show under "details"; the verbose row is filtered; the unknown type dropped.
    expect(lis.length).toBe(1);
    expect(lis[0]?.textContent).toContain("Phase Research started");
  });

  it("the density tab re-filters live rows", async () => {
    await mountFeed();
    const src = FakeEventSource.instances[0]!;
    act(() => {
      src.emit("phase.started", { type: "phase.started", seq: 42, payload: { phase: "write" }, density: "verbose" });
    });
    expect(document.querySelectorAll("[data-feed-event]").length).toBe(0);
    click(document.querySelector("[data-feed-density='verbose']"));
    act(() => {
      src.emit("phase.started", { type: "phase.started", seq: 43, payload: { phase: "write" }, density: "verbose" });
    });
    expect(document.querySelectorAll("[data-feed-event]").length).toBe(1);
  });

  it("a live event schedules ONE debounced [bff] invalidation — ticks are exempt", async () => {
    const { qc } = await mountFeed();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const src = FakeEventSource.instances[0]!;
    act(() => {
      src.emit("phase.started", { type: "phase.started", seq: 42, payload: { phase: "research" } });
      src.emit("phase.finished", { type: "phase.finished", seq: 43, payload: { phase: "research" } });
      src.emit("usage.tick", { type: "usage.tick", seq: 44, payload: { spentCredits: 10, capCredits: 100 } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220));
    });
    const bff = spy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] };
      return Array.isArray(arg?.queryKey) && arg.queryKey[0] === "bff";
    });
    expect(bff.length).toBe(1);
  });

  it("at most ONE live EventSource at any moment; unmount closes it", async () => {
    const { router } = await mountFeed();
    // REQ-UX-15 — every rebind closes the previous source; the live count is always exactly one.
    const live = () => FakeEventSource.instances.filter((i) => !i.closed);
    expect(live().length).toBe(1);
    await act(async () => {
      router.history.push("/p/alpha/settings");
      await router.load();
    });
    expect(live().length).toBe(0);
  });
});

describe("the menu/cmdmenu legs + manifest assertion coverage (REQ-ISL-11/12, REQ-TST-2)", () => {
  it("the view menu's advanced + authorship toggles stamp the .ide attrs and persist their keys", async () => {
    await mount();
    click(document.querySelector("[data-ide-view-menu]"));
    click(document.querySelector("[data-ide-menu='view'] [data-ide-toggle='advanced']"));
    expect(ide()?.hasAttribute("data-advanced")).toBe(true);
    expect(localStorage.getItem(paneStorageKey("u1", "p-alpha"))).toContain('"advanced":true');
    click(document.querySelector("[data-ide-view-menu]"));
    click(document.querySelector("[data-ide-menu='view'] [data-ide-toggle='authorship']"));
    expect(ide()?.hasAttribute("data-authorship")).toBe(true);
    expect(localStorage.getItem("rhema:authorship:v1:p-alpha")).toBe("1");
  });

  it("the palette's keyboard row stamps data-active; a disabled resolution stamps data-disabled", async () => {
    const bag: IdeChromeData = {
      ...PUBLISH,
      palette: {
        projectSlug: "alpha",
        nextStep: { command: "/not-a-verb x", label: "Broken step" },
      },
    };
    await mount("/p/alpha", { leaf: publishLeaf(bag) });
    key({ key: "k", metaKey: true });
    expect(paletteEl()?.querySelector(".ide-pal-row[data-active]")).not.toBeNull();
    expect(paletteEl()?.querySelector(".ide-pal-row[data-disabled]")).not.toBeNull();
  });

  it("a surface body's Live-feed affordance opens the Desk on the feed tab (data-ide-open-feed)", async () => {
    const bag: IdeChromeData = {
      ...PUBLISH,
      chatBody: (
        <button type="button" data-ide-open-feed>
          feed
        </button>
      ),
    };
    await mount("/p/alpha", { leaf: publishLeaf(bag) });
    click(document.querySelector("[data-ide-open-feed]"));
    expect(ide()?.dataset["desk"]).toBe("open");
    expect(ide()?.dataset["deskTab"]).toBe("feed");
  });

  it("a timeline [data-round] contextmenu opens the round-scoped cmdmenu", async () => {
    await mount("/p/alpha", { leaf: publishLeaf({ ...PUBLISH, timeline: [{ id: "r1", label: "Draft 1", state: "done" }] }) });
    // the TimelinePane owns the real [data-round] rows; the contract leg drives the delegated
    // handler with a node in the pane's scope.
    const pane = document.querySelector<HTMLElement>("[data-pane='timeline']")!;
    const round = document.createElement("div");
    round.setAttribute("data-round", "2");
    pane.querySelector(".ide-tl-body")?.appendChild(round);
    act(() => {
      round.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
      );
    });
    expect(document.querySelector(".ide-cmdmenu")).not.toBeNull();
  });

  it("the suggestion preview + verb arming stamp data-suggestion-replacement / data-armed", async () => {
    const bag: IdeChromeData = {
      ...PUBLISH,
      marginBody: (
        <div className="ide-fcard" id="finding-f9" data-finding-id="f9">
          <span className="rm-finding" data-suggestion-replacement="better words">
            original
          </span>
          <input type="text" />
          <button type="button" data-verb="rebut">
            Rebut
          </button>
        </div>
      ),
    };
    await mount("/p/alpha", { leaf: publishLeaf(bag) });
    // ⌘⇧T focuses the first finding (the margin card) → the scoped 'r' chord arms its verb.
    key({ key: "t", metaKey: true, shiftKey: true });
    key({ key: "r" });
    expect(document.querySelector("[data-verb='rebut']")?.getAttribute("data-armed")).toBe("true");
    // the §5.1 default is ON — the island's applySuggestions previews replacements inline at bind;
    // the view menu's toggle then removes them.
    expect(document.querySelector(".rm-finding")?.classList.contains("rm-suggestion-preview")).toBe(true);
    expect(document.querySelector(".rm-suggestion-replacement")?.textContent).toContain("better words");
    click(document.querySelector("[data-ide-view-menu]"));
    click(document.querySelector("[data-ide-toggle='suggestionsInline']"));
    expect(document.querySelector(".rm-finding")?.classList.contains("rm-suggestion-preview")).toBe(false);
  });
});

describe("REQ-UX-16 — the skip link + axe", () => {
  it("the skip link precedes the rail and focuses #ide-page", async () => {
    const { el } = await mount();
    const link = el.querySelector<HTMLElement>("[data-skip-link]");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe(COPY.ide.skipToPage);
    const target = document.getElementById("ide-page");
    expect(target).not.toBeNull();
    click(link);
    expect(document.activeElement).toBe(target);
  });

  it("the mounted chrome passes component-level axe", async () => {
    await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the session/labels queries settle first
    });
    // Scoped to `.ide` — document rules (title/lang/h1/landmark coverage) are the journey suite's
    // gate, and happy-dom has no layout so `hidden` overlays stay "visible" to aria-required-
    // children (a real browser collapses them before axe sees them).
    const results = await axe.run(ide() as axe.ElementContext, {
      rules: {
        "color-contrast": { enabled: false },
        "aria-required-children": { enabled: false },
      },
    });
    expect(
      results.violations.map((v) => v.id),
      `axe violations: ${results.violations.map((v) => `${v.id} (${v.nodes.length} node(s))`).join(", ")}`,
    ).toEqual([]);
  });
});

describe("the verbatim localStorage family (REQ-SEQ-11)", () => {
  it("authorship + reader-step + font keep the island's keys", async () => {
    await mount();
    // the same keys the island wrote — a mixed-mode document boot must read them unchanged.
    expect(localStorage.getItem("rhema:authorship:v1:p-alpha")).toBeNull(); // off by default, no write
    const paperBtn = document.querySelector<HTMLElement>("[data-ide-paper='warm']");
    if (paperBtn) {
      click(paperBtn);
      expect(localStorage.getItem("rhema:paper:v1:alpha")).toBe("warm");
      expect(document.documentElement.getAttribute("data-paper")).toBe("warm");
    }
  });
});

describe("NAVC.4 — native hash hops + the scroll-preserving navs (REQ-NAVM-10, REQ-NAVC-16/19)", () => {
  beforeEach(async () => {
    // happy-dom queues a REAL hashchange on a macrotask whenever `location.hash` is assigned —
    // a prior leg's queued event would dispatch under this leg's fresh listener and select
    // whatever stale `#finding-*` is still in the URL. Normalize, then drain the queue.
    window.location.hash = "";
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("a hashchange the router never saw still selects the finding — the REQ-NAVM-10 gap closed", async () => {
    await mount();
    const f2 = document.querySelector<HTMLElement>("[data-finding-id='f2']");
    expect(f2?.getAttribute("data-selected")).toBeNull();
    // The native path: the delegated interceptor SKIPS hash-only clicks (native fragment nav),
    // so no router commit ever happens — `opts.nav.hash` stays "". The browser still fires
    // `hashchange`; the controller's listener runs the SAME consumer on window.location.hash.
    act(() => {
      window.location.hash = "#finding-f2";
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(f2?.getAttribute("data-selected")).toBe("true");
    expect(document.querySelector<HTMLElement>("[data-finding-id='f1']")?.getAttribute("data-selected")).toBeNull();
  });

  it("a non-finding native hash is inert — no selection churn", async () => {
    await mount();
    act(() => {
      window.location.hash = "#section";
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(document.querySelector("[data-selected='true']")).toBeNull();
  });

  it("`[`/`]` version stepping commits through navigate({resetScroll:false}) — never a scroll reset (REQ-NAVC-16)", async () => {
    // the `/v/$v` leaf must carry a "spa" verdict or the layout mounts it unframed (no chrome).
    const { router } = await mount("/p/alpha/v/3", {
      boot: bootFor({ "/p/$project/v/$v": "spa" }),
    });
    const navSpy = vi.spyOn(router, "navigate");
    key({ key: "[" });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/p/alpha/v/2"));
    expect(navSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/p/alpha/v/2", resetScroll: false }),
    );
    navSpy.mockClear();
    key({ key: "]" });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/p/alpha/v/3"));
    expect(navSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/p/alpha/v/3", resetScroll: false }),
    );
  });

  it("`[`/`]` are inert off a /v/:n path — no malformed nav", async () => {
    const { router } = await mount("/p/alpha");
    const navSpy = vi.spyOn(router, "navigate");
    key({ key: "[" });
    key({ key: "]" });
    expect(navSpy).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/p/alpha");
  });

  it("the ?focus=1 strip rides navigate({replace:true, resetScroll:false}) — the third preserved-scroll nav", async () => {
    // The strip fires inside mount (a leaf-bound effect) — the spy installs on the router FIRST.
    const router = buildRouter("/p/alpha?focus=1");
    const navSpy = vi.spyOn(router, "navigate");
    await mount("/p/alpha?focus=1", { router });
    expect(navSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/p/alpha", replace: true, resetScroll: false }),
    );
    expect(router.state.location.searchStr).not.toContain("focus");
    expect(ide()?.dataset["view"]).toBe("focus");
  });

  it("⌘⇧T toggles ?triage through navigate({resetScroll:false}) on a dossier path", async () => {
    const { router } = await mount("/p/alpha/review/r9", {
      boot: bootFor({ "/p/$project/review/$runId": "spa" }),
    });
    const navSpy = vi.spyOn(router, "navigate");
    key({ key: "t", metaKey: true, shiftKey: true });
    await vi.waitFor(() => expect(router.state.location.searchStr).toBe("?triage=1"));
    expect(navSpy).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/p/alpha/review/r9?triage=1", resetScroll: false }),
    );
    key({ key: "t", metaKey: true, shiftKey: true });
    await vi.waitFor(() => expect(router.state.location.searchStr).toBe(""));
    expect(navSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ href: "/p/alpha/review/r9", resetScroll: false }),
    );
  });
});

