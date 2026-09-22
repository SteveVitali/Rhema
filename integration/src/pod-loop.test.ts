// The pod→server commit/deliver loop, driven END-TO-END through the REAL api internal routes + PGlite (P0.15e;
// D-P0.15d-4). Unlike the FakeEngine harness unit tests (apps/run-task/harness-loop.test.ts, in-process client),
// this composes `runCommitLoop` against the actual `createRunRoutes` HTTP surface — runspec → harvest (persist)
// → commit (advance/gate/finalize) → deliver — so the new routes + the loop are proven together over real DB
// rows. The agent phase is a scripted `/work` output bundle (no SDK); the run token authorizes every call.

import { describe, it, expect } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps } from "@rhema/orchestrator/testing";
import { rateTableCreditRenderer } from "@rhema/orchestrator";
import { createRunRoutes, type Principal } from "@rhema/api";
import { InMemoryContentStore, sha256Hex, type NewVersion } from "@rhema/mirror";
import { RUBRIC_DIMENSIONS } from "@rhema/contracts";
import { emptyUsage } from "@rhema/engine";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import {
  runCommitLoop,
  type HarnessApiClient,
  type HarvestCall,
  type CommitCall,
  type FailCall,
  type PhaseRunOutputs,
} from "@rhema/run-task";
import { assessPhase0ExitForRun } from "./harness.js";

const review = WORKFLOW_MANIFESTS.review!;

/** Adapt the real api HTTP routes to the loop's `HarnessApiClient` (token-authed, versions base64 on the wire). */
function makeApiLoopClient(api: ReturnType<typeof createRunRoutes>, runId: string, token: string): HarnessApiClient {
  const authed = (h: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...h });
  const url = (p: string) => `/internal/runs/${runId}${p}`;
  const post = async (p: string, body: unknown) => {
    const res = await api.request(url(p), { method: "POST", headers: authed({ "content-type": "application/json" }), body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const wire = (v: NewVersion) => ({ path: v.path, root: v.root, kind: v.kind, namespace: v.namespace, sha256: v.sha256, bytesB64: Buffer.from(v.bytes).toString("base64"), wordCount: v.wordCount });
  return {
    async fetchRunSpec() {
      const res = await api.request(url("/runspec"), { headers: authed() });
      if (!res.ok) throw new Error(`runspec ${res.status}`);
      return (await res.json()) as Awaited<ReturnType<HarnessApiClient["fetchRunSpec"]>>;
    },
    async harvest(a: HarvestCall) {
      const { json } = await post(`/steps/${a.stepKey}/harvest`, { ordinal: a.ordinal, seat: a.seat, projectId: a.projectId ?? null, versions: a.versions.map(wire), usage: a.usage });
      return { producedVersionIds: (json.producedVersionIds as string[]) ?? [], byPath: (json.byPath as Record<string, string>) ?? {}, provisionalCredits: (json.provisionalCredits as number) ?? 0 };
    },
    async commit(a: CommitCall) {
      const { json } = await post(`/steps/${a.stepKey}/commit`, { ordinal: a.ordinal, of: a.of, producedVersionIds: a.producedVersionIds, credits: a.credits, result: a.result, next: a.next });
      return { ok: json.ok === true, state: json.state as string | undefined };
    },
    async failStep(a: FailCall) {
      await post(`/steps/${a.stepKey}/fail`, { ordinal: a.ordinal, errorClass: a.errorClass, reason: a.reason });
    },
    async deliver(a) {
      const { json } = await post("/deliver", { delivery: a.delivery });
      return { ok: json.ok === true, state: json.state as string | undefined };
    },
    async finalize() {
      const { json } = await post("/finalize", {});
      return { ok: json.ok === true, state: json.state as string | undefined };
    },
  };
}

function version(path: string, kind: string): NewVersion {
  const bytes = Buffer.from(`# ${path}\n\nThorough content for ${path}.`);
  return { path, root: "project", kind, namespace: "editor", sha256: sha256Hex(bytes), bytes, wordCount: 6 };
}

const validRubric = { sidecar: "rubric", version: 1, dimensions: RUBRIC_DIMENSIONS.map((d) => ({ dimension: d, score: 3 })) };
const validFindings = { sidecar: "findings", version: 1, findings: [] };

async function setup() {
  const db = await createOrchestratorTestDb();
  const deps = makeDeps(db, { renderCredits: rateTableCreditRenderer });
  const seed = await seedProject(db, { draftN: 1 });
  const store = new InMemoryContentStore();
  const principal: Principal = { userId: seed.userId, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId };
  const api = createRunRoutes({ ...deps, principal: () => principal, store, contentStoreFor: () => Promise.resolve(store) });

  const createRun = async (): Promise<string> => {
    const res = await api.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
        workflow: "review",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: { draftId: seed.draftId, sidecar: true },
        draftId: seed.draftId,
      }),
    });
    const { runId } = (await res.json()) as { runId: string };
    // force the run to `running` (skip the worker provision path) so the internal routes accept the phase loop.
    await db.client.query("update runs set state='running', started_at=now() where id=$1", [runId]);
    return runId;
  };
  const token = (runId: string) => deps.tokens.mint({ runId, attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
  return { db, deps, seed, store, api, createRun, token };
}

describe("pod loop over the real api routes (P0.15e; D-P0.15d-4)", () => {
  it("runs intake, harvests + commits, and opens the approve_scope gate (the pod then exits)", async () => {
    const h = await setup();
    const runId = await h.createRun();
    const client = makeApiLoopClient(h.api, runId, h.token(runId));

    const runPhase = (): Promise<PhaseRunOutputs> =>
      Promise.resolve({
        subtype: "success",
        usage: emptyUsage(),
        phaseResult: { status: "done" },
        versions: [version("00-piece-brief.md", "brief")],
        facts: { thesisPresent: true, inventoryPresent: true },
      });

    const res = await runCommitLoop({ client, runPhase, workspaceId: h.seed.workspaceId });

    expect(res).toEqual({ kind: "gated", phasesCommitted: 1 });
    // one intake step committed, a gate opened, the produced brief persisted as an artifact version.
    const steps = await h.db.client.query("select phase, state from steps where run_id=$1", [runId]);
    expect(steps.rows).toEqual([{ phase: "intake", state: "done" }]);
    const gate = await h.db.client.query("select kind from gates where run_id=$1 and resolved_at is null", [runId]);
    expect((gate.rows[0] as { kind: string }).kind).toBe("approve_scope");
    const state = await h.db.client.query("select state from runs where id=$1", [runId]);
    expect((state.rows[0] as { state: string }).state).toBe("waiting_gate");
    const versions = await h.db.client.query("select v.id from artifact_versions v join artifacts a on a.id=v.artifact_id where a.mirror_path='00-piece-brief.md'");
    expect(versions.rows.length).toBe(1); // the harvest route persisted the brief

    await h.db.close();
  });

  it("runs the final letter phase and delivers a completed run (Phase-0 exit checks green)", async () => {
    const h = await setup();
    const runId = await h.createRun();

    // seed a promoted draft head to freeze at, and pre-commit the first six phases so the runspec returns `letter`.
    await h.db.client.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_draft',$1,$2,'draft','project','draft.md','av_draft')`,
      [h.seed.workspaceId, h.seed.projectId],
    );
    await h.db.client.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by)
       values ('av_draft','art_draft',1,'sha_draft','k/av_draft',10,3,'text/markdown','{"kind":"agent"}'::jsonb)`,
    );
    await h.db.client.query("update drafts set promoted_version_id='av_draft' where id=$1", [h.seed.draftId]);
    for (let i = 0; i < 6; i++) {
      await h.db.client.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1,now(),now(),0)`,
        [`step_${i}`, runId, review.phases[i]!.key, i],
      );
    }

    const client = makeApiLoopClient(h.api, runId, h.token(runId));
    const runPhase = (): Promise<PhaseRunOutputs> =>
      Promise.resolve({
        subtype: "success",
        usage: emptyUsage(),
        phaseResult: { status: "done" },
        versions: [version("editors-letter.md", "letter")],
        facts: { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
        delivery: {
          deliveredPaths: ["editors-letter.md"],
          sidecars: [
            { filename: "findings.json", json: validFindings },
            { filename: "rubric.json", json: validRubric },
          ],
          coversAllObligations: true,
        },
      });

    const res = await runCommitLoop({ client, runPhase, workspaceId: h.seed.workspaceId });

    expect(res.kind).toBe("delivered");
    const state = await h.db.client.query("select state from runs where id=$1", [runId]);
    expect((state.rows[0] as { state: string }).state).toBe("completed");

    // the §17 Phase-0 exit checks over the delivered run's rows (boundary/sidecar/cited⇒fetched).
    const assessment = await h.db.txRunner.run(h.seed.workspaceId, (tx) => assessPhase0ExitForRun(tx, { runId, attempt: 1 }));
    expect(assessment.delivered).toBe(true);
    expect(assessment.boundaryOk).toBe(true);
    expect(assessment.citedFetched.ok).toBe(true);
    expect(assessment.sidecars.allOk).toBe(true);

    await h.db.close();
  });
});
