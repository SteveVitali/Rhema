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

  // AC3 (Path B, ADR-006) — a claim citing a URL absent from the proxy fetch log NO LONGER hard-fails delivery:
  // the unfetched url is STRIPPED from the persisted ledger and the claim's verdict downgraded (the §12.8(c)
  // treatment), so the delivered dossier cites only fetch-verified sources. Delivery SUCCEEDS.
  it("strips a claim.url absent from the proxy fetch log + downgrades the claim, delivering (AC3 / Path B)", async () => {
    const args = baseArgs({
      claimLedger: claimLedger([{ ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: "https://nope.example/x", normalizedUrl: normalizeUrl("https://nope.example/x"), humanAdded: false }]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    // delivered: a correspondence item + a frozen, immutable draft.
    expect(result.strippedCitations).toBe(1);
    expect(result.downgradedClaimOrdinals).toEqual([1]);
    expect(((await db.exec.query("select count(*)::int as n from correspondence_items where run_id=$1", [runId])).rows[0] as { n: number }).n).toBe(1);
    // the unfetched url was stripped + the verdict downgraded; the persisted ledger cites nothing unfetched.
    const claim = (await db.exec.query("select url, verdict, source_check from claims where correspondence_id=$1", [result.correspondenceId])).rows[0] as { url: string | null; verdict: string; source_check: string };
    expect(claim.url).toBeNull();
    expect(claim.verdict).toBe("unverifiable");
    expect(claim.source_check).toBe("suspicious_source");
  });

  it("strips an unfetched claim.sources[].url but keeps the fetched ones, delivering (REQ-OBJ-18 / Path B)", async () => {
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "contradicted", url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL),
          sources: [
            { url: "https://unfetched.example/s", normalizedUrl: normalizeUrl("https://unfetched.example/s"), accessedAt: "2026-09-03T00:00:00.000Z", stance: "contradicts" },
            { url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL), accessedAt: "2026-09-03T00:00:00.000Z", stance: "supports" },
          ], humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(1);
    expect(result.downgradedClaimOrdinals).toEqual([1]);
    // only the fetched source survives; the unfetched one was stripped.
    const srcs = (await db.exec.query("select cs.url from claim_sources cs join claims c on c.id=cs.claim_id where c.correspondence_id=$1 order by cs.ordinal", [result.correspondenceId])).rows as { url: string }[];
    expect(srcs.map((s) => s.url)).toEqual([FETCHED_URL]);
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

  // PRB.05 (§5.7) — delivering a `response` correspondence freezes the triage ledger: the review
  // findings' open dispositions lock and link forward (response_id → the delivered response).
  it("delivering a 'response' freezes + forward-links the review's open dispositions", async () => {
    // the review the Revise run responds to: one correspondence with one finding + two dispositions.
    await db.exec.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('corr_rev',$1,'review','dft_v2','run_rev', now(), '{}')`,
      [projectId],
    );
    await db.exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('rf_1','corr_rev','dft_v2',1,'argument','major','editor','t','b')`,
    );
    await db.exec.query(
      `insert into dispositions(id, finding_id, kind, status, rationale, by_actor)
       values ('dsp_open','rf_1','rebut','proposed','no','{"kind":"user","userId":"u_1"}'::jsonb)`,
    );

    const result = await runDeliveryTransaction(
      db.exec,
      deps,
      baseArgs({ correspondenceKind: "response" }),
    );

    const d = (
      await db.exec.query("select response_id, frozen_at, move_ordinal from dispositions where id='dsp_open'")
    ).rows[0] as { response_id: string | null; frozen_at: Date | null; move_ordinal: number | null };
    expect(d.frozen_at).not.toBeNull(); // cards lock at delivery
    expect(d.response_id).toBe(result.correspondenceId); // links forward to the response
    expect(d.move_ordinal).toBeNull(); // no response-ledger sidecar → no move link (PRB.06 fills it when present)
  });

  // PRB.06 (§5.8) — the response-ledger fold: the frozen ledger's rows persist as dispositions carrying the
  // move link, the v(N+1) draft row is created, and `revision.move_traced` fires per move (REQ-BETA-7).
  it("folds the response ledger at delivery: dispositions + move_ordinal + v(N+1) + revision.move_traced", async () => {
    // entity ids that land in the revision.move_traced payload must be valid ULIDs (idSchema) —
    // mint them from the harness factory rather than using the short test ids.
    const reviewCorrId = deps.ids("corr");
    const findingId = deps.ids("fnd");
    const baseDraftId = deps.ids("dft");
    const nextDraftId = deps.ids("dft");
    // the review the Revise run answers: one finding + one open (user-authored) disposition.
    await db.exec.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ($1,$2,'review','dft_v2','run_rev', now(), '{}')`,
      [reviewCorrId, projectId],
    );
    await db.exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ($1,$2,'dft_v2',1,'argument','major','editor','weak pillar','b')`,
      [findingId, reviewCorrId],
    );
    await db.exec.query(
      `insert into dispositions(id, finding_id, kind, status, rationale, by_actor)
       values ('dsp_open',$1,'accept','open',null,'{"kind":"user","userId":"u_1"}'::jsonb)`,
      [findingId],
    );
    // the base draft under a ULID id, as THE working head (dft_v2 freezes first — one working head per
    // project, REQ-DATA-14). It freezes onto av_v2 at delivery → the diff's "before".
    await db.exec.query("update drafts set state='frozen', promoted_version_id='av_v2' where id='dft_v2'");
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id)
       values ($1,$2,3,'response_to_review','working','dft_v2')`,
      [baseDraftId, projectId],
    );

    // the delivered v3 draft + the frozen response-ledger.json artifact.
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
        {
          findingOrdinal: 1,
          disposition: { kind: "accept", status: "done", moveOrdinal: 1, actor: "drafter" },
          anchor: { blockId: "b2", quote: "restated pillar paragraph", startOffset: 0, endOffset: 0, confidence: 1 },
        },
      ],
      moves: [{ ordinal: 1, title: "Restate the pillar" }],
    };
    const ledgerBlob = await store.putText(workspaceId, JSON.stringify(ledger));
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_ledger',$1,$2,'sidecar','run','correspondence/response-ledger.json','av_ledger')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_ledger','art_ledger',1,$1,'k',400,'application/json','{"kind":"system"}'::jsonb)`,
      [ledgerBlob.sha256],
    );

    const base = baseArgs();
    const result = await runDeliveryTransaction(db.exec, deps, {
      runId: base.runId,
      attempt: base.attempt,
      workspaceId: base.workspaceId,
      projectId: base.projectId,
      draftId: baseDraftId,
      correspondenceKind: "response",
      priorReviewId: reviewCorrId,
      newDraftId: nextDraftId,
      deliveredVersionIds: ["av_v3", "av_ledger"],
      draftPromotedVersionId: "av_v2",
      sidecars: [{ filename: "response-ledger.json", json: ledger as never }],
      verdictContext: EMPTY_VERDICT_CTX,
    });

    // the disposition row: the ledger's kind/status + the move link + the freeze — actor kept ("user").
    const d = (
      await db.exec.query(
        "select kind, status, move_ordinal, response_id, frozen_at, by_actor from dispositions where id='dsp_open'",
      )
    ).rows[0] as { kind: string; status: string; move_ordinal: number | null; response_id: string | null; frozen_at: Date | null; by_actor: { kind: string } };
    expect(d.kind).toBe("accept");
    expect(d.status).toBe("done");
    expect(d.move_ordinal).toBe(1);
    expect(d.response_id).toBe(result.correspondenceId);
    expect(d.frozen_at).not.toBeNull();
    expect(d.by_actor.kind).toBe("user");

    // the v(N+1) draft row: origin response_to_review, based on the frozen head, promoted to the
    // delivered drafts/v3.md version.
    expect(result.newDraftId).toBe(nextDraftId);
    const next = (
      await db.exec.query("select n, origin, base_draft_id, promoted_version_id from drafts where id=$1", [nextDraftId])
    ).rows[0] as { n: number; origin: string; base_draft_id: string; promoted_version_id: string };
    expect(next).toMatchObject({ n: 4, origin: "response_to_review", base_draft_id: baseDraftId, promoted_version_id: "av_v3" });

    // prior_review_id on the response correspondence.
    const corr = (
      await db.exec.query("select prior_review_id from correspondence_items where id=$1", [result.correspondenceId])
    ).rows[0] as { prior_review_id: string | null };
    expect(corr.prior_review_id).toBe(reviewCorrId);

    // revision.move_traced: one row for the joined move (the added paragraph resolved into its hunk) —
    // the diff has exactly one hunk (the added b2), claimed by Move 1, so no unlinked remainder.
    const traces = events.filter((e) => e.type === "revision.move_traced");
    expect(traces.length).toBe(1);
    expect(traces[0]!.payload).toMatchObject({
      findingId,
      moveId: "M1",
      hunkCount: 1,
      draftId: nextDraftId,
      baseDraftId,
    });
    expect((traces[0]!.payload as { charsChanged: number }).charsChanged).toBeGreaterThan(0);
    expect(result.moveTraces).toMatchObject([{ moveId: "M1", hunkCount: 1 }]);
  });

  it("delivering a 'review' does NOT touch dispositions (only a response freezes the ledger)", async () => {
    await db.exec.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('corr_rev',$1,'review','dft_v2','run_rev', now(), '{}')`,
      [projectId],
    );
    await db.exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('rf_1','corr_rev','dft_v2',1,'argument','major','editor','t','b')`,
    );
    await db.exec.query(
      `insert into dispositions(id, finding_id, kind, status, by_actor)
       values ('dsp_open','rf_1','accept','proposed','{"kind":"user","userId":"u_1"}'::jsonb)`,
    );
    await runDeliveryTransaction(db.exec, deps, baseArgs({ correspondenceKind: "review" }));
    const d = (await db.exec.query("select frozen_at, response_id from dispositions where id='dsp_open'"))
      .rows[0] as { frozen_at: Date | null; response_id: string | null };
    expect(d.frozen_at).toBeNull();
    expect(d.response_id).toBeNull();
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
