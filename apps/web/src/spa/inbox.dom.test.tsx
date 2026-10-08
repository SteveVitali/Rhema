// @vitest-environment happy-dom
//
// SPA.11 — the `inbox` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/9, REQ-DAT-4, REQ-UX-6; §5.11). Mounted through the production router (memory
// history + a stub fetch) at `/app/inbox`: the section order, the badge-equals-rendered-blocked
// invariant, the gate-card join + its `data-gate-artifact` target, the mark-read JSON POSTs (the
// forms keep SSR markup — the SPA intercepts submit and invalidates the twin), the degraded join,
// the empty state, the SsrHandoff/no-BFF leg, and the REQ-TST-2 parity leg against the SSR
// `InboxPage` under a PageDataContext provider. Component axe covers the mounted surface.
//
// The fixture's shapes mirror the retained SSR spec's (inbox-phone.test.ts) — the parity leg
// compares the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GateCardDto, InboxItemDto } from "@rhema/api-client";
import { PageDataContext } from "../page-data.js";
import { InboxPage } from "../pages.js";
import { hooksForSurface } from "../dom-contract.js";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import type { BffInboxTwin } from "./queries.js";
import { axeCheck, expectManifestEmission } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "acme";

const GATE_CARD: GateCardDto = {
  id: "gate_1",
  runId: "run_1",
  kind: "approve_plan",
  workflow: "review",
  artifactId: "art_1",
  artifactTitle: "The essay",
  openedAt: "2026-10-01T10:00:00Z",
  deadlineAt: "2026-10-02T12:00:00Z",
  presenceDeadlineAt: "2026-10-01T10:10:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "proceed_as_proposed",
  spentCredits: 40,
  capCredits: 60,
  remainingEstimateCredits: 20,
};

const ITEMS: InboxItemDto[] = [
  {
    id: "blk_gate",
    kind: "blocked",
    type: "gate",
    title: "Review plan is waiting on you",
    href: `/p/${SLUG}?gate=gate_1`,
    projectId: "proj_a",
    projectTitle: "Alpha Essay",
    runId: "run_1",
    unread: true,
    createdAt: "2026-10-01T10:00:00Z",
    gate: {
      gateId: "gate_1",
      runId: "run_1",
      kind: "approve_plan",
      workflow: "review",
      deadlineAt: "2026-10-02T12:00:00Z",
    },
  },
  {
    id: "blk_dec",
    kind: "blocked",
    type: "decision",
    title: "A decision needs you",
    href: `/p/${SLUG}?decision=dec_1`,
    projectId: "proj_a",
    projectTitle: "Alpha Essay",
    unread: true,
    createdAt: "2026-10-01T09:00:00Z",
    decision: {
      decisionId: "dec_1",
      text: "Keep the section or cut it?",
      options: ["keep", "cut"],
      obligationId: "obl_1",
    },
  },
  {
    id: "evt_new",
    kind: "event",
    type: "run_finished",
    title: "Review delivered",
    body: "The review finished.",
    href: `/p/${SLUG}/r/run_1`,
    projectId: "proj_a",
    projectTitle: "Alpha Essay",
    runId: "run_1",
    unread: true,
    createdAt: "2026-10-01T08:00:00Z",
  },
  {
    id: "evt_old",
    kind: "event",
    type: "run_finished",
    title: "Earlier note",
    href: `/p/${SLUG}/r/run_0`,
    projectId: "proj_a",
    projectTitle: "Alpha Essay",
    unread: false,
    createdAt: "2026-09-30T08:00:00Z",
  },
  {
    id: "voice_1",
    kind: "voice",
    type: "voice_stale",
    title: "Voice drifted",
    href: "/voices",
    unread: false,
    createdAt: "2026-09-29T08:00:00Z",
  },
];

function twin(over?: Partial<BffInboxTwin>): BffInboxTwin {
  return { items: ITEMS, badge: 2, gateCards: { blk_gate: GATE_CARD }, ...over };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The fetch stub — every same-origin path the mount can reach is named; anything else 500s so a
 *  surprise read fails loudly rather than fabricating data. The POST legs record their init. */
function makeFetch(opts: { inbox?: BffInboxTwin; inboxStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/app/inbox") {
      return opts.inboxStatus != null && opts.inboxStatus !== 200
        ? jsonResponse(opts.inboxStatus, { error: "upstream_unavailable" })
        : jsonResponse(200, opts.inbox ?? twin());
    }
    if (url === "/app/inbox/read" || url === "/app/inbox/read-all") {
      return jsonResponse(200, { ok: true, redirect: "/app/inbox" });
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

let assignSpy: ReturnType<typeof vi.fn>;
let beaconSpy: ReturnType<typeof vi.spyOn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
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

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

beforeEach(() => {
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
  // The auto-proceed card's presence pings ride sendBeacon — happy-dom's transport would otherwise
  // hit a real socket for every mounted row. Stubbed for the whole file; the presence leg inspects.
  beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("GET /app/inbox mounted (REQ-SEQ-9 — the flipped surface)", () => {
  const BOOT = bootFor({ "/app/inbox": "spa" });

  it("renders the four sections in order with the manifest vocabulary + the settle pair", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch());
    expect(document.documentElement.getAttribute("data-route")).toBe("/app/inbox");
    expect(document.documentElement.getAttribute("data-mounted")).not.toBeNull();
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.inbox.heading);
    expect(document.title).toBe("Inbox · Rhēma");
    // Section order is the SSR's: blocked → unread → read → voices.
    const order = [...main.querySelectorAll("[data-inbox-section]")].map(
      (s) => s.getAttribute("data-inbox-section"),
    );
    expect(order).toEqual(["blocked", "unread", "read", "voices"]);
    // The badge IS the rendered blocked-row count — the api number is ignored for display.
    expect(main.querySelector("[data-inbox-badge]")?.textContent).toBe(
      COPY.inbox.badgeLine.replace("{n}", "2"),
    );
    // Every row + its kind/type hooks.
    expect(main.querySelector('[data-inbox-row="blk_gate"][data-inbox-kind="gate"]')).not.toBeNull();
    expect(main.querySelector('[data-inbox-row="blk_dec"][data-inbox-kind="decision"]')).not.toBeNull();
    expect(main.querySelector('[data-inbox-row="evt_new"][data-inbox-type="run_finished"]')).not.toBeNull();
    expect(main.querySelector('[data-inbox-row="evt_old"]')).not.toBeNull();
    expect(main.querySelector('[data-inbox-row="voice_1"][data-inbox-type="voice_stale"]')).not.toBeNull();
    // Project metadata on the rows that carry it.
    expect(main.querySelectorAll("[data-inbox-project]").length).toBe(4);
    // The write controls: mark-all form + per-row mark-read with the item field.
    expect(main.querySelector('[data-inbox-read-all]')).not.toBeNull();
    expect(main.querySelectorAll("[data-inbox-mark-read]").length).toBe(1);
    const hidden = main.querySelector<HTMLInputElement>('[data-inbox-row="evt_new"] [name="item"]');
    expect(hidden?.value).toBe("evt_new");
    // Open links land on the row hrefs.
    const opens = [...main.querySelectorAll<HTMLAnchorElement>("[data-inbox-open]")].map((a) => a.getAttribute("href"));
    expect(opens).toContain(`/p/${SLUG}?gate=gate_1`);
    expect(opens).toContain(`/p/${SLUG}/r/run_1`);
    expect(opens).toContain(`/p/${SLUG}/r/run_0`);
  });

  it("the gate row mounts the real §6.4 card — joined by inbox-item id, no presence <script>", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch());
    const row = el()!.querySelector('[data-inbox-row="blk_gate"]')!;
    // The card is mounted inside the row's expand, keyed by the GATE id.
    const cardHost = row.querySelector('[data-inbox-gate-card="gate_1"]');
    expect(cardHost).not.toBeNull();
    expect(cardHost!.querySelector("[data-gate-card]")).not.toBeNull();
    // The artifact link is the presence 'reading' target — it must render (and be manifest-visible).
    const artifact = cardHost!.querySelector<HTMLAnchorElement>("[data-gate-artifact]");
    expect(artifact?.getAttribute("href")).toBe(`/p/${SLUG}/a/art_1`);
    // React never executes innerHTML scripts — the React twin carries NO inline script; the
    // useGatePresence effect replaces it (asserted by the beacon leg below).
    expect(cardHost!.querySelector("script")).toBeNull();
    // The decision row renders the inline answer controls.
    const dec = el()!.querySelector('[data-inbox-row="blk_dec"]')!;
    expect(dec.querySelectorAll("[data-decision-option]").length).toBe(2);
  });

  it("auto-proceed cards ping presence — the React twin of the SSR script (REQ-SPEC-18)", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch());
    // Mount-time 'present' ping to the gate's activity endpoint — gated on model.autoProceed.
    const hit = beaconSpy.mock.calls.some(
      ([url]) => url === `/p/${SLUG}/gates/gate_1/activity`,
    );
    expect(hit).toBe(true);
  });

  it("a wait-default card mounts NO presence effect — REQ-SPEC-18's gate is verbatim", async () => {
    const waitCard: GateCardDto = { ...GATE_CARD, onExpiry: "wait", presenceDeadlineAt: null };
    await mountAt("/app/inbox", BOOT, makeFetch({ inbox: twin({ gateCards: { blk_gate: waitCard } }) }));
    const hit = beaconSpy.mock.calls.some(
      ([url]) => String(url).includes("/activity"),
    );
    expect(hit).toBe(false);
  });

  it("a missed gate join degrades the row to its deep link + the decide note", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch({ inbox: twin({ gateCards: {} }) }));
    const row = el()!.querySelector('[data-inbox-row="blk_gate"]')!;
    expect(row.querySelector("[data-inbox-gate-card]")).toBeNull();
    expect(row.textContent).toContain(COPY.inbox.decideNote);
    expect(row.querySelector('[data-inbox-open]')?.getAttribute("href")).toBe(`/p/${SLUG}?gate=gate_1`);
  });

  it("mark-read posts the JSON branch + invalidates the twin (no document nav)", async () => {
    const f = makeFetch();
    await mountAt("/app/inbox", BOOT, f);
    // Loader warm + the leaf's stale-refetch both fire — count them as the baseline, then the
    // settle invalidation must add at least one more read.
    const inboxReads = () => f.mock.calls.filter(([u]) => String(u) === "/bff/app/inbox").length;
    const baseline = inboxReads();
    expect(baseline).toBeGreaterThanOrEqual(1);
    const button = el()!.querySelector<HTMLButtonElement>('[data-inbox-row="evt_new"] [data-inbox-mark-read]')!;
    const form = button.closest("form")!;
    expect(form.getAttribute("action")).toBe("/app/inbox/read");
    expect(form.getAttribute("method")).toBe("post");
    await act(async () => {
      fireEvent.submit(form);
    });
    const post = f.mock.calls.find(([u]) => String(u) === "/app/inbox/read");
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).method).toBe("POST");
    expect((post![1] as RequestInit).headers).toMatchObject({
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ item: "evt_new" });
    // The twin refetches on settle — the row's unread state repaints from the server.
    await vi.waitFor(() => expect(inboxReads()).toBeGreaterThan(baseline));
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("read-all posts the JSON branch + invalidates", async () => {
    const f = makeFetch();
    await mountAt("/app/inbox", BOOT, f);
    const form = el()!.querySelector('form[action="/app/inbox/read-all"]')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    const post = f.mock.calls.find(([u]) => String(u) === "/app/inbox/read-all");
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).method).toBe("POST");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("the empty aggregate renders the designed empty state — badge counts zero blocked", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch({ inbox: { items: [], badge: 0, gateCards: {} } }));
    const main = el()!;
    expect(main.querySelector("[data-inbox-empty]")?.textContent).toBe(COPY.inbox.empty);
    expect(main.querySelector("[data-inbox-section]")).toBeNull();
    expect(main.querySelector("[data-inbox-read-all]")).toBeNull();
    expect(main.querySelector("[data-inbox-badge]")?.textContent).toBe(
      COPY.inbox.badgeLine.replace("{n}", "0"),
    );
  });

  it("REQ-TST-2 parity — every inbox hook the SSR twin emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{ inbox: { items: ITEMS, badge: 2, gateCards: { blk_gate: GATE_CARD } }, compact: false }}
      >
        <InboxPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/inbox", BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
    const emitted = hooksForSurface("inbox").filter((entry) => {
      if (entry.kind === "attr") return new RegExp(`\\b${esc(entry.hook)}(?:[\\s=>/]|$)`).test(ssrMarkup);
      if (entry.kind === "field")
        return new RegExp(`\\bname=["']${esc(entry.hook)}["']`).test(ssrMarkup);
      return false;
    });
    // The fixture exercises the full row + write vocabulary — a thin set means the fixture drifted.
    expect(emitted.length).toBeGreaterThanOrEqual(10);
    expectManifestEmission(spaMarkup, emitted);
    // And the value-bearing hooks agree verbatim (row ids, gate join, section names).
    for (const literal of [
      'data-inbox-row="blk_gate"',
      'data-inbox-kind="gate"',
      'data-inbox-kind="decision"',
      'data-inbox-gate-card="gate_1"',
      'data-inbox-section="blocked"',
      'data-inbox-type="voice_stale"',
      'name="item"',
    ]) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("component axe on the mounted surface (REQ-VFY-6)", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("a non-401 twin failure renders the designed error state — not a /login lie", async () => {
    await mountAt("/app/inbox", BOOT, makeFetch({ inboxStatus: 502 }));
    expect(el()?.querySelector("[data-spa-error]")).not.toBeNull();
    expect(assignSpy).not.toHaveBeenCalledWith("/login");
  });

  it("an unflipped verdict hands the document back — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt("/app/inbox", bootFor({ "/app/inbox": "ssr" }), f);
    expect(assignSpy).toHaveBeenCalledWith("/app/inbox");
    expect(el()?.querySelector("[data-inbox-badge]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/app/inbox")).toBe(false);
  });
});
