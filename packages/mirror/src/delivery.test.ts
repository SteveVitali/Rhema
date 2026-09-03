import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaimLedgerSidecar, FindingsSidecar } from "@rhema/contracts";
import { materializeSeat } from "./materialize.js";
import { recordMounts, recordSubagentLaunch } from "./attestation.js";
import {
  DeliveryValidationError,
  runDeliveryTransaction,
  type DeliveryArgs,
  type DeliveryDeps,
  type ObligationHook,
} from "./delivery.js";
import { normalizeUrl, type VerdictSourceContext } from "./validation.js";
import { createMirrorTestDb, testDeps, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedBase, seedFetchLog, seedMirrorProject, seedRun } from "./testing/fixture.js";
import type { SqlExecutor } from "./sql.js";

// P0.09 delivery transaction (REQ-DATA-7 amended): validation → correspondence + freeze + obligation hook →
// attestation, atomic; a validation failure writes nothing (AC3); an obligation-hook crash rolls back the
// whole dossier (AC8); the verdict source check downgrades at commit (AC6 at the transaction level).

const FETCHED_URL = "https://a.example/one";
const EMPTY_VERDICT_CTX: VerdictSourceContext = {
  citationDomains: new Set(),
  reputableDomains: new Set(),
  searchResultDomains: new Set(),
};

function claimLedger(claims: ClaimLedgerSidecar["claims"]): ClaimLedgerSidecar {
  return { sidecar: "claim_ledger", version: 1, claims } as ClaimLedgerSidecar;
}
function findings(): FindingsSidecar {
  return {
    sidecar: "findings",
    version: 1,
    findings: [{ ordinal: 1, kind: "argument", severity: "major", origin: "editor", anchor: null, title: "t", body: "b", rubricDims: [] }],
  } as FindingsSidecar;
}

describe("delivery transaction", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  const runId = "run_deliver";
  const projectId = "proj_pv";

  let events: { type: string; payload: unknown }[];
  let deps: DeliveryDeps;

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    await seedMirrorProject(db.exec, store, workspaceId, { id: projectId, personaId: "prs_pv", tag: "PV" });
    await seedRun(db.exec, { runId, workspaceId, projectId, state: "finalizing" });
    // a WORKING draft (v2) the review will freeze on delivery.
    const dv = await store.putText(workspaceId, "# v2\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,$1,'k',4,'text/markdown','{"kind":"system"}'::jsonb)`,
      [dv.sha256],
    );
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state) values ('dft_v2',$1,2,'response_to_review','working')`,
      [projectId],
    );
    // persist the hydration manifest (the attestation fact) + one allowed fetch for the claim url.
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId, personaId: "prs_pv" });
    await recordMounts(db.exec, { runId, attempt: 1, manifest: tree.manifest });
    await seedFetchLog(db.exec, { runId, url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL) });

    events = [];
    deps = {
      ...testDeps(),
      store,
      eventWriter: { async append(_exec: SqlExecutor, ev) { events.push({ type: ev.type, payload: ev.payload }); } },
    };
  });
  afterEach(() => db.close());

  function baseArgs(over: Partial<DeliveryArgs> = {}): DeliveryArgs {
    return {
      runId,
      attempt: 1,
      workspaceId,
      projectId,
      draftId: "dft_v2",
      correspondenceKind: "review",
      deliveredVersionIds: ["av_v2"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "findings.json", json: findings() }],
      claimLedger: claimLedger([{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL), humanAdded: false }]),
      findings: findings(),
      verdictContext: EMPTY_VERDICT_CTX,
      ...over,
    };
  }

  it("delivers: correspondence + claims + findings, freezes the draft, marks artifacts immutable, attests", async () => {
    const result = await runDeliveryTransaction(db.exec, deps, baseArgs());
    expect(result.correspondenceId).toBeTruthy();

    const corr = (await db.exec.query("select count(*)::int as n from correspondence_items where run_id=$1", [runId])).rows[0] as { n: number };
    expect(corr.n).toBe(1);
    const claims = (await db.exec.query("select count(*)::int as n from claims where correspondence_id=$1", [result.correspondenceId])).rows[0] as { n: number };
    expect(claims.n).toBe(1);
    const finds = (await db.exec.query("select count(*)::int as n from findings where correspondence_id=$1", [result.correspondenceId])).rows[0] as { n: number };
    expect(finds.n).toBe(1);

    // the input draft is frozen (REQ-DATA-21) and the delivered artifact is immutable (REQ-VIS-4/5).
    const draft = (await db.exec.query("select state from drafts where id='dft_v2'")).rows[0] as { state: string };
    expect(draft.state).toBe("frozen");
    const av = (await db.exec.query("select immutable from artifact_versions where id='av_v2'")).rows[0] as { immutable: boolean };
    expect(av.immutable).toBe(true);

    // the attestation event + report artifact were emitted (AC7).
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["boundary.attested", "artifact.written"]));
    const rep = (await db.exec.query("select count(*)::int as n from artifacts where kind='access_report' and project_id=$1", [projectId])).rows[0] as { n: number };
    expect(rep.n).toBe(1);
  });

  // AC3 — a claim citing a URL absent from the proxy fetch log fails delivery; nothing is written or frozen.
  it("fails delivery when a claim.url is not in the proxy fetch log (AC3)", async () => {
    const args = baseArgs({
      claimLedger: claimLedger([{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: "https://nope.example/x", normalizedUrl: normalizeUrl("https://nope.example/x"), humanAdded: false }]),
    });
    await expect(runDeliveryTransaction(db.exec, deps, args)).rejects.toBeInstanceOf(DeliveryValidationError);
    // nothing committed / frozen / immutable (the caller ends the run failed(validation)).
    expect(((await db.exec.query("select count(*)::int as n from correspondence_items where run_id=$1", [runId])).rows[0] as { n: number }).n).toBe(0);
    expect(((await db.exec.query("select state from drafts where id='dft_v2'")).rows[0] as { state: string }).state).toBe("working");
    expect(((await db.exec.query("select immutable from artifact_versions where id='av_v2'")).rows[0] as { immutable: boolean }).immutable).toBe(false);
  });

  it("fails delivery when a claim.sources[].url is not in the proxy fetch log (REQ-OBJ-18 / AC3)", async () => {
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "contradicted", url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL),
          sources: [{ url: "https://unfetched.example/s", normalizedUrl: normalizeUrl("https://unfetched.example/s"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }], humanAdded: false },
      ]),
    });
    await expect(runDeliveryTransaction(db.exec, deps, args)).rejects.toBeInstanceOf(DeliveryValidationError);
  });

  // AC6 (at the commit level) — a Tier-1 contradicted verdict from a suspicious source is downgraded on write.
  it("downgrades a suspicious Tier-1 verdict to unverifiable + suspicious_source at commit (§12.8(c))", async () => {
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 1, verdict: "contradicted", url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL),
          sources: [{ url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" }], humanAdded: false },
      ]),
      verdictContext: EMPTY_VERDICT_CTX, // a.example is not citation/reputable/search — suspicious
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.downgradedClaimOrdinals).toEqual([1]);
    const claim = (await db.exec.query("select verdict, source_check from claims where correspondence_id=$1", [result.correspondenceId])).rows[0] as { verdict: string; source_check: string };
    expect(claim.verdict).toBe("unverifiable");
    expect(claim.source_check).toBe("suspicious_source");
  });

  // AC8 — an obligation-hook crash between the row insert and freeze rolls back ALL of it.
  it("rolls back the whole dossier when the obligation hook throws (atomicity, AC8)", async () => {
    const throwingHook: ObligationHook = { async onDelivery() { throw new Error("obligation hook boom"); } };
    await db.pg.query("begin");
    try {
      await runDeliveryTransaction(db.exec, { ...deps, obligationHook: throwingHook }, baseArgs());
      throw new Error("expected the hook to throw");
    } catch (e) {
      expect((e as Error).message).toContain("boom");
      await db.pg.query("rollback");
    }
    // nothing survived: no correspondence, the draft is still working, the artifact still mutable.
    expect(((await db.exec.query("select count(*)::int as n from correspondence_items where run_id=$1", [runId])).rows[0] as { n: number }).n).toBe(0);
    expect(((await db.exec.query("select state from drafts where id='dft_v2'")).rows[0] as { state: string }).state).toBe("working");
    expect(((await db.exec.query("select immutable from artifact_versions where id='av_v2'")).rows[0] as { immutable: boolean }).immutable).toBe(false);
  });

  // AC8 — a separate retried ledger debit never rolls back a delivered dossier.
  it("a failing separate ledger-debit transaction leaves the delivered dossier intact (AC8)", async () => {
    const result = await runDeliveryTransaction(db.exec, deps, baseArgs());
    // simulate the SEPARATE debit transaction failing after delivery committed.
    await db.pg.query("begin");
    try {
      await db.exec.query("insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key) values ('bad',$1,'x','debit',1,'included','s','k')", [workspaceId]);
      throw new Error("debit failed");
    } catch {
      await db.pg.query("rollback");
    }
    // the dossier is still delivered and frozen.
    expect(((await db.exec.query("select count(*)::int as n from correspondence_items where id=$1", [result.correspondenceId])).rows[0] as { n: number }).n).toBe(1);
    expect(((await db.exec.query("select state from drafts where id='dft_v2'")).rows[0] as { state: string }).state).toBe("frozen");
  });

  // The producer check: a second read not produced by an orchestrator-launched scoped query fails delivery.
  it("fails delivery when the second read's producerQueryId is not an orchestrator launch (§12.2 F17)", async () => {
    await expect(
      runDeliveryTransaction(db.exec, deps, baseArgs({ secondReadProducerQueryId: "forged-query" })),
    ).rejects.toBeInstanceOf(DeliveryValidationError);
  });

  it("passes the producer check for a recorded orchestrator-launched second read", async () => {
    await recordSubagentLaunch(db.exec, testDeps(), {
      runId, attempt: 1, label: "second-reader", inputsKind: "explicit_files",
      inputPaths: ["/work/project/drafts/v2.md"], producerQueryId: "q_second",
    });
    const result = await runDeliveryTransaction(db.exec, deps, baseArgs({ secondReadProducerQueryId: "q_second" }));
    expect(result.correspondenceId).toBeTruthy();
  });
});
