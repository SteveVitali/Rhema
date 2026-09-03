import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@rhema/contracts";
import { matchFinding, quoteOverlap, type CandidateFinding } from "./lineage.js";
import type { LineageFinding } from "./queries.js";
import { SqlObligationHook } from "./hook.js";
import { routeDisposition } from "./routing.js";
import { dischargeByGapCheck } from "./discharge.js";
import { loadObligation } from "./queries.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// REQ-OBJ-4: the three lineage matchers (claim identity · Editor declaration · anchor overlap), first hit wins.
// AC3 (deterministic): a re-review matching a new finding onto a discharged lineage yields `reopened` +
// roundsOpen increment (the planted-regression fixture).

const SYSTEM: Actor = { kind: "system" };
const lf = (o: Partial<LineageFinding> & { obligationId: string }): LineageFinding => ({
  findingId: "f", relation: "root", kind: "claim", anchor: null, normalizedUrl: null, ...o,
});

describe("lineage matchers (pure) — REQ-OBJ-4", () => {
  it("matcher 1: claim identity (normalized_url + quote)", () => {
    const lineage = [lf({ obligationId: "obl_A", normalizedUrl: "https://gov.uk/g", anchor: { quote: "the 2019 guidance" } })];
    const c: CandidateFinding = { findingId: "n", kind: "claim", quote: "the 2019 guidance", normalizedUrl: "https://gov.uk/g", carriesObligationId: null };
    expect(matchFinding(c, lineage, new Set(["obl_A"]))).toEqual({ obligationId: "obl_A", matcher: 1 });
  });

  it("matcher 1 needs BOTH url and quote to agree (url alone does not match)", () => {
    const lineage = [lf({ obligationId: "obl_A", normalizedUrl: "https://gov.uk/g", anchor: { quote: "the 2019 guidance" } })];
    const c: CandidateFinding = { findingId: "n", kind: "claim", quote: "a different quote", normalizedUrl: "https://gov.uk/g", carriesObligationId: null };
    expect(matchFinding(c, lineage, new Set(["obl_A"]))).toBeNull();
  });

  it("matcher 2: the Editor's carriesObligationId declaration, when it names a project obligation", () => {
    const c: CandidateFinding = { findingId: "n", kind: "claim", quote: null, normalizedUrl: null, carriesObligationId: "obl_B" };
    expect(matchFinding(c, [], new Set(["obl_B"]))).toEqual({ obligationId: "obl_B", matcher: 2 });
    // a declaration naming an unknown obligation does not match.
    expect(matchFinding(c, [], new Set(["obl_other"]))).toBeNull();
  });

  it("matcher order: claim identity (1) wins over a declaration (2)", () => {
    const lineage = [lf({ obligationId: "obl_A", normalizedUrl: "u", anchor: { quote: "q" } })];
    const c: CandidateFinding = { findingId: "n", kind: "claim", quote: "q", normalizedUrl: "u", carriesObligationId: "obl_B" };
    expect(matchFinding(c, lineage, new Set(["obl_A", "obl_B"]))).toEqual({ obligationId: "obl_A", matcher: 1 });
  });

  it("matcher 3 (anchor overlap) is OFF by default and ON only when enabled, above the floor + same kind", () => {
    const lineage = [lf({ obligationId: "obl_A", kind: "argument", anchor: { quote: "the state does not merely watch it adjudicates" } })];
    const c: CandidateFinding = { findingId: "n", kind: "argument", quote: "the state does not merely watch but adjudicates", normalizedUrl: null, carriesObligationId: null };
    expect(matchFinding(c, lineage, new Set(["obl_A"]))).toBeNull(); // default off
    expect(matchFinding(c, lineage, new Set(["obl_A"]), { anchorOverlapMatcher: true, anchorOverlapFloor: 0.5 })).toEqual({ obligationId: "obl_A", matcher: 3 });
    // a different kind never overlaps even above the floor.
    const cWrongKind = { ...c, kind: "claim" };
    expect(matchFinding(cWrongKind, lineage, new Set(["obl_A"]), { anchorOverlapMatcher: true, anchorOverlapFloor: 0.5 })).toBeNull();
  });

  it("quoteOverlap is a symmetric Jaccard in [0,1]", () => {
    expect(quoteOverlap("a b c", "a b c")).toBe(1);
    expect(quoteOverlap("a b", "c d")).toBe(0);
    expect(quoteOverlap(null, "x")).toBe(0);
  });
});

describe("planted regression — reopened + roundsOpen++ (AC3, REQ-OBJ-4/REQ-WF-7)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(3000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  it("a re-review whose finding matches a DISCHARGED lineage reopens it and increments roundsOpen", async () => {
    const hook = new SqlObligationHook({ ...deps });
    // v1 review spawns a major obligation on a claim (url + quote).
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_v1",
      findings: [{ ordinal: 1, severity: "major", kind: "claim", quote: "the 2019 Home Office guidance", url: "https://gov.uk/guidance" }],
    });
    const oblId = hook.lastOutcome!.spawned[0]!;
    expect((await loadObligation(db.exec, oblId))?.roundsOpen).toBe(1);

    // the author addresses it, then a gap check verifies the move → discharged.
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "accept", status: "done", draftId, byActor: SYSTEM });
    await dischargeByGapCheck(db.exec, deps, { obligationId: oblId, draftId, byActor: SYSTEM });
    expect((await loadObligation(db.exec, oblId))?.state).toBe("discharged");

    // v2 re-review plants the SAME finding (claim identity) → regression → reopened + roundsOpen 1 → 2.
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_v2", ordinal: 2,
      findings: [{ ordinal: 1, severity: "major", kind: "claim", quote: "the 2019 Home Office guidance", url: "https://gov.uk/guidance" }],
    });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.state).toBe("reopened");
    expect(after?.roundsOpen).toBe(2);
    expect(hook.lastOutcome?.reopened).toEqual([oblId]);
    // the triggering finding is recorded as a regression edge.
    const rel = await db.exec.query(`select relation from obligation_findings where obligation_id = $1 order by relation`, [oblId]);
    expect(rel.rows).toContainEqual({ relation: "regression" });
    expect(rel.rows).toContainEqual({ relation: "root" });
  });

  it("a re-review that re-raises an OPEN obligation carries it (roundsOpen++), and drops nothing", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_a", findings: [{ ordinal: 1, severity: "major", carriesObligationId: null, quote: "q1", url: "u1" }],
    });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // v2 re-raises the same claim while still open → carried, roundsOpen 1 → 2, still open.
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_b", ordinal: 2, findings: [{ ordinal: 1, severity: "major", quote: "q1", url: "u1" }],
    });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.state).toBe("open");
    expect(after?.roundsOpen).toBe(2);
    expect(hook.lastOutcome?.carried).toEqual([oblId]);
  });

  it("two findings matching one obligation in a round add both edges but bump roundsOpen only once", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_m1", findings: [{ ordinal: 1, severity: "major", quote: "same", url: "usame" }] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // v2: two findings both resolve to the same claim (matcher 1) → both carried edges, one roundsOpen bump.
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_m2", ordinal: 2,
      findings: [{ ordinal: 1, severity: "major", quote: "same", url: "usame" }, { ordinal: 2, severity: "blocking", quote: "same", url: "usame" }],
    });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.roundsOpen).toBe(2); // not 3 — one bump for the round
    expect(after?.severity).toBe("blocking"); // bumped to the max over the lineage
    const edges = await db.exec.query(`select count(*)::int as n from obligation_findings where obligation_id = $1 and correspondence_id in (select id from correspondence_items where run_id = 'run_m2')`, [oblId]);
    expect((edges.rows[0] as { n: number }).n).toBe(2);
  });

  it("a covering review that does NOT re-raise an open obligation discharges it (REQ-WF-7 'closed' set)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_c", findings: [{ ordinal: 1, severity: "major", quote: "gone", url: "ug" }],
    });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // v2 finds a DIFFERENT issue; the old one is not re-raised → discharged by no-match (verifiedBy re_review).
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_d", ordinal: 2, findings: [{ ordinal: 1, severity: "major", quote: "brand new", url: "un" }],
    });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.state).toBe("discharged");
    expect(after?.dischargedBy?.verifiedBy).toBe("re_review");
    expect(hook.lastOutcome?.discharged).toContain(oblId);
  });

  it("a next_review deferral is returned to open at the next review, NOT buried (snooze, not burial)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_e", findings: [{ ordinal: 1, severity: "major", quote: "q", url: "u" }] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "defer", deferHorizon: { until: "next_review" }, draftId, byActor: SYSTEM });
    // v2 does not re-raise it; the horizon arrives → returned to open, and it is NOT discharged this delivery.
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_f", ordinal: 2, findings: [{ ordinal: 1, severity: "major", quote: "different", url: "ud" }] });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.state).toBe("open");
    expect(hook.lastOutcome?.discharged).not.toContain(oblId);
  });

  it("a scoped run (coversAllObligations:false) never discharges an unmatched obligation (REQ-WF-13)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_g", findings: [{ ordinal: 1, severity: "major", kind: "argument", quote: "arg", url: "ua" }] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    // a scoped Fact-check (claim-only) delivers as a review but covers nothing about the argument obligation.
    await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run_h", ordinal: 2, coversAllObligations: false,
      findings: [{ ordinal: 1, severity: "major", kind: "claim", quote: "claimy", url: "uc" }],
    });
    expect((await loadObligation(db.exec, oblId))?.state).toBe("open"); // not discharged by omission
    expect(hook.lastOutcome?.discharged).toEqual([]);
  });

  it("a rebutted lineage matched by a new finding records the edge but neither carries nor reopens", async () => {
    const hook = new SqlObligationHook({ ...deps });
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_i", findings: [{ ordinal: 1, severity: "major", quote: "q", url: "u" }] });
    const oblId = hook.lastOutcome!.spawned[0]!;
    await routeDisposition(db.exec, deps, { obligationId: oblId, kind: "rebut", rationale: "the reviewer misread it", draftId, byActor: SYSTEM });
    const before = await loadObligation(db.exec, oblId);
    // v2 re-raises the same claim; a rebut stands (closed with an argument on file) — no reopen, no roundsOpen bump.
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run_j", ordinal: 2, findings: [{ ordinal: 1, severity: "major", quote: "q", url: "u" }] });
    const after = await loadObligation(db.exec, oblId);
    expect(after?.state).toBe("rebutted");
    expect(after?.roundsOpen).toBe(before?.roundsOpen); // unchanged
    // the lineage edge IS recorded for the record.
    const edges = await db.exec.query(`select count(*)::int as n from obligation_findings where obligation_id = $1`, [oblId]);
    expect((edges.rows[0] as { n: number }).n).toBe(2); // root + the new matched edge
  });
});
