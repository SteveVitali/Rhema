import type { Anchor, Finding, FindingView, Severity } from "@rhema/contracts";
import type { DispositionState } from "./disposition.js";
import { WHOLE_PIECE } from "./anchor.js";

// The FindingView read model built from rows (§5.7; deliverable 1). `Finding`/`Disposition` are §11.3's
// canonical row shapes; `FindingView` is the IDE read model both clients render. Framework-free.

/** Severity sort order for the list-first surface: blocking → major → minor → note (§5.7). */
export const SEVERITY_ORDER: Record<Severity, number> = {
  blocking: 0,
  major: 1,
  minor: 2,
  note: 3,
};

export interface BuildFindingViewOptions {
  /** the user's / agent's disposition for this finding, if any. */
  readonly disposition?: DispositionState;
  /** true while the finding is streaming during a run (no disposition controls — REQ-IDE-15). */
  readonly provisional?: boolean;
  /** the projection onto the open draft, when it is not the reviewed one (§5.7). */
  readonly projection?: Anchor;
}

/**
 * Build the §5.7 `FindingView` read model from a canonical `Finding` row (+ its disposition). Field names match
 * §11.3's `Finding`/`Disposition`. `provisional` marks a streaming card; the disposition (if frozen) locks it.
 */
export function buildFindingView(finding: Finding, opts: BuildFindingViewOptions = {}): FindingView {
  return {
    id: finding.id,
    correspondenceId: finding.correspondenceId,
    draftId: finding.draftId,
    kind: finding.kind,
    severity: finding.severity,
    origin: finding.origin,
    ...(finding.reconciliation != null ? { reconciliation: finding.reconciliation } : {}),
    anchor: finding.anchor,
    ...(opts.projection != null ? { projection: opts.projection } : {}),
    title: finding.title,
    body: finding.body,
    ...(finding.evidence != null ? { evidence: finding.evidence } : {}),
    ...(finding.suggestion != null ? { suggestion: finding.suggestion } : {}),
    rubricDims: finding.rubricDims,
    ...(finding.letterSection != null ? { letterSection: finding.letterSection } : {}),
    provisional: opts.provisional ?? false,
    ...(opts.disposition != null
      ? {
          disposition: {
            kind: opts.disposition.kind,
            ...(opts.disposition.rationale != null ? { rationale: opts.disposition.rationale } : {}),
            ...(opts.disposition.adaptedText != null
              ? { adaptedText: opts.disposition.adaptedText }
              : {}),
            ...(opts.disposition.reasonCode != null
              ? { reasonCode: opts.disposition.reasonCode }
              : {}),
            by: opts.disposition.by,
            at: opts.disposition.at,
            ...(opts.disposition.moveId != null ? { moveId: opts.disposition.moveId } : {}),
            frozen: opts.disposition.frozen,
            ...(opts.disposition.applied != null ? { applied: opts.disposition.applied } : {}),
          },
        }
      : {}),
  };
}

/** A section of the list-first findings surface (§5.7 "three surfaces, one list"; beta = the Desk list). */
export interface FindingGroup {
  /** the anchor block id, or the whole-piece sentinel. */
  readonly key: string;
  /** the display label (a block label from the caller, or "Whole piece"). */
  readonly label: string;
  readonly findings: readonly FindingView[];
}

export interface GroupOptions {
  /** resolve an anchor block id to a human label (e.g. "§II ¶4"); defaults to the block id. */
  readonly blockLabel?: (blockId: string) => string;
}

function severityRank(v: FindingView): number {
  return SEVERITY_ORDER[v.severity];
}

/**
 * Group findings for the list-first surface (REQ-IDE-23/24). Unanchored findings head the list under
 * "Whole piece" and are NEVER dropped; anchored findings group by their anchor block; every input view lands in
 * exactly one group (the count is preserved). Within a group, sort blocking → major → minor → note, then by
 * ordinal-stable insertion order.
 */
export function groupFindingsForList(views: readonly FindingView[], opts: GroupOptions = {}): FindingGroup[] {
  const wholePiece: FindingView[] = [];
  const byBlock = new Map<string, FindingView[]>();
  const blockOrder: string[] = [];

  for (const v of views) {
    if (v.anchor == null || v.anchor.unanchored === true) {
      wholePiece.push(v);
      continue;
    }
    const key = v.anchor.blockId;
    let bucket = byBlock.get(key);
    if (bucket == null) {
      bucket = [];
      byBlock.set(key, bucket);
      blockOrder.push(key);
    }
    bucket.push(v);
  }

  const sortSeverity = (arr: FindingView[]): FindingView[] =>
    arr
      .map((v, i) => ({ v, i }))
      .sort((a, b) => severityRank(a.v) - severityRank(b.v) || a.i - b.i)
      .map((x) => x.v);

  const groups: FindingGroup[] = [];
  // Whole piece heads the list (§5.7) whenever there is an unanchored finding.
  if (wholePiece.length > 0) {
    groups.push({ key: WHOLE_PIECE, label: WHOLE_PIECE, findings: sortSeverity(wholePiece) });
  }
  for (const key of blockOrder) {
    groups.push({
      key,
      label: opts.blockLabel ? opts.blockLabel(key) : key,
      findings: sortSeverity(byBlock.get(key) ?? []),
    });
  }
  return groups;
}

/** Total findings across the groups — the invariant helper (count in === count out; never dropped). */
export function countGrouped(groups: readonly FindingGroup[]): number {
  return groups.reduce((n, g) => n + g.findings.length, 0);
}
