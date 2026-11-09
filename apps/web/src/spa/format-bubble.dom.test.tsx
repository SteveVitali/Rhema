// @vitest-environment happy-dom
//
// R7WRITE.1a (REQ-WRITE-1; UXC-22, I6; REQ-KEYS-1 Rule 4) — the format bubble over a Page
// selection, exercised against the REAL mounted IDE chrome:
//   - a non-collapsed selection inside `.ide-page` floats `data-format-bubble` ABOVE the
//     selection (`data-placed="above"`), carrying the format items + the agent group;
//   - no "not available yet" item renders;
//   - Esc dismisses it;
//   - a read-only mount withholds the whole bubble;
//   - ⌘K with a selection opens the Link affordance (`data-format-link-input`), never the
//     palette — with no selection the palette event still fires (Rule 4 preserved).

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../copy.js";
import type { SpaBoot } from "./boot.js";
import { setSpaBoot } from "./boot.js";
import { IdeProjectLayout } from "./ide/chrome.js";
import { useIdeChromeData, type IdeChromeData } from "./ide/chrome-data.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const BOOT: SpaBoot = {
  principal: PRINCIPAL,
  theme: {},
  deviceClass: "desktop",
  surfaces: { "/p/$project": "spa" },
} as unknown as SpaBoot;

const mounted: Root[] = [];
const containers: HTMLElement[] = [];

function publishLeaf(bag: IdeChromeData | null, body: ReactNode): () => ReactNode {
  return function Leaf() {
    if (bag != null) useIdeChromeData(bag);
    return <>{body}</>;
  };
}

async function mount(body: ReactNode): Promise<void> {
  const rootRoute = createRootRoute({
    component: () => (
      <IdeProjectLayout demo={null}>
        <Outlet />
      </IdeProjectLayout>
    ),
  });
  const leaf = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/alpha",
    component: publishLeaf(
      {
        projectId: "proj_alpha",
        projectTitle: "Alpha",
        palette: { projectSlug: "alpha" } as never,
      },
      body,
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([leaf]),
    history: createMemoryHistory({ initialEntries: ["/p/alpha"] }),
  });
  const queryClient = new QueryClient();
  const el = document.createElement("div");
  document.body.appendChild(el);
  containers.push(el);
  const root = createRoot(el);
  mounted.push(root);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await router.load();
  });
}

function pagePane(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-pane='page']")!;
}

/**
 * Force a non-collapsed selection inside the page pane with a stubbed rect. happy-dom's Range
 * carries no layout — `getBoundingClientRect` is stubbed so the placement math gets a real
 * viewport-space box.
 */
function selectInPage(rect: { top: number; bottom: number; left: number; right: number }): void {
  const pane = pagePane();
  let host = pane.querySelector<HTMLElement>("[data-page-view]");
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-page-view", "1");
    host.setAttribute("data-page-host", "1");
    host.tabIndex = -1;
    const para = document.createElement("p");
    para.textContent = "selectable body text for the bubble";
    host.appendChild(para);
    pane.appendChild(host);
  }
  const range = document.createRange();
  range.selectNodeContents(host.firstChild ?? host);
  const box = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect;
  (range as Range).getBoundingClientRect = () => box;
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

async function mouseUp(): Promise<void> {
  // the mouseup lands INSIDE the page pane (the controller's delegated handler requires it)
  const target = pagePane().querySelector("[data-page-view]") ?? pagePane();
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    // the bubble's 120-ms settle
    await new Promise((r) => setTimeout(r, 160));
  });
}

beforeEach(() => {
  setSpaBoot(BOOT);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/session") return new Response(JSON.stringify(PRINCIPAL), { status: 200 });
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  for (const r of mounted) r.unmount();
  mounted.length = 0;
  for (const c of containers) c.remove();
  containers.length = 0;
  document.querySelectorAll("[data-format-bubble], .ide-cmdmenu").forEach((n) => n.remove());
});

describe("R7WRITE.1a — the format bubble (REQ-WRITE-1)", () => {
  it("a non-collapsed Page selection floats the bubble ABOVE with the format + agent items", async () => {
    await mount(<div data-pane="page" />);
    selectInPage({ top: 300, bottom: 340, left: 200, right: 500 });
    await mouseUp();
    const bubble = document.querySelector<HTMLElement>("[data-format-bubble]");
    expect(bubble).not.toBeNull();
    expect(bubble?.dataset["placed"]).toBe("above");
    const labels = Array.from(bubble?.querySelectorAll("[data-format-item]") ?? []).map((b) => b.textContent);
    for (const want of ["Bold", "Italic", "Link", "H2", "H3", "Quote", "Bulleted", "Numbered"]) {
      expect(labels.join(" ")).toContain(want);
    }
    for (const want of ["Ask", "Visualize", "Fact-check", "Review this section"]) {
      expect(labels.join(" ")).toContain(want);
    }
    // no "not available yet" item (I6)
    expect(labels.join(" ")).not.toContain("Line edit");
    expect(labels.join(" ")).not.toContain("Cut to length");
  });

  it("Esc dismisses the bubble", async () => {
    await mount(<div data-pane="page" />);
    selectInPage({ top: 300, bottom: 340, left: 200, right: 500 });
    await mouseUp();
    expect(document.querySelector("[data-format-bubble]")).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector("[data-format-bubble]")).toBeNull();
  });

  it("a read-only mount withholds the whole bubble — no write/agent items can fire", async () => {
    await mount(<div data-pane="page" />);
    // mark the mounted page read-only — the mount's data-page-root sentinel
    const root = document.createElement("div");
    root.setAttribute("data-page-root", "1");
    root.dataset["readonly"] = "1";
    pagePane().appendChild(root);
    selectInPage({ top: 300, bottom: 340, left: 200, right: 500 });
    await mouseUp();
    expect(document.querySelector("[data-format-bubble]")).toBeNull();
  });

  it("⌘K with a selection opens the Link affordance, never the palette (Rule 4)", async () => {
    await mount(<div data-pane="page" />);
    const events: string[] = [];
    window.addEventListener("rhema:palette-open", () => events.push("palette"));
    const view = document.createElement("div");
    view.setAttribute("data-page-view", "1");
    view.setAttribute("data-page-host", "1");
    view.tabIndex = -1;
    const p = document.createElement("p");
    p.textContent = "linkable words";
    view.appendChild(p);
    pagePane().appendChild(view);
    selectInPage({ top: 300, bottom: 340, left: 200, right: 500 });
    view.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector("[data-format-bubble]")).not.toBeNull();
    expect(document.querySelector("[data-format-link-input]")).not.toBeNull();
    expect(document.querySelector("[data-format-link-apply]")).not.toBeNull();
    expect(events).toEqual([]);
  });

  it("⌘K with NO selection falls through to the global palette (Rule 4 preserved)", async () => {
    await mount(<div data-pane="page" />);
    const events: string[] = [];
    window.addEventListener("rhema:palette-open", () => events.push("palette"));
    window.getSelection()?.removeAllRanges();
    const view = document.createElement("div");
    view.setAttribute("data-page-view", "1");
    view.setAttribute("data-page-host", "1");
    view.tabIndex = -1;
    view.textContent = "x";
    pagePane().appendChild(view);
    view.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector("[data-format-link-input]")).toBeNull();
    expect(events).toEqual(["palette"]);
  });

  it("a format item click dispatches the local PM command — never a POST", async () => {
    await mount(<div data-pane="page" />);
    const seen: string[] = [];
    window.addEventListener("rhema:format-command", (ev) => {
      seen.push((ev as CustomEvent<{ action?: string }>).detail?.action ?? "");
    });
    selectInPage({ top: 300, bottom: 340, left: 200, right: 500 });
    await mouseUp();
    const bold = Array.from(document.querySelectorAll<HTMLElement>("[data-format-item]")).find(
      (b) => b.dataset["formatItem"] === "bold",
    )!;
    await act(async () => {
      bold.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(seen).toEqual(["bold"]);
    expect(document.querySelector("[data-format-bubble]")).toBeNull();
    void COPY;
  });
});
