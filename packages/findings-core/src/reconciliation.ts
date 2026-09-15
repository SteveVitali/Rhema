import type { DispositionKind, FindingView } from "@rhema/contracts";

// Second-read reconciliation (§5.7; REQ-IDE-26, REQ-IDE-15 amended). Corroborated (origin `both`, ✓✓);
// second-read-only kept; rejected-by-reconciliation (collapsed with the Editor's reason, promotable). And the
// conflict case: a finding the user PRE-TRIAGED that the reconciliation later marked `rejected` surfaces as a
// conflict row rather than silently dropping either side. Framework-free.

/** How a reconciled finding presents on the surface. */
export type ReconciliationState =
  | "corroborated" // origin both — ✓✓
  | "second_read_only" // origin second_read, reconciliation kept
  | "editor_kept" // origin editor, kept
  | "rejected"; // reconciliation rejected — collapsed, promotable

export function reconciliationStateOf(v: FindingView): ReconciliationState {
  if (v.reconciliation === "rejected") return "rejected";
  if (v.origin === "both") return "corroborated";
  if (v.origin === "second_read") return "second_read_only";
  return "editor_kept";
}

export interface ReconciliationSummary {
  readonly corroborated: number;
  readonly secondReadOnly: number;
  readonly editorKept: number;
  readonly rejected: number;
  /** rejected findings the user may still promote ("I want to address this anyway"). */
  readonly promotable: number;
}

/** Tally the reconciliation states across the dossier's findings (§5.7). */
export function summarizeReconciliation(views: readonly FindingView[]): ReconciliationSummary {
  let corroborated = 0;
  let secondReadOnly = 0;
  let editorKept = 0;
  let rejected = 0;
  for (const v of views) {
    switch (reconciliationStateOf(v)) {
      case "corroborated":
        corroborated += 1;
        break;
      case "second_read_only":
        secondReadOnly += 1;
        break;
      case "editor_kept":
        editorKept += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
    }
  }
  return { corroborated, secondReadOnly, editorKept, rejected, promotable: rejected };
}

/** A conflict: the user pre-triaged a finding the reconciliation then withdrew (REQ-IDE-15 amended). */
export interface ReconciliationConflict {
  readonly findingId: string;
  readonly title: string;
  /** the verb the user chose before delivery. */
  readonly userDisposition: DispositionKind;
  /** the user's rationale, if any. */
  readonly userRationale?: string;
}

/**
 * Detect reconciliation conflicts (REQ-IDE-15 amended): a finding the user disposed (pre-triage) that the
 * second-read reconciliation later marked `rejected`. Neither the disposition nor the withdrawal is dropped —
 * the surface renders a conflict row ("you accepted this; the Editor withdrew it — keep your disposition?").
 */
export function detectReconciliationConflicts(views: readonly FindingView[]): ReconciliationConflict[] {
  const out: ReconciliationConflict[] = [];
  for (const v of views) {
    if (v.reconciliation === "rejected" && v.disposition != null) {
      out.push({
        findingId: v.id,
        title: v.title,
        userDisposition: v.disposition.kind,
        ...(v.disposition.rationale != null ? { userRationale: v.disposition.rationale } : {}),
      });
    }
  }
  return out;
}

/** Rejected findings with NO user disposition — the collapsed, promotable group (§5.7). */
export function collapsedRejected(views: readonly FindingView[]): FindingView[] {
  return views.filter((v) => v.reconciliation === "rejected" && v.disposition == null);
}
