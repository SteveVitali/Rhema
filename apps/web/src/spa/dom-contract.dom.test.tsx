// SPA.7 — the reference component test proving the stack (REQ-VFY-1/2/6, REQ-TST-6/10;
// design/27 F2): happy-dom via the `*.dom.test.tsx` environmentMatchGlobs route (no pragma),
// @testing-library/react `render`/`screen`, jest-dom matchers (registered by test-setup.ts),
// user-event on a real interactive component, manifest-consuming parity assertions, and
// component-level axe on the manifest's interactive subset.
//
// `dom-contract.ts` is the surface-keyed hook vocabulary; this spec consumes it twice:
//   1. the states.tsx surface markers are asserted BY MANIFEST ENTRY (the test asks the manifest
//      what spa/states.tsx owes, then checks the DOM) — the parity pattern surface tickets reuse;
//   2. `AXE_INTERACTIVE ⊆ manifest` keeps the axe subset honest — a renamed hook can't silently
//      drop out of the accessibility gate.

import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatDesk } from "@rhema/ui";
import { DOM_CONTRACT_ENTRIES, domContractMatch } from "../dom-contract.js";
import { COPY } from "../copy.js";
import { SpaRouteError } from "./states.js";
import { axeCheck, expectManifestEmission, AXE_INTERACTIVE } from "./testkit.js";

describe("manifest → SPA markers (REQ-VFY-2, REQ-TST-2)", () => {
  it("the designed error state emits every shell hook the manifest assigns to spa/states.tsx", async () => {
    const rootRoute = createRootRoute({ component: SpaRouteError });
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ["/p/demo"] }),
    });
    // R7SHELL.1a — the error state mounts the AppShell on SPA-space paths; the shell's workspace
    // reads need a QueryClient the way the real root route provides one.
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // jest-dom matchers + the settle-flank markers, read from the manifest rather than
    // hand-duplicated literals: every entry whose emitter is spa/states.tsx must be in the DOM.
    const main = await screen.findByRole("main");
    const entries = DOM_CONTRACT_ENTRIES.filter(
      (e) => e.surface === "shell" && e.emittedBy.includes("spa/states"),
    );
    expect(entries.length).toBeGreaterThan(0);
    expectManifestEmission(document.body, entries);
    // Spot assertions in test-file literals too (the lint's assertion scan keys on them).
    expect(main).toHaveAttribute("data-spa-surface");
    expect(main).toHaveAttribute("data-spa-error");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(COPY.spaError.heading);
    await axeCheck(main);
  });
});

describe("interactive subset — ChatDesk composer (REQ-TST-6, REQ-VFY-6)", () => {
  const endpoints = {
    turn: "/p/demo/chat/turns",
    planDecision: "/p/demo/chat/plan-decision",
    pin: "/p/demo/chat/pins",
    pinRemove: (id: string) => `/p/demo/chat/pins/${id}/remove`,
    correction: "/p/demo/chat/corrections",
    suggestion: "/p/demo/chat/suggestions",
    notes: "/p/demo/chat/notes",
    threadHref: (t: string) => `/p/demo?thread=${t}#chat`,
  };
  const model = {
    threads: [{ id: "thr_1", name: "Project chat", isDefault: true, archived: false }],
    activeThreadId: "thr_1",
    turns: [],
    messages: [],
    pins: { pins: [], footprint: 0, cap: 12 },
    sources: [],
    liveRun: null,
    emptyState: null,
    budgets: { credits: 40, searches: 5, fetches: 10 },
    tier: "base",
  };

  it("mounts the composer, types via user-event, and passes component axe", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatDesk model={model} endpoints={endpoints} labels={COPY.ide.chatDesk} />,
    );

    // Manifest marker + field: the composer and its `message` field are both contract entries.
    const composer = container.querySelector("[data-chat-composer]");
    expect(composer).not.toBeNull();
    const box = screen.getByRole("textbox", { name: COPY.ide.chatDesk.composerPlaceholder });
    await user.type(box, "tighten ¶2");
    expect(box).toHaveValue("tighten ¶2");

    // The component-level axe leg for an interactive manifest member.
    await axeCheck(container.firstElementChild as Element);
  });

  it("component axe is not vacuous — it flags a real violation", async () => {
    const { container } = render(<button aria-pressed="not-a-boolean">x</button>);
    const results = await axe.run(container.firstElementChild as Element);
    expect(results.violations.some((v) => v.id === "aria-valid-attr-value")).toBe(true);
  });

  it("the axe subset stays ⊆ the manifest — a renamed hook can't silently leave the gate", () => {
    for (const hook of AXE_INTERACTIVE) {
      expect(domContractMatch(hook), `${hook} must resolve to a manifest entry`).not.toBeNull();
    }
    // Sanity: the subset lists only attr hooks on interactive components.
    expect(AXE_INTERACTIVE.length).toBeGreaterThanOrEqual(5);
  });
});
