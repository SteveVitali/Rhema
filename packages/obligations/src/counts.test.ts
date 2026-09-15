import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunEventType } from "@rhema/contracts";
import { SqlObligationHook, type ObligationEventAppender } from "./hook.js";
import { computeDeliveryCounts, reconcileCounts } from "./counts.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// AC6 (deterministic): a sidecar-count mismatch produces a delivery-validation WARNING (a check.result event),
// never a failure (REQ-WF-7). The row-computed carried/closed/new are the truth; the sidecar is the Editor's
// cross-check.

interface Captured { runId: string; type: RunEventType; payload: unknown }

function capturingAppender(): { events: Captured[]; appender: ObligationEventAppender } {
  const events: Captured[] = [];
  return {
    events,
    appender: {
      async append(_exec, ev) {
        events.push({ runId: ev.runId, type: ev.type, payload: ev.payload });
        return undefined;
      },
    },
  };
}

describe("REQ-WF-7 counts + sidecar reconciliation (AC6)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(5000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  it("reconcileCounts: absent sidecar matches; equal matches; any diff mismatches", () => {
    const computed = { carried: 1, closed: 2, new: 3 };
    expect(reconcileCounts(computed, null).match).toBe(true);
    expect(reconcileCounts(computed, { carried: 1, closed: 2, new: 3 }).match).toBe(true);
    expect(reconcileCounts(computed, { carried: 1, closed: 2, new: 4 }).match).toBe(false);
  });

  it("a mismatched sidecar tally emits a check.result warning and does NOT throw", async () => {
    const { events, appender } = capturingAppender();
    const hook = new SqlObligationHook({ ...deps, appendEvent: appender });
    // 2 blocking findings → computed {new:2, carried:0, closed:0}; the Editor's tally is wrong.
    await expect(
      deliverReviewViaHook(db.exec, hook, {
        projectId, draftId, runId: "rw",
        sidecarCounts: { carried: 9, closed: 9, new: 9 },
        findings: [{ ordinal: 1, severity: "blocking" }, { ordinal: 2, severity: "blocking" }],
      }),
    ).resolves.toBeDefined(); // delivery succeeded — a warning, not a failure
    expect(hook.lastOutcome?.counts).toEqual({ carried: 0, closed: 0, new: 2 });
    expect(hook.lastOutcome?.countsMatch).toBe(false);
    const warnings = events.filter((e) => e.type === "check.result");
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.payload).toMatchObject({ name: "obligation_counts", passed: false });
  });

  it("a matching sidecar tally emits no warning", async () => {
    const { events, appender } = capturingAppender();
    const hook = new SqlObligationHook({ ...deps, appendEvent: appender });
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "rw2",
      sidecarCounts: { carried: 0, closed: 0, new: 2 },
      findings: [{ ordinal: 1, severity: "blocking" }, { ordinal: 2, severity: "major" }],
    });
    expect(hook.lastOutcome?.countsMatch).toBe(true);
    expect(events.filter((e) => e.type === "check.result").length).toBe(0);
  });

  it("computeDeliveryCounts reads carried/closed/new from rows across a two-round sequence", async () => {
    const hook = new SqlObligationHook({ ...deps });
    // round 1: two majors (A re-raised next round, B dropped next round).
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "c1",
      findings: [{ ordinal: 1, severity: "major", quote: "qa", url: "ua" }, { ordinal: 2, severity: "major", quote: "qb", url: "ub" }],
    });
    // round 2: re-raise A (carried), drop B (closed by no-match), add a NEW major C.
    const { correspondenceId } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "c2", ordinal: 2,
      findings: [{ ordinal: 1, severity: "major", quote: "qa", url: "ua" }, { ordinal: 2, severity: "major", quote: "qc", url: "uc" }],
    });
    const counts = await computeDeliveryCounts(db.exec, { correspondenceId, runId: "c2" });
    expect(counts).toEqual({ carried: 1, closed: 1, new: 1 });
  });
});
