import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FindingsSidecar } from "@rhema/contracts";
import {
  DeliveryValidationError,
  materializeSeat,
  normalizeUrl,
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
    // a claim citing a URL absent from the proxy fetch log fails cited⇒fetched → nothing commits.
    const failing = args({
      claimLedger: { sidecar: "claim_ledger", version: 1, claims: [{ ordinal: 1, text: "c", tier: 2, verdict: "verified", url: "https://nope.example/x", normalizedUrl: normalizeUrl("https://nope.example/x"), humanAdded: false }] } as DeliveryArgs["claimLedger"],
    });
    await expect(runDeliveryTransaction(db.exec, deps, failing)).rejects.toBeInstanceOf(DeliveryValidationError);
    expect((await loadProjectObligations(db.exec, projectId)).length).toBe(0);
  });
});
