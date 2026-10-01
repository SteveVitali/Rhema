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

  // ---- RES.2 (REQ-SPEC-31(3)) — the Unverified classification ------------------------------------
  // The predicate runs on POST-STRIP coverage the mirror counts: ≥1 checkable Tier-1/2 claim, zero
  // covered. The label + `run.unverified` commit atomically with `finalizing → completed`; the
  // platform-fault settle is post-commit and best-effort (the sweep retries while unmarked).

  /** A claim ledger of checkable claims whose cited sources were never fetched (all stripped). */
  function zeroCoverageDelivery(over: Partial<DeliveryArgs> = {}): DeliveryArgs {
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [
        // tier-2 checkable; its url + source were never fetched → the Path-B strip leaves 0 covered.
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: "https://unfetched.example/a", normalizedUrl: "unfetched.example/a", humanAdded: false },
        { ordinal: 2, text: "c2", tier: 1, verdict: "verified", humanAdded: false, sources: [{ url: "https://unfetched.example/b", normalizedUrl: "unfetched.example/b", accessedAt: "2026-09-02T11:00:00Z", stance: "supports" }] },
      ],
    } as ClaimLedgerSidecar;
    return delivery({
      sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }],
      claimLedger,
      ...over,
    });
  }

  it("zero coverage → completed with the write-once Unverified label, run.unverified, and a post-commit settle call", async () => {
    const settled: { runId: string; phaseKeys: readonly string[]; checkableClaims: number; coveredClaims: number }[] = [];
    const result = await deliverRun(
      { ...deps, store, settleUnverified: async (a) => { settled.push(a); } },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: zeroCoverageDelivery() },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toBe("completed");

    // the persisted label + counts — atomically with the transition (one commit).
    const run = (await db.client.query("select state, delivery from runs where id=$1", [RUN])).rows[0] as {
      state: string;
      delivery: { label?: string; checkableClaims?: number; coveredClaims?: number } | null;
    };
    expect(run.state).toBe("completed");
    expect(run.delivery).toMatchObject({ label: "unverified", checkableClaims: 2, coveredClaims: 0 });

    // `run.unverified` in the run stream (the analytics `run.completed` suppression is the dashboard's).
    const ev = deps.eventWriter.events.find((e) => e.type === "run.unverified");
    expect(ev?.payload).toMatchObject({ checkableClaims: 2, coveredClaims: 0 });

    // the research-class phase keys resolve from the review manifest (verification + discourse).
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      runId: RUN,
      workspaceId: WS,
      billingAccountId: "ba_seed",
      phaseKeys: ["verification", "discourse"],
      checkableClaims: 2,
      coveredClaims: 0,
    });
    // every stripped claim's verdict stays the CLAIM verdict `unverifiable` — never the run label.
    const claims = (await db.client.query("select verdict from claims order by ordinal", [])).rows as { verdict: string }[];
    expect(claims.map((c) => c.verdict)).toEqual(["unverifiable", "unverifiable"]);
  });

  it("an injected settlement failure still leaves the dossier delivered (settle is post-commit)", async () => {
    const result = await deliverRun(
      { ...deps, store, settleUnverified: () => Promise.reject(new Error("settle exploded")) },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: zeroCoverageDelivery() },
    );
    expect(result.ok).toBe(true);
    const run = (await db.client.query("select state, delivery->>'label' as label from runs where id=$1", [RUN])).rows[0] as {
      state: string;
      label: string | null;
    };
    expect(run).toMatchObject({ state: "completed", label: "unverified" });
    // the correspondence row committed — the delivery itself never hinges on settlement.
    const corr = (await db.client.query("select count(*)::int as n from correspondence_items where run_id=$1", [RUN])).rows[0] as { n: number };
    expect(corr.n).toBe(1);
  });

  it("partial coverage → NOT Unverified (one fetched Tier-1 claim of two)", async () => {
    const settled: unknown[] = [];
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [
        { ordinal: 1, text: "c1", tier: 1, verdict: "verified", url: FETCHED, normalizedUrl: normalizeUrl(FETCHED), humanAdded: false },
        { ordinal: 2, text: "c2", tier: 2, verdict: "verified", url: "https://unfetched.example/a", normalizedUrl: "unfetched.example/a", humanAdded: false },
      ],
    } as ClaimLedgerSidecar;
    const result = await deliverRun(
      { ...deps, store, settleUnverified: async (a) => { settled.push(a); } },
      {
        billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100,
        delivery: delivery({ sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }], claimLedger }),
      },
    );
    expect(result.ok).toBe(true);
    const run = (await db.client.query("select delivery from runs where id=$1", [RUN])).rows[0] as { delivery: unknown };
    expect(run.delivery).toBeNull(); // partial coverage is an ordinary delivery — no label
    expect(settled).toHaveLength(0);
    expect(deps.eventWriter.events.some((e) => e.type === "run.unverified")).toBe(false);
    expect(deps.eventWriter.events.some((e) => e.type === "cost.final")).toBe(true);
  });

  it("no Tier-1/2 claims → NOT Unverified (nothing was checkable)", async () => {
    const settled: unknown[] = [];
    const claimLedger: ClaimLedgerSidecar = {
      sidecar: "claim_ledger",
      version: 1,
      claims: [
        { ordinal: 1, text: "style note", tier: 3, verdict: "unsupported", humanAdded: false },
      ],
    } as ClaimLedgerSidecar;
    const result = await deliverRun(
      { ...deps, store, settleUnverified: async (a) => { settled.push(a); } },
      {
        billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100,
        delivery: delivery({ sidecars: [{ filename: "01-claim-ledger.json", json: claimLedger }], claimLedger }),
      },
    );
    expect(result.ok).toBe(true);
    const run = (await db.client.query("select delivery from runs where id=$1", [RUN])).rows[0] as { delivery: unknown };
    expect(run.delivery).toBeNull();
    expect(settled).toHaveLength(0);
  });

  it("the label is write-once — a re-drive of the committed run cannot overwrite delivery", async () => {
    const result = await deliverRun(
      { ...deps, store, settleUnverified: async () => {} },
      { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: zeroCoverageDelivery() },
    );
    expect(result.ok).toBe(true);
    // a second deliverRun finds the run no longer `finalizing` — the CAS throws and the blob is intact.
    await expect(
      deliverRun(
        { ...deps, store, settleUnverified: async () => {} },
        { billingAccountId: "ba_seed", holdLedgerId: "hold_1", spentCredits: 42, capCredits: 100, delivery: delivery() },
      ),
    ).rejects.toThrow();
    const run = (await db.client.query("select delivery from runs where id=$1", [RUN])).rows[0] as {
      delivery: { label?: string } | null;
    };
    expect(run.delivery?.label).toBe("unverified");
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
