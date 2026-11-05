// @vitest-environment happy-dom
//
// 221 R7DEM.5 (REQ-DWEB-7/12/15, REQ-TOUR-6/7; R3 §7 test 7) — the demo side-effect contract,
// mounted through the REAL router (memory history + a stub fetch):
//   • §7 test 7 — a demo boot constructs NO EventSource, fires NO sendBeacon, issues NO POST,
//     never polls `/edit/:d/doc`, and ⌘S shows the honest read-only pill (never "syncing").
//   • the write backstop — a `method="post"` submit anywhere in the document is captured,
//     prevented, and answered with the ONE `data-demo-readonly-notice`.
//   • the replayed-run labels — RunCard + RunReport render the badge, the inferred-phase tag,
//     the PROVENANCE approvals / "approvals not recorded", and the "not recorded" field list
//     verbatim from the replayed DTO arms (S-9; REQ-DWEB-15 render).
//   • the demo markers — `DemoDocMarkers` renders the import-rule labels + "not published"
//     refs; `stripNotPublishedLinks` turns excluded-ref link marks into non-links;
//     `DemoLedgerDecisions` renders response-ledger escalations as Decisions (REQ-TOUR-7).

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunCard, RunReport } from "@rhema/ui";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { restoreDocumentNav, SETTLE_TIMEOUT, settled, stubDocumentNav } from "./testkit.js";
import { runCardLabels, reportLabels } from "../dossier-view.js";
import {
  DemoDocMarkers,
  DemoLedgerDecisions,
  parseLedgerEscalations,
  stripNotPublishedLinks,
} from "../demo-markers.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ESSAY = "the-borrowed-commons";
const SLUG = `demo~${ESSAY}`;
const DEMO = { essay: ESSAY, slug: SLUG, signedIn: false, build: "testsha1" };

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

function demoBoot(): SpaBoot {
  return {
    theme: {},
    deviceClass: "desktop",
    surfaces: DEMO_SURFACES,
    project: { slug: SLUG },
    readOnlyProject: { reason: "demo" },
    demo: DEMO,
  };
}

/** The overview twin — a `page` bag so the working Page mounts (poll + ⌘S arms under test). */
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
    if (url === `/bff/p/${SLUG}`) return json(PAGE_TWIN);
    return json({ error: "unstubbed_path" }, 500);
  });
  return { impl, calls };
}

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

/** A plain component render (no router) — the label/marker arms. */
function renderEl(node: React.ReactNode): HTMLElement {
  const rootEl = document.createElement("div");
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);
  mounted.push(root);
  act(() => {
    root.render(<StrictMode>{node}</StrictMode>);
  });
  return rootEl;
}

beforeEach(() => {
  stubDocumentNav();
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

// ---- R3 §7 test 7 — zero side effects in a demo boot (REQ-DWEB-7) --------------------------

describe("R3 §7 test 7 — the demo boot issues no side effects", () => {
  it("no EventSource, no sendBeacon, no POST, no /doc poll — only allowlisted GETs", async () => {
    const esCtor = vi.fn();
    vi.stubGlobal("EventSource", esCtor);
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}`, demoBoot(), f.impl);
    await settled("[data-demo-banner]", document, { timeout: SETTLE_TIMEOUT });
    await settled("[data-page-mount]", document, { timeout: SETTLE_TIMEOUT });
    // wait out any accidental interval poll — the poll period is 10s; a settled PM mount with
    // zero /doc calls is the proof (the interval never arms under isDemo()).
    await new Promise((r) => setTimeout(r, 60));
    expect(esCtor).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    expect(f.calls.some((c) => c.method !== "GET")).toBe(false);
    expect(f.calls.some((c) => c.url.endsWith("/doc"))).toBe(false);
    expect(
      f.calls.every(
        (c) => c.url.startsWith(`/bff/p/${SLUG}`) || c.url.startsWith("/bff/demo/"),
      ),
    ).toBe(true);
  });

  it("⌘S is a no-op PLUS the honest read-only pill — never the syncing lie", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}`, demoBoot(), f.impl);
    await settled("[data-sync-pill]", document, { timeout: SETTLE_TIMEOUT });
    const before = f.calls.length;
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(f.calls.length).toBe(before); // no request minted
    const pill = document.querySelector<HTMLElement>("[data-sync-pill]")!;
    const readonlyLabel = pill.getAttribute("data-label-readonly")!;
    expect(pill.textContent).toBe(readonlyLabel);
    expect(pill.textContent).not.toBe(pill.getAttribute("data-label-syncing"));
  });

  it("a post-form submit is captured and answered with the ONE readonly notice", async () => {
    const f = makeFetch();
    await mountAt(`/demo/${ESSAY}`, demoBoot(), f.impl);
    await settled("[data-demo-banner]", document, { timeout: SETTLE_TIMEOUT });
    const form = document.createElement("form");
    form.setAttribute("method", "post");
    form.setAttribute("action", `/p/${SLUG}/rename`);
    document.body.appendChild(form);
    const before = f.calls.length;
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => {
      form.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(f.calls.length).toBe(before);
    const notice = document.querySelector<HTMLElement>("[data-demo-readonly-notice]")!;
    expect(notice).not.toBeNull();
    expect(notice.hidden).toBe(false);
  });
});

// ---- REQ-DWEB-15 render — the replayed-run labels (S-9) -------------------------------------

describe("the replayed-run labels", () => {
  const REPLAYED_CARD = {
    replayed: true,
    recordSource: "agent-discourse",
    runId: "v1-review",
    state: "completed",
    phases: [
      { key: "intake", status: "done", counters: [] },
      { key: "draft_analysis", status: "done", counters: [] },
    ],
    phaseSource: "inferred_from_delivered_files",
    done: 7,
    running: 0,
    total: 7,
    artifacts: [],
    deliverables: [],
    delivered: null,
    decisions: [],
    approvals: "not_recorded",
    notRecorded: ["time", "credits", "model", "estimate"],
    actions: [],
    failureCode: null,
    deliveryLabel: null,
    spentCredits: null,
    capCredits: null,
    provisional: false,
    creditFraction: 0,
    refundedCredits: 0,
    elapsedMs: null,
    etaBand: null,
    estimateCredits: null,
    queuePosition: null,
    paused: false,
    waitingGate: null,
    resumable: false,
    queuedNotes: 0,
  };

  it("RunCard renders the badge, inferred-phase tags, approvals-empty and not-recorded list", () => {
    const host = renderEl(<RunCard view={REPLAYED_CARD as never} labels={runCardLabels} />);
    expect(host.querySelector("[data-replayed-badge]")?.textContent).toBe(
      "Replayed from the agent-discourse record",
    );
    expect(host.querySelectorAll("[data-phase-inferred]").length).toBe(2);
    expect(host.querySelector("[data-phase-inferred]")?.textContent).toBe(
      "inferred from the delivered files",
    );
    expect(host.querySelector("[data-approvals-not-recorded]")?.textContent).toBe(
      "approvals not recorded",
    );
    const nr = host.querySelector("[data-not-recorded]")?.textContent ?? "";
    expect(nr).toContain("time not recorded");
    expect(nr).toContain("credits not recorded");
    expect(nr).toContain("model not recorded");
    expect(nr).toContain("estimate not recorded");
  });

  it("RunCard renders PROVENANCE approval facts verbatim when the record holds them", () => {
    const host = renderEl(
      <RunCard
        view={{
          ...REPLAYED_CARD,
          approvals: [
            { round: "v1 review", decision: "revision plan approved", note: "recorded in the round log" },
          ],
        } as never}
        labels={runCardLabels}
      />,
    );
    const row = host.querySelector("[data-replayed-approval]");
    expect(row?.textContent).toContain("v1 review: revision plan approved");
    expect(row?.textContent).toContain("recorded in the round log");
    expect(host.querySelector("[data-approvals-not-recorded]")).toBeNull();
  });

  it("RunReport renders the replayed arm — no crash on the omitted money/usage fields", () => {
    const REPLAYED_REPORT = {
      replayed: true,
      runId: "v1-review",
      state: "completed",
      workflow: "review",
      phases: [
        { key: "intake", ordinal: 1, status: "done", seat: null, source: "inferred_from_delivered_files" },
      ],
      claims: { checked: 7, verified: 5 },
      notRecorded: ["time", "credits", "model", "estimate", "usage"],
      approvals: "not_recorded",
    };
    const host = renderEl(<RunReport view={REPLAYED_REPORT as never} labels={reportLabels} />);
    expect(host.querySelector("[data-replayed-badge]")).not.toBeNull();
    expect(host.querySelector("[data-phase-inferred]")?.textContent).toBe(
      "inferred from the delivered files",
    );
    expect(host.querySelector("[data-approvals-not-recorded]")).not.toBeNull();
    expect(host.querySelector("[data-not-recorded]")?.textContent).toContain("usage not recorded");
    expect(host.querySelector("[data-claims]")).not.toBeNull();
    // the omitted live fields never render a money line
    expect(host.querySelector("[data-estimate-line]")).toBeNull();
  });
});

// ---- REQ-TOUR-6/7 + REQ-CONV-14 — the demo record markers ------------------------------------

describe("the demo record markers", () => {
  it("DemoDocMarkers renders import-rule labels, not-published refs and the fragments note", () => {
    const host = renderEl(
      <DemoDocMarkers
        demo={{
          importRule: { "claims[].tier": "assigned by import rule", "findings[].kind": "assigned by import rule" },
          notPublishedRefs: [
            { line: 3, path: "agents/author/research/sources/private-note.md" },
          ],
          fragmentsNote: "3 working fragments not shown",
        }}
      />,
    );
    expect(host.querySelector("[data-demo-markers]")).not.toBeNull();
    expect(host.querySelectorAll("[data-import-rule]").length).toBe(2);
    expect(host.querySelector('[data-import-rule="claims[].tier"]')).not.toBeNull();
    const np = host.querySelector("[data-not-published]");
    expect(np?.getAttribute("data-not-published")).toBe("agents/author/research/sources/private-note.md");
    expect(np?.textContent).toContain("not published");
    expect(host.querySelector("[data-fragments-note]")?.textContent).toContain(
      "3 working fragments not shown",
    );
  });

  it("renders nothing when the markers block is empty (a live doc's arm)", () => {
    const host = renderEl(<DemoDocMarkers demo={{}} />);
    expect(host.querySelector("[data-demo-markers]")).toBeNull();
  });

  it("stripNotPublishedLinks turns an excluded-ref link into a non-link labelled 'not published'", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "see the private note",
              marks: [{ type: "link", attrs: { href: "../agents/author/research/sources/private-note.md" } }],
            },
            {
              type: "text",
              text: " and the kept source",
              marks: [{ type: "link", attrs: { href: "../agents/author/research/sources/marsh-viscosity-2021.md" } }],
            },
          ],
        },
      ],
    };
    const out = stripNotPublishedLinks(doc, [
      { line: 3, path: "agents/author/research/sources/private-note.md" },
    ]) as typeof doc;
    const [excluded, kept] = (out.content![0]!.content ?? []) as {
      text: string;
      marks?: { type: string; attrs?: { href?: string } }[];
    }[];
    // the excluded ref: a non-link labelled "not published" — the text stays verbatim.
    expect(excluded.marks?.some((m) => m.type === "link") ?? false).toBe(false);
    expect(excluded.text).toBe("see the private note (not published)");
    // a published ref's link is untouched.
    expect(kept.marks?.[0]?.attrs?.href).toBe("../agents/author/research/sources/marsh-viscosity-2021.md");
    expect(kept.text).toBe(" and the kept source");
  });

  it("parseLedgerEscalations reads escalate rows out of the response-ledger table", () => {
    const md = [
      "| Row | Source | Disposition | Status | Note |",
      "|---|---|---|---|---|",
      "| F1 | L Major 1 | accept | done | fixed. |",
      "| F6 | OQ 1 | escalate | escalated | County board record quotability — awaiting the writer. |",
      "| F7 | CL C7b | §3.B accept; the volume point **rebut** | done | Mixed cell. |",
    ].join("\n");
    const rows = parseLedgerEscalations(md);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({
      row: "F6",
      source: "OQ 1",
      status: "escalated",
      note: "County board record quotability — awaiting the writer.",
    });
  });

  it("DemoLedgerDecisions renders the escalations as Decisions", () => {
    const md = [
      "| Row | Source | Disposition | Status | Note |",
      "|---|---|---|---|---|",
      "| F6 | OQ 1 | escalate | escalated | County board record quotability — awaiting the writer. |",
    ].join("\n");
    const host = renderEl(<DemoLedgerDecisions markdown={md} />);
    expect(host.querySelector("[data-demo-decisions]")).not.toBeNull();
    const row = host.querySelector('[data-demo-escalation="F6"]');
    expect(row?.textContent).toContain("F6");
    expect(row?.textContent).toContain("OQ 1");
    expect(row?.textContent).toContain("escalated");
    expect(row?.textContent).toContain("County board record quotability");
  });

  it("DemoLedgerDecisions renders nothing for a ledger with no escalations", () => {
    const host = renderEl(
      <DemoLedgerDecisions markdown={"| Row | Source | Disposition | Status | Note |\n|---|---|---|---|---|\n| F1 | L Major 1 | accept | done | fixed. |"} />,
    );
    expect(host.querySelector("[data-demo-decisions]")).toBeNull();
  });
});
