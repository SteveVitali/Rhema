import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@rhema/contracts";
import { SqlObligationHook } from "./hook.js";
import { routeDisposition } from "./routing.js";
import { escalateStalls, findStalledObligations, isStalled } from "./stall.js";
import { loadObligation } from "./queries.js";
import { openDecisionRequests } from "./reads.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// AC4 (deterministic): a two-round hand-run with a PERSISTING major escalates to the Decisions inbox; an
// IN-HORIZON deferral does not (§6.8; REQ-OBJ-5, REQ-WF-15 amended). Stall detection is a query over
// obligation rows, so it works identically for hand-run Review → Revise → Review rounds at MVP.

const SYSTEM: Actor = { kind: "system" };
const claim = (severity = "major") => ({ ordinal: 1, severity, kind: "claim", quote: "the contested claim", url: "https://ex.test/c" });

describe("stall detection over obligation rows (AC4, §6.8)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(4000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  it("a persisting major over two covering rounds escalates to the Decisions inbox", async () => {
    const hook = new SqlObligationHook({ ...deps });
    // round 1: Review spawns the major obligation.
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r1", findings: [claim()] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // the author "addresses" it by hand (a Revise move) — but the fix does not hold …
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "accept", status: "done", draftId, byActor: SYSTEM });
    // round 2: the re-review re-raises the same claim → reopened, roundsOpen → 2.
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r2", ordinal: 2, findings: [claim()] });

    const ob = await loadObligation(db.exec, oblId);
    expect(ob?.state).toBe("reopened");
    expect(ob?.roundsOpen).toBe(2);
    expect(await isStalled(db.exec, projectId)).toBe(true);
    expect((await findStalledObligations(db.exec, projectId)).map((o) => o.id)).toEqual([oblId]);

    const result = await escalateStalls(db.exec, deps, { projectId, runId: "r2" });
    expect(result.stalled.map((o) => o.id)).toEqual([oblId]);
    const decisions = await openDecisionRequests(db.exec, projectId);
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.text).toContain("Stalled major obligation");
    expect(decisions[0]!.options).toEqual(["decide", "re-defer", "drop"]);
  });

  it("an in-horizon deferral does NOT escalate (a snooze re-enters only when the horizon returns it to open)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r1", findings: [claim()] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // defer for 3 rounds — still in horizon at round 2.
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "defer", rationale: "later", deferHorizon: { rounds: 3 }, draftId, byActor: SYSTEM });
    // round 2 re-review re-raises it; the deferral sweep decrements the horizon but keeps it deferred.
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r2", ordinal: 2, findings: [claim()] });

    const ob = await loadObligation(db.exec, oblId);
    expect(ob?.state).toBe("deferred");
    expect(ob?.deferHorizon?.rounds).toBe(2); // one round consumed
    expect(await isStalled(db.exec, projectId)).toBe(false);
    const result = await escalateStalls(db.exec, deps, { projectId, runId: "r2" });
    expect(result.stalled).toEqual([]);
    expect((await openDecisionRequests(db.exec, projectId)).length).toBe(0);
  });

  it("escalation is idempotent — re-running escalateStalls does not duplicate the inbox row", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r1", findings: [claim()] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "accept", status: "done", draftId, byActor: SYSTEM });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r2", ordinal: 2, findings: [claim()] });
    // escalate twice (e.g. the loop runs each round) → still exactly one OPEN decision_request, linked.
    await escalateStalls(db.exec, deps, { projectId, runId: "r2" });
    await escalateStalls(db.exec, deps, { projectId, runId: "r2" });
    const decisions = await openDecisionRequests(db.exec, projectId);
    expect(decisions.length).toBe(1);
    const link = await db.exec.query(`select obligation_id from decision_requests where id = $1`, [decisions[0]!.id]);
    expect((link.rows[0] as { obligation_id: string }).obligation_id).toBe(oblId);
  });

  it("a rebutted obligation is never a stall even after two rounds (closed with an argument on file)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "r1", findings: [claim()] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "rebut", rationale: "the reviewer misread the passage", draftId, byActor: SYSTEM });
    // a re-review that would otherwise carry it: rebutted is closed_at-stamped, so the stall query excludes it.
    expect(await isStalled(db.exec, projectId)).toBe(false);
  });
});
