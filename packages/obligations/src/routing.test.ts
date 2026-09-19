import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@rhema/contracts";
import { routeDisposition, createDecisionRequest } from "./routing.js";
import { dischargeByHand, mootObligation, returnDeferredToOpen, sweepArrivedDeferrals } from "./discharge.js";
import { spawnObligationFromFinding } from "./spawn.js";
import { loadObligation } from "./queries.js";
import { openDecisionRequests } from "./reads.js";
import { ObligationTransitionError } from "./state-machine.js";
import {
  createObligationTestDb,
  InMemoryContentStore,
  seedCorrespondence,
  seedFinding,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// REQ-OBJ-3 routing + discharge paths (deliverable 2): rebut/defer/escalate/address, by-hand discharge, moot,
// and the deferral horizon returning to open.

const USER: Actor = { kind: "user", userId: "usr_mirror" } as Actor;

describe("disposition routing + discharge (REQ-OBJ-3)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  let correspondenceId: string;
  let ord = 0;
  const deps = testDeps(7000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
    correspondenceId = await seedCorrespondence(db.exec, { projectId, draftId, runId: "run_rt" });
    ord = 0;
  });
  afterEach(() => db.close());

  async function openObligation(severity = "major"): Promise<string> {
    const findingId = await seedFinding(db.exec, { correspondenceId, draftId, ordinal: ++ord, severity });
    return spawnObligationFromFinding(db.exec, deps, { projectId, findingId, severity: severity as "major", kind: "claim", title: `F${ord}`, correspondenceId, draftId });
  }

  it("rebut closes with the rationale copied onto the row (DB-checked); no rationale raises", async () => {
    const id = await openObligation();
    await expect(routeDisposition(db.exec, deps, { obligationId: id, kind: "rebut", draftId, byActor: USER })).rejects.toBeInstanceOf(ObligationTransitionError);
    await routeDisposition(db.exec, deps, { obligationId: id, kind: "rebut", rationale: "the reviewer misread §II", draftId, byActor: USER });
    const ob = await loadObligation(db.exec, id);
    expect(ob?.state).toBe("rebutted");
    expect(ob?.rationale).toBe("the reviewer misread §II");
    expect(ob?.closedAt).not.toBeNull();
  });

  it("defer parks with a horizon; the rationale defaults to 'Not this round'", async () => {
    const id = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: id, kind: "defer", deferHorizon: { rounds: 2 }, draftId, byActor: USER });
    const ob = await loadObligation(db.exec, id);
    expect(ob?.state).toBe("deferred");
    expect(ob?.deferHorizon).toEqual({ rounds: 2 });
    expect(ob?.rationale).toBe("Not this round");
  });

  it("accept/adapt addresses only once the move is made (status done/verified)", async () => {
    const id = await openObligation();
    const pre = await routeDisposition(db.exec, deps, { obligationId: id, kind: "accept", status: "proposed", draftId, byActor: USER });
    expect(pre.transitioned).toBe(false);
    expect((await loadObligation(db.exec, id))?.state).toBe("open"); // pre-triage: still open

    const made = await routeDisposition(db.exec, deps, { obligationId: id, kind: "adapt", status: "done", moveOrdinal: 3, draftId, byActor: USER });
    expect(made).toEqual({ transitioned: true, to: "addressed" });
    expect((await loadObligation(db.exec, id))?.state).toBe("addressed");
  });

  it("escalate keeps the obligation open and links a decision_request (§5.11)", async () => {
    const id = await openObligation();
    const res = await routeDisposition(db.exec, deps, { obligationId: id, kind: "escalate", runId: "run_rt", draftId, byActor: USER });
    expect(res.decisionRequestId).toBeDefined();
    expect((await loadObligation(db.exec, id))?.state).toBe("open"); // stays open
    const decisions = await openDecisionRequests(db.exec, projectId);
    expect(decisions.map((d) => d.id)).toContain(res.decisionRequestId);
  });

  it("by-hand discharge requires a note and renders unverified (verifiedBy 'user')", async () => {
    const id = await openObligation();
    await expect(dischargeByHand(db.exec, deps, { obligationId: id, note: "  ", draftId, byActor: USER })).rejects.toBeInstanceOf(ObligationTransitionError);
    await dischargeByHand(db.exec, deps, { obligationId: id, note: "handled offline", draftId, byActor: USER });
    const ob = await loadObligation(db.exec, id);
    expect(ob?.state).toBe("discharged");
    expect(ob?.dischargedBy?.verifiedBy).toBe("user");
    expect(ob?.rationale).toBe("handled offline");
  });

  it("moot applies to a live obligation in any active state (REQ-DATA-26)", async () => {
    // an addressed obligation whose quote no longer resolves after a human revision can be mooted.
    const addressed = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: addressed, kind: "accept", status: "done", draftId, byActor: USER });
    await mootObligation(db.exec, deps, { obligationId: addressed, byActor: USER });
    expect((await loadObligation(db.exec, addressed))?.state).toBe("mooted");
    // a deferred one too.
    const deferred = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: deferred, kind: "defer", deferHorizon: { rounds: 2 }, draftId, byActor: USER });
    await mootObligation(db.exec, deps, { obligationId: deferred, byActor: USER });
    expect((await loadObligation(db.exec, deferred))?.state).toBe("mooted");
  });

  it("moot closes it; the horizon returns a deferral to open (a snooze, not a burial)", async () => {
    const mooted = await openObligation();
    await mootObligation(db.exec, deps, { obligationId: mooted, byActor: USER });
    expect((await loadObligation(db.exec, mooted))?.state).toBe("mooted");

    const deferred = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: deferred, kind: "defer", deferHorizon: { until: "pre_export" }, draftId, byActor: USER });
    // an unrelated review sweep does NOT return a pre_export deferral …
    expect(await sweepArrivedDeferrals(db.exec, deps, { projectId, context: "review" })).not.toContain(deferred);
    expect((await loadObligation(db.exec, deferred))?.state).toBe("deferred");
    // … but the export dialog's sweep does.
    const returned = await sweepArrivedDeferrals(db.exec, deps, { projectId, context: "pre_export" });
    expect(returned).toContain(deferred);
    const ob = await loadObligation(db.exec, deferred);
    expect(ob?.state).toBe("open");
    expect(ob?.deferHorizon).toBeNull(); // cleared on return
  });

  it("PRB.19 (live F33): a same-target re-route is an idempotent no-op, not a closed-world error", async () => {
    // live: a pretriage `rebut` routed at record-time, then the frozen response ledger folded at delivery
    // re-routed the SAME disposition → `rebutted → rebutted` threw inside the delivery tx and wedged the run
    // in `finalizing` (prod 01M2VDHN…). Same-target must be a no-op; a different target still rejects.
    const rebutted = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: rebutted, kind: "rebut", rationale: "misread", draftId, byActor: USER });
    const again = await routeDisposition(db.exec, deps, { obligationId: rebutted, kind: "rebut", rationale: "misread", draftId, byActor: USER });
    expect(again).toEqual({ transitioned: false, to: "rebutted" });
    expect((await loadObligation(db.exec, rebutted))?.state).toBe("rebutted");
    // a DIFFERENT target on the closed row still rejects (closed world preserved).
    await expect(
      routeDisposition(db.exec, deps, { obligationId: rebutted, kind: "defer", rationale: "later", draftId, byActor: USER }),
    ).rejects.toBeInstanceOf(ObligationTransitionError);

    const deferred = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: deferred, kind: "defer", rationale: "next round", draftId, byActor: USER });
    const deferAgain = await routeDisposition(db.exec, deps, { obligationId: deferred, kind: "defer", rationale: "next round", draftId, byActor: USER });
    expect(deferAgain).toEqual({ transitioned: false, to: "deferred" });

    const addressed = await openObligation();
    await routeDisposition(db.exec, deps, { obligationId: addressed, kind: "accept", status: "done", draftId, byActor: USER });
    const addrAgain = await routeDisposition(db.exec, deps, { obligationId: addressed, kind: "adapt", status: "done", draftId, byActor: USER });
    expect(addrAgain).toEqual({ transitioned: false, to: "addressed" });
  });

  it("returnDeferredToOpen refuses a non-deferred obligation (closed world)", async () => {
    const id = await openObligation();
    await expect(returnDeferredToOpen(db.exec, deps, { obligationId: id, byActor: USER })).rejects.toBeInstanceOf(ObligationTransitionError);
  });

  it("createDecisionRequest defaults its text + options from the obligation", async () => {
    const id = await openObligation();
    const drId = await createDecisionRequest(db.exec, deps, { obligationId: id });
    const decisions = await openDecisionRequests(db.exec, projectId);
    const dr = decisions.find((d) => d.id === drId);
    expect(dr?.options).toEqual(["decide", "dismiss"]);
    expect(dr?.text).toContain("Escalated obligation");
  });
});
