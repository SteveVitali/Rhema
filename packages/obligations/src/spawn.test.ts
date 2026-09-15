import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@rhema/contracts";
import { SqlObligationHook } from "./hook.js";
import { spawnAndRouteMinor } from "./routing.js";
import { loadObligation, loadObligationByRootFinding, loadProjectObligations } from "./queries.js";
import {
  createObligationTestDb,
  deliverReviewViaHook,
  InMemoryContentStore,
  seedProject,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// AC1 (deterministic): golden dossier fixtures assert spawn counts per severity mix (REQ-OBJ-2). Blocking/major
// spawn one obligation each at delivery (actor system); minor spawns only on accept/adapt; note never; a
// reconciliation-rejected finding spawns nothing.

const USER: Actor = { kind: "user", userId: "usr_mirror" } as Actor;

describe("spawn — per-severity-mix counts (AC1, REQ-OBJ-2)", () => {
  let db: MirrorTestDb;
  let projectId: string;
  let draftId: string;
  const deps = testDeps(2000);

  beforeEach(async () => {
    db = await createObligationTestDb();
    const seeded = await seedProject(db.exec, new InMemoryContentStore());
    projectId = seeded.projectId;
    draftId = seeded.draftId;
  });
  afterEach(() => db.close());

  it("blocking + major spawn one obligation each; minor / note / rejected spawn none", async () => {
    const hook = new SqlObligationHook({ ...deps });
    // an Academic-shaped severity mix: 2 blocking, 3 major, 4 minor, 5 note, 1 REJECTED major.
    const findings = [
      { ordinal: 1, severity: "blocking" }, { ordinal: 2, severity: "blocking" },
      { ordinal: 3, severity: "major" }, { ordinal: 4, severity: "major" }, { ordinal: 5, severity: "major" },
      { ordinal: 6, severity: "minor" }, { ordinal: 7, severity: "minor" }, { ordinal: 8, severity: "minor" }, { ordinal: 9, severity: "minor" },
      { ordinal: 10, severity: "note" }, { ordinal: 11, severity: "note" }, { ordinal: 12, severity: "note" }, { ordinal: 13, severity: "note" }, { ordinal: 14, severity: "note" },
      { ordinal: 15, severity: "major", origin: "second_read", reconciliation: "rejected" },
    ];
    await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run1", findings });

    const obligations = await loadProjectObligations(db.exec, projectId);
    expect(obligations.length).toBe(5); // 2 blocking + 3 major; the rejected major + minors + notes spawn none
    expect(obligations.filter((o) => o.severity === "blocking").length).toBe(2);
    expect(obligations.filter((o) => o.severity === "major").length).toBe(3);
    expect(hook.lastOutcome?.spawned.length).toBe(5);
    // each spawned obligation is OPEN, system-created, source='finding', roundsOpen 1, with one root edge.
    for (const o of obligations) {
      expect(o.state).toBe("open");
      expect(o.source).toBe("finding");
      expect(o.roundsOpen).toBe(1);
      expect(o.createdBy).toEqual({ kind: "system" });
      const edges = await db.exec.query(`select relation from obligation_findings where obligation_id = $1`, [o.id]);
      expect(edges.rows).toEqual([{ relation: "root" }]);
    }
  });

  it("a reconciliation-rejected finding spawns nothing unless promoted (REQ-IDE-26)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const { findingIds } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run2",
      findings: [{ ordinal: 1, severity: "blocking", origin: "second_read", reconciliation: "rejected" }],
    });
    expect((await loadProjectObligations(db.exec, projectId)).length).toBe(0);
    // promotion creates a user-origin obligation for the same finding.
    const { addToObligations } = await import("./spawn.js");
    await addToObligations(db.exec, deps, { projectId, draftId, title: "promoted", severity: "blocking", byActor: USER, findingId: findingIds[0]!, correspondenceId: "corr_x" });
    const promoted = await loadObligationByRootFinding(db.exec, findingIds[0]!);
    expect(promoted?.source).toBe("user");
  });

  it("a minor finding spawns only when accepted/adapted, then is addressed (REQ-OBJ-2)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const { correspondenceId, findingIds } = await deliverReviewViaHook(db.exec, hook, {
      projectId, draftId, runId: "run3", findings: [{ ordinal: 1, severity: "minor" }],
    });
    expect((await loadProjectObligations(db.exec, projectId)).length).toBe(0); // no spawn at delivery
    const oblId = await spawnAndRouteMinor(db.exec, deps, {
      projectId, findingId: findingIds[0]!, kind: "craft", title: "tighten this", correspondenceId, draftId,
      disposition: { kind: "adapt", status: "done" }, byActor: USER,
    });
    const ob = await loadObligation(db.exec, oblId);
    expect(ob?.severity).toBe("minor");
    expect(ob?.state).toBe("addressed"); // the accept/adapt move addressed it
  });

  it("spawn is idempotent per root finding (a retried delivery does not double-spawn)", async () => {
    const hook = new SqlObligationHook({ ...deps });
    const findings = [{ ordinal: 1, severity: "blocking" as const }];
    const first = await deliverReviewViaHook(db.exec, hook, { projectId, draftId, runId: "run4", findings });
    // re-invoke onDelivery with the SAME finding id (a retry) — the unique root-finding index makes it a no-op.
    await hook.onDelivery({
      exec: db.exec, runId: "run4", projectId, draftId, correspondenceId: first.correspondenceId,
      correspondenceKind: "review",
      findings: [{ findingId: first.findingIds[0]!, ordinal: 1, severity: "blocking", kind: "claim", title: "Finding 1", origin: "editor", reconciliation: null, anchor: null, normalizedUrl: null, carriesObligationId: null }],
      claims: [], sidecarCounts: null,
    });
    expect((await loadProjectObligations(db.exec, projectId)).length).toBe(1);
  });
});
