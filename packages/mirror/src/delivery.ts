// The delivery transaction (REQ-DATA-7 amended; §12.2). The final harvest of a delivering step VALIDATES
// (sidecars, cited⇒fetched, the model-independent verdict source check, the producer check) and then, in ONE
// Postgres transaction: creates the `correspondence_item`, inserts the claim / claim_source / finding rows
// (with any verdict downgrades applied at commit), marks the delivered artifacts immutable, freezes the input
// draft, runs the obligation spawn/join HOOK (the logic is P0.12; the transactional seam is here), and emits
// the attestation + report events. A validation failure throws `DeliveryValidationError` — the caller ends the
// run `failed(validation)` with the files retained as partial and nothing marked immutable; nothing here
// commits. The ledger debit is a SEPARATE retried transaction (a ledger failure never rolls back a delivered
// dossier — review 13 F36): this module never debits.

import type {
  ClaimLedgerSidecar,
  CorrespondenceKind,
  FindingsSidecar,
  ResponseLedgerSidecar,
  RubricSidecar,
} from "@rhema/contracts";
import { parseRunEvent } from "@rhema/contracts";
import { diffMarkdown, traceRevisionMoves, type MoveTrace } from "@rhema/findings-core";
import type { SqlExecutor } from "./sql.js";
import type { SidecarInput } from "./validation.js";
import {
  applyVerdictSourceChecks,
  checkSecondReadProducer,
  normalizeUrl,
  validateCitedFetched,
  validateSidecars,
  type VerdictSourceContext,
} from "./validation.js";
import { freezeDraft } from "./freeze.js";
import {
  accessReportEvent,
  buildAccessReport,
  renderAccessReportMd,
  type AccessReport,
} from "./attestation.js";
import { persistHarvest, type PersistDeps } from "./persist.js";
import { sha256Hex } from "./content-store.js";
import type { ContentStore } from "./content-store.js";

/** A delivery validation failure (schema / cited⇒fetched / producer) — `failed(validation)` (REQ-DATA-7). */
export class DeliveryValidationError extends Error {
  readonly code = "validation";
  constructor(
    readonly reason: string,
    readonly detail: unknown,
  ) {
    super(`delivery validation failed: ${reason}`);
    this.name = "DeliveryValidationError";
  }
}

/**
 * The obligation spawn/join hook (the logic is P0.12 `@rhema/obligations`; this module owns the seam). The
 * context carries everything the spawn/lineage/counts logic needs from the just-committed delivery, so the hook
 * re-reads nothing it already has: the persisted findings with their origin / reconciliation / anchor and any
 * `carriesObligationId` the re-review declared (REQ-OBJ-4), the persisted claims (lineage matcher 1's
 * `normalized_url` + quote), and the Editor's own carried/closed/new tally from the findings sidecar (REQ-WF-7,
 * reconciled — a mismatch is a warning, never a failure). Default: no-op.
 */
export interface ObligationDeliveryFinding {
  readonly findingId: string;
  readonly ordinal: number;
  readonly severity: string;
  readonly kind: string;
  readonly title: string;
  readonly origin: string;
  readonly reconciliation?: string | null;
  /** the finding's canonical anchor (§11.3), for lineage matchers 1 & 3. */
  readonly anchor?: unknown | null;
  /** the normalized url of the finding's first evidence source (lineage matcher 1 — claim identity). */
  readonly normalizedUrl?: string | null;
  /** the open obligation this re-review finding declares it carries (lineage matcher 2 — REQ-OBJ-4). */
  readonly carriesObligationId?: string | null;
}
export interface ObligationDeliveryClaim {
  readonly claimId: string;
  readonly ordinal: number;
  readonly normalizedUrl?: string | null;
  readonly anchor?: unknown | null;
}
export interface ObligationDeliveryContext {
  readonly exec: SqlExecutor;
  readonly runId: string;
  readonly projectId: string;
  readonly draftId: string;
  readonly correspondenceId: string;
  readonly correspondenceKind: CorrespondenceKind;
  readonly findings: ReadonlyArray<ObligationDeliveryFinding>;
  readonly claims: ReadonlyArray<ObligationDeliveryClaim>;
  /** the prior review this delivery answers/re-reviews (`prior_review_id`), when the run supplied one. */
  readonly priorReviewId?: string;
  /** the v(N+1) draft row id created on a response delivery (PRB.06). */
  readonly newDraftId?: string;
  /** the frozen response ledger on a `response` delivery (PRB.06 — the move/discharge join + routing input). */
  readonly responseLedger?: ResponseLedgerSidecar;
  /** the Editor's own {carried, closed, new} from the findings sidecar (REQ-WF-7); absent on a first review. */
  readonly sidecarCounts?: { carried: number; closed: number; new: number } | null;
  /**
   * Whether this delivery is a WHOLE-DRAFT covering review (default true). Only a covering review discharges an
   * obligation the review did not re-raise (REQ-WF-7's "closed" set). A phase-subset / scoped run (Fact-check,
   * a scoped Review — REQ-WF-13) sets this false: it can carry / reopen / spawn, but it must NOT discharge
   * obligations outside its scope by mere omission.
   */
  readonly coversAllObligations?: boolean;
}
export interface ObligationHook {
  onDelivery(ctx: ObligationDeliveryContext): Promise<void>;
}
export const NOOP_OBLIGATION_HOOK: ObligationHook = { async onDelivery() {} };

/** Append seam (the orchestrator's `SqlEventWriter.append` satisfies it structurally). */
export interface DeliveryEventAppender {
  append(
    exec: SqlExecutor,
    ev: { runId: string; type: string; payload: unknown; at: Date; agentLabel?: string },
  ): Promise<unknown>;
}

export interface DeliveryDeps extends PersistDeps {
  readonly store: ContentStore;
  readonly eventWriter: DeliveryEventAppender;
  readonly obligationHook?: ObligationHook;
}

export interface DeliveryArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly draftId: string;
  readonly correspondenceKind: CorrespondenceKind;
  readonly protocolId?: string;
  readonly protocolVersion?: number;
  /** artifact version ids of the delivered dossier — recorded on the item and marked immutable. */
  readonly deliveredVersionIds: readonly string[];
  /** the reviewed draft's head version to freeze it at (a frozen draft requires a promoted version). */
  readonly draftPromotedVersionId: string;
  /** the prior review this correspondence answers (a `response`) or re-reviews (a re-review `review`) —
   *  server-resolved from the run's inputs, never pod-trusted (PRB.06). Sets `prior_review_id`. */
  readonly priorReviewId?: string;
  /** the v(N+1) draft row id a `response` delivery creates (the run's reserved `nextDraftId`); generated
   *  when unset. */
  readonly newDraftId?: string;
  readonly sidecars: readonly SidecarInput[];
  readonly claimLedger?: ClaimLedgerSidecar;
  readonly findings?: FindingsSidecar;
  readonly rubric?: RubricSidecar;
  /** the second read's producerQueryId (present when the workflow ran a second read) — producer check. */
  readonly secondReadProducerQueryId?: string | null;
  readonly verdictContext: VerdictSourceContext;
  readonly frozenBy?: unknown;
  /** whole-draft covering review (default true); a scoped/phase-subset run sets false (see ObligationDeliveryContext). */
  readonly coversAllObligations?: boolean;
  /**
   * PRB.10 — the voice facts stamped on the delivered note (REQ-PERSONA-17/20, §9.3/§9.6): the pinned
   * `persona_profile_snapshot_id` and the snapshot's build date the note was written against, plus the
   * 'linked' | 'ad_hoc' mode (a no-voice piece is labeled ad-hoc, never persisted as a voice). Server-resolved
   * from the run's frozen inputs — never pod-trusted.
   */
  readonly personaProfileSnapshotId?: string;
  readonly personaSnapshotAt?: Date | string;
  readonly voiceMode?: "linked" | "ad_hoc";
}

export interface DeliveryResult {
  readonly correspondenceId: string;
  readonly downgradedClaimOrdinals: readonly number[];
  /** Path B (ADR-006): count of unfetched cited urls stripped from the persisted ledger at delivery. */
  readonly strippedCitations: number;
  readonly accessReport: AccessReport;
  readonly accessReportVersionId: string;
  /** the version ids of the dossier copies published under `correspondence/<kind>/<ordinal>/` (F12). */
  readonly dossierVersionIds: readonly string[];
  /** the v(N+1) draft row a `response` delivery created (PRB.06); unset otherwise. */
  readonly newDraftId?: string;
  /** the per-move `revision.move_traced` payloads emitted (PRB.06; REQ-BETA-7). */
  readonly moveTraces?: readonly MoveTrace[];
}

/**
 * The artifact kinds a delivery publishes into the shared `correspondence/<kind>/<ordinal>/` tree —
 * §8.2's shared-record rows plus the structured `sidecar` twins and the frozen `response_ledger`.
 * Working-memory kinds (research/source notes, voice charter, briefs/plans, drafts) stay private to
 * the producing seat: the delivered dossier is the seat's complete statement, never its deliberations.
 */
const CORRESPONDENCE_DOSSIER_KINDS: ReadonlySet<string> = new Set([
  "figure",
  "companion_doc",
  "drafting_note",
  "editors_letter",
  "piece_brief",
  "claim_ledger",
  "discourse_report",
  "argument_notes",
  "craft_notes",
  "second_read",
  "response_letter",
  "response_ledger",
  "sidecar",
]);

/** The set of normalized urls the proxy actually fetched for a run (the fetch log of record). */
async function fetchedNormalizedUrls(exec: SqlExecutor, runId: string): Promise<Set<string>> {
  const res = await exec.query(
    `select normalized_url, url from fetch_log
      where run_id = $1 and kind in ('fetch','search') and decision in ('allow','success','ok')`,
    [runId],
  );
  const out = new Set<string>();
  for (const r of res.rows as { normalized_url: string | null; url: string | null }[]) {
    if (r.normalized_url) out.add(r.normalized_url);
    else if (r.url) out.add(normalizeUrl(r.url));
  }
  return out;
}

/**
 * Run the delivery transaction inside the caller's tx (`exec`). Throws `DeliveryValidationError` on a hard
 * validation failure (nothing written; the caller fails the run). On success returns the correspondence id, the
 * verdict downgrades applied, and the built access_report (its `boundary.attested` event already appended).
 */
export async function runDeliveryTransaction(
  exec: SqlExecutor,
  deps: DeliveryDeps,
  args: DeliveryArgs,
): Promise<DeliveryResult> {
  const hook = deps.obligationHook ?? NOOP_OBLIGATION_HOOK;

  // ---- 1. validate (before any write) --------------------------------------------------------------
  const sidecarResult = validateSidecars(args.sidecars);
  if (!sidecarResult.ok) throw new DeliveryValidationError("sidecar", sidecarResult.failures);

  const claims = args.claimLedger?.claims ?? [];
  // The proxy fetch log of record — used by both the cited⇒fetched policy below and the strip in step 3.
  const fetched = claims.length > 0 ? await fetchedNormalizedUrls(exec, args.runId) : new Set<string>();
  const isFetched = (url: string): boolean => fetched.has(normalizeUrl(url));

  if (args.secondReadProducerQueryId !== undefined) {
    const producer = await checkSecondReadProducer(exec, { runId: args.runId, producerQueryId: args.secondReadProducerQueryId });
    if (!producer.ok) throw new DeliveryValidationError("producer", producer.reason);
  }

  // cited⇒fetched (REQ-VIS-9) — a per-claim DOWNGRADE at commit, NOT a run-fatal reject (Path B; ADR-006;
  // operator ruling 2026-09-11). `validateCitedFetched` is unchanged (still computes the misses — this call and
  // the exit assessor both read it). An unfetched cited url is STRIPPED from the persisted ledger (step 3) and
  // its claim's verdict downgraded to `unverifiable`/`suspicious_source` — the SAME treatment §12.8(c) already
  // gives a suspicious verdict source — so the delivered dossier cites ONLY fetch-verified sources (cited⇒fetched
  // stays TRUE for what ships; the exit assessor re-reads the persisted rows and sees no miss).
  const citedMisses = claims.length > 0 ? validateCitedFetched(claims, fetched).misses : [];
  const unfetchedOrdinals = new Set(citedMisses.map((m) => m.claimOrdinal));

  // verdict source check — a DOWNGRADE at commit, not a hard failure (§12.8(c)) — composed with the cited⇒fetched
  // downgrade above (a claim with an unfetched citation is likewise downgraded).
  const applied = applyVerdictSourceChecks(claims, args.verdictContext).map((a) =>
    unfetchedOrdinals.has(a.claim.ordinal) && a.verdict !== "unverifiable"
      ? { claim: a.claim, verdict: "unverifiable" as const, sourceCheck: "suspicious_source" as const, downgraded: true }
      : a,
  );
  const downgradedClaimOrdinals = applied.filter((a) => a.downgraded).map((a) => a.claim.ordinal);
  let strippedCitations = 0;

  // ---- 2. correspondence_item ----------------------------------------------------------------------
  const ordRes = await exec.query(
    "select coalesce(max(ordinal),0)+1 as n from correspondence_items where draft_id = $1 and kind = $2",
    [args.draftId, args.correspondenceKind],
  );
  const ordinal = (ordRes.rows[0] as { n: number }).n;
  const correspondenceId = deps.ids("corr");
  const now = deps.clock.now();
  await exec.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
       artifact_ids, rubric, protocol_id, protocol_version, prior_review_id,
       persona_profile_snapshot_id, persona_snapshot_at, voice_mode)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      correspondenceId,
      args.projectId,
      args.correspondenceKind,
      args.draftId,
      args.runId,
      ordinal,
      now,
      args.deliveredVersionIds as string[],
      args.rubric ? JSON.stringify(args.rubric) : null,
      args.protocolId ?? null,
      args.protocolVersion ?? null,
      args.priorReviewId ?? null,
      // PRB.10 — the note records the profile snapshot date it was written against (REQ-PERSONA-17)
      // and the ad-hoc label for a no-voice piece (REQ-PERSONA-20); both come from the run's frozen
      // inputs via the caller, never re-derived from mutable persona state.
      args.personaProfileSnapshotId ?? null,
      args.personaSnapshotAt ?? null,
      args.voiceMode ?? null,
    ],
  );

  // ---- 3. claims + claim_sources -------------------------------------------------------------------
  const persistedClaims: { claimId: string; ordinal: number; normalizedUrl?: string | null; anchor?: unknown | null }[] = [];
  for (const a of applied) {
    const c = a.claim;
    const claimId = deps.ids("clm");
    // Path B strip (ADR-006): a cited url absent from the proxy fetch log is unverifiable provenance — drop it
    // from the persisted ledger so the delivered dossier cites only fetch-verified sources. A claim's own url is
    // nulled; an unfetched source row is skipped. The claim's verdict was already downgraded in `applied`.
    const claimUrlUnfetched = !!c.url && !isFetched(c.url);
    if (claimUrlUnfetched) strippedCitations += 1;
    const keptSources = (c.sources ?? []).filter((s) => isFetched(s.url));
    strippedCitations += (c.sources ?? []).length - keptSources.length;
    const claimUrl = claimUrlUnfetched ? null : (c.url ?? null);
    await exec.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, tier, verdict, kind, url,
         normalized_url, accessed_at, note, source_check, anchor, human_added)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        claimId,
        correspondenceId,
        args.draftId,
        c.ordinal,
        c.text,
        c.tier,
        a.verdict,
        c.kind ?? null,
        claimUrl,
        claimUrl ? (c.normalizedUrl ?? normalizeUrl(claimUrl)) : null,
        c.accessedAt ?? null,
        c.note ?? null,
        a.sourceCheck ?? c.sourceCheck ?? null,
        c.anchor ? JSON.stringify(c.anchor) : null,
        c.humanAdded ?? false,
      ],
    );
    for (const [i, s] of keptSources.entries()) {
      await exec.query(
        `insert into claim_sources(claim_id, ordinal, url, normalized_url, accessed_at, stance, note)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [claimId, i, s.url, s.normalizedUrl, s.accessedAt, s.stance, s.note ?? null],
      );
    }
    persistedClaims.push({
      claimId,
      ordinal: c.ordinal,
      normalizedUrl: claimUrl ? (c.normalizedUrl ?? normalizeUrl(claimUrl)) : null,
      anchor: c.anchor ?? null,
    });
  }

  // ---- 4. findings ---------------------------------------------------------------------------------
  const persistedFindings: ObligationDeliveryFinding[] = [];
  for (const f of args.findings?.findings ?? []) {
    const findingId = deps.ids("fnd");
    await exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, reconciliation,
         title, body, evidence, suggestion, rubric_dims, letter_section, anchor)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        findingId,
        correspondenceId,
        args.draftId,
        f.ordinal,
        f.kind,
        f.severity,
        f.origin,
        f.reconciliation ?? null,
        f.title,
        f.body,
        f.evidence ? JSON.stringify(f.evidence) : null,
        f.suggestion ? JSON.stringify(f.suggestion) : null,
        (f.rubricDims ?? []) as string[],
        f.letterSection ?? null,
        f.anchor ? JSON.stringify(f.anchor) : null,
      ],
    );
    persistedFindings.push({
      findingId,
      ordinal: f.ordinal,
      severity: f.severity,
      kind: f.kind,
      title: f.title,
      origin: f.origin,
      reconciliation: f.reconciliation ?? null,
      anchor: f.anchor ?? null,
      normalizedUrl: f.evidence?.urls?.[0]?.url ? normalizeUrl(f.evidence.urls[0].url) : null,
      carriesObligationId: f.carriesObligationId ?? null,
    });
  }

  // ---- 5. mark the delivered artifacts immutable (delivered artifacts are immutable — REQ-VIS-4/5) -
  if (args.deliveredVersionIds.length > 0) {
    await exec.query(`update artifact_versions set immutable = true where id = any($1::text[])`, [
      args.deliveredVersionIds as string[],
    ]);
  }

  // ---- 5b. publish the dossier into the shared correspondence tree (PRB.16b; LIVE FINDING 12) ------
  // The seat wrote its dossier under its PRIVATE namespace (`agents/editor/**` — the manifest pins
  // `output_dir` there because `correspondence/` is a read-only mount for seats), so a responding
  // run's author seat — whose shared read is exactly `drafts/ correspondence/ manifest.md` — could
  // not see the delivered dossier and self-reported `blocked` at bootstrap. Publish each produced
  // dossier artifact the run committed as a `correspondence/<kind>/<ordinal>/<basename>` SHARED
  // artifact: the same content-addressed bytes re-pointed (no re-upload), marked immutable. The
  // correspondence item's `artifact_ids` grows to name the complete shared dossier.
  const produced = (
    await exec.query(
      `select distinct on (a.id)
          a.mirror_path, a.kind, av.content_sha256, av.s3_key, av.bytes, av.word_count, av.media_type,
          av.parse_status
         from steps s
         join artifact_versions av on av.id = any(s.produced_version_ids)
         join artifacts a on a.id = av.artifact_id
        where s.run_id = $1 and s.state = 'done' and a.namespace like 'agent:%'
        order by a.id, av.ordinal desc`,
      [args.runId],
    )
  ).rows as {
    mirror_path: string;
    kind: string;
    content_sha256: string;
    s3_key: string;
    bytes: number;
    word_count: number | null;
    media_type: string;
    parse_status: string | null;
  }[];
  // One file per basename — the canonical (shallowest) path wins a `foo.json` vs `.rhema/foo.json`
  // collision so the correspondence copy is the file the seat meant, not a harness twin.
  const dossierByBase = new Map<string, (typeof produced)[number]>();
  for (const r of produced) {
    if (!CORRESPONDENCE_DOSSIER_KINDS.has(r.kind)) continue;
    const base = r.mirror_path.slice(r.mirror_path.lastIndexOf("/") + 1);
    const cur = dossierByBase.get(base);
    if (!cur || r.mirror_path.length < cur.mirror_path.length) dossierByBase.set(base, r);
  }
  const dossierVersionIds: string[] = [];
  for (const [base, r] of dossierByBase) {
    const corrPath = `correspondence/${args.correspondenceKind}/${ordinal}/${base}`;
    let artifactId = (
      (await exec.query(`select id from artifacts where project_id = $1 and mirror_path = $2`, [
        args.projectId,
        corrPath,
      ])).rows[0] as { id: string } | undefined
    )?.id;
    if (!artifactId) {
      artifactId = deps.ids("art");
      await exec.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, created_at)
         values ($1,$2,$3,$4,'shared',$5,$6)`,
        [artifactId, args.workspaceId, args.projectId, r.kind, corrPath, now],
      );
    }
    const vOrd = (
      (await exec.query(
        "select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1",
        [artifactId],
      )).rows[0] as { n: number }
    ).n;
    const versionId = deps.ids("av");
    await exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes,
         word_count, media_type, created_by, created_at, immutable, parse_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
      [
        versionId,
        artifactId,
        vOrd,
        r.content_sha256,
        r.s3_key, // the content-addressed bytes are already stored — re-point, never re-upload
        r.bytes,
        r.word_count,
        r.media_type,
        JSON.stringify({ kind: "system" }),
        now,
        r.parse_status, // the same bytes carry the same parse verdict
      ],
    );
    await exec.query("update artifacts set head_version_id = $2 where id = $1", [artifactId, versionId]);
    dossierVersionIds.push(versionId);
  }
  // The findings/rubric structured twins were never artifacts (they live in `.rhema/` — a derived,
  // never-harvested directory), so serialize them here from the VERBATIM-persisted sidecars. The
  // claim-ledger twin is deliberately NOT shipped: Path-B citation stripping made the pod's JSON
  // non-authoritative — the delivered claims+claim_sources rows are the cited⇒fetched truth.
  const sidecarTwins: { filename: string; json: unknown }[] = [];
  if (args.findings) sidecarTwins.push({ filename: "findings.json", json: args.findings });
  if (args.rubric) sidecarTwins.push({ filename: "rubric.json", json: args.rubric });
  if (sidecarTwins.length > 0) {
    const persisted = await persistHarvest(
      exec,
      deps.store,
      deps,
      { workspaceId: args.workspaceId, projectId: args.projectId, createdBy: { kind: "system" } },
      sidecarTwins.map((t) => {
        const bytes = Buffer.from(JSON.stringify(t.json, null, 2), "utf8");
        return {
          path: `correspondence/${args.correspondenceKind}/${ordinal}/${t.filename}`,
          root: "project" as const,
          kind: "sidecar",
          namespace: "shared",
          sha256: sha256Hex(bytes),
          bytes,
          wordCount: 0,
        };
      }),
    );
    for (const p of persisted) {
      await exec.query(`update artifact_versions set immutable = true where id = $1`, [p.versionId]);
      dossierVersionIds.push(p.versionId);
    }
  }
  if (dossierVersionIds.length > 0) {
    await exec.query(`update correspondence_items set artifact_ids = artifact_ids || $2::text[] where id = $1`, [
      correspondenceId,
      dossierVersionIds as string[],
    ]);
  }

  // ---- 6. freeze the input draft (the dossier-reference trigger — REQ-DATA-21) ---------------------
  await freezeDraft(exec, {
    draftId: args.draftId,
    promotedVersionId: args.draftPromotedVersionId,
    cause: "dossier_ref",
    frozenBy: args.frozenBy ?? { kind: "system", runId: args.runId },
    at: now,
  });

  // ---- 6b. the response-ledger fold (§5.7/§5.8; PRB.05 freeze + PRB.06 move rows) ---------------------
  // A delivered `response` correspondence answers the review it responds to: the frozen response-ledger's
  // rows land as `dispositions` (agent-authored where no user row exists; a user's own row keeps its actor),
  // every open row on the answered review locks (`frozen_at`) + links forward (`response_id`), and each row
  // carries its `move_ordinal` — the forward link the What-changed join + obligation routing read.
  let responseLedger: ResponseLedgerSidecar | undefined;
  let newDraftId: string | undefined;
  let moveTraces: MoveTrace[] | undefined;
  const findingIdByOrdinal = new Map<number, string>();
  if (args.correspondenceKind === "response") {
    const ledgerInput = args.sidecars.find((s) => s.filename === "response-ledger.json");
    responseLedger = ledgerInput?.json as ResponseLedgerSidecar | undefined;
    // The review this response answers: the run-supplied prior_review, else the project's latest review.
    const reviewCorrId =
      args.priorReviewId ??
      (((
        await exec.query(
          `select id from correspondence_items
            where project_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
          [args.projectId],
        )
      ).rows[0] as { id: string } | undefined)?.id ?? null);
    if (reviewCorrId != null) {
      // persist the ledger's rows: update the open row in place (keeps a user row's actor) or insert the
      // ledger-authored row; every persisted row gets the move link + the freeze.
      for (const e of responseLedger?.entries ?? []) {
        const finding = (
          await exec.query(
            `select id from findings where correspondence_id = $1 and ordinal = $2`,
            [reviewCorrId, e.findingOrdinal],
          )
        ).rows[0] as { id: string } | undefined;
        if (!finding) continue;
        findingIdByOrdinal.set(e.findingOrdinal, finding.id);
        const existing = (
          await exec.query(
            `select id from dispositions where finding_id = $1 and response_id is null order by created_at desc limit 1`,
            [finding.id],
          )
        ).rows[0] as { id: string } | undefined;
        if (existing) {
          await exec.query(
            `update dispositions
                set kind = $2, status = $3, rationale = $4, adapted_text = $5, move_ordinal = $6,
                    response_id = $7, frozen_at = $8
              where id = $1`,
            [
              existing.id,
              e.disposition.kind,
              e.disposition.status,
              e.disposition.rationale ?? null,
              e.disposition.adaptedText ?? null,
              e.disposition.moveOrdinal ?? null,
              correspondenceId,
              now,
            ],
          );
        } else {
          await exec.query(
            `insert into dispositions
               (id, finding_id, kind, status, rationale, adapted_text, move_ordinal, applied,
                response_id, frozen_at, by_actor, created_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              deps.ids("dsp"),
              finding.id,
              e.disposition.kind,
              e.disposition.status,
              e.disposition.rationale ?? null,
              e.disposition.adaptedText ?? null,
              e.disposition.moveOrdinal ?? null,
              e.disposition.applied ?? null,
              correspondenceId,
              now,
              JSON.stringify({ kind: e.disposition.actor === "user" ? "user" : "agent", runId: args.runId }),
              now,
            ],
          );
        }
      }
      // any remaining open row on the answered review still locks + links forward (§5.7).
      await exec.query(
        `update dispositions d
            set response_id = $1, frozen_at = $2
           from findings f
          where d.finding_id = f.id
            and d.response_id is null
            and d.frozen_at is null
            and f.correspondence_id = $3`,
        [correspondenceId, now, reviewCorrId],
      );
    }

    // The revision lands as a new draft row: v(N+1) origin `response_to_review`, based on the frozen head,
    // promoted to the delivered `drafts/v(N+1).md` artifact version.
    const deliveredDraft = (
      await exec.query(
        `select av.id, av.content_sha256
           from artifact_versions av join artifacts a on a.id = av.artifact_id
          where av.id = any($1::text[]) and a.kind = 'draft'
          order by av.ordinal desc limit 1`,
        [args.deliveredVersionIds as string[]],
      )
    ).rows[0] as { id: string; content_sha256: string } | undefined;
    if (deliveredDraft) {
      const base = (
        await exec.query(`select n from drafts where id = $1`, [args.draftId])
      ).rows[0] as { n: number } | undefined;
      if (base) {
        newDraftId = args.newDraftId ?? deps.ids("dft");
        await exec.query(
          `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id, created_at)
           values ($1,$2,$3,'response_to_review','working',$4,$5,$6)`,
          [newDraftId, args.projectId, base.n + 1, args.draftId, deliveredDraft.id, now],
        );
      }
    }

    // revision.move_traced (REQ-BETA-7): the server diff vN→v(N+1) joined to the ledger's moves. Both
    // sides come from the content store (the frozen head's promoted version + the delivered draft
    // version) — identical bytes in, identical trace out.
    const baseVersion = (
      await exec.query(
        `select av.content_sha256 from drafts d join artifact_versions av on av.id = d.promoted_version_id
          where d.id = $1`,
        [args.draftId],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    if (deliveredDraft && baseVersion) {
      const [beforeBytes, afterBytes] = await Promise.all([
        deps.store.get(baseVersion.content_sha256),
        deps.store.get(deliveredDraft.content_sha256),
      ]);
      if (beforeBytes && afterBytes) {
        const diff = diffMarkdown(
          Buffer.from(beforeBytes).toString("utf8"),
          Buffer.from(afterBytes).toString("utf8"),
        );
        const entries = (responseLedger?.entries ?? []).map((e) => ({
          findingOrdinal: e.findingOrdinal,
          ...(findingIdByOrdinal.has(e.findingOrdinal) ? { findingId: findingIdByOrdinal.get(e.findingOrdinal)! } : {}),
          kind: e.disposition.kind,
          ...(e.disposition.status != null ? { status: e.disposition.status } : {}),
          ...(e.disposition.moveOrdinal != null ? { moveOrdinal: e.disposition.moveOrdinal } : {}),
          ...(e.anchor != null ? { anchor: e.anchor } : {}),
        }));
        moveTraces = traceRevisionMoves(diff, { entries, moves: responseLedger?.moves ?? [] });
        for (const t of moveTraces) {
          const ev = parseRunEvent("revision.move_traced", {
            correspondenceId,
            ...(newDraftId != null ? { draftId: newDraftId } : {}),
            baseDraftId: args.draftId,
            ...(t.findingId != null ? { findingId: t.findingId } : {}),
            ...(t.moveId != null ? { moveId: t.moveId } : {}),
            hunkCount: t.hunkCount,
            charsChanged: t.charsChanged,
          });
          await deps.eventWriter.append(exec, { runId: args.runId, type: ev.type, payload: ev.payload, at: now });
        }
      }
    }
  }

  // ---- 7. obligation spawn/join hook (logic is P0.12; the transactional seam is here — REQ-OBJ-2) --
  //    On a `response` delivery the hook routes the frozen ledger's moves (PRB.06: D-P0.12-2's auto-path).
  await hook.onDelivery({
    exec,
    runId: args.runId,
    projectId: args.projectId,
    draftId: args.draftId,
    correspondenceId,
    correspondenceKind: args.correspondenceKind,
    findings: persistedFindings,
    claims: persistedClaims,
    ...(args.priorReviewId != null ? { priorReviewId: args.priorReviewId } : {}),
    ...(newDraftId != null ? { newDraftId } : {}),
    ...(responseLedger != null ? { responseLedger } : {}),
    sidecarCounts: args.findings?.obligationCounts ?? null,
    coversAllObligations: args.coversAllObligations ?? true,
  });

  // ---- 8. attestation: build the access_report, write it as an SR artifact, emit boundary.attested -
  const accessReport = await buildAccessReport(exec, { runId: args.runId, attempt: args.attempt });
  const reportMd = renderAccessReportMd(accessReport);
  const reportBytes = Buffer.from(reportMd, "utf8");
  const reportPath = `correspondence/${args.correspondenceKind}/${ordinal}/access-report.md`;
  const persistedReports = await persistHarvest(
    exec,
    deps.store,
    deps,
    { workspaceId: args.workspaceId, projectId: args.projectId, createdBy: { kind: "system" } },
    [
      {
        path: reportPath,
        root: "project",
        kind: "access_report",
        namespace: "shared",
        sha256: sha256Hex(reportBytes),
        bytes: reportBytes,
        wordCount: reportMd.split(/\s+/).length,
      },
    ],
  );
  const persistedReport = persistedReports[0]!;
  await exec.query(`update artifact_versions set immutable = true where id = $1`, [persistedReport.versionId]);

  // the delivery/timeline events (validated at the write boundary): the boundary attestation and the written
  // access_report artifact (the trust chip). Both derive only from server-side facts (§12.6).
  const attested = parseRunEvent("boundary.attested", accessReportEvent(accessReport));
  await deps.eventWriter.append(exec, { runId: args.runId, type: attested.type, payload: attested.payload, at: now });
  const written = parseRunEvent("artifact.written", { kind: "access_report", mirrorPath: reportPath, versionId: persistedReport.versionId });
  await deps.eventWriter.append(exec, { runId: args.runId, type: written.type, payload: written.payload, at: now });

  return {
    correspondenceId,
    downgradedClaimOrdinals,
    strippedCitations,
    accessReport,
    accessReportVersionId: persistedReport.versionId,
    dossierVersionIds,
    ...(newDraftId != null ? { newDraftId } : {}),
    ...(moveTraces != null ? { moveTraces } : {}),
  };
}
