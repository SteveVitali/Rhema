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
  it("renders the three groups in order — Needs you, events, voices — with the badge line", async () => {
    const app = createWebApp(
      makeDeps({}, {
        getInbox: async () => [EVENT_FINISHED, BLOCKED_GATE, BLOCKED_DECISION, VOICE_ROW],
        getInboxBadge: async () => ({ count: 2 }),
      }),
    );
    const res = await app.request("/app/inbox");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("data-inbox-badge=\"true\"");
    // blocked rows lead — the gate row + the decision row render before the event/voice rows.
    const gateAt = html.indexOf("gate:gate_1");
    const decisionAt = html.indexOf("decision:dcr_1");
    const eventAt = html.indexOf("ib_1");
    const voiceAt = html.indexOf("voice:per_1");
    expect(gateAt).toBeGreaterThan(-1);
    expect(decisionAt).toBeGreaterThan(-1);
    expect(eventAt).toBeGreaterThan(-1);
    expect(voiceAt).toBeGreaterThan(-1);
    expect(Math.min(gateAt, decisionAt)).toBeLessThan(eventAt);
    expect(eventAt).toBeLessThan(voiceAt);
    // the finished-run row's link IS its §4.2 landing (the review letter for a review).
    expect(html).toContain('href="/p/seed-essay/review/run_9"');
    // the decision row offers its own options (decide / re-defer / drop).
    expect(html).toContain("re-defer");
  });

  it("an expanded gate row mounts the run's real card — Approve posts to the gate route (the SSR side-sheet)", async () => {
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
    const res = await app.request("/app/inbox", MOBILE);
    const html = await res.text();
    // the card mounts inside the row's expand — compact model, phone actions only.
    expect(html).toContain('data-inbox-gate-card="gate_1"');
    expect(html).toContain('action="/p/seed-essay/gates/gate_1"');
    expect(html).toContain('data-compact="true"');
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

describe("P1.19 — the §10.1 phone-width contract (REQ-SPEC-20; REQ-MOBILE-3 amended)", () => {
  it("the /app home drops the New project control on phone width", async () => {
    const app = createWebApp(makeDeps());
    const desktop = await app.request("/app");
    expect(await desktop.text()).toContain('data-new-project="true"');
    const phone = await app.request("/app", MOBILE);
    const html = await phone.text();
    expect(html).not.toContain('data-new-project="true"');
  });

  it("the project home drops the import/run/export affordances on phone width", async () => {
    const app = createWebApp(makeDeps());
    const desktop = await app.request("/p/seed-essay");
    const dhtml = await desktop.text();
    expect(dhtml).toContain('href="/p/seed-essay/import"');
    expect(dhtml).toContain('href="/p/seed-essay/export"');
    const phone = await app.request("/p/seed-essay", MOBILE);
    const html = await phone.text();
    expect(html).not.toContain('href="/p/seed-essay/import"');
    expect(html).not.toContain('href="/p/seed-essay/run"');
    expect(html).not.toContain('href="/p/seed-essay/export"');
  });

  it("the run sheet renders its blocked note instead of run-start/config on phone width", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/seed-essay/run", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-phone-blocked="true"');
    expect(html).not.toContain('action="/p/seed-essay/run"');
  });

  it("the import and new-project sheets never render their forms on phone width", async () => {
    const app = createWebApp(makeDeps());
    const imp = await app.request("/p/seed-essay/import", MOBILE);
    const impHtml = await imp.text();
    expect(impHtml).toContain('data-phone-blocked="true"');
    expect(impHtml).not.toContain('action="/p/seed-essay/import/preview"');

    const np = await app.request("/app/new", MOBILE);
    const npHtml = await np.text();
    expect(npHtml).toContain('data-phone-blocked="true"');
    expect(npHtml).not.toContain('action="/app/new"');
  });

  it("the voice creation sheet and voices list never offer building on phone width", async () => {
    const app = createWebApp(
      makeDeps({}, {
        listVoiceGroups: async () => ({ voices: [], groups: { your_voices: [], house_styles: [], shared_with_you: [] } } as never),
      }),
    );
    const list = await app.request("/voices", MOBILE);
    expect((await list.text())).not.toContain('data-new-voice="true"');
    const sheet = await app.request("/voices/new", MOBILE);
    const html = await sheet.text();
    expect(html).toContain('data-phone-blocked="true"');
    expect(html).not.toContain('action="/voices/new"');
  });

  it("the export dialog never renders its form on phone width", async () => {
    const app = createWebApp(
      makeDeps({}, {
        getExportDialog: async () => ({
          projectId: "proj_1",
          formats: [],
          mdProfiles: [],
          citations: { styles: [], projectHasBibliography: false },
          provenance: { offered: false },
          surfaces: { opedExclusivity: false, academicDisclosure: false },
          obligations: { blockingOpen: 0, open: 0, line: "No obligations open", items: [], returnedIds: [] },
          statement: { text: "", versions: [] },
        } as never),
      }),
    );
    const res = await app.request("/p/seed-essay/export", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-phone-blocked="true"');
    expect(html).not.toContain('data-export-form="true"');
  });

  it("billing renders the read-only plan card but no configuration forms on phone width", async () => {
    const app = createWebApp(
      makeDeps({}, {
        getSubscription: async () => ({
          tier: "free",
          trial: { state: "none" },
          autoReload: { enabled: false },
          subscription: null,
          hasStripeCustomer: false,
        } as never),
        getPlans: async () => ({ trial: { includedNote: "" }, plans: {}, topUpPacks: [] } as never),
      }),
    );
    const res = await app.request("/settings/billing", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-plan-card="true"');
    expect(html).toContain('data-phone-blocked="true"');
    expect(html).not.toContain('data-subscribe-form');
    expect(html).not.toContain('data-auto-reload-form');
  });
});
