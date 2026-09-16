import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaimLedgerSidecar } from "@rhema/contracts";
import { InMemoryContentStore, normalizeUrl, type DeliveryArgs, type VerdictSourceContext } from "@rhema/mirror";
import { deliverRun } from "./delivery.js";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import type { IdFactory } from "./ids.js";

// P0.09 orchestrator wiring: `deliverRun` runs the mirror delivery transaction and, atomically, takes
// finalizing → completed + releases the hold + emits cost.final; a validation failure ends the run
// failed(validation) via failRun. Integration over PGlite + in-memory fakes.

// ULIDs for the test (the run.report event's reportVersionId must be a valid id; sequentialIds is not ULID).
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulidIds(): IdFactory {
  let n = 0;
  return () => {
    let s = "";
    let v = ++n;
    while (v > 0) {
      s = CROCKFORD[v % 32] + s;
      v = Math.floor(v / 32);
    }
    return s.padStart(26, "0");
  };
}

const WS = "ws_seed";
const PROJECT = "prj_seed";
const RUN = "run_deliver";
const FETCHED = "https://a.example/one";
const VCTX: VerdictSourceContext = { citationDomains: new Set(), reputableDomains: new Set(), searchResultDomains: new Set() };

describe("deliverRun (orchestrator wiring)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let store: InMemoryContentStore;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    await seedProject(db, { draftN: 2 }); // a working head draft dft_prj_seed_2
    await seedRun(db, { runId: RUN, workspaceId: WS, projectId: PROJECT, state: "finalizing" });
    // a draft artifact version to freeze the draft at, + one allowed proxy fetch for the claim url.
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [WS, PROJECT],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,$1,'k',4,'text/markdown','{"kind":"system"}'::jsonb)`,
      ["b".repeat(64)],
    );
    await db.pg.query(
      `insert into fetch_log(run_id, ts, agent_label, attempt, kind, url, normalized_url, decision)
       values ($1, now(), 'editor', 1, 'fetch', $2, $3, 'allow')`,
      [RUN, FETCHED, normalizeUrl(FETCHED)],
    );
    store = new InMemoryContentStore();
    deps = { ...makeDeps(db), ids: ulidIds() };
  });
  afterEach(() => db.close());

  function delivery(over: Partial<DeliveryArgs> = {}): DeliveryArgs {
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: FETCHED, normalizedUrl: normalizeUrl(FETCHED), humanAdded: false }],
    } as ClaimLedgerSidecar;
    return {
      runId: RUN,
      attempt: 1,
      workspaceId: WS,
      projectId: PROJECT,
      draftId: "dft_prj_seed_2",
      correspondenceKind: "review",
      deliveredVersionIds: ["av_v2"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }],
      claimLedger,
      verdictContext: VCTX,
      ...over,
    };
  }

  it("delivers, takes finalizing → completed, releases the hold, emits cost.final", async () => {
    const result = await deliverRun(
      { ...deps, store },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: delivery() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toBe("completed");

    const run = (await db.client.query("select state from runs where id=$1", [RUN])).rows[0] as { state: string };
    expect(run.state).toBe("completed");
    const draft = (await db.client.query("select state from drafts where id='dft_prj_seed_2'")).rows[0] as { state: string };
    expect(draft.state).toBe("frozen");
    // the hold was released and cost.final emitted.
    expect(deps.ledger.ops.some((o) => o.op === "release")).toBe(true);
    expect(deps.eventWriter.events.some((e) => e.type === "cost.final")).toBe(true);
    expect(deps.eventWriter.events.some((e) => e.type === "boundary.attested")).toBe(true);
  });

  it("PRB.10 — the delivered note records the voice facts (snapshot id + build date + mode) on the correspondence row", async () => {
    const result = await deliverRun(
      { ...deps, store },
      {
        billingAccountId: "ba_seed",
        holdLedgerId: "hold_1",
        spentCredits: 42,
        capCredits: 100,
        delivery: delivery({
          personaProfileSnapshotId: "pp_snap_1",
          personaSnapshotAt: "2026-08-20T00:00:00Z",
          voiceMode: "linked",
        }),
      },
    );
    expect(result.ok).toBe(true);
    const corr = (
      await db.client.query(
        "select persona_profile_snapshot_id, persona_snapshot_at, voice_mode from correspondence_items where run_id=$1",
        [RUN],
      )
    ).rows[0] as {
      persona_profile_snapshot_id: string | null;
      persona_snapshot_at: Date | null;
      voice_mode: string | null;
    };
    expect(corr.persona_profile_snapshot_id).toBe("pp_snap_1");
    expect(corr.persona_snapshot_at?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(corr.voice_mode).toBe("linked");
  });

  // NB: an unfetched citation no longer hard-fails delivery (Path B / ADR-006) — it is stripped + downgraded.
  // A genuine validation failure (a sidecar that fails its schema) still ends the run failed(validation).
  it("a delivery-validation (sidecar) failure ends the run failed(validation), nothing committed", async () => {
    const result = await deliverRun(
      { ...deps, store },
      {
        billingAccountId: "ba_seed",
        holdLedgerId: "hold_1",
        refundCredits: 42,
        spentCredits: 42,
        capCredits: 100,
        delivery: delivery({
          // a claim_ledger sidecar whose claim is schema-invalid (ordinal not a number) → parseSidecar fails.
          sidecars: [{ filename: "01-claim-ledger.json", json: { sidecar: "claim_ledger", version: 1, claims: [{ ordinal: "one", text: "c1" }] } }],
        }),
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation");

    const run = (await db.client.query("select state from runs where id=$1", [RUN])).rows[0] as { state: string };
    expect(run.state).toBe("failed");
    const corr = (await db.client.query("select count(*)::int as n from correspondence_items where run_id=$1", [RUN])).rows[0] as { n: number };
    expect(corr.n).toBe(0);
    // failRun refunded the debits + released the hold.
    expect(deps.ledger.ops.some((o) => o.op === "refund")).toBe(true);
    expect(deps.ledger.ops.some((o) => o.op === "release")).toBe(true);
  });

  it("REQ-SPEC-24.7 (PRB.08): a suspended account's delivery is withheld — the run stays finalizing with the args stashed", async () => {
    await db.pg.query("update billing_accounts set suspended_at = now() where id = 'ba_seed'");
    const result = await deliverRun(
      { ...deps, store },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: delivery() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("withheld");

    const run = (await db.client.query("select state, delivery_withheld_at, pending_delivery from runs where id=$1", [RUN])).rows[0] as {
      state: string; delivery_withheld_at: string | null; pending_delivery: { delivery?: { runId?: string } } | null;
    };
    expect(run.state).toBe("finalizing"); // NOT delivered, NOT failed — withheld
    expect(run.delivery_withheld_at).not.toBeNull();
    expect(run.pending_delivery?.delivery?.runId).toBe(RUN); // the stash the run.deliver job re-drives
    // nothing committed: no correspondence, no release, no cost.final
    expect(deps.ledger.ops.some((o) => o.op === "release")).toBe(false);
    expect(deps.eventWriter.events.some((e) => e.type === "cost.final")).toBe(false);
  });

  it("a run flagged delivery_withheld_at by the chargeback (account since reinstated) still withholds until the marker clears", async () => {
    await db.txRunner.run("ws_seed", (tx) => tx.query("update runs set delivery_withheld_at = now() where id = $1", [RUN]));
    const result = await deliverRun(
      { ...deps, store },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: delivery() },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("withheld");
  });
});
