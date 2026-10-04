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

  // ---- CITE.1 (ADR-083/084/085) — canonical-on-read URL identity + the measured completeness record ----

  it("covers a cited url whose stored normalized_url carries the proxy's query+slash form (ADR-083)", async () => {
    // the PROXY form keeps query + trailing slash; the guard's canonical drops both. Pre-CITE.1 this
    // byte-join missed and Path B stripped a fetched citation (the parity defect, ticket §Goal).
    const cited = "https://x.test/a";
    await seedFetchLog(db.exec, { runId, url: "https://x.test/a/?id=7", normalizedUrl: "https://x.test/a/?id=7" });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: cited, normalizedUrl: normalizeUrl(cited), humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(0);
    expect(result.downgradedClaimOrdinals).toEqual([]);
    const claim = (
      await db.exec.query("select url, verdict from claims where correspondence_id=$1", [result.correspondenceId])
    ).rows[0] as { url: string | null; verdict: string };
    expect(claim.url).toBe(cited);
    expect(claim.verdict).toBe("verified");
    expect(result.citationCompleteness).toMatchObject({ cited: 1, covered: 1, missed: 0, stripped: 0 });
  });

  it("covers the cited ?id=7 variant of a fetched url (query dropped on BOTH sides — ADR-083)", async () => {
    const cited = "https://x.test/a?id=7";
    await seedFetchLog(db.exec, { runId, url: "https://x.test/a/", normalizedUrl: "https://x.test/a/" });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: cited, normalizedUrl: normalizeUrl(cited), humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(0);
    const claim = (
      await db.exec.query("select url from claims where correspondence_id=$1", [result.correspondenceId])
    ).rows[0] as { url: string | null };
    expect(claim.url).toBe(cited);
  });

  it("a url-bearing `search` row covers the cite + reports searchCovered (ADR-084 — guard/chip parity)", async () => {
    const cited = "https://hit.test/p";
    await seedFetchLog(db.exec, {
      runId,
      kind: "search",
      url: cited,
      normalizedUrl: "https://hit.test/p",
      query: "hit p",
    });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: cited, normalizedUrl: normalizeUrl(cited), humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(0);
    expect(result.citationCompleteness).toMatchObject({ cited: 1, covered: 1, searchCovered: 1, missed: 0 });
  });

  it("a `backfill` phase-class row covers the cite + reports backfillRan/backfillResolved (ADR-085)", async () => {
    const cited = "https://b.test/rescued";
    await seedFetchLog(db.exec, { runId, url: cited, normalizedUrl: cited, phaseClass: "backfill" });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: cited, normalizedUrl: normalizeUrl(cited), humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(0);
    expect(result.citationCompleteness).toMatchObject({
      cited: 1,
      covered: 1,
      missed: 0,
      backfillRan: true,
      backfillResolved: 1,
    });
  });

  it("records the measured record for a fixture with one parity-rescued + one true miss (BL-15)", async () => {
    // the seeded FETCHED_URL covers the base claim; add a parity-rescued cite + a truly unretrieved one.
    await seedFetchLog(db.exec, { runId, url: "https://x.test/a/?id=7", normalizedUrl: "https://x.test/a/?id=7" });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 2, verdict: "verified", url: "https://x.test/a", normalizedUrl: "https://x.test/a", humanAdded: false },
        { ordinal: 2, text: "c2", tier: 2, verdict: "verified", url: "https://gone.test/x", normalizedUrl: "https://gone.test/x", humanAdded: false },
      ]),
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.strippedCitations).toBe(1); // ONLY the true miss stripped — the parity case survived
    expect(result.downgradedClaimOrdinals).toEqual([2]);
    expect(result.citationCompleteness).toMatchObject({
      cited: 2,
      covered: 1,
      missed: 1,
      stripped: 1,
      missedUrls: ["https://gone.test/x"],
      backfillRan: false,
      backfillResolved: 0,
    });
    const claims = (
      await db.exec.query("select ordinal, url, verdict from claims where correspondence_id=$1 order by ordinal", [result.correspondenceId])
    ).rows as { ordinal: number; url: string | null; verdict: string }[];
    expect(claims[0]).toMatchObject({ url: "https://x.test/a", verdict: "verified" });
    expect(claims[1]).toMatchObject({ url: null, verdict: "unverifiable" });
  });

  it("a Tier-1 verdict sourced from a domain the run's own searches reached earns sourceCheck=from_search (ADR-084; D-P0.15-2)", async () => {
    // before CITE.1 `searchResultDomains` was only the harness's claim-ledger hostname guess — a Tier-1
    // verdict whose source domain surfaced via a url-bearing SEARCH row now passes §12.8(c) honestly.
    const cited = "https://found.test/p";
    await seedFetchLog(db.exec, { runId, kind: "search", url: cited, normalizedUrl: cited, query: "found p" });
    const args = baseArgs({
      claimLedger: claimLedger([
        { ordinal: 1, text: "c1", tier: 1, verdict: "verified", url: cited, normalizedUrl: normalizeUrl(cited),
          sources: [{ url: cited, normalizedUrl: normalizeUrl(cited), accessedAt: "2026-09-03T00:00:00.000Z", stance: "supports" }], humanAdded: false },
      ]),
      verdictContext: EMPTY_VERDICT_CTX, // found.test is not citation/reputable — only search-reached
    });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.downgradedClaimOrdinals).toEqual([]); // NOT suspicious_source — search-reached counts
    const claim = (
      await db.exec.query("select verdict, source_check from claims where correspondence_id=$1", [result.correspondenceId])
    ).rows[0] as { verdict: string; source_check: string };
    expect(claim.verdict).toBe("verified");
    expect(claim.source_check).toBe("from_search");
  });

  it("no claim ledger ⇒ no completeness record (a note delivery stays unmeasured)", async () => {
    const args = baseArgs({ claimLedger: undefined });
    const result = await runDeliveryTransaction(db.exec, deps, args);
    expect(result.citationCompleteness).toBeUndefined();
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
    // delivered drafts/v3.md version — and born FROZEN (PRB.19: it IS the delivered revision, sealed like
    // its base; editing it forks a human_revision child per REQ-DATA-24).
    expect(result.newDraftId).toBe(nextDraftId);
    const next = (
      await db.exec.query("select n, origin, state, base_draft_id, promoted_version_id, frozen_at from drafts where id=$1", [nextDraftId])
    ).rows[0] as { n: number; origin: string; state: string; base_draft_id: string; promoted_version_id: string; frozen_at: Date | null };
    expect(next).toMatchObject({ n: 4, origin: "response_to_review", state: "frozen", base_draft_id: baseDraftId, promoted_version_id: "av_v3" });
    expect(next.frozen_at).not.toBeNull();

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

  // PRB.19 (F26) — the REAL revise shape: `drafts/v(N+1).md` is produced by the `revise` phase, so it lands
  // in `steps.produced_version_ids`, NOT in `deliveredVersionIds` (which name only the final `deliver`
  // phase's artifacts — the response letter). The reserved `nextDraftId` row + `revision.move_traced` must
  // still materialize.
  it("materializes the reserved nextDraftId from a draft produced by an EARLIER phase (F26)", async () => {
    const reviewCorrId = deps.ids("corr");
    const findingId = deps.ids("fnd");
    const baseDraftId = deps.ids("dft");
    const nextDraftId = deps.ids("dft");
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
    // the delivery base under a ULID id, as THE working head (dft_v2 freezes first — one working head per
    // project, REQ-DATA-14); it freezes onto av_v2 at delivery → the diff's "before".
    await db.exec.query("update drafts set state='frozen', promoted_version_id='av_v2' where id='dft_v2'");
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id)
       values ($1,$2,3,'response_to_review','working','dft_v2')`,
      [baseDraftId, projectId],
    );
    // the produced draft — committed by the `revise` step (produced_version_ids), never deliveredVersionIds.
    const v4 = await store.putText(workspaceId, "# v2\n\nThe restated pillar paragraph.\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v4',$1,$2,'draft','shared','drafts/v4.md','av_v4')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v4','art_v4',1,$1,'k',40,'text/markdown','{"kind":"agent"}'::jsonb)`,
      [v4.sha256],
    );
    await db.exec.query(
      `insert into steps(id, run_id, phase, ordinal, state, attempt, produced_version_ids)
       values ('st_revise',$1,'revise',3,'done',1,'{av_v4}')`,
      [runId],
    );
    // the delivered dossier is the response letter only (the deliver phase's declared artifact).
    const letter = await store.putText(workspaceId, "# Response\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_resp',$1,$2,'response_letter','shared','correspondence/v2-response.md','av_resp')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_resp','art_resp',1,$1,'k',20,'text/markdown','{"kind":"agent"}'::jsonb)`,
      [letter.sha256],
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

    const base = baseArgs();
    const result = await runDeliveryTransaction(db.exec, deps, {
      ...base,
      draftId: baseDraftId,
      correspondenceKind: "response",
      priorReviewId: reviewCorrId,
      newDraftId: nextDraftId,
      deliveredVersionIds: ["av_resp"], // the letter only — the draft came through steps.produced_version_ids
      sidecars: [{ filename: "response-ledger.json", json: ledger as never }],
      claimLedger: undefined,
      findings: undefined,
    });

    // the reserved draft row: v4, frozen, promoted to the produced drafts/v4.md version (immutable now).
    expect(result.newDraftId).toBe(nextDraftId);
    const next = (
      await db.exec.query("select n, origin, state, base_draft_id, promoted_version_id, frozen_at from drafts where id=$1", [nextDraftId])
    ).rows[0] as { n: number; origin: string; state: string; base_draft_id: string; promoted_version_id: string; frozen_at: Date | null };
    expect(next).toMatchObject({ n: 4, origin: "response_to_review", state: "frozen", base_draft_id: baseDraftId, promoted_version_id: "av_v4" });
    expect(next.frozen_at).not.toBeNull();
    expect(((await db.exec.query("select immutable from artifact_versions where id='av_v4'")).rows[0] as { immutable: boolean }).immutable).toBe(true);

    // the ledger row folded + the move trace emitted against the produced draft.
    const disp = (
      await db.exec.query("select kind, response_id, frozen_at from dispositions where finding_id=$1", [findingId])
    ).rows[0] as { kind: string; response_id: string | null; frozen_at: Date | null };
    expect(disp.kind).toBe("accept");
    expect(disp.response_id).toBe(result.correspondenceId);
    expect(disp.frozen_at).not.toBeNull();
    const traces = events.filter((e) => e.type === "revision.move_traced");
    expect(traces).toHaveLength(1);
    expect(traces[0]!.payload).toMatchObject({ findingId, moveId: "M1", draftId: nextDraftId, baseDraftId });
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

  // PRB.16b (LIVE FINDING 12) — the seat wrote its dossier under its PRIVATE `agents/editor/` namespace
  // (the manifest pins output_dir there; `correspondence/` is a read-only mount), so a responding run's
  // author seat — shared read exactly `drafts/ correspondence/ manifest.md` — could not see it and
  // self-reported `blocked` at bootstrap. Delivery publishes each produced dossier-kind artifact as a
  // shared `correspondence/<kind>/<ordinal>/<basename>` copy: same content-addressed bytes, immutable.
  it("publishes the agent-namespace dossier into shared correspondence/<kind>/<ordinal>/ (F12)", async () => {
    // the review run's produced versions: the dossier files + a private research note that must NOT ship.
    const letter = await store.putText(workspaceId, "# Editor's letter\nVerdict: revise.\n");
    const claimMd = await store.putText(workspaceId, "# Claim ledger\n");
    const notes = await store.putText(workspaceId, "# private research scratch\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id) values
         ('art_letter',$1,$2,'editors_letter','agent:editor','agents/editor/editors-letter.md','av_letter'),
         ('art_claim',$1,$2,'claim_ledger','agent:editor','agents/editor/01-claim-ledger.md','av_claim'),
         ('art_notes',$1,$2,'research_note','agent:editor','agents/editor/research/index.md','av_notes')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by) values
         ('av_letter','art_letter',1,$1,$4,100,'text/markdown','{"kind":"agent"}'::jsonb),
         ('av_claim','art_claim',1,$2,$5,80,'text/markdown','{"kind":"agent"}'::jsonb),
         ('av_notes','art_notes',1,$3,$6,50,'text/markdown','{"kind":"agent"}'::jsonb)`,
      [letter.sha256, claimMd.sha256, notes.sha256, letter.key, claimMd.key, notes.key],
    );
    // the run's committed steps name the produced versions — the dossier source of truth.
    await db.exec.query(
      `insert into steps(id, run_id, phase, ordinal, state, attempt, produced_version_ids) values
         ('st_letter',$1,'letter',6,'done',1,'{av_letter}'),
         ('st_verif',$1,'verification',2,'done',1,'{av_claim,av_notes}')`,
      [runId],
    );

    const result = await runDeliveryTransaction(db.exec, deps, baseArgs());

    // the dossier copies landed as shared, immutable versions of the SAME bytes under review ordinal 1.
    const copies = (
      await db.exec.query(
        `select a.mirror_path, a.kind, a.namespace, av.immutable, av.content_sha256, av.s3_key
           from artifacts a join artifact_versions av on av.artifact_id = a.id
          where a.mirror_path like 'correspondence/review/1/%' and a.kind <> 'access_report'
          order by a.mirror_path`,
        [],
      )
    ).rows as { mirror_path: string; kind: string; namespace: string; immutable: boolean; content_sha256: string; s3_key: string }[];
    // the .md dossier copies + the findings.json twin serialized from the verbatim-persisted sidecar
    // (.rhema/ twins are never harvested — findings/rubric ship only via this delivery write).
    expect(copies).toHaveLength(3); // the dossier kinds only — the private research note stays agent-side
    expect(copies.map((c) => c.mirror_path)).toEqual([
      "correspondence/review/1/01-claim-ledger.md",
      "correspondence/review/1/editors-letter.md",
      "correspondence/review/1/findings.json",
    ]);
    for (const c of copies) {
      expect(c.namespace).toBe("shared");
      expect(c.immutable).toBe(true);
    }
    expect(copies[0]!.content_sha256).toBe(claimMd.sha256);
    expect(copies[0]!.s3_key).toBe(claimMd.key); // re-pointed, never re-uploaded
    expect(copies[1]!.content_sha256).toBe(letter.sha256);
    expect(result.dossierVersionIds).toHaveLength(3);

    // the correspondence item's artifact_ids name the complete shared dossier.
    const corr = (
      await db.exec.query("select artifact_ids from correspondence_items where id=$1", [result.correspondenceId])
    ).rows[0] as { artifact_ids: string[] };
    for (const v of result.dossierVersionIds) expect(corr.artifact_ids).toContain(v);

    // nothing private leaked: no artifact under correspondence/ names the research note's bytes.
    const leaked = (
      await db.exec.query(
        `select count(*)::int as n from artifacts a join artifact_versions av on av.artifact_id = a.id
          where a.mirror_path like 'correspondence/%' and av.content_sha256 = $1`,
        [notes.sha256],
      )
    ).rows[0] as { n: number };
    expect(leaked.n).toBe(0);
  });
});

// P1.10 — a `drafting_note` delivery (the Draft verb): the run AUTHORS the draft, so there is no base
// head to freeze — the delivery creates the reserved `drafts/v(N+1)` row BORN FROZEN
// (origin `drafted_from_outline`) with the Writing phase's committed version as its promoted head.
describe("delivery — drafting_note (the Draft run's born-frozen draft; REQ-WF-4)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  const runId = "run_draft_note";
  const projectId = "proj_dn";

  let events: { type: string; payload: unknown }[];
  let deps: DeliveryDeps;

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    await seedMirrorProject(db.exec, store, workspaceId, { id: projectId, personaId: "prs_dn", tag: "DN" });
    await seedRun(db.exec, { runId, workspaceId, projectId, state: "finalizing" });

    // the outline draft the run read — stays WORKING (a Draft delivery never freezes its outline).
    const outlineV = await store.putText(workspaceId, "# outline\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_outline',$1,$2,'outline','project','outline/the-piece.md','av_outline')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_outline','art_outline',1,$1,'k',9,'text/markdown','{"kind":"system"}'::jsonb)`,
      [outlineV.sha256],
    );
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state) values ('dft_outline',$1,2,'outline','working')`,
      [projectId],
    );

    // the Writing phase's committed `drafts/v3.md` — the born-frozen row's promoted head.
    const draftV = await store.putText(workspaceId, "# v3 — the drafted piece\n\nFirst section.\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v3',$1,$2,'draft','shared','drafts/v3.md','av_v3')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v3','art_v3',1,$1,'k',44,'text/markdown','{"kind":"system"}'::jsonb)`,
      [draftV.sha256],
    );
    await db.exec.query(
      `insert into steps(id, run_id, phase, ordinal, state, produced_version_ids, started_at, ended_at)
       values ('st_draft',$1,'draft',4,'done','{av_v3}',now(),now())`,
      [runId],
    );

    // the delivered drafting note itself (committed by the delivery phase's harvest).
    const noteV = await store.putText(workspaceId, "# Drafting note\n\n## Choices\n…\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_note',$1,$2,'drafting_note','shared','correspondence/v3-drafting-note.md','av_note')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_note','art_note',1,$1,'k',36,'text/markdown','{"kind":"system"}'::jsonb)`,
      [noteV.sha256],
    );

    const tree = await materializeSeat(db.exec, store, { seat: "author", projectId, personaId: "prs_dn" });
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

  it("creates the born-frozen drafted_from_outline row + the drafting_note correspondence item", async () => {
    const result = await runDeliveryTransaction(db.exec, deps, {
      runId,
      attempt: 1,
      workspaceId,
      projectId,
      draftId: "dft_v3",
      correspondenceKind: "drafting_note",
      deliveredVersionIds: ["av_note"],
      newDraftId: "dft_v3",
      newDraftN: 3,
      sidecars: [],
      claimLedger: claimLedger([
        { ordinal: 1, text: "a grounded claim", tier: 2, verdict: "verified", url: FETCHED_URL, normalizedUrl: normalizeUrl(FETCHED_URL), humanAdded: false },
        { ordinal: 2, text: "an unverified claim", tier: 3, verdict: "unverifiable", humanAdded: false },
      ]),
      verdictContext: EMPTY_VERDICT_CTX,
    });
    expect(result.correspondenceId).toBeTruthy();
    expect(result.newDraftId).toBe("dft_v3");

    // the born-frozen row: n=3, promoted head = the Writing step's committed version, already sealed.
    const draft = (
      await db.exec.query(
        "select n, origin, state, promoted_version_id, frozen_at from drafts where id='dft_v3'",
      )
    ).rows[0] as { n: number; origin: string; state: string; promoted_version_id: string; frozen_at: unknown };
    expect(draft).toMatchObject({ n: 3, origin: "drafted_from_outline", state: "frozen", promoted_version_id: "av_v3" });
    expect(draft.frozen_at).not.toBeNull();
    const av = (await db.exec.query("select immutable from artifact_versions where id='av_v3'")).rows[0] as { immutable: boolean };
    expect(av.immutable).toBe(true);

    // the correspondence item is the drafting note kind, on the NEW draft, carrying the delivered note.
    const corr = (
      await db.exec.query("select kind, draft_id, artifact_ids from correspondence_items where id=$1", [result.correspondenceId])
    ).rows[0] as { kind: string; draft_id: string; artifact_ids: string[] };
    expect(corr).toMatchObject({ kind: "drafting_note", draft_id: "dft_v3" });
    expect(corr.artifact_ids).toContain("av_note");

    // the grounding ledger's claims persist against the new draft (incl. the [unverified] row).
    const claims = (
      await db.exec.query("select ordinal, verdict, draft_id from claims where correspondence_id=$1 order by ordinal", [result.correspondenceId])
    ).rows as { ordinal: number; verdict: string; draft_id: string }[];
    expect(claims.map((c) => c.ordinal)).toEqual([1, 2]);
    expect(claims.every((c) => c.draft_id === "dft_v3")).toBe(true);
    expect(claims[1]!.verdict).toBe("unverifiable");

    // the outline draft is untouched — a Draft delivery freezes nothing it read.
    const outline = (await db.exec.query("select state from drafts where id='dft_outline'")).rows[0] as { state: string };
    expect(outline.state).toBe("working");

    // attestation still lands (access report + boundary.attested).
    expect(events.map((e) => e.type)).toContain("boundary.attested");
  });

  it("fails closed when no committed drafts/v<N>.md exists for the reserved ordinal", async () => {
    await expect(
      runDeliveryTransaction(db.exec, deps, {
        runId,
        attempt: 1,
        workspaceId,
        projectId,
        draftId: "dft_v7",
        correspondenceKind: "drafting_note",
        deliveredVersionIds: ["av_note"],
        newDraftId: "dft_v7",
        newDraftN: 7,
        sidecars: [],
        verdictContext: EMPTY_VERDICT_CTX,
      }),
    ).rejects.toBeInstanceOf(DeliveryValidationError);
  });
});
