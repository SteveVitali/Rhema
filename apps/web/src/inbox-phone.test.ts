import { describe, it, expect, vi } from "vitest";
import type { ProjectRow } from "@rhema/api-client";
import type { InboxItemDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.19 — the §5.11 Inbox page + the §10.1 phone-width contract (REQ-IDE-2 amended, REQ-IDE-47/48,
// REQ-SPEC-20, REQ-MOBILE-3 amended). In-memory data source + Hono's app.request — no network.
// The phone request is the `sec-ch-ua-mobile: ?1` client hint (the user-agent fallback is the seam's
// second leg; the tests drive the hint).

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "seed-essay",
    title: "Seed Essay",
    state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } },
  },
];

const BLOCKED_GATE: InboxItemDto = {
  id: "gate:gate_1",
  kind: "blocked",
  type: "gate",
  title: "approve plan needs your call",
  href: "/p/seed-essay/review/run_1?gate=gate_1",
  projectId: "proj_1",
  projectTitle: "Seed Essay",
  runId: "run_1",
  unread: true,
  createdAt: "2026-09-20T00:00:00Z",
  gate: { gateId: "gate_1", runId: "run_1", kind: "approve_plan", workflow: "review", deadlineAt: null },
};
const BLOCKED_DECISION: InboxItemDto = {
  id: "decision:dcr_1",
  kind: "blocked",
  type: "decision",
  title: "An obligation needs a decision",
  body: "Deferred previously, horizon reached: restate the pillar",
  href: "/p/seed-essay#decisions",
  projectId: "proj_1",
  unread: true,
  createdAt: "2026-09-21T00:00:00Z",
  decision: { decisionId: "dcr_1", text: "Deferred previously…", options: ["decide", "re-defer", "drop"], obligationId: "obl_1" },
};
const EVENT_FINISHED: InboxItemDto = {
  id: "ib_1",
  kind: "event",
  type: "run_finished",
  title: "Review finished",
  href: "/p/seed-essay/review/run_9",
  projectId: "proj_1",
  runId: "run_9",
  unread: true,
  createdAt: "2026-09-25T00:00:00Z",
};
const VOICE_ROW: InboxItemDto = {
  id: "voice:per_1",
  kind: "voice",
  type: "voice_stale",
  title: "Voice needs attention: Mine",
  href: "/v/mine",
  unread: false,
  createdAt: "2026-09-22T00:00:00Z",
};

function makeDeps(over: Partial<WebDeps> = {}, dataSource: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      previewImport: async () => ({ status: "ready" as const, preview: { markdown: "", counts: { words: 0, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 }, warnings: [], unconverted: [], quality: "clean" as const, qualityNotes: [], sourceFormat: "md" as const }, quarantineKey: "q" }),
      createImport: async () => ({ draftId: "d_new" }),
      createRun: async () => ({ runId: "run_new", state: "queued", deduped: false }),
      getBillingBalance: async () => ({ spendableCredits: 200_000, suspended: false, clawbackDebt: 0 }),
      recordExhaustedPrompt: async () => undefined,
      listGates: async () => [],
      listDecisions: async () => [],
      getApprovalOverrides: async () => ({}),
      answerDecision: async () => undefined,
      getPretriage: async () => ({ triaged: 0, total: 0 }),
      ...dataSource,
    },
    session: () => ({}),
    ...over,
  };
}

const MOBILE = { headers: { "sec-ch-ua-mobile": "?1" } };

describe("P1.19 — /app/inbox (REQ-IDE-2 amended)", () => {
  it("the document serves the shell; the twin ships the api's verbatim order + the badge", async () => {
    // SPA.27 (REQ-TST-1) — the grouped inbox render retired with the document; the leaf paints
    // the same `{items,badge,gateCards}` aggregate the `/bff/app/inbox` twin ships. The api owns
    // ordering (blocked → unread → earlier → voices) — the twin passes it through unmassaged.
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [EVENT_FINISHED, BLOCKED_GATE, BLOCKED_DECISION, VOICE_ROW],
        getInboxBadge: async () => ({ count: 2 }),
      }),
    );
    const res = await app.request("/app/inbox");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="spa-root"');

    const twin = await app.request("/bff/app/inbox");
    expect(twin.status).toBe(200);
    const body = (await twin.json()) as {
      items: InboxItemDto[];
      badge: number;
      gateCards: Record<string, unknown>;
    };
    expect(body.badge).toBe(2);
    expect(body.items.map((i) => i.id)).toEqual(["ib_1", "gate:gate_1", "decision:dcr_1", "voice:per_1"]);
    // the row's href IS its §4.2 landing — verbatim in the DTO.
    expect(body.items[0].href).toBe("/p/seed-essay/review/run_9");
    expect(body.items[2].decision?.options).toContain("re-defer");
  });

  it("the twin keys the run's real gate card by item id — the leaf mounts it in the row's expand", async () => {
    const card = {
      id: "gate_1",
      runId: "run_1",
      kind: "approve_plan",
      workflow: "review",
      openedAt: "2026-09-20T00:00:00Z",
      pausedWhileReading: false,
      held: false,
      blocking: true,
      onExpiry: "wait",
      spentCredits: 120,
      capCredits: 2000,
      remainingEstimateCredits: 1880,
    };
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [BLOCKED_GATE],
        getInboxBadge: async () => ({ count: 1 }),
        listGates: async () => [card as never],
      }),
    );
    // SPA.27 — the SSR expand died with the document; the card join is the twin's contract
    // (keyed by inbox-item id; a missed join degrades to the deep link, never a 500).
    const body = (await (await app.request("/bff/app/inbox", MOBILE)).json()) as {
      gateCards: Record<string, { id: string; runId: string; kind: string }>;
    };
    expect(body.gateCards["gate:gate_1"]).toMatchObject({ id: "gate_1", runId: "run_1", kind: "approve_plan" });
  });

  it("an empty seam still renders the page; read receipts POST back and redirect", async () => {
    const markAll = vi.fn(async () => ({ ok: true as const, marked: 3 }));
    const markOne = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [EVENT_FINISHED],
        getInboxBadge: async () => ({ count: 0 }),
        markInboxAllRead: markAll,
        markInboxItemRead: markOne,
      }),
    );
    const page = await app.request("/app/inbox");
    expect(page.status).toBe(200);

    const all = await app.request("/app/inbox/read-all", { method: "POST" });
    expect(all.status).toBe(302);
    expect(all.headers.get("location")).toBe("/app/inbox");
    expect(markAll).toHaveBeenCalledOnce();

    const one = await app.request("/app/inbox/read", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ item: "ib_1" }).toString(),
    });
    expect(one.status).toBe(302);
    expect(markOne).toHaveBeenCalledWith(expect.anything(), "ib_1");
  });

  it("unauthenticated visits redirect to /login", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    expect((await app.request("/app/inbox")).status).toBe(302);
  });
});

describe("P1.19 — returning to a finished run (REQ-IDE-48)", () => {
  it("an unread run_finished row for the project lands on its workflow-shaped href (and marks read)", async () => {
    const markRead = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [EVENT_FINISHED],
        getInboxBadge: async () => ({ count: 0 }),
        markInboxItemRead: markRead,
      }),
    );
    const res = await app.request("/p/seed-essay");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/seed-essay/review/run_9");
    expect(markRead).toHaveBeenCalledWith(expect.anything(), "ib_1");
  });

  it("no unread finished row (or ?focus=1) → the plain project home", async () => {
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [{ ...EVENT_FINISHED, unread: false }],
        getInboxBadge: async () => ({ count: 0 }),
      }),
    );
    const res = await app.request("/p/seed-essay");
    expect(res.status).toBe(200);

    const app2 = createWebApp(
      makeDeps({}, {
        getInbox: async () => [EVENT_FINISHED],
        getInboxBadge: async () => ({ count: 0 }),
      }),
    );
    const focused = await app2.request("/p/seed-essay?focus=1");
    expect(focused.status).toBe(200);
  });
});

// SPA.27 — the §10.1 phone-width drops moved into the leaf: every migrated surface now serves
// the shell on phone too, and the leaf ANDs its affordances against the boot `deviceClass`
// (`data-device` on the html tag — the server-owned seam these pins assert). The ONE document
// that still answers phone SSR is the Page family (REQ-ED-12/REQ-VFY-5 — `pageMount` routes keep
// their forced-SSR arm), so the project-home pin below still reads a real server document.
describe("P1.19 — the §10.1 phone-width contract (REQ-SPEC-20; REQ-MOBILE-3 amended)", () => {
  it("the /app home carries deviceClass=phone in the boot — the leaf drops New project", async () => {
    const app = createWebApp(makeDeps());
    const desktop = await app.request("/app");
    expect(await desktop.text()).toContain('data-device="desktop"');
    const phone = await app.request("/app", MOBILE);
    const html = await phone.text();
    expect(html).toContain('id="spa-root"');
    expect(html).toContain('data-device="phone"'); // the leaf's §10.1 seam
  });

  it("the project home stays forced-SSR on phone (pageMount) and still drops the affordances", async () => {
    const app = createWebApp(makeDeps());
    const desktop = await app.request("/p/seed-essay");
    // SPA.27 — the desktop overview is the shell now; the links are leaf paint.
    expect(await desktop.text()).toContain('id="spa-root"');
    // phone ⇒ forced-SSR Page overview (REQ-ED-12): the §10.1 affordance drops stay server truth.
    const phone = await app.request("/p/seed-essay", MOBILE);
    const html = await phone.text();
    expect(html).not.toContain('id="spa-root"');
    expect(html).not.toContain('href="/p/seed-essay/import"');
    expect(html).not.toContain('href="/p/seed-essay/run"');
    expect(html).not.toContain('href="/p/seed-essay/export"');
  });

  it("the run sheet's phone request serves the shell carrying deviceClass=phone", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/seed-essay/run", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="spa-root"');
    expect(html).toContain('data-device="phone"'); // the leaf paints the blocked note, never the form
  });

  it("the import and new-project sheets serve the phone-boot shell (the leaf never mounts the forms)", async () => {
    const app = createWebApp(makeDeps());
    const imp = await app.request("/p/seed-essay/import", MOBILE);
    const impHtml = await imp.text();
    expect(impHtml).toContain('id="spa-root"');
    expect(impHtml).toContain('data-device="phone"');

    // R7HOME.2b — GET /app/new is a server redirect on every device (the create is one POST
    // the leaf issues; a document GET never mounts a form).
    const np = await app.request("/app/new", MOBILE);
    expect(np.status).toBe(302);
    expect(np.headers.get("location")).toBe("/app");
  });

  it("the voice creation sheet and voices list serve the phone-boot shell", async () => {
    const app = createWebApp(
      makeDeps({}, {
        listVoiceGroups: async () => ({ voices: [], groups: { your_voices: [], house_styles: [], shared_with_you: [] } } as never),
      }),
    );
    const list = await app.request("/voices", MOBILE);
    const listHtml = await list.text();
    expect(listHtml).toContain('id="spa-root"');
    expect(listHtml).toContain('data-device="phone"'); // no building affordances on phone — leaf-owned
    const sheet = await app.request("/voices/new", MOBILE);
    const html = await sheet.text();
    expect(html).toContain('id="spa-root"');
    expect(html).toContain('data-device="phone"');
  });

  it("the export dialog serves the phone-boot shell (the leaf never mounts the form)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/seed-essay/export", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="spa-root"');
    expect(html).toContain('data-device="phone"');
  });

  it("billing serves the phone-boot shell (the read-only card + no config forms are leaf-owned)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/settings/billing", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="spa-root"');
    expect(html).toContain('data-device="phone"');
  });
});
