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
import {
  parseRunEvent,
  figureProvenanceSchema,
  verificationFromVerdicts,
  isCheckableClaimTier,
  type VerificationCoverage,
} from "@rhema/contracts";
import { diffMarkdown, traceRevisionMoves, type MoveTrace } from "@rhema/findings-core";
import type { SqlExecutor } from "./sql.js";
import type { SidecarInput } from "./validation.js";
import {
  applyVerdictSourceChecks,
  checkSecondReadProducer,
  normalizeUrl,
  registrableDomain,
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
  /** the reviewed draft's head version to freeze it at (a frozen draft requires a promoted version).
   *  Absent on a `drafting_note` delivery — the run's own `drafts/vN.md` is born frozen (P1.10). */
  readonly draftPromotedVersionId?: string;
  /** the prior review this correspondence answers (a `response`) or re-reviews (a re-review `review`) —
   *  server-resolved from the run's inputs, never pod-trusted (PRB.06). Sets `prior_review_id`. */
  readonly priorReviewId?: string;
  /** the v(N+1) draft row id a `response` delivery creates (the run's reserved `nextDraftId`); generated
   *  when unset. For a `drafting_note` delivery it is the reserved id of the run's NEW draft row (P1.10). */
  readonly newDraftId?: string;
  /** P1.10 — a `drafting_note` delivery's draft ordinal: the run produced `drafts/v{newDraftN}.md` and the
   *  born-frozen `drafted_from_outline` row takes `n = newDraftN` (server-resolved from frozen inputs). */
  readonly newDraftN?: number;
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

/**
 * CITE.1 (REQ-VIS-9; ADR-084/085) — the per-run citation-completeness record the mirror computes at
 * delivery from the SAME join `validateCitedFetched` enforces. Persisted under
 * `runs.delivery.citation_completeness` and emitted as `run.citation_completeness` (internal — counts
 * and normalized-url identifiers only).
 */
export interface CitationCompleteness {
  /** distinct canonical urls the claim ledger cited (claim.url ∪ sources[].url, pre-strip). */
  readonly cited: number;
  /** cited urls the run's fetch log covers — post-backfill (the delivered rate's numerator). */
  readonly covered: number;
  /** `cited − covered` — urls Path B had to strip. */
  readonly missed: number;
  /** occurrence-level strip count (a url missed by several claims counts once here, per-source there). */
  readonly stripped: number;
  /** the canonical urls Path B stripped (identifiers only — the unfetched urls themselves). */
  readonly missedUrls: readonly string[];
  /** whether any cited url's coverage came through the mechanism-A backfill phase class. */
  readonly backfillRan: boolean;
  /** cited urls covered only via backfill traffic (the mechanism's rescue count). */
  readonly backfillResolved: number;
  /** cited urls whose coverage rests on `search` rows — snippet evidence, not a page fetch. */
  readonly searchCovered: number;
}

export interface DeliveryResult {
  readonly correspondenceId: string;
  readonly downgradedClaimOrdinals: readonly number[];
  /** Path B (ADR-006): count of unfetched cited urls stripped from the persisted ledger at delivery. */
  readonly strippedCitations: number;
  /** CITE.1 — the measured cited⇒retrieved record (see {@link CitationCompleteness}). */
  readonly citationCompleteness?: CitationCompleteness;
  readonly accessReport: AccessReport;
  readonly accessReportVersionId: string;
  /** the version ids of the dossier copies published under `correspondence/<kind>/<ordinal>/` (F12). */
  readonly dossierVersionIds: readonly string[];
  /** the v(N+1) draft row a `response` delivery created (PRB.06); unset otherwise. */
  readonly newDraftId?: string;
  /** the per-move `revision.move_traced` payloads emitted (PRB.06; REQ-BETA-7). */
  readonly moveTraces?: readonly MoveTrace[];
  /**
   * RES.2 (REQ-SPEC-31(3)) — the delivered verification coverage, computed HERE on server-owned facts:
   * `checkableClaims` counts the Tier-1/2 inventory; `coveredClaims` counts those that kept ≥1
   * fetch-verified source (post Path-B strip — a persisted `claim_sources` row / surviving claim url IS
   * the cited⇒fetched truth, never the model's prose). The orchestrator's `isUnverifiedDelivery` predicate
   * reads this; surfaces never recompute.
   */
  readonly verificationCoverage: VerificationCoverage;
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

/**
 * The run's retrieval evidence, keyed by URL identity (the fetch log of record). Each entry is the
 * CANONICAL guard-normalized url (CITE.1 / ADR-083: BOTH sides of the join share `normalizeUrl` — the
 * stored `normalized_url` is the proxy's richer form, so it is re-normalized on read; a legacy row with
 * no `normalized_url` falls back to normalizing `url`) plus the log KIND that covered it — `'search'`
 * for a url surfaced only as a search-result link, `'fetch'` for a fetched page — so the completeness
 * record and the §12.8(c) search-domain provenance see the same union the guard accepts.
 */
export interface RetrievedEvidence {
  /** canonical urls the run retrieved at all — the cited⇒fetched join set (fetch ∪ search rows). */
  readonly urls: Set<string>;
  /** canonical urls covered by ≥1 `fetch` row (a page the proxy actually retrieved). */
  readonly fetchedUrls: Set<string>;
  /** canonical urls covered by ≥1 `search` row (a hit the run's searches surfaced — snippet evidence). */
  readonly searchUrls: Set<string>;
  /** canonical urls whose covering rows were backfill-class traffic (CITE.1 mechanism A). */
  readonly backfilledUrls: Set<string>;
  /** canonical urls covered ONLY by `search` rows (never by a `fetch` row this run). */
  readonly searchOnlyUrls: Set<string>;
}

async function retrievedEvidence(exec: SqlExecutor, runId: string): Promise<RetrievedEvidence> {
  const res = await exec.query(
    `select normalized_url, url, kind, phase_class from fetch_log
      where run_id = $1 and kind in ('fetch','search') and decision in ('allow','success','ok')
        and url is not null`,
    [runId],
  );
  const urls = new Set<string>();
  const fetchedUrls = new Set<string>();
  const searchUrls = new Set<string>();
  const backfilledUrls = new Set<string>();
  for (const r of res.rows as {
    normalized_url: string | null;
    url: string | null;
    kind: string;
    phase_class: string | null;
  }[]) {
    const raw = r.normalized_url ?? r.url;
    if (!raw) continue;
    const norm = normalizeUrl(raw);
    urls.add(norm);
    if (r.kind === "fetch") fetchedUrls.add(norm);
    else if (r.kind === "search") searchUrls.add(norm);
    if (r.phase_class === "backfill") backfilledUrls.add(norm);
  }
  const searchOnlyUrls = new Set<string>();
  for (const u of urls) if (!fetchedUrls.has(u)) searchOnlyUrls.add(u);
  return { urls, fetchedUrls, searchUrls, backfilledUrls, searchOnlyUrls };
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
  // The proxy fetch log of record — used by the cited⇒fetched policy below, the strip in step 3, the
  // §12.8(c) search-domain provenance, and the CITE.1 completeness record persisted in step 5. BOTH
  // sides of the join share `normalizeUrl` (ADR-083 — canonical on read; the stored `normalized_url`
  // keeps the proxy's richer form).
  const evidence: RetrievedEvidence =
    claims.length > 0
      ? await retrievedEvidence(exec, args.runId)
      : { urls: new Set(), fetchedUrls: new Set(), searchUrls: new Set(), backfilledUrls: new Set(), searchOnlyUrls: new Set() };
  const fetched = evidence.urls;
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

  // CITE.1 (ADR-084/085) — the measured completeness record, computed on the SAME join set the guard
  // reads (the measurement authority is `validateCitedFetched`; this is its per-run persistence).
  // `covered`/`missed` are POST-backfill (the fetch log already carries the mechanism's rows). A cited
  // url a `search` row covers counts covered at rate level (snippet retrieval IS retrieved evidence)
  // and is recorded separately in `searchCovered`.
  const citedUrls = new Set<string>();
  for (const c of claims) {
    if (c.url) citedUrls.add(normalizeUrl(c.url));
    for (const s of c.sources ?? []) if (s.url) citedUrls.add(normalizeUrl(s.url));
  }
  const coveredUrls = new Set<string>();
  const missedUrls = new Set<string>();
  for (const u of citedUrls) (fetched.has(u) ? coveredUrls : missedUrls).add(u);
  const backfilledCites = new Set<string>();
  const searchCoveredCites = new Set<string>();
  for (const u of citedUrls) {
    if (evidence.backfilledUrls.has(u)) backfilledCites.add(u);
    if (evidence.searchUrls.has(u)) searchCoveredCites.add(u);
  }

  // verdict source check — a DOWNGRADE at commit, not a hard failure (§12.8(c)) — composed with the cited⇒fetched
  // downgrade above (a claim with an unfetched citation is likewise downgraded). CITE.1 (ADR-084) —
  // `searchResultDomains` is now populated from the fetch log's url-bearing `search` rows (the live
  // refinement D-P0.15-2 deferred): a Tier-1 verdict sourced from a domain the run's own search results
  // reached earns the §12.8(c) `from_search` sourceCheck instead of `suspicious_source`.
  const searchDomains = new Set<string>();
  for (const u of evidence.searchUrls) {
    const d = registrableDomain(u);
    if (d) searchDomains.add(d);
  }
  const verdictCtx: VerdictSourceContext =
    searchDomains.size === 0
      ? args.verdictContext
      : {
          ...args.verdictContext,
          searchResultDomains: new Set([...args.verdictContext.searchResultDomains, ...searchDomains]),
        };
  const applied = applyVerdictSourceChecks(claims, verdictCtx).map((a) =>
    unfetchedOrdinals.has(a.claim.ordinal) && a.verdict !== "unverifiable"
      ? { claim: a.claim, verdict: "unverifiable" as const, sourceCheck: "suspicious_source" as const, downgraded: true }
      : a,
  );
  const downgradedClaimOrdinals = applied.filter((a) => a.downgraded).map((a) => a.claim.ordinal);
  let strippedCitations = 0;
  const now = deps.clock.now();

  // ---- 1b. P1.10 — a `drafting_note` delivery creates the run's NEW draft row (born frozen, origin
  //      `drafted_from_outline`) BEFORE the correspondence item that references it (the FK). The produced
  //      `drafts/v{newDraftN}.md` version — committed by the Writing step, not the final phase — becomes its
  //      promoted head. The run reserved `nextDraftId`/`nextDraftN` at creation (frozen inputs, server-side).
  let newDraftId: string | undefined;
  let moveTraces: MoveTrace[] | undefined;
  if (args.correspondenceKind === "drafting_note") {
    if (args.newDraftN == null) {
      throw new DeliveryValidationError("drafting_note", "newDraftN (the reserved draft ordinal) is required");
    }
    const newId = args.newDraftId ?? deps.ids("dft");
    const producedDraft = (
      await exec.query(
        `select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id
          where a.project_id = $1 and a.kind = 'draft' and a.mirror_path = $2
            and av.id in (select unnest(s.produced_version_ids) from steps s
                          where s.run_id = $3 and s.state = 'done')
          order by av.ordinal desc limit 1`,
        [args.projectId, `drafts/v${args.newDraftN}.md`, args.runId],
      )
    ).rows[0] as { id: string } | undefined;
    if (!producedDraft) {
      throw new DeliveryValidationError(
        "drafting_note",
        `no committed drafts/v${args.newDraftN}.md version — the Writing phase's output is the draft row's head`,
      );
    }
    await exec.query(`update artifact_versions set immutable = true where id = $1`, [producedDraft.id]);
    await exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id, frozen_at, frozen_by, created_at)
       values ($1,$2,$3,'drafted_from_outline','frozen',null,$4,$5,$6,$7)`,
      [
        newId,
        args.projectId,
        args.newDraftN,
        producedDraft.id,
        now,
        JSON.stringify(args.frozenBy ?? { kind: "system", runId: args.runId }),
        now,
      ],
    );
    newDraftId = newId;
  }
  // the draft id every later row references: the born-frozen new draft for a drafting note, else the input.
  const draftId = newDraftId ?? args.draftId;

  // ---- 2. correspondence_item ----------------------------------------------------------------------
  const ordRes = await exec.query(
    "select coalesce(max(ordinal),0)+1 as n from correspondence_items where draft_id = $1 and kind = $2",
    [draftId, args.correspondenceKind],
  );
  const ordinal = (ordRes.rows[0] as { n: number }).n;
  const correspondenceId = deps.ids("corr");
  await exec.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at,
       artifact_ids, rubric, protocol_id, protocol_version, prior_review_id,
       persona_profile_snapshot_id, persona_snapshot_at, voice_mode)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      correspondenceId,
      args.projectId,
      args.correspondenceKind,
      draftId,
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
  let checkableClaims = 0;
  let coveredClaims = 0;
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
    // RES.2 — the post-strip coverage tally: a checkable claim is "covered" when the delivered ledger
    // carries ≥1 fetch-verified source row for it (or its own cited url survived the strip). Every
    // input here is the POST-STRIP fact — model-claimed sources absent from the fetch log never count.
    if (isCheckableClaimTier(c.tier)) {
      checkableClaims += 1;
      if (keptSources.length > 0 || claimUrl !== null) coveredClaims += 1;
    }
    await exec.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, tier, verdict, kind, url,
         normalized_url, accessed_at, note, source_check, anchor, human_added, figure_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        claimId,
        correspondenceId,
        draftId,
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
        // P1.13 — a figure-linked Tier-1 claim (§7.5; REQ-VIZ-13): the verdict folds into the
        // figure's `provenance.verification` below.
        c.figureId ?? null,
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

  // ---- 3b. figure-claim verdict write-back (P1.13; §7.5; REQ-VIZ-13) --------------------------------
  // Every figure-linked claim's verdict folds into `figures.provenance.verification` — all
  // verified ⇒ verified; any contradicted ⇒ contradicted; otherwise unverifiable. The row's jsonb
  // AND the asset's `provenance.json` both update (the asset stays the file-of-record the pane +
  // the next review read); `kind:"none"`'s `[unverified data]` badge follows `figureBadge()` — a
  // verified verdict lifts it, a contradicted one replaces it.
  {
    const verdictByFigure = new Map<string, ("verified" | "contradicted" | "unverifiable")[]>();
    for (const a of applied) {
      const fid = a.claim.figureId;
      if (!fid) continue;
      const v =
        a.verdict === "verified" || a.verdict === "substantially_accurate" || a.verdict === "verified_against_user_source"
          ? ("verified" as const)
          : a.verdict === "contradicted" || a.verdict === "misleading_in_context"
            ? ("contradicted" as const)
            : ("unverifiable" as const);
      const list = verdictByFigure.get(fid) ?? [];
      list.push(v);
      verdictByFigure.set(fid, list);
    }
    for (const [figureId, verdicts] of verdictByFigure) {
      const verification = verificationFromVerdicts(verdicts);
      if (!verification) continue;
      const row = (
        await exec.query(`select provenance from figures where id = $1 and project_id = $2`, [figureId, args.projectId])
      ).rows[0] as { provenance: unknown } | undefined;
      if (!row) continue;
      const parsed = figureProvenanceSchema.safeParse(row.provenance);
      const next = parsed.success
        ? { ...parsed.data, verification }
        : { kind: "none" as const, refs: [], computedBy: "drafter" as const, verification };
      await exec.query(`update figures set provenance = $2 where id = $1`, [figureId, JSON.stringify(next)]);
      // the asset file-of-record: a new provenance.json version carrying the verdict.
      const provPath = `assets/figures/${figureId}/provenance.json`;
      const provBytes = new TextEncoder().encode(JSON.stringify(next, null, 2));
      await persistHarvest(
        exec,
        deps.store,
        deps,
        { workspaceId: args.workspaceId, projectId: args.projectId, createdBy: { kind: "run", runId: args.runId } },
        [
          {
            path: provPath,
            root: "project",
            kind: "figure",
            namespace: "shared",
            sha256: sha256Hex(provBytes),
            bytes: provBytes,
            wordCount: 0,
          },
        ],
      );
    }
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
        draftId,
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
  // A `drafting_note` delivery skips this: its draft row was born frozen in step 1b (P1.10 — the run
  // authored the draft; there is no pre-existing working head to seal).
  if (args.correspondenceKind !== "drafting_note") {
    await freezeDraft(exec, {
      draftId: draftId,
      promotedVersionId: args.draftPromotedVersionId!,
      cause: "dossier_ref",
      frozenBy: args.frozenBy ?? { kind: "system", runId: args.runId },
      at: now,
    });
  }

  // ---- 6b. the response-ledger fold (§5.7/§5.8; PRB.05 freeze + PRB.06 move rows) ---------------------
  // A delivered `response` correspondence answers the review it responds to: the frozen response-ledger's
  // rows land as `dispositions` (agent-authored where no user row exists; a user's own row keeps its actor),
  // every open row on the answered review locks (`frozen_at`) + links forward (`response_id`), and each row
  // carries its `move_ordinal` — the forward link the What-changed join + obligation routing read.
  let responseLedger: ResponseLedgerSidecar | undefined;
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
    // PRB.19 (F26): the produced draft version is found across BOTH the delivered dossier versions AND the
    // run's committed `steps.produced_version_ids` — a Revise's `drafts/v(N+1).md` is produced by the `revise`
    // phase, NOT the final `deliver` phase, so `deliveredVersionIds` alone (which name only the final phase's
    // artifacts) never contained it and the reserved `nextDraftId` row + `revision.move_traced` never landed.
    const base = (
      await exec.query(`select n from drafts where id = $1`, [draftId])
    ).rows[0] as { n: number } | undefined;
    const deliveredDraft = base
      ? ((
          await exec.query(
            `select av.id, av.content_sha256, a.mirror_path
               from artifact_versions av join artifacts a on a.id = av.artifact_id
              where a.kind = 'draft'
                and (
                  av.id = any($1::text[])
                  or av.id in (
                    select unnest(s.produced_version_ids) from steps s
                     where s.run_id = $2 and s.state = 'done'
                  )
                )
              order by (a.mirror_path = $3) desc, av.ordinal desc limit 1`,
            [args.deliveredVersionIds as string[], args.runId, `drafts/v${base.n + 1}.md`],
          )
        ).rows[0] as { id: string; content_sha256: string } | undefined)
      : undefined;
    if (deliveredDraft && base) {
      // the delivered draft bytes are as immutable as every other delivered artifact (REQ-VIS-4/5).
      await exec.query(`update artifact_versions set immutable = true where id = $1`, [deliveredDraft.id]);
      newDraftId = args.newDraftId ?? deps.ids("dft");
      // The v(N+1) draft is born FROZEN (PRB.19): it IS the delivered revision — sealed at the delivered
      // version like its base (REQ-DATA-14/21); editing it forks a `human_revision` child as usual.
      await exec.query(
        `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id, frozen_at, frozen_by, created_at)
         values ($1,$2,$3,'response_to_review','frozen',$4,$5,$6,$7,$8)`,
        [
          newDraftId,
          args.projectId,
          base.n + 1,
          draftId,
          deliveredDraft.id,
          now,
          JSON.stringify(args.frozenBy ?? { kind: "system", runId: args.runId }),
          now,
        ],
      );
    }

    // revision.move_traced (REQ-BETA-7): the server diff vN→v(N+1) joined to the ledger's moves. Both
    // sides come from the content store (the frozen head's promoted version + the delivered draft
    // version) — identical bytes in, identical trace out.
    const baseVersion = (
      await exec.query(
        `select av.content_sha256 from drafts d join artifact_versions av on av.id = d.promoted_version_id
          where d.id = $1`,
        [draftId],
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
            baseDraftId: draftId,
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
    draftId: draftId,
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

  const citationCompleteness: CitationCompleteness | undefined =
    citedUrls.size > 0
      ? {
          cited: citedUrls.size,
          covered: coveredUrls.size,
          missed: missedUrls.size,
          stripped: strippedCitations,
          missedUrls: [...missedUrls],
          backfillRan: evidence.backfilledUrls.size > 0,
          backfillResolved: backfilledCites.size,
          searchCovered: searchCoveredCites.size,
        }
      : undefined;

  return {
    correspondenceId,
    downgradedClaimOrdinals,
    strippedCitations,
    citationCompleteness,
    accessReport,
    accessReportVersionId: persistedReport.versionId,
    dossierVersionIds,
    ...(newDraftId != null ? { newDraftId } : {}),
    ...(moveTraces != null ? { moveTraces } : {}),
    verificationCoverage: { checkableClaims, coveredClaims },
  };
}
