// The What-changed read (§5.8; PRB.06; REQ-IDE-33, REQ-BETA-7/8). Server-side assembly of the view model the
// renderer consumes: load the frozen response ledger (the immutable `response-ledger.json` artifact on the
// response correspondence), diff the base draft's promoted head against the v(N+1) draft the response
// created, join each changed hunk to a ledger move through the discharge-evidence anchors (the SAME
// quote-resolution ladder findings use), and hang obligation discharge lines + the summary strip off the
// obligation ROWS — never the ledger's own prose.
//
// This is deliberately an api-side projector over @rhema/findings-core's pure `buildWhatChangedView`: the
// package boundary stays "SQL + content store here, domain logic there" (P0.12 pattern), and P1.8 re-skins
// the same pair in the pane system.

import {
  buildChangedSince,
  buildWhatChangedView,
  diffMarkdown,
  type ChangedSince,
  type DiffHunk,
  type ObligationLineInput,
  type WhatChangedEntryInput,
  type WhatChangedView,
} from "@rhema/findings-core";
import { responseLedgerSidecarSchema, type ResponseLedgerSidecar } from "@rhema/contracts";
import { findingObligationState, loadObligation } from "@rhema/obligations";
import type { ContentStore } from "@rhema/mirror";
import type { SqlExecutor } from "@rhema/obligations";

export interface WhatChangedResult {
  readonly ok: true;
  readonly responseId: string;
  readonly reviewId: string | null;
  /** the diffed versions — "v2 → v3" for the page header. */
  readonly beforeN: number;
  readonly afterN: number | null;
  readonly view: WhatChangedView;
}
export type WhatChangedOutcome = WhatChangedResult | { readonly ok: false; readonly reason: string };

interface CorrRow {
  id: string;
  project_id: string;
  kind: string;
  draft_id: string;
  run_id: string | null;
  prior_review_id: string | null;
  artifact_ids: string[] | null;
}

async function utf8OfVersion(store: ContentStore, versionId: string | null, exec: SqlExecutor): Promise<string | null> {
  if (!versionId) return null;
  const row = (
    await exec.query(`select content_sha256 from artifact_versions where id = $1`, [versionId])
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await store.get(row.content_sha256);
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

/**
 * Assemble the What-changed view for a delivered `response` correspondence. Returns `ok:false` with a reason
 * when the correspondence is not a response on this project, or when the v(N+1) draft it produced is absent
 * (a response that delivered no draft revision has nothing to diff — the view still renders its ledger rows
 * as unlinked cards via an empty diff).
 */
export async function loadWhatChanged(
  exec: SqlExecutor,
  store: ContentStore,
  args: { projectId: string; responseId: string },
): Promise<WhatChangedOutcome> {
  const corr = (
    await exec.query(
      `select id, project_id, kind, draft_id, run_id, prior_review_id, artifact_ids
         from correspondence_items where id = $1 and project_id = $2`,
      [args.responseId, args.projectId],
    )
  ).rows[0] as CorrRow | undefined;
  if (!corr || corr.kind !== "response") return { ok: false, reason: "not_found" };

  // The answered review — the run-supplied prior_review (authoritative), else the project's latest review
  // delivered before this response.
  const reviewCorr =
    (corr.prior_review_id
      ? ((
          await exec.query(`select id from correspondence_items where id = $1`, [corr.prior_review_id])
        ).rows[0] as { id: string } | undefined)
      : undefined) ??
    ((
      await exec.query(
        `select id from correspondence_items
          where project_id = $1 and kind = 'review' and id <> $2
          order by delivered_at desc limit 1`,
        [args.projectId, corr.id],
      )
    ).rows[0] as { id: string } | undefined);
  const reviewId = reviewCorr?.id ?? null;

  // The frozen ledger: the response's `response-ledger.json` artifact (immutable at delivery — §5.7).
  let ledger: ResponseLedgerSidecar | null = null;
  if (corr.artifact_ids && corr.artifact_ids.length > 0) {
    const ledgerVersion = (
      await exec.query(
        `select av.content_sha256 from artifact_versions av join artifacts a on a.id = av.artifact_id
          where av.id = any($1::text[]) and a.mirror_path like '%response-ledger.json'
          order by av.ordinal desc limit 1`,
        [corr.artifact_ids],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    if (ledgerVersion) {
      const bytes = await store.get(ledgerVersion.content_sha256);
      if (bytes) {
        const parsed = responseLedgerSidecarSchema.safeParse(
          JSON.parse(Buffer.from(bytes).toString("utf8")),
        );
        if (parsed.success) ledger = parsed.data;
      }
    }
  }

  // The diffed versions: vN = the base draft's promoted head (the version the response was delivered
  // against); v(N+1) = the draft this response created (the run's reserved nextDraftId, else the newest
  // draft based on the base). Absent after-side ⇒ empty diff (the ledger still renders).
  const base = (
    await exec.query(`select n, promoted_version_id from drafts where id = $1`, [corr.draft_id])
  ).rows[0] as { n: number; promoted_version_id: string | null } | undefined;
  if (!base) return { ok: false, reason: "base_draft_not_found" };
  const nextDraftId =
    (corr.run_id
      ? ((
          await exec.query(`select inputs->>'nextDraftId' as id from runs where id = $1`, [corr.run_id])
        ).rows[0] as { id: string | null } | undefined)?.id
      : null) ?? null;
  const nextDraft =
    (nextDraftId
      ? ((
          await exec.query(`select n, promoted_version_id from drafts where id = $1`, [nextDraftId])
        ).rows[0] as { n: number; promoted_version_id: string | null } | undefined)
      : undefined) ??
    ((
      await exec.query(
        `select n, promoted_version_id from drafts
          where base_draft_id = $1 and project_id = $2 and id <> $1 order by n desc limit 1`,
        [corr.draft_id, args.projectId],
      )
    ).rows[0] as { n: number; promoted_version_id: string | null } | undefined);

  const beforeMd = await utf8OfVersion(store, base.promoted_version_id, exec);
  const afterMd = nextDraft ? await utf8OfVersion(store, nextDraft.promoted_version_id, exec) : null;
  const diff = diffMarkdown(beforeMd ?? "", afterMd ?? "");

  // Entries: the ledger's own rows, with the review's finding rows resolved for ids/titles/severity. The
  // ledger stays the join's source of truth for anchors (the discharge evidence is §11.3 anchor-verbatim —
  // it never denormalized onto the disposition row).
  const findingRows = reviewId
    ? (((
        await exec.query(
          `select id, ordinal, title, severity from findings where correspondence_id = $1`,
          [reviewId],
        )
      ).rows as Array<{ id: string; ordinal: number; title: string; severity: string }>) ?? [])
    : [];
  const findingByOrdinal = new Map(findingRows.map((f) => [f.ordinal, f]));

  const entries: WhatChangedEntryInput[] = (ledger?.entries ?? []).map((e) => {
    const f = findingByOrdinal.get(e.findingOrdinal);
    return {
      findingOrdinal: e.findingOrdinal,
      ...(f ? { findingId: f.id, title: f.title, severity: f.severity } : {}),
      kind: e.disposition.kind,
      status: e.disposition.status,
      ...(e.disposition.rationale != null ? { rationale: e.disposition.rationale } : {}),
      ...(e.disposition.moveOrdinal != null ? { moveOrdinal: e.disposition.moveOrdinal } : {}),
      ...(e.disposition.actor != null ? { actor: e.disposition.actor } : {}),
      ...(e.anchor != null ? { anchor: e.anchor } : {}),
    };
  });

  // Obligation discharge lines, keyed by move ordinal: the entry's finding → its obligation (root or
  // lineage edge) → the row's post-routing state + verification. "OBL-<i>" numbers the project's
  // obligations by creation order (stable within a round).
  const projectObligations = (
    await exec.query(
      `select id from revision_obligations where project_id = $1 order by created_at, id`,
      [args.projectId],
    )
  ).rows as { id: string }[];
  const oblLabel = new Map(projectObligations.map((o, i) => [o.id, `OBL-${i + 1}`]));
  const draftNById = new Map<string, number>(
    ((
      await exec.query(`select id, n from drafts where project_id = $1`, [args.projectId])
    ).rows as Array<{ id: string; n: number }>
    ).map((d) => [d.id, d.n]),
  );
  const obligationLines: Record<number, ObligationLineInput[]> = {};
  const pushLine = (moveOrdinal: number, line: ObligationLineInput) => {
    (obligationLines[moveOrdinal] ??= []).push(line);
  };
  for (const e of entries) {
    if (e.moveOrdinal == null || !e.findingId || e.kind === "rebut") continue;
    const chip = await findingObligationState(exec, e.findingId);
    if (!chip) continue;
    const ob = await loadObligation(exec, chip.obligationId);
    if (!ob) continue;
    const openedOnN = ob.openedOnDraftId ? draftNById.get(ob.openedOnDraftId) : undefined;
    const lineage =
      ob.roundsOpen > 1 && openedOnN != null
        ? `(F-${String(e.findingOrdinal).padStart(2, "0")}, carried from v${openedOnN})`
        : `(F-${String(e.findingOrdinal).padStart(2, "0")})`;
    pushLine(e.moveOrdinal, {
      obligationId: ob.id,
      label: oblLabel.get(ob.id) ?? `OBL-${ob.id.slice(-4)}`,
      lineage,
      ...(ob.dischargedBy?.verifiedBy ? { verifiedBy: ob.dischargedBy.verifiedBy } : {}),
      state: chip.rendered,
    });
  }

  // The summary strip — computed from obligation ROWS (REQ-OBJ-6): addressed/discharged/mooted moves this
  // response routed (transitions on its run), rebutted rows, and the project's still-live remainder.
  const routed = (
    await exec.query(
      `select to_state, count(distinct obligation_id)::int as n from obligation_transitions
        where run_id = $1 group by to_state`,
      [corr.run_id],
    )
  ).rows as Array<{ to_state: string; n: number }>;
  const nOf = (s: string) => routed.find((r) => r.to_state === s)?.n ?? 0;
  const addressed = nOf("addressed") + nOf("discharged") + nOf("mooted");
  const rebutted = nOf("rebutted");
  const stillOpen = (
    await exec.query(
      `select count(*)::int as n from revision_obligations
        where project_id = $1 and state in ('open','reopened','deferred')`,
      [args.projectId],
    )
  ).rows[0] as { n: number };

  const view = buildWhatChangedView(diff, {
    entries,
    moves: (ledger?.moves ?? []).map((m) => ({
      ordinal: m.ordinal,
      title: m.title,
      ...(m.type != null ? { type: m.type } : {}),
      ...(m.status != null ? { status: m.status } : {}),
    })),
    obligationLines,
    strip: { addressed, rebutted, stillOpen: stillOpen.n },
  });
  return {
    ok: true,
    responseId: corr.id,
    reviewId,
    beforeN: base.n,
    afterN: nextDraft?.n ?? null,
    view,
  };
}

/** The hunk a comment attaches to — resolved server-side so the Guidance anchor names a real hunk id. */
export function findHunk(view: WhatChangedView, hunkId: string): DiffHunk | null {
  for (const mv of view.moves) {
    const h = mv.hunks.find((x) => x.id === hunkId);
    if (h) return h;
  }
  return view.unlinked.hunks.find((x) => x.id === hunkId) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// the re-review seed (§5.8: "launching Review on v(N+1) passes prior_review + changed_since")
// ---------------------------------------------------------------------------------------------------------------------

export interface ReReviewSeed {
  /** the prior review correspondence the new review re-reviews (`inputs.priorReviewId`). */
  readonly priorReviewId: string;
  /** the server-computed block diff the Editor reads first (`inputs.changedSince`; REQ-DATA-25). */
  readonly changedSince: ChangedSince;
}

/**
 * Compute the re-review inputs at run creation (PRB.06): the project's latest review correspondence is the
 * `prior_review`, and `changed_since` is the block diff between the version that review covered (its draft's
 * promoted head) and the version being re-reviewed (the run's target draft — `headDraftId`, else the
 * project's newest promoted draft). A head draft of `origin 'human_revision'` marks every touched block a
 * `humanAdded`/`unverifiable` claim placeholder (REQ-DATA-25; REQ-PROD-11).
 */
export async function computeReReviewSeed(
  exec: SqlExecutor,
  store: ContentStore,
  args: { projectId: string; headDraftId?: string },
): Promise<ReReviewSeed | null> {
  const prev = (
    await exec.query(
      `select ci.id, d.promoted_version_id
         from correspondence_items ci join drafts d on d.id = ci.draft_id
        where ci.project_id = $1 and ci.kind = 'review'
        order by ci.delivered_at desc limit 1`,
      [args.projectId],
    )
  ).rows[0] as { id: string; promoted_version_id: string | null } | undefined;
  if (!prev) return null;
  const head = args.headDraftId
    ? ((
        await exec.query(`select promoted_version_id, origin from drafts where id = $1`, [args.headDraftId])
      ).rows[0] as { promoted_version_id: string | null; origin: string } | undefined)
    : ((
        await exec.query(
          `select promoted_version_id, origin from drafts
            where project_id = $1 and promoted_version_id is not null order by n desc limit 1`,
          [args.projectId],
        )
      ).rows[0] as { promoted_version_id: string | null; origin: string } | undefined);
  const beforeMd = await utf8OfVersion(store, prev.promoted_version_id, exec);
  const afterMd = head ? await utf8OfVersion(store, head.promoted_version_id, exec) : null;
  const changedSince = buildChangedSince(beforeMd ?? "", afterMd ?? "", {
    humanEdit: head?.origin === "human_revision",
  });
  return { priorReviewId: prev.id, changedSince };
}
