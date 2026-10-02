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
import { GATE_KINDS, NEVER_AUTOPROCEED_GATES, GATE_DEFAULTS } from "@rhema/contracts";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.09 — the §6.4 approval surface's server side (AC3/AC5/AC6): the settings read/write validates
// REQ-SPEC-1's override rules (never a spend/refusal override, never shorten, ≥ 2 h to add), the
// per-run override layers over the project's, standing guidance is retirable never deleted, and the
// one-time explainers' dismissal state round-trips per user.

const HOUR = 60 * 60 * 1000;

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
const putJson = (path: string, body: Record<string, unknown>) =>
  app.request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const postJson = (path: string, body: Record<string, unknown> = {}) =>
  app.request(path, {
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

describe("GET /projects/:id/settings/approvals — the §6.4 settings read", () => {
  it("returns the policy, the twelve-kind defaults grid, and empty guidance lists", async () => {
    const res = await get(`/projects/${seed.projectId}/settings/approvals`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      policy: string;
      defaults: { kind: string; deadlineMs: number | null; overridable: boolean }[];
      standing: unknown[];
      retired: unknown[];
    };
    expect(dto.policy).toBe("named");
    expect(dto.defaults).toHaveLength(GATE_KINDS.length);
    // REQ-SPEC-1 — spend/refusal kinds render "always waits for you": never overridable.
    for (const kind of NEVER_AUTOPROCEED_GATES) {
      expect(dto.defaults.find((d) => d.kind === kind)?.overridable).toBe(false);
      expect(dto.defaults.find((d) => d.kind === kind)?.deadlineMs).toBe(GATE_DEFAULTS[kind].deadlineMs);
    }
    expect(dto.standing).toEqual([]);
    expect(dto.retired).toEqual([]);
  });

  it("404s a project outside the workspace", async () => {
    const res = await get(`/projects/prj_other/settings/approvals`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /projects/:id/settings/approvals — policy + override validation (REQ-SPEC-1; AC3)", () => {
  it("persists each of the three policies", async () => {
    for (const policy of ["named", "wait_each", "run_to_completion"]) {
      const res = await putJson(`/projects/${seed.projectId}/settings/approvals`, { policy });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { policy: string }).policy).toBe(policy);
      const row = (
        await db.pg.query(`select approval_policy from projects where id = $1`, [seed.projectId])
      ).rows[0] as { approval_policy: string };
      expect(row.approval_policy).toBe(policy);
    }
  });

  it("422s an unknown policy and an illegal override (spend kind / shorten / <2h add)", async () => {
    expect(
      (await putJson(`/projects/${seed.projectId}/settings/approvals`, { policy: "yolo" })).status,
    ).toBe(422);
    // a spend kind may never take an override — not even remove.
    for (const kind of NEVER_AUTOPROCEED_GATES) {
      expect(
        (await putJson(`/projects/${seed.projectId}/settings/approvals`, { overrides: { [kind]: null } })).status,
        kind,
      ).toBe(422);
    }
    // approve_plan's default deadline may be lengthened, never shortened.
    expect(
      (await putJson(`/projects/${seed.projectId}/settings/approvals`, { overrides: { approve_plan: 1 * HOUR } }))
        .status,
    ).toBe(422);
    // adding to a wait-default kind requires ≥ 2 h.
    expect(
      (await putJson(`/projects/${seed.projectId}/settings/approvals`, { overrides: { approve_triage: 30 * 60 * 1000 } }))
        .status,
    ).toBe(422);
    // …and the legal forms persist: add ≥ 2 h to a wait-default, lengthen a defaulted kind, remove.
    const ok = await putJson(`/projects/${seed.projectId}/settings/approvals`, {
      overrides: { approve_triage: 4 * HOUR, approve_plan: null },
    });
    expect(ok.status).toBe(200);
    const row = (
      await db.pg.query(`select approval_overrides from projects where id = $1`, [seed.projectId])
    ).rows[0] as { approval_overrides: Record<string, number | null> };
    expect(row.approval_overrides).toEqual({ approve_triage: 4 * HOUR, approve_plan: null });
  });
});

describe("PUT /projects/:id/runs/:runId/gate-overrides — the per-run layer (§6.4)", () => {
  it("persists overrides on THIS run only + sets gates_off on request", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    const res = await putJson(`/projects/${seed.projectId}/runs/run_1/gate-overrides`, {
      overrides: { approve_triage: 6 * HOUR },
      gatesOff: true,
    });
    expect(res.status).toBe(200);
    const row = (
      await db.pg.query(`select gate_overrides, gates_off from runs where id = 'run_1'`)
    ).rows[0] as { gate_overrides: Record<string, number>; gates_off: boolean };
    expect(row.gate_overrides).toEqual({ approve_triage: 6 * HOUR });
    expect(row.gates_off).toBe(true);
    // the project policy row is untouched — "this run only".
    const project = (
      await db.pg.query(`select approval_overrides from projects where id = $1`, [seed.projectId])
    ).rows[0] as { approval_overrides: unknown };
    expect(project.approval_overrides ?? {}).toEqual({});
  });

  it("422s an illegal override and 404s a run outside the project", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    expect(
      (
        await putJson(`/projects/${seed.projectId}/runs/run_1/gate-overrides`, {
          overrides: { confirm_cost: 4 * HOUR },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await putJson(`/projects/${seed.projectId}/runs/run_other/gate-overrides`, {
          overrides: { approve_triage: 6 * HOUR },
        })
      ).status,
    ).toBe(404);
  });
});

describe("standing guidance (§6.5; REQ-GATE-10) — add, list, retire; never delete", () => {
  it("POST guidance creates a standing row the settings read lists; retire moves it, never deletes", async () => {
    const created = await postJson(`/projects/${seed.projectId}/guidance`, {
      body: "Always ask before apparatus over 1,000 words.",
    });
    expect(created.status).toBe(201);
    const { guidanceId } = (await created.json()) as { guidanceId: string };

    let settings = (await (await get(`/projects/${seed.projectId}/settings/approvals`)).json()) as {
      standing: { id: string; body: string; active: boolean }[];
      retired: unknown[];
    };
    expect(settings.standing.map((g) => g.id)).toContain(guidanceId);
    expect(settings.retired).toHaveLength(0);

    const retired = await postJson(`/projects/${seed.projectId}/guidance/${guidanceId}/retire`);
    expect(retired.status).toBe(200);

    settings = (await (await get(`/projects/${seed.projectId}/settings/approvals`)).json()) as {
      standing: unknown[];
      retired: { id: string; active: boolean }[];
    };
    expect(settings.standing).toHaveLength(0);
    expect(settings.retired).toHaveLength(1);
    // the row survives — history is never deleted.
    const row = (
      await db.pg.query(`select active, standing from guidance where id = $1`, [guidanceId])
    ).rows[0] as { active: boolean; standing: boolean };
    expect(row).toEqual({ active: false, standing: true });

    // a second retire is a 404 (already inactive), not a silent re-write.
    expect((await postJson(`/projects/${seed.projectId}/guidance/${guidanceId}/retire`)).status).toBe(404);
    expect((await postJson(`/projects/${seed.projectId}/guidance/gdn_none/retire`)).status).toBe(404);
  });

  it("rejects an empty body", async () => {
    expect((await postJson(`/projects/${seed.projectId}/guidance`, { body: "   " })).status).toBe(400);
  });
});

describe("structured edits through decide (§6.4 item 4; REQ-GATE-5/6; REQ-SPEC-9) — AC3", () => {
  const MD_PATH = "agents/author/drafting/v1/02-structure-plan.md";
  const JSON_PATH = "agents/author/drafting/v1/02-structure-plan.json";
  const PLAN = {
    sidecar: "structure_plan",
    version: 1,
    spine: ["Claim one.", "Claim two.", "Claim three."],
    sections: [
      { ref: "§I", title: "Opening", targetWords: 800 },
      { ref: "§II", title: "Body", targetWords: 1400 },
    ],
  };

  async function seedPlanGate() {
    // the committed plan pair: the .md the gate's artifact points at + the .json sidecar twin the
    // server re-reads as the edit base (the client sends DELTAS only).
    const mdSha = sha256Hex("# plan");
    await store.put(seed.workspaceId, mdSha, Buffer.from("# plan", "utf8"));
    const jsonSha = sha256Hex(JSON.stringify(PLAN));
    await store.put(seed.workspaceId, jsonSha, Buffer.from(JSON.stringify(PLAN), "utf8"));
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_plan',$1,$2,'structure_plan','agent:author',$3)`,
        [seed.workspaceId, seed.projectId, MD_PATH],
      );
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_plan_md','art_plan',1,$1,'k',6,'text/markdown','{"kind":"agent"}')`,
        [mdSha],
      );
      await tx.query("update artifacts set head_version_id = 'av_plan_md' where id = 'art_plan'");
      await tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_plan_json',$1,$2,'sidecar','agent:author',$3)`,
        [seed.workspaceId, seed.projectId, JSON_PATH],
      );
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_plan_json','art_plan_json',1,$1,'k',9,'application/json','{"kind":"agent"}')`,
        [jsonSha],
      );
      await tx.query("update artifacts set head_version_id = 'av_plan_json' where id = 'art_plan_json'");
    });
    await seedRun(db, {
      runId: "run_plan",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "waiting_gate",
    });
    await seedGate(db, {
      gateId: "gate_plan",
      runId: "run_plan",
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: new Date("2026-09-18T12:00:00Z"),
      artifactVersionId: "av_plan_md",
    });
  }

  it("deltas apply server-side → overlay versions, Guidance{gate_edit}, 'with N changes' on the Decision", async () => {
    await seedPlanGate();
    const res = await app.request(`/projects/${seed.projectId}/gates/gate_plan/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        edits: {
          spine: [{ index: 0, order: 2 }, { index: 1, strike: true, note: "redundant" }],
          newClaims: [{ text: "Costs follow attention.", note: "user added" }],
          sections: [{ index: 0, targetWords: 900 }],
          note: "trimmed the middle",
        },
        standingRule: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resolved: boolean; overlayVersionIds: string[]; guidanceId: string };
    expect(body.resolved).toBe(true);
    expect(body.overlayVersionIds).toHaveLength(2); // the .md + .json twins

    // the Decision records the change count + the overlay ids ("approved … with N changes" reads off this).
    const decision = await readDecision(db, "gate_plan");
    expect(decision?.action).toBe("approve");
    expect(decision?.overlay_version_ids).toEqual(body.overlayVersionIds);
    const drow = (
      await db.pg.query(`select changes, standing_rule from decisions where gate_id = 'gate_plan'`)
    ).rows[0] as { changes: number; standing_rule: boolean };
    // strike (1) + the struck claim's note (1) + reorder (1) + new claim (1) + section target-words (1) = 5.
    expect(drow.changes).toBe(5);
    expect(drow.standing_rule).toBe(true);

    // Guidance{source:'gate_edit'} — standing because the card's "remember this" box was checked.
    const guidance = (
      await db.pg.query(
        `select source, body, standing, active from guidance where project_id = $1`,
        [seed.projectId],
      )
    ).rows as { source: string; body: string; standing: boolean; active: boolean }[];
    expect(guidance).toHaveLength(1);
    expect(guidance[0]).toMatchObject({ source: "gate_edit", standing: true, active: true });
    expect(guidance[0]!.body).toContain("trimmed the middle");
    expect(guidance[0]!.body).toContain("struck");

    // the overlay .json IS the post-edit document — strike removed, reorder applied, claim appended.
    const head = (
      await db.pg.query(
        `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.mirror_path = $1`,
        [JSON_PATH],
      )
    ).rows[0] as { content_sha256: string };
    const bytes = await store.get(head.content_sha256);
    const overlay = JSON.parse(Buffer.from(bytes!).toString("utf8")) as typeof PLAN;
    expect(overlay.spine).toEqual(["Claim three.", "Claim one.", "Costs follow attention."]);
    expect(overlay.sections[0]!.targetWords).toBe(900);
  });

  it("a policy change leaves an OPEN gate's deadline untouched (REQ-GATE-3; AC5)", async () => {
    await seedPlanGate();
    const before = (
      await db.pg.query(`select deadline_at from gates where id = 'gate_plan'`)
    ).rows[0] as { deadline_at: Date };
    const res = await putJson(`/projects/${seed.projectId}/settings/approvals`, {
      policy: "wait_each",
      overrides: { approve_plan: 96 * HOUR },
    });
    expect(res.status).toBe(200);
    const after = (
      await db.pg.query(`select deadline_at from gates where id = 'gate_plan'`)
    ).rows[0] as { deadline_at: Date };
    expect(after.deadline_at?.toISOString()).toBe(before.deadline_at?.toISOString());
  });
});

describe("the one-time explainers (§5.11/§6.4) — per-user dismissal state", () => {
  it("GET returns [] then the dismissed names; dismiss is idempotent", async () => {
    expect(((await (await get(`/settings/explainers`)).json()) as { dismissed: string[] }).dismissed).toEqual([]);
    expect((await postJson(`/settings/explainers/approvals/dismiss`)).status).toBe(200);
    expect((await postJson(`/settings/explainers/approvals/dismiss`)).status).toBe(200); // idempotent
    const dto = (await (await get(`/settings/explainers`)).json()) as { dismissed: string[] };
    expect(dto.dismissed).toEqual(["approvals"]);
    // another user's state is untouched — the column is per-user.
    const other = (
      await db.pg.query(`select dismissed_explainers from "user" where id = $1`, [seed.userId])
    ).rows[0] as { dismissed_explainers: string[] };
    expect(other.dismissed_explainers).toEqual(["approvals"]);
  });

  it("422s a name outside the explainer grammar", async () => {
    expect((await postJson(`/settings/explainers/Bad-Name!/dismiss`)).status).toBe(422);
  });
});
