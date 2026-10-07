import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { ASSISTANT_TURN_BUDGET, PINS_MAX_PER_THREAD, quarantineKey } from "@rhema/contracts";
import { InMemoryContentStore } from "@rhema/mirror";
import type { ConversionResult } from "@rhema/contracts";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";
import type { Converter } from "./import.js";

// P1.11 — the Assistant chat surface's server side (§7.1/§7.4/§7.6): threads CRUD with the
// undeletable default, a turn creating a `chat_turn` RUN (the plan card is the consent — queued,
// hold placed, budgets frozen), the metered cost strip, pins ≤12, corrections as Guidance-class
// notes, attachments → assistant-namespace source notes, the ≤1-paragraph suggestion shaping, and
// the §7.6 empty state with its one-shot analytics.

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const get = (path: string) => app.request(path);
const postJson = (path: string, body: Record<string, unknown> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const patchJson = (path: string, body: Record<string, unknown>) =>
  app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const del = (path: string) => app.request(path, { method: "DELETE" });

const conversion: ConversionResult = {
  sourceFormat: "md",
  markdown: "# Attached\n\nConverted body text.",
  counts: { words: 4, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};
const converter: Converter = { preview: async () => conversion };

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  // ULID-shaped seed ids — the analytics sink validates its envelope ids at the write boundary, so
  // the telemetry assertions below only land with real ULIDs.
  seed = await seedProject(db, {
    draftN: 1,
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
  app = createApp({
    ...deps,
    principal: () => principal(),
    db: sql,
    contentStore: store,
    importConverter: converter,
  });
});
afterEach(() => db.close());

/** The default thread's id (GET /chat ensures it on read). */
async function defaultThreadId(): Promise<string> {
  const res = await get(`/projects/${seed.projectId}/chat`);
  const dto = (await res.json()) as { threads: { id: string; isDefault: boolean }[] };
  return dto.threads.find((t) => t.isDefault)!.id;
}

describe("GET /projects/:id/chat — the Desk Chat read (REQ-CHAT-1/2)", () => {
  it("ensures the undeletable 'Project chat' default thread and lists it", async () => {
    const res = await get(`/projects/${seed.projectId}/chat`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      threads: { id: string; name: string; isDefault: boolean }[];
      activeThreadId: string;
      budgets: { credits: number; searches: number; fetches: number };
      emptyState: unknown;
    };
    expect(dto.threads).toHaveLength(1);
    expect(dto.threads[0]!.isDefault).toBe(true);
    expect(dto.threads[0]!.name).toBe("Project chat");
    expect(dto.activeThreadId).toBe(dto.threads[0]!.id);
    // a seeded draft ⇒ no empty state; budgets ride along for the cost strip.
    expect(dto.emptyState).toBeNull();
    expect(dto.budgets).toEqual(ASSISTANT_TURN_BUDGET);
  });

  it("renders the §7.6 empty state (four chips + one card) on a draftless project, once", async () => {
    const bare = await seedProject(db, {
      userId: seed.userId,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
    });
    const res = await get(`/projects/${bare.projectId}/chat`);
    const dto = (await res.json()) as {
      emptyState: { chips: string[]; nextStep: { kind: string } } | null;
    };
    expect(dto.emptyState).not.toBeNull();
    expect(dto.emptyState!.chips).toHaveLength(4);
    expect(dto.emptyState!.nextStep).toBeTruthy();
    // the activation event emits once per project (dedupe-keyed), not once per read.
    await get(`/projects/${bare.projectId}/chat`);
    const rows = (
      await db.pg.query(
        `select count(*)::int as n from analytics_events where event = 'chat.empty_state_shown'`,
      )
    ).rows as { n: number }[];
    expect(rows[0]!.n).toBe(1);
  });

  it("404s a project outside the workspace", async () => {
    expect((await get(`/projects/prj_other/chat`)).status).toBe(404);
  });
});

describe("thread CRUD (REQ-CHAT-3/4/5)", () => {
  it("creates, renames, archives, and deletes a thread", async () => {
    const created = await postJson(`/projects/${seed.projectId}/chat/threads`, { name: "Side thread" });
    expect(created.status).toBe(201);
    const { thread } = (await created.json()) as { thread: { id: string; name: string } };
    expect(thread.name).toBe("Side thread");

    expect(
      (await patchJson(`/projects/${seed.projectId}/chat/threads/${thread.id}`, { name: "Renamed" })).status,
    ).toBe(200);
    expect((await postJson(`/projects/${seed.projectId}/chat/threads/${thread.id}/archive`)).status).toBe(200);
    expect((await del(`/projects/${seed.projectId}/chat/threads/${thread.id}`)).status).toBe(200);
    const rows = (await db.pg.query(`select id from threads where id = $1`, [thread.id])).rows;
    expect(rows).toHaveLength(0);
  });

  it("refuses to delete the default thread (409)", async () => {
    const tid = await defaultThreadId();
    expect((await del(`/projects/${seed.projectId}/chat/threads/${tid}`)).status).toBe(409);
  });

  it("422s a nameless create and a cross-project thread id 404s", async () => {
    expect((await postJson(`/projects/${seed.projectId}/chat/threads`, { name: "  " })).status).toBe(422);
    expect((await patchJson(`/projects/${seed.projectId}/chat/threads/thr_nope`, { name: "x" })).status).toBe(404);
  });
});

describe("POST …/turns — a chat turn is a `chat_turn` run (REQ-CHAT-6/9/10)", () => {
  it("creates a queued run with the §7.1 cap, freezes inputs, and emits the plan card event", async () => {
    const tid = await defaultThreadId();
    const res = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "Summarize the argument so far.",
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { runId: string; state: string; planCard: { threadId: string } };
    expect(dto.state).toBe("queued");
    expect(dto.planCard.threadId).toBe(tid);

    const run = (
      await db.pg.query(
        `select workflow, cap_credits, model_tier, inputs->>'threadId' as tid from runs where id = $1`,
        [dto.runId],
      )
    ).rows[0] as { workflow: string; cap_credits: number; model_tier: string; tid: string };
    expect(run.workflow).toBe("chat_turn");
    expect(run.cap_credits).toBe(ASSISTANT_TURN_BUDGET.credits); // the hard cap, not the estimate
    expect(run.tid).toBe(tid);

    // the plan card is the run's first user-visible event — ids + budgets, never the message text.
    const card = deps.eventWriter.forRun(dto.runId).find((e) => e.type === "chat.plan_card");
    expect(card).toBeTruthy();
    expect(JSON.stringify(card!.payload)).not.toContain("Summarize the argument");
    expect(card!.payload.searches).toBe(ASSISTANT_TURN_BUDGET.searches);
    expect(card!.payload.fetches).toBe(ASSISTANT_TURN_BUDGET.fetches);

    // the user's message landed as an assistant-namespace session artifact — not on the run row.
    const msg = (
      await db.pg.query(
        `select a.mirror_path from artifacts a where a.project_id = $1 and a.mirror_path like 'agents/assistant/%'`,
        [seed.projectId],
      )
    ).rows as { mirror_path: string }[];
    expect(msg.some((m) => m.mirror_path.includes("user.md"))).toBe(true);
  });

  it("clamps an over-budget request down to the §7.1 ceiling; honors a shrink", async () => {
    const tid = await defaultThreadId();
    const over = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "a",
      budget: { credits: 999, searches: 99, fetches: 99 },
    });
    expect(over.status).toBe(201);
    const run = (
      await db.pg.query(`select cap_credits from runs where id = $1`, [
        ((await over.json()) as { runId: string }).runId,
      ])
    ).rows[0] as { cap_credits: number };
    expect(run.cap_credits).toBe(ASSISTANT_TURN_BUDGET.credits);
  });

  it("dedupes a replayed idempotency key to one run row", async () => {
    const tid = await defaultThreadId();
    const first = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "one",
      idempotencyKey: "key-1",
    });
    const second = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "one",
      idempotencyKey: "key-1",
    });
    const a = (await first.json()) as { runId: string };
    const b = (await second.json()) as { runId: string; deduped: boolean };
    expect(b.runId).toBe(a.runId);
    expect(b.deduped).toBe(true);
    const runs = (await db.pg.query(`select id from runs where project_id = $1`, [seed.projectId])).rows;
    expect(runs).toHaveLength(1);
  });

  it("422s an empty message and 404s an unknown thread", async () => {
    const tid = await defaultThreadId();
    expect(
      (await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, { message: " " })).status,
    ).toBe(422);
    expect(
      (await postJson(`/projects/${seed.projectId}/chat/threads/thr_nope/turns`, { message: "hi" })).status,
    ).toBe(404);
  });
});

describe("GET …/turns/:runId — the metered cost strip (REQ-CHAT-11)", () => {
  it("reads credits/searches/fetches from usage rows — never model text", async () => {
    const tid = await defaultThreadId();
    const created = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "turn",
    });
    const { runId } = (await created.json()) as { runId: string };
    await db.pg.query(
      `insert into usage_records
         (id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier,
          rate_table_version, searches, fetches, list_cost_usd, credits, source)
         values ('ur_1', now(), $1, $2, $3, 'phase', 'anthropic', 'm', 'base', 1, 2, 3, 0.1, 7, 'proxy')`,
      [seed.workspaceId, seed.billingAccountId, runId],
    );
    const res = await get(`/projects/${seed.projectId}/chat/threads/${tid}/turns/${runId}`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      strip: {
        spentCredits: number;
        capCredits: number;
        searchesUsed: number;
        searchesBudget: number;
        fetchesUsed: number;
        fetchesBudget: number;
        workspaceSpent?: number;
      };
    };
    expect(dto.strip.searchesUsed).toBe(2);
    expect(dto.strip.searchesBudget).toBe(ASSISTANT_TURN_BUDGET.searches);
    expect(dto.strip.fetchesUsed).toBe(3);
    expect(dto.strip.fetchesBudget).toBe(ASSISTANT_TURN_BUDGET.fetches);
    expect(dto.strip.capCredits).toBe(ASSISTANT_TURN_BUDGET.credits);
    expect(dto.strip.workspaceSpent).toBe(7);
  });

  it("ECON.1 D-A: sdk twin rows never double-count the strip's credits or workspace spend", async () => {
    const tid = await defaultThreadId();
    const created = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/turns`, {
      message: "turn",
    });
    const { runId } = (await created.json()) as { runId: string };
    for (const [id, source, credits] of [
      ["ur_p", "proxy", 7],
      ["ur_e", "sdk_estimate", 9],
      ["ur_s", "sdk_stream", 11],
      ["ur_pr", "provider_report", 13],
    ] as const) {
      await db.pg.query(
        `insert into usage_records
           (id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier,
            rate_table_version, searches, fetches, list_cost_usd, credits, source)
         values ($1, now(), $2, $3, $4, 'phase', 'anthropic', 'm', 'base', 1, 0, 0, 0.1, $5, $6)`,
        [id, seed.workspaceId, seed.billingAccountId, runId, credits, source],
      );
    }
    const res = await get(`/projects/${seed.projectId}/chat/threads/${tid}/turns/${runId}`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { strip: { spentCredits: number; workspaceSpent?: number } };
    // the turn's credit truth is the proxy row alone (7), not 7+9+11+13 = 40;
    // workspace spend is likewise proxy-only (7).
    expect(dto.strip.workspaceSpent).toBe(7);
  });

  it("404s a run that isn't this thread's chat_turn", async () => {
    const tid = await defaultThreadId();
    expect(
      (await get(`/projects/${seed.projectId}/chat/threads/${tid}/turns/run_nope`)).status,
    ).toBe(404);
  });
});

describe("POST …/plan-decision (REQ-CHAT-10)", () => {
  it("run_research returns the research_burst SHEET link — it never creates a run", async () => {
    const tid = await defaultThreadId();
    const res = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/plan-decision`, {
      action: "run_research",
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { action: string; sheet: { href: string } };
    expect(dto.action).toBe("run_research");
    expect(dto.sheet.href).toContain("research_burst");
    const runs = (await db.pg.query(`select id from runs where project_id = $1`, [seed.projectId])).rows;
    expect(runs).toHaveLength(0);
  });

  it("422s an unknown action", async () => {
    const tid = await defaultThreadId();
    expect(
      (await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/plan-decision`, { action: "yeet" }))
        .status,
    ).toBe(422);
  });
});

describe("pins (REQ-CHAT-13)", () => {
  it("adds, lists, enforces the ≤12 cap, and removes pins", async () => {
    const tid = await defaultThreadId();
    for (let i = 0; i < PINS_MAX_PER_THREAD; i++) {
      const res = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/pins`, {
        summary: `pin ${i}`,
      });
      expect(res.status).toBe(201);
    }
    const over = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/pins`, {
      summary: "one too many",
    });
    expect(over.status).toBe(409);
    expect(((await over.json()) as { error: string }).error).toBe("pins_full");

    // dropOldest is the correctable path — the cap stays, the oldest pin rotates out.
    const rotated = await postJson(`/projects/${seed.projectId}/chat/threads/${tid}/pins`, {
      summary: "one too many",
      dropOldest: true,
    });
    expect(rotated.status).toBe(201);
    const pins = (
      (await (await get(`/projects/${seed.projectId}/chat/threads/${tid}/pins`)).json()) as {
        pins: { id: string; summary: string }[];
      }
    ).pins;
    expect(pins).toHaveLength(PINS_MAX_PER_THREAD);
    expect(pins.some((p) => p.summary === "pin 0")).toBe(false);

    const removed = await del(`/projects/${seed.projectId}/chat/threads/${tid}/pins/${pins[0]!.id}`);
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { pins: unknown[] }).pins).toHaveLength(PINS_MAX_PER_THREAD - 1);
  });
});

describe("remembers + corrections (§7.1)", () => {
  it("a correction lands as a Guidance-class note (source chat_promote)", async () => {
    const tid = await defaultThreadId();
    const res = await postJson(
      `/projects/${seed.projectId}/chat/threads/${tid}/remembers/corrections`,
      { text: "Actually the venue is NeurIPS, not ICML." },
    );
    expect(res.status).toBe(201);
    const row = (
      await db.pg.query(`select source, standing, body from guidance where project_id = $1`, [
        seed.projectId,
      ])
    ).rows[0] as { source: string; standing: boolean; body: string };
    expect(row.source).toBe("chat_promote");
    expect(row.standing).toBe(true);
    expect(row.body).toContain("NeurIPS");
  });

  it("the remembers view reads brief + pins without mutation", async () => {
    const tid = await defaultThreadId();
    const res = await get(`/projects/${seed.projectId}/chat/threads/${tid}/remembers`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { brief: string | null; pins: { pins: unknown[] } };
    expect(dto.brief).toBeNull();
    expect(dto.pins.pins).toEqual([]);
  });
});

describe("attachments (§7.1; quarantine → convert → source note)", () => {
  it("converts an allowed upload into an agents/assistant/research/attachments/ note", async () => {
    const key = quarantineKey(seed.workspaceId, "upl_1");
    const res = await postJson(`/projects/${seed.projectId}/chat/attachments`, {
      quarantineKey: key,
      filename: "notes.pdf",
      mediaType: "application/pdf",
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { note: { path: string } };
    expect(dto.note.path).toMatch(/^agents\/assistant\/research\/attachments\//);
    // the note is a real artifact row in the assistant namespace — never the corpus.
    const row = (
      await db.pg.query(
        `select namespace from artifacts where project_id = $1 and mirror_path = $2`,
        [seed.projectId, dto.note.path],
      )
    ).rows[0] as { namespace: string };
    expect(row.namespace).toBe("agent:assistant");
    // and the index gained the attachment card.
    const sources = (
      (await (await get(`/projects/${seed.projectId}/chat/sources`)).json()) as {
        sources: { kind: string }[];
      }
    ).sources;
    expect(sources.some((s) => s.kind === "attachment")).toBe(true);
  });

  it("403s a quarantine key outside the workspace and 415s an image", async () => {
    const foreign = await postJson(`/projects/${seed.projectId}/chat/attachments`, {
      quarantineKey: quarantineKey("ws_other", "upl_1"),
      filename: "x.pdf",
      mediaType: "application/pdf",
    });
    expect(foreign.status).toBe(403);
    const image = await postJson(`/projects/${seed.projectId}/chat/attachments`, {
      quarantineKey: quarantineKey(seed.workspaceId, "upl_2"),
      filename: "x.png",
      mediaType: "image/png",
    });
    expect(image.status).toBe(415);
  });
});

describe("POST …/suggestions — 'Ask about this draft' (§7.4; REQ-CHAT-19)", () => {
  it("shapes a ≤1-paragraph suggestion with assistant provenance", async () => {
    const res = await postJson(`/projects/${seed.projectId}/chat/suggestions`, {
      anchor: { ref: "@v1 ¶2", version: 1, block: "¶2" },
      replacement: "A tighter single paragraph.",
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as {
      proposal: { provenance: string; anchor: { ref: string } };
    };
    expect(dto.proposal.provenance).toBe("assistant");
    expect(dto.proposal.anchor.ref).toBe("@v1 ¶2");
  });

  it("refuses a whole-section rewrite with the /lineedit|/revise pointer", async () => {
    const res = await postJson(`/projects/${seed.projectId}/chat/suggestions`, {
      anchor: { ref: "@v1 §II", version: 1 },
      replacement: "First paragraph.\n\nSecond paragraph.",
    });
    expect(res.status).toBe(422);
    const dto = (await res.json()) as { error: string; refusal: { commands: string[] } };
    expect(dto.error).toBe("suggestion_too_large");
    expect(dto.refusal.commands).toEqual(["/lineedit @section", "/revise"]);
  });

  it("422s a missing anchor", async () => {
    expect(
      (await postJson(`/projects/${seed.projectId}/chat/suggestions`, { replacement: "x" })).status,
    ).toBe(422);
  });
});
