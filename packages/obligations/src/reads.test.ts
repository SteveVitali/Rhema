import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@rhema/contracts";
import { SqlObligationHook } from "./hook.js";
import { routeDisposition } from "./routing.js";
import { dischargeByHand, mootObligation } from "./discharge.js";
import {
  exportDialogObligations,
  findingObligationState,
  obligationStatesForCorrespondence,
  obligationSummary,
  renderObligationState,
  runSheetObligations,
} from "./reads.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// REQ-OBJ-6 (data/API half): the read APIs the beta surfaces consume — version-rail chip counts, per-finding
// obligation state, run-sheet scope lines, export-dialog counts. Deterministic projections of the rows.

const USER: Actor = { kind: "user", userId: "usr_mirror" } as Actor;

describe("read APIs (REQ-OBJ-6)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(8000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  it("renderObligationState maps mooted → discharged_pending and by-hand → discharged_unverified", () => {
    expect(renderObligationState({ state: "open", dischargedBy: null })).toBe("open");
    expect(renderObligationState({ state: "mooted", dischargedBy: null })).toBe("discharged_pending");
    expect(renderObligationState({ state: "discharged", dischargedBy: { draftId: "d", verifiedBy: "user" } })).toBe("discharged_unverified");
    expect(renderObligationState({ state: "discharged", dischargedBy: { draftId: "d", verifiedBy: "gap_check" } })).toBe("discharged");
  });

  it("obligationSummary counts open/addressed and the version-rail blocking-major chip", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const { findingIds } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r1",
      findings: [
        { ordinal: 1, severity: "blocking", quote: "a", url: "ua" },
        { ordinal: 2, severity: "major", quote: "b", url: "ub" },
        { ordinal: 3, severity: "major", quote: "c", url: "uc" },
      ],
    });
    // address the first major.
    const majorId = hook.lastOutcome!.spawned[1]!;
    await routeDisposition(db.exec, deps, { obligationId: majorId, kind: "accept", status: "done", draftId, byActor: USER });

    const summary = await obligationSummary(db.exec, projectId);
    expect(summary.open).toBe(2); // blocking + one major still open
    expect(summary.addressed).toBe(1);
    expect(summary.blockingOpen).toBe(1);
    expect(summary.blockingMajorOpen).toBe(2);
    expect(summary.blockingMajorAddressed).toBe(1);
    expect(findingIds.length).toBe(3);
  });

  it("findingObligationState + the batch map return each finding's chip", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const { correspondenceId, findingIds } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r1", findings: [{ ordinal: 1, severity: "blocking", quote: "a", url: "ua" }],
    });
    const single = await findingObligationState(db.exec, findingIds[0]!);
    expect(single).toMatchObject({ state: "open", severity: "blocking", roundsOpen: 1, rendered: "open" });
    const batch = await obligationStatesForCorrespondence(db.exec, correspondenceId);
    expect(batch.get(findingIds[0]!)?.state).toBe("open");
    // a finding that spawned no obligation → null.
    const { findingIds: minorIds } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r2", ordinal: 2, findings: [{ ordinal: 9, severity: "note" }],
    });
    expect(await findingObligationState(db.exec, minorIds[0]!)).toBeNull();
  });

  it("run-sheet scope lines + export-dialog counts read open obligations (§5.6/§11.7)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r1",
      findings: [
        { ordinal: 1, severity: "blocking", quote: "a", url: "ua" },
        { ordinal: 2, severity: "blocking", quote: "b", url: "ub" },
        { ordinal: 3, severity: "major", quote: "c", url: "uc" },
      ],
    });
    const sheet = await runSheetObligations(db.exec, projectId);
    expect(sheet.open.length).toBe(3);
    expect(sheet.reviewScopeLine).toBe("3 open obligations will be checked");
    expect(sheet.reviseScopeLine).toBe("this run addresses 3 open obligations");
    // blocking/major first in the list.
    expect(sheet.open[0]!.severity).toBe("blocking");

    const exp = await exportDialogObligations(db.exec, projectId);
    expect(exp.blockingOpen).toBe(2);
    expect(exp.line).toBe("2 blocking obligations open");
  });

  it("a mooted obligation renders as discharged-pending in the finding chip", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const { correspondenceId } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "r1", findings: [{ ordinal: 1, severity: "major", quote: "a", url: "ua" }],
    });
    const oblId = hook.lastOutcome!.spawned[0]!;
    await mootObligation(db.exec, deps, { obligationId: oblId, byActor: USER });
    const batch = await obligationStatesForCorrespondence(db.exec, correspondenceId);
    expect([...batch.values()][0]!.rendered).toBe("discharged_pending");
    // a by-hand discharge renders unverified.
    const hook2 = new SqlObligationHook({ ...deps });
    const d2 = await deliverReviewViaHook(db.exec, hook2, { projectId, draftId, runId: "r2", ordinal: 2, findings: [{ ordinal: 1, severity: "major", quote: "z", url: "uz" }] });
    const id2 = hook2.lastOutcome!.spawned[0]!;
    await dischargeByHand(db.exec, deps, { obligationId: id2, note: "n", draftId, byActor: USER });
    const b2 = await obligationStatesForCorrespondence(db.exec, d2.correspondenceId);
    expect([...b2.values()][0]!.rendered).toBe("discharged_unverified");
  });
});
