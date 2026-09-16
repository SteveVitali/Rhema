import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FindingsSidecar } from "@rhema/contracts";
import {
  DeliveryValidationError,
  materializeSeat,
  recordMounts,
  runDeliveryTransaction,
  type DeliveryArgs,
  type DeliveryDeps,
  type VerdictSourceContext,
} from "@rhema/mirror";
import { SqlObligationHook } from "./hook.js";
import { loadProjectObligations } from "./queries.js";
import {
  createObligationTestDb,
  InMemoryContentStore,
  seedBase,
  seedMirrorProject,
  seedRun,
  testDeps,
  type MirrorTestDb,
} from "./testing/index.js";

// The obligation hook runs INSIDE the P0.09 delivery transaction (REQ-DATA-7 amended; REQ-OBJ-2). This proves
// the seam end-to-end: a real `runDeliveryTransaction` with the concrete `SqlObligationHook` spawns obligations
// atomically with the dossier, and a delivery-validation failure rolls back the obligations along with it.

const EMPTY_VERDICT_CTX: VerdictSourceContext = {
  citationDomains: new Set(),
  reputableDomains: new Set(),
  searchResultDomains: new Set(),
};

function findingsSidecar(): FindingsSidecar {
  return {
    sidecar: "findings",
    version: 1,
    findings: [
      { ordinal: 1, kind: "claim", severity: "blocking", origin: "editor", anchor: null, title: "unsupported claim", body: "b", rubricDims: [] },
      { ordinal: 2, kind: "argument", severity: "major", origin: "editor", anchor: null, title: "weak argument", body: "b", rubricDims: [] },
      { ordinal: 3, kind: "craft", severity: "minor", origin: "editor", anchor: null, title: "wording", body: "b", rubricDims: [] },
    ],
  } as FindingsSidecar;
}

describe("obligation hook inside the delivery transaction (REQ-OBJ-2, REQ-DATA-7)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  const runId = "run_deliver_obl";
  const projectId = "proj_pv";
  let deps: DeliveryDeps;

  beforeEach(async () => {
    db = await createObligationTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    await seedMirrorProject(db.exec, store, workspaceId, { id: projectId, personaId: "prs_pv", tag: "PV" });
    await seedRun(db.exec, { runId, workspaceId, projectId, state: "finalizing" });
    // a WORKING draft the review freezes on delivery.
    const dv = await store.put(workspaceId, "sha_v2", Buffer.from("# v2\n", "utf8"));
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,'sha_v2',$1,5,'text/markdown','{"kind":"system"}'::jsonb)`,
      [dv.key],
    );
    await db.exec.query(`insert into drafts(id, project_id, n, origin, state) values ('dft_v2',$1,2,'response_to_review','working')`, [projectId]);
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId, attempt: 1, manifest: tree.manifest });

    deps = {
      ...testDeps(),
      store,
      eventWriter: { async append() {} },
      obligationHook: new SqlObligationHook(testDeps(500)),
    };
  });
  afterEach(() => db.close());

  function args(over: Partial<DeliveryArgs> = {}): DeliveryArgs {
    return {
      runId,
      attempt: 1,
      workspaceId,
      projectId,
      draftId: "dft_v2",
      correspondenceKind: "review",
      deliveredVersionIds: ["av_v2"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "findings.json", json: findingsSidecar() }],
      findings: findingsSidecar(),
      verdictContext: EMPTY_VERDICT_CTX,
      ...over,
    };
  }

  it("spawns blocking/major obligations atomically with the dossier (minor spawns none)", async () => {
    await runDeliveryTransaction(db.exec, deps, args());
    const obligations = await loadProjectObligations(db.exec, projectId);
    expect(obligations.length).toBe(2); // blocking + major; the minor spawns nothing at delivery
    expect(new Set(obligations.map((o) => o.severity))).toEqual(new Set(["blocking", "major"]));
    for (const o of obligations) expect(o.state).toBe("open");
  });

  it("a delivery-validation failure commits no obligations (validation precedes the hook)", async () => {
    // A sidecar that fails its schema hard-fails delivery → nothing commits. (An unfetched citation no longer
    // hard-fails — Path B / ADR-006 strips + downgrades it — so a sidecar failure is the validation trigger.)
    const failing = args({
      sidecars: [{ filename: "findings.json", json: { sidecar: "findings", version: 1, findings: [{ ordinal: "one" }] } }],
    });
    await expect(runDeliveryTransaction(db.exec, deps, failing)).rejects.toBeInstanceOf(DeliveryValidationError);
    expect((await loadProjectObligations(db.exec, projectId)).length).toBe(0);
  });

  // PRB.06 — a Revise `response` delivery routes the frozen ledger's moves through the obligation state
  // machine (the auto-path of D-P0.12-2): verified accept → discharged, rebut w/ rationale → rebutted,
  // a minor's accept spawns + addresses in one step.
  it("routes a delivered response's ledger rows through the obligation state machine", async () => {
    const review = await runDeliveryTransaction(db.exec, deps, args());
    const before = await loadProjectObligations(db.exec, projectId);
    const byTitle = new Map(before.map((o) => [o.title, o]));
    const blocking = byTitle.get("unsupported claim")!; // finding 1
    const major = byTitle.get("weak argument")!; // finding 2

    // the Revise run: a fresh run + the working head + the delivered v3 draft/ledger artifacts.
    const respRun = "run_resp";
    await seedRun(db.exec, { runId: respRun, workspaceId, projectId, state: "finalizing" });
    const tree = await materializeSeat(db.exec, store, { seat: "drafter", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId: respRun, attempt: 1, manifest: tree.manifest });
    const baseDraftId = deps.ids("dft");
    const nextDraftId = deps.ids("dft");
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id)
       values ($1,$2,3,'response_to_review','working','dft_v2')`,
      [baseDraftId, projectId],
    );
    const v3 = await store.putText(workspaceId, "# v2\n\nThe restated pillar paragraph.\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v3',$1,$2,'draft','shared','drafts/v3.md','av_v3')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v3','art_v3',1,$1,'k',40,'text/markdown','{"kind":"system"}'::jsonb)`,
      [v3.sha256],
    );

    const ledger = {
      sidecar: "response_ledger",
      version: 1,
      entries: [
        // blocking f1: the move landed AND verified → discharge (gap_check evidence).
        { findingOrdinal: 1, disposition: { kind: "accept", status: "verified", moveOrdinal: 1, actor: "drafter" },
          anchor: { blockId: "b2", quote: "restated pillar paragraph", startOffset: 0, endOffset: 0, confidence: 1 } },
        // major f2: rebutted with rationale → obligation closes `rebutted`.
        { findingOrdinal: 2, disposition: { kind: "rebut", status: "done", rationale: "the pillar is load-bearing — see §3", actor: "drafter" } },
        // minor f3: no obligation yet — the accept spawns one already addressed.
        { findingOrdinal: 3, disposition: { kind: "accept", status: "done", moveOrdinal: 2, actor: "drafter" },
          anchor: { blockId: "b2", quote: "restated pillar paragraph", startOffset: 0, endOffset: 0, confidence: 1 } },
      ],
      moves: [{ ordinal: 1, title: "Restate the pillar" }, { ordinal: 2, title: "Tighten wording" }],
    };
    await runDeliveryTransaction(db.exec, deps, {
      runId: respRun,
      attempt: 1,
      workspaceId,
      projectId,
      draftId: baseDraftId,
      correspondenceKind: "response",
      priorReviewId: review.correspondenceId,
      newDraftId: nextDraftId,
      deliveredVersionIds: ["av_v3"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "response-ledger.json", json: ledger as never }],
      verdictContext: EMPTY_VERDICT_CTX,
    });

    const after = await loadProjectObligations(db.exec, projectId);
    const stateOf = (title: string) => after.find((o) => o.title === title)?.state;
    expect(stateOf("unsupported claim")).toBe("discharged"); // verified accept
    expect(stateOf("weak argument")).toBe("rebutted"); // rebut with rationale
    expect(stateOf("wording")).toBe("addressed"); // the minor spawned on accept/done
    expect(blocking.id).not.toBe(major.id); // sanity: distinct obligations
    void nextDraftId;
  });

  // PRB.06 — the re-review's lineage tally is computed from rows and emitted as `rereview.lineage`.
  it("emits rereview.lineage on a re-review: carried + closed + new from rows", async () => {
    const events: { type: string; payload: unknown }[] = [];
    deps = {
      ...deps,
      obligationHook: new SqlObligationHook({
        ...testDeps(900),
        appendEvent: { async append(_e, ev) { events.push({ type: ev.type, payload: ev.payload }); } },
      }),
    };
    const review = await runDeliveryTransaction(db.exec, deps, args());
    const obls = await loadProjectObligations(db.exec, projectId);
    const carried = obls.find((o) => o.title === "unsupported claim")!;

    // the re-review: a second run + a new working head. Its findings: one carries the blocking obligation
    // (matcher 2 — the Editor's declared carry), one is brand-new blocking; the major's obligation is NOT
    // re-raised → closed by no-match.
    const run2 = "run_rereview";
    await seedRun(db.exec, { runId: run2, workspaceId, projectId, state: "finalizing" });
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId: run2, attempt: 1, manifest: tree.manifest });
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id)
       values ('dft_v3',$1,3,'response_to_review','working','dft_v2')`,
      [projectId],
    );
    const rereviewFindings: FindingsSidecar = {
      sidecar: "findings",
      version: 1,
      findings: [
        { ordinal: 1, kind: "claim", severity: "blocking", origin: "editor", anchor: null, title: "unsupported claim", body: "b", rubricDims: [], carriesObligationId: carried.id },
        { ordinal: 2, kind: "argument", severity: "blocking", origin: "editor", anchor: null, title: "a fresh hole", body: "b", rubricDims: [] },
      ],
    } as FindingsSidecar;
    const review2 = await runDeliveryTransaction(db.exec, deps, args({
      runId: run2,
      draftId: "dft_v3",
      priorReviewId: review.correspondenceId,
      sidecars: [{ filename: "findings.json", json: rereviewFindings }],
      findings: rereviewFindings,
    }));

    const lineage = events.filter((e) => e.type === "rereview.lineage");
    expect(lineage.length).toBe(1);
    expect(lineage[0]!.payload).toMatchObject({
      correspondenceId: review2.correspondenceId,
      priorReviewId: review.correspondenceId,
      carried: 1,
      closed: 1,
      new: 1,
      reopened: 0,
    });

    const after = await loadProjectObligations(db.exec, projectId);
    const closedMajor = after.find((o) => o.title === "weak argument")!;
    expect(closedMajor.state).toBe("discharged"); // not re-raised → closed by the covering review
    expect(after.find((o) => o.title === "a fresh hole")?.state).toBe("open");
  });
});
