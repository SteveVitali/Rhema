import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  readDecision,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// PRB.05 — the disposition write + decision surfaces end-to-end on PGlite (AC1/AC2/AC3): the five-verb write
// validates, persists actor/rationale/reason_code, is reversible until freeze, routes the obligation, and
// lands escalations in the Decisions list; the approve_triage decision merges user rows over the agent's
// ledger into the response-ledger overlay (REQ-SPEC-9, REQ-WF-9); "Wait for me" holds a gate.

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

const CORR = "corr_r1";

async function seedReview(findings: { id: string; ordinal: number; severity?: string; title?: string }[]) {
  await db.txRunner.run(seed.workspaceId, async (tx) => {
    await tx.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ($1,$2,'review',$3,'run_rev', now(), '{}')`,
      [CORR, seed.projectId, seed.draftId],
    );
    for (const f of findings) {
      await tx.query(
        `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
         values ($1,$2,$3,$4,'argument',$5,'editor',$6,'body')`,
        [f.id, CORR, seed.draftId, f.ordinal, f.severity ?? "major", f.title ?? `finding ${f.ordinal}`],
      );
    }
  });
}

const postDisposition = (fid: string, body: Record<string, unknown>) =>
  app.request(`/projects/${seed.projectId}/findings/${fid}/disposition`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

describe("POST /projects/:id/findings/:fid/disposition — the five-verb write (§5.7)", () => {
  it("records accept with an optional reason code + actor: user (AC1)", async () => {
    await seedReview([{ id: "f_1", ordinal: 1 }]);
    const res = await postDisposition("f_1", { kind: "accept", reasonCode: "already_knew" });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { kind: string; reasonCode: string };
    expect(dto).toMatchObject({ kind: "accept", reasonCode: "already_knew" });

    const row = (
      await db.pg.query("select kind, rationale, reason_code, by_actor from dispositions where finding_id = 'f_1'")
    ).rows[0] as { kind: string; rationale: string | null; reason_code: string; by_actor: { kind: string; userId: string } };
    expect(row.kind).toBe("accept");
    expect(row.reason_code).toBe("already_knew");
    expect(row.by_actor).toEqual({ kind: "user", userId: seed.userId });
  });

  it("rebut without a rationale → 422; defer defaults to 'Not this round'; adapt carries edited text", async () => {
    await seedReview([
      { id: "f_1", ordinal: 1 },
      { id: "f_2", ordinal: 2 },
      { id: "f_3", ordinal: 3 },
    ]);
    expect((await postDisposition("f_1", { kind: "rebut" })).status).toBe(422);
    expect((await postDisposition("f_1", { kind: "escalate", rationale: "  " })).status).toBe(422);

    const d = await postDisposition("f_2", { kind: "defer" });
    expect((await d.json()) as { rationale: string }).toMatchObject({ rationale: "Not this round" });

    const a = await postDisposition("f_3", { kind: "adapt", adaptedText: "the fixed wording" });
    expect((await a.json()) as { adaptedText: string }).toMatchObject({ adaptedText: "the fixed wording" });
  });

  it("is REVERSIBLE until freeze — a second write replaces the row in place", async () => {
    await seedReview([{ id: "f_1", ordinal: 1 }]);
    await postDisposition("f_1", { kind: "accept" });
    const res = await postDisposition("f_1", { kind: "rebut", rationale: "the stat is fine" });
    expect(res.status).toBe(200);
    const rows = (await db.pg.query("select id, kind, rationale from dispositions where finding_id = 'f_1'"))
      .rows as { kind: string; rationale: string }[];
    expect(rows).toHaveLength(1); // one row, replaced — append-only history is the audit record, not dupes
    expect(rows[0]!.kind).toBe("rebut");
    expect(rows[0]!.rationale).toBe("the stat is fine");
  });

  it("a FROZEN (delivered) disposition → 409; cards lock at delivery", async () => {
    await seedReview([{ id: "f_1", ordinal: 1 }]);
    await postDisposition("f_1", { kind: "accept" });
    await db.pg.query("update dispositions set frozen_at = now() where finding_id = 'f_1'");
    expect((await postDisposition("f_1", { kind: "rebut", rationale: "x" })).status).toBe(409);
  });

  it("another workspace's project reads/writes as 404 — explicit tenant check (RLS is the live backstop)", async () => {
    const other = await seedProject(db, {
      draftN: 1,
      workspaceId: "ws_other",
      projectId: "prj_other",
      userId: "usr_other",
      billingAccountId: "ba_other",
    });
    await db.txRunner.run(other.workspaceId, async (tx) => {
      await tx.query(
        `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
         values ('corr_o',$1,'review',$2,'run_rev_o', now(), '{}')`,
        [other.projectId, other.draftId],
      );
      await tx.query(
        `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
         values ('f_o','corr_o',$1,1,'argument','major','editor','other ws finding','body')`,
        [other.draftId],
      );
    });
    // the disposition write, the decisions list, and the gates read all 404 cross-workspace.
    const res = await app.request(`/projects/${other.projectId}/findings/f_o/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "accept" }),
    });
    expect(res.status).toBe(404);
    expect((await app.request(`/projects/${other.projectId}/decisions`)).status).toBe(404);
    expect((await app.request(`/projects/${other.projectId}/gates`)).status).toBe(404);
    expect((await app.request(`/projects/${other.projectId}/pretriage`)).status).toBe(404);
    const gone = await db.pg.query("select id from dispositions where finding_id = 'f_o'");
    expect(gone.rows).toHaveLength(0);
  });

  it("an unknown verb or reason code → 422; an unknown finding → 404", async () => {
    await seedReview([{ id: "f_1", ordinal: 1 }]);
    expect((await postDisposition("f_1", { kind: "agree" })).status).toBe(422);
    expect((await postDisposition("f_1", { kind: "accept", reasonCode: "nah" })).status).toBe(422);
    expect((await postDisposition("f_nope", { kind: "accept" })).status).toBe(404);
  });

  it("escalate lands an open row in the Decisions list (REQ-OBJ-7)", async () => {
    await seedReview([{ id: "f_1", ordinal: 1, title: "the contested stat" }]);
    const res = await postDisposition("f_1", { kind: "escalate", rationale: "my call" });
    expect(res.status).toBe(200);

    const list = await app.request(`/projects/${seed.projectId}/decisions`);
    const { decisions } = (await list.json()) as { decisions: { id: string; text: string; options: string[] }[] };
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.text).toBe("Escalated finding: the contested stat");
    expect(decisions[0]!.options).toEqual(["decide", "dismiss"]);
  });

  it("a minor finding's accept spawns + routes its obligation (REQ-OBJ-2)", async () => {
    await seedReview([{ id: "f_m", ordinal: 1, severity: "minor" }]);
    await postDisposition("f_m", { kind: "accept" });
    const obl = (
      await db.pg.query("select id, state, severity from revision_obligations where finding_id = 'f_m'")
    ).rows[0] as { id: string; state: string; severity: string } | undefined;
    expect(obl?.severity).toBe("minor");
    // accept stays 'proposed' until the move lands — the debt remains open.
    expect(obl?.state).toBe("open");
  });
});

describe("GET/POST /projects/:id/decisions — the beta Inbox stand-in", () => {
  it("lists open rows only; answering or dismissing removes them", async () => {
    await seedReview([{ id: "f_1", ordinal: 1 }]);
    await postDisposition("f_1", { kind: "escalate", rationale: "call me" });
    await db.pg.query(
      `insert into decision_requests(id, project_id, text, options, state)
       values ('dcr_done',$1,'already answered','{decide,dismiss}','answered')`,
      [seed.projectId],
    );

    const { decisions } = (await (await app.request(`/projects/${seed.projectId}/decisions`)).json()) as {
      decisions: { id: string }[];
    };
    expect(decisions).toHaveLength(1); // open only

    const id = decisions[0]!.id;
    const answered = await app.request(`/projects/${seed.projectId}/decisions/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "decide" }),
    });
    expect(answered.status).toBe(200);
    const after = (await (await app.request(`/projects/${seed.projectId}/decisions`)).json()) as {
      decisions: unknown[];
    };
    expect(after.decisions).toHaveLength(0);
  });
});

describe("GET /projects/:id/gates + POST .../decide — the §6.4 card's server side", () => {
  it("lists open gates; 'wait' holds the gate (deadline cleared, run stays parked)", async () => {
    await seedRun(db, { runId: "run_g", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, {
      gateId: "gate_w",
      runId: "run_g",
      kind: "confirm_cost",
      onExpiry: "cancel",
      deadlineAt: new Date("2026-09-23T00:00:00Z"),
    });

    const list = await app.request(`/projects/${seed.projectId}/gates`);
    const { gates } = (await list.json()) as { gates: { id: string; kind: string; onExpiry: string }[] };
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ id: "gate_w", kind: "confirm_cost", onExpiry: "cancel" });

    const wait = await app.request(`/projects/${seed.projectId}/gates/gate_w/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "wait" }),
    });
    expect(wait.status).toBe(200);
    const row = (
      await db.pg.query("select held, deadline_at, resolved_at from gates where id = 'gate_w'")
    ).rows[0] as { held: boolean; deadline_at: Date | null; resolved_at: Date | null };
    expect(row.held).toBe(true);
    expect(row.deadline_at).toBeNull(); // "Wait for me" clears the deadline (§6.4 item 1)
    expect(row.resolved_at).toBeNull(); // held, NOT resolved
  });

  it("activity pings arm the 10-min presence timer only on auto-proceed gates (REQ-SPEC-18)", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    // all times relative to the deterministic test clock (FixedClock @ 2026-09-02T12:00Z).
    const now = deps.clock.now().getTime();
    await seedGate(db, {
      gateId: "gate_auto",
      runId: "run_p",
      kind: "approve_sample",
      onExpiry: "proceed_as_proposed",
      deadlineAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    await seedGate(db, {
      gateId: "gate_wait",
      runId: "run_p",
      kind: "approve_triage",
      onExpiry: "wait",
    });

    const post = (gid: string, activity: string) =>
      app.request(`/projects/${seed.projectId}/gates/${gid}/activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activity }),
      });

    // present → the auto-proceed gate gets a presence deadline ~10 min out.
    const res = await post("gate_auto", "present");
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { presenceDeadlineAt: string | null };
    expect(dto.presenceDeadlineAt).toBeTruthy();
    const ms = Date.parse(dto.presenceDeadlineAt!) - now;
    expect(ms).toBeGreaterThan(8 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(10 * 60 * 1000);

    // blur → reverts to the long deadline.
    const blur = await post("gate_auto", "blur");
    expect(((await blur.json()) as { presenceDeadlineAt: string | null }).presenceDeadlineAt).toBeNull();

    // a wait-default gate can never arm the timer — 'present' is a no-op there.
    const noop = await post("gate_wait", "present");
    expect(((await noop.json()) as { presenceDeadlineAt: string | null }).presenceDeadlineAt).toBeNull();
    const waitRow = (
      await db.pg.query("select presence_deadline_at from gates where id = 'gate_wait'")
    ).rows[0] as { presence_deadline_at: Date | null };
    expect(waitRow.presence_deadline_at).toBeNull();

    // bad activity value → 422; a gate of another project → 404.
    expect((await post("gate_auto", "nope")).status).toBe(422);
    expect((await post("gate_elsewhere", "present")).status).toBe(404);
  });

  it("approve_triage merges user rows over the agent's ledger into the response-ledger overlay (AC2/AC3)", async () => {
    await seedReview([
      { id: "f_1", ordinal: 1, title: "first" },
      { id: "f_2", ordinal: 2, title: "second" },
    ]);
    // the agent-proposed ledger the gate's artifact carries (the .md artifact + its .json twin).
    const agentLedger = {
      sidecar: "response_ledger",
      version: 1,
      entries: [
        { findingOrdinal: 1, disposition: { kind: "accept", status: "proposed" } },
        { findingOrdinal: 2, disposition: { kind: "defer", status: "proposed" } },
      ],
    };
    const jsonSha = sha256Hex(JSON.stringify(agentLedger));
    await store.put(seed.workspaceId, jsonSha, Buffer.from(JSON.stringify(agentLedger), "utf8"));
    const mdSha = sha256Hex("# ledger");
    await store.put(seed.workspaceId, mdSha, Buffer.from("# ledger", "utf8"));

    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_rl',$1,$2,'response_ledger','reviews','reviews/1/response-ledger.md')`,
        [seed.workspaceId, seed.projectId],
      );
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_rl_md','art_rl',1,$1,'k',9,'text/markdown','{"kind":"agent"}')`,
        [mdSha],
      );
      await tx.query("update artifacts set head_version_id = 'av_rl_md' where id = 'art_rl'");
      await tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_rl_json',$1,$2,'sidecar','reviews','reviews/1/response-ledger.json')`,
        [seed.workspaceId, seed.projectId],
      );
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_rl_json','art_rl_json',1,$1,'k',9,'application/json','{"kind":"agent"}')`,
        [jsonSha],
      );
      await tx.query("update artifacts set head_version_id = 'av_rl_json' where id = 'art_rl_json'");
    });

    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, {
      gateId: "gate_t",
      runId: "run_t",
      kind: "approve_triage",
      onExpiry: "wait",
      artifactVersionId: "av_rl_md",
    });

    // the human overrides f_2's proposal before approving.
    await postDisposition("f_2", { kind: "rebut", rationale: "the stat is fine", reasonCode: "wrong" });

    // the card's read model shows the merged ledger (the user's row wins).
    const { gates } = (await (await app.request(`/projects/${seed.projectId}/gates`)).json()) as {
      gates: { triage?: { rows: { ordinal: number; disposition?: { kind: string; actor?: string } }[] } }[];
    };
    const rows = gates[0]!.triage!.rows;
    const f2 = rows.find((r) => r.ordinal === 2)!;
    expect(f2.disposition).toMatchObject({ kind: "rebut", rationale: "the stat is fine", actor: "user" });

    const res = await app.request(`/projects/${seed.projectId}/gates/gate_t/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resolved: boolean; overlayVersionIds: string[] };
    expect(body.resolved).toBe(true);
    expect(body.overlayVersionIds).toHaveLength(2); // the .md twin + the .json twin

    // the overlay .json — the file Revise reads — carries the user's row with actor: "user".
    const head = (
      await db.pg.query(
        `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.mirror_path = 'reviews/1/response-ledger.json'`,
      )
    ).rows[0] as { content_sha256: string };
    const bytes = await store.get(head.content_sha256);
    const overlay = JSON.parse(Buffer.from(bytes!).toString("utf8")) as typeof agentLedger;
    const overridden = overlay.entries.find((e) => e.findingOrdinal === 2)!;
    expect(overridden.disposition).toMatchObject({ kind: "rebut", rationale: "the stat is fine", actor: "user" });
    // the agent's untouched row survives.
    expect(overlay.entries.find((e) => e.findingOrdinal === 1)!.disposition.kind).toBe("accept");

    // the Decision row records the overlay ids + the change count (§6.4 item 6).
    const decision = await readDecision(db, "gate_t");
    expect(decision?.action).toBe("approve");
    expect(decision?.overlay_version_ids).toHaveLength(2);
  });
});

describe("PUT /projects/:id/approval-overrides — the per-project 24-h opt-in (§6.4 R3)", () => {
  it("persists a schema-valid override and rejects the REQ-SPEC-1-illegal ones", async () => {
    // the 24-h approve_triage opt-in: a wait-default kind may ADD a ≥2 h deadline → proceed_as_proposed.
    const put = await app.request(`/projects/${seed.projectId}/approval-overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides: { approve_triage: 24 * 3600_000 } }),
    });
    expect(put.status).toBe(200);
    const row = (
      await db.pg.query("select approval_overrides from projects where id = $1", [seed.projectId])
    ).rows[0] as { approval_overrides: Record<string, number> };
    expect(row.approval_overrides).toEqual({ approve_triage: 24 * 3600_000 });

    const get = await app.request(`/projects/${seed.projectId}/approval-overrides`);
    expect(((await get.json()) as { overrides: Record<string, number> }).overrides.approve_triage).toBe(24 * 3600_000);

    // under that override the policy resolution proceeds as proposed (the opt-in's whole point).
    const { resolveGatePolicy } = await import("@rhema/orchestrator");
    const r = resolveGatePolicy("approve_triage", {
      policy: "named",
      overrides: row.approval_overrides,
      now: new Date("2026-09-16T12:00:00Z"),
    });
    expect(r).toMatchObject({ action: "open", onExpiry: "proceed_as_proposed" });

    // spend/refusal kinds can never take an override; a sub-2 h add is illegal (REQ-SPEC-1).
    for (const overrides of [
      { confirm_cost: 24 * 3600_000 },
      { approve_triage: 30 * 60_000 },
    ]) {
      const bad = await app.request(`/projects/${seed.projectId}/approval-overrides`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      expect(bad.status).toBe(422);
    }
  });
});

describe("GET /projects/:id/pretriage — the Revise sheet's 'you pre-triaged N of M'", () => {
  it("reports the decided count + the user ledger rows a Revise run seeds (REQ-IDE-28)", async () => {
    await seedReview([
      { id: "f_1", ordinal: 1 },
      { id: "f_2", ordinal: 2 },
      { id: "f_3", ordinal: 3 },
    ]);
    await postDisposition("f_2", { kind: "accept" });
    await postDisposition("f_3", { kind: "escalate", rationale: "call me" });

    const res = await app.request(`/projects/${seed.projectId}/pretriage`);
    const pre = (await res.json()) as {
      correspondenceId: string;
      triaged: number;
      total: number;
      entries: { findingOrdinal: number; disposition: { kind: string; actor?: string } }[];
    };
    expect(pre).toMatchObject({ correspondenceId: CORR, triaged: 2, total: 3 });
    expect(pre.entries.map((e) => e.findingOrdinal)).toEqual([2, 3]);
    expect(pre.entries.every((e) => e.disposition.actor === "user")).toBe(true);
  });
});
