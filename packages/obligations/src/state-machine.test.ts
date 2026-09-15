import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OBLIGATION_STATES, type Actor, type ObligationState } from "@rhema/contracts";
import {
  applyObligationTransition,
  CLOSING_STATES,
  isValidTransition,
  OBLIGATION_EDGES,
  ObligationTransitionError,
  type ObligationCause,
} from "./state-machine.js";
import { spawnObligationFromFinding } from "./spawn.js";
import { loadObligation } from "./queries.js";
import {
  createObligationTestDb,
  InMemoryContentStore,
  seedCorrespondence,
  seedFinding,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// AC2 (deterministic): the closed-world state machine (REQ-OBJ-3). Enumerate every transition; no path closes
// an obligation without one of the named causes; rebut/defer without a rationale raises (function + DDL check).

const SYSTEM: Actor = { kind: "system" };
const ALL_CAUSES: ObligationCause[] = [
  "spawn", "address", "rebut", "defer", "gap_check", "no_match", "user", "moot", "regression", "horizon",
];

describe("obligation state machine — closed world (AC2, REQ-OBJ-3)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let projectId: string;
  let draftId: string;
  let correspondenceId: string;
  let ord = 0;
  const deps = testDeps(1000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    store = new InMemoryContentStore();
    const seeded = await seedProject(db.exec, store);
    projectId = seeded.projectId;
    draftId = seeded.draftId;
    correspondenceId = await seedCorrespondence(db.exec, { projectId, draftId, runId: "run_sm" });
    ord = 0;
  });
  afterEach(() => db.close());

  async function freshObligation(severity = "major"): Promise<{ obligationId: string; findingId: string }> {
    const findingId = await seedFinding(db.exec, { correspondenceId, draftId, ordinal: ++ord, severity });
    const obligationId = await spawnObligationFromFinding(db.exec, deps, {
      projectId, findingId, severity: severity as "major", kind: "claim", title: `F${ord}`, correspondenceId, draftId,
    });
    return { obligationId, findingId };
  }

  async function driveTo(obligationId: string, target: ObligationState, findingId: string): Promise<void> {
    const extra = (cause: ObligationCause) =>
      cause === "defer"
        ? { rationale: "Not this round", deferHorizon: { until: "next_review" as const } }
        : cause === "rebut"
          ? { rationale: "on the record" }
          : cause === "gap_check"
            ? { dischargedBy: { verifiedBy: "gap_check" as const, draftId } }
            : {};
    switch (target) {
      case "open":
        return;
      case "addressed":
        return applyObligationTransition(db.exec, deps, { obligationId, to: "addressed", cause: "address", byActor: SYSTEM });
      case "deferred":
        return applyObligationTransition(db.exec, deps, { obligationId, to: "deferred", cause: "defer", byActor: SYSTEM, ...extra("defer") });
      case "rebutted":
        return applyObligationTransition(db.exec, deps, { obligationId, to: "rebutted", cause: "rebut", byActor: SYSTEM, ...extra("rebut") });
      case "discharged":
        return applyObligationTransition(db.exec, deps, { obligationId, to: "discharged", cause: "gap_check", byActor: SYSTEM, ...extra("gap_check") });
      case "mooted":
        return applyObligationTransition(db.exec, deps, { obligationId, to: "mooted", cause: "moot", byActor: SYSTEM });
      case "reopened":
        await applyObligationTransition(db.exec, deps, { obligationId, to: "addressed", cause: "address", byActor: SYSTEM });
        return applyObligationTransition(db.exec, deps, { obligationId, to: "reopened", cause: "regression", byActor: SYSTEM, findingId });
    }
  }

  it("isValidTransition is EXACTLY the declared edge set (pure closed world)", () => {
    const froms: (ObligationState | null)[] = [null, ...OBLIGATION_STATES];
    const declared = new Set(OBLIGATION_EDGES.map((e) => `${e.from ?? "∅"}>${e.to}:${e.cause}`));
    let checked = 0;
    for (const from of froms) {
      for (const to of OBLIGATION_STATES) {
        for (const cause of ALL_CAUSES) {
          checked++;
          const key = `${from ?? "∅"}>${to}:${cause}`;
          expect(isValidTransition(from, to, cause)).toBe(declared.has(key));
        }
      }
    }
    expect(checked).toBe(froms.length * OBLIGATION_STATES.length * ALL_CAUSES.length);
  });

  it("every declared edge is accepted by the DB and lands in the target state", async () => {
    for (const edge of OBLIGATION_EDGES) {
      if (edge.cause === "spawn") continue; // spawn is the insert path, exercised separately
      const { obligationId, findingId } = await freshObligation();
      await driveTo(obligationId, edge.from as ObligationState, findingId);
      const extra =
        edge.cause === "defer"
          ? { rationale: "Not this round", deferHorizon: { until: "next_review" as const } }
          : edge.cause === "rebut"
            ? { rationale: "on the record" }
            : edge.cause === "user" && edge.to === "discharged"
              ? { rationale: "by hand", dischargedBy: { verifiedBy: "user" as const, draftId } }
              : edge.cause === "gap_check"
                ? { dischargedBy: { verifiedBy: "gap_check" as const, draftId } }
                : edge.cause === "no_match"
                  ? { dischargedBy: { verifiedBy: "re_review" as const, draftId } }
                  : {};
      await applyObligationTransition(db.exec, deps, { obligationId, to: edge.to, cause: edge.cause, byActor: SYSTEM, findingId, ...extra });
      const after = await loadObligation(db.exec, obligationId);
      expect(after?.state, `${edge.from} → ${edge.to} via ${edge.cause}`).toBe(edge.to);
    }
  });

  it("a transition outside the closed world raises (no bulk close, no silent close)", async () => {
    const { obligationId, findingId } = await freshObligation();
    await driveTo(obligationId, "rebutted", findingId); // closed with an argument
    // rebutted → open is not an edge; the machine refuses it.
    await expect(
      applyObligationTransition(db.exec, deps, { obligationId, to: "open", cause: "horizon", byActor: SYSTEM }),
    ).rejects.toBeInstanceOf(ObligationTransitionError);
  });

  it("closing states are reached ONLY by their named causes", () => {
    const closingCauses: Record<string, Set<string>> = { discharged: new Set(), rebutted: new Set(), mooted: new Set() };
    for (const e of OBLIGATION_EDGES) if (CLOSING_STATES.has(e.to)) closingCauses[e.to]!.add(e.cause);
    expect(closingCauses.discharged).toEqual(new Set(["gap_check", "no_match", "user"]));
    expect(closingCauses.rebutted).toEqual(new Set(["rebut"]));
    expect(closingCauses.mooted).toEqual(new Set(["moot"]));
  });

  it("rebut without a rationale raises at the function layer (before touching the DB)", async () => {
    const { obligationId } = await freshObligation();
    await expect(
      applyObligationTransition(db.exec, deps, { obligationId, to: "rebutted", cause: "rebut", byActor: SYSTEM }),
    ).rejects.toThrow(/rationale/);
    expect((await loadObligation(db.exec, obligationId))?.state).toBe("open"); // unchanged
  });

  it("defer without a rationale raises at the function layer", async () => {
    const { obligationId } = await freshObligation();
    await expect(
      applyObligationTransition(db.exec, deps, { obligationId, to: "deferred", cause: "defer", byActor: SYSTEM, deferHorizon: { until: "next_review" } }),
    ).rejects.toThrow(/rationale/);
  });

  it("the row's state is a cache of the last transition (append-only truth)", async () => {
    const { obligationId, findingId } = await freshObligation();
    await driveTo(obligationId, "addressed", findingId);
    await applyObligationTransition(db.exec, deps, { obligationId, to: "discharged", cause: "gap_check", byActor: SYSTEM, dischargedBy: { verifiedBy: "gap_check", draftId } });
    const trans = await db.exec.query(`select from_state, to_state, cause from obligation_transitions where obligation_id = $1 order by at, id`, [obligationId]);
    expect(trans.rows).toEqual([
      { from_state: null, to_state: "open", cause: "spawn" },
      { from_state: "open", to_state: "addressed", cause: "address" },
      { from_state: "addressed", to_state: "discharged", cause: "gap_check" },
    ]);
    const ob = await loadObligation(db.exec, obligationId);
    expect(ob?.state).toBe("discharged");
    expect(ob?.closedAt).not.toBeNull(); // the trigger stamped closed_at for a closing state
  });
});
