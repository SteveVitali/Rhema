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
  RubricSidecar,
} from "@rhema/contracts";
import { parseRunEvent } from "@rhema/contracts";
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

/** The obligation spawn/join hook (P0.12 fills the logic; this ticket owns the seam). Default: no-op. */
export interface ObligationDeliveryContext {
  readonly exec: SqlExecutor;
  readonly runId: string;
  readonly projectId: string;
  readonly draftId: string;
  readonly correspondenceId: string;
  readonly correspondenceKind: CorrespondenceKind;
  readonly findings: ReadonlyArray<{ findingId: string; ordinal: number; severity: string; kind: string }>;
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
  readonly sidecars: readonly SidecarInput[];
  readonly claimLedger?: ClaimLedgerSidecar;
  readonly findings?: FindingsSidecar;
  readonly rubric?: RubricSidecar;
  /** the second read's producerQueryId (present when the workflow ran a second read) — producer check. */
  readonly secondReadProducerQueryId?: string | null;
  readonly verdictContext: VerdictSourceContext;
  readonly frozenBy?: unknown;
}

export interface DeliveryResult {
  readonly correspondenceId: string;
  readonly downgradedClaimOrdinals: readonly number[];
  readonly accessReport: AccessReport;
  readonly accessReportVersionId: string;
}

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
  if (claims.length > 0) {
    const fetched = await fetchedNormalizedUrls(exec, args.runId);
    const cited = validateCitedFetched(claims, fetched);
    if (!cited.ok) throw new DeliveryValidationError("cited_not_fetched", cited.misses);
  }

  if (args.secondReadProducerQueryId !== undefined) {
    const producer = await checkSecondReadProducer(exec, { runId: args.runId, producerQueryId: args.secondReadProducerQueryId });
    if (!producer.ok) throw new DeliveryValidationError("producer", producer.reason);
  }

  // verdict source check — a DOWNGRADE at commit, not a hard failure (§12.8(c)).
  const applied = applyVerdictSourceChecks(claims, args.verdictContext);
  const downgradedClaimOrdinals = applied.filter((a) => a.downgraded).map((a) => a.claim.ordinal);

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
       artifact_ids, rubric, protocol_id, protocol_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
    ],
  );

  // ---- 3. claims + claim_sources -------------------------------------------------------------------
  for (const a of applied) {
    const c = a.claim;
    const claimId = deps.ids("clm");
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
        c.url ?? null,
        c.normalizedUrl ?? (c.url ? normalizeUrl(c.url) : null),
        c.accessedAt ?? null,
        c.note ?? null,
        a.sourceCheck ?? c.sourceCheck ?? null,
        c.anchor ? JSON.stringify(c.anchor) : null,
        c.humanAdded ?? false,
      ],
    );
    for (const [i, s] of (c.sources ?? []).entries()) {
      await exec.query(
        `insert into claim_sources(claim_id, ordinal, url, normalized_url, accessed_at, stance, note)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [claimId, i, s.url, s.normalizedUrl, s.accessedAt, s.stance, s.note ?? null],
      );
    }
  }

  // ---- 4. findings ---------------------------------------------------------------------------------
  const persistedFindings: { findingId: string; ordinal: number; severity: string; kind: string }[] = [];
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
    persistedFindings.push({ findingId, ordinal: f.ordinal, severity: f.severity, kind: f.kind });
  }

  // ---- 5. mark the delivered artifacts immutable (delivered artifacts are immutable — REQ-VIS-4/5) -
  if (args.deliveredVersionIds.length > 0) {
    await exec.query(`update artifact_versions set immutable = true where id = any($1::text[])`, [
      args.deliveredVersionIds as string[],
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

  // ---- 7. obligation spawn/join hook (logic is P0.12; the transactional seam is here — REQ-OBJ-2) --
  await hook.onDelivery({
    exec,
    runId: args.runId,
    projectId: args.projectId,
    draftId: args.draftId,
    correspondenceId,
    correspondenceKind: args.correspondenceKind,
    findings: persistedFindings,
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

  return { correspondenceId, downgradedClaimOrdinals, accessReport, accessReportVersionId: persistedReport.versionId };
}
