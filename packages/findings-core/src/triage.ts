import type {
  FindingView,
  ResponseLedgerEntry,
  ResponseLedgerSidecar,
} from "@rhema/contracts";
import { SEVERITY_ORDER } from "./find-view.js";
import type { DispositionState } from "./disposition.js";

// Triage read/write rules (PRB.05; §5.7, REQ-SPEC-9, REQ-IDE-27/28, REQ-WF-9). Framework-free so the beta
// web, the gate card, and the 1.x mobile app share the same ordering + merge semantics.
//
// The triage list the Approve-triage card renders IS the response ledger it is approving: escalations are
// pinned first ("the decisions only you can make", §5.7), undecided rows come next in severity order, then
// the decided rows — every row visible, none dropped.

/** Above this many findings the beta advertises "let the Drafter propose a triage" (§5.7 finding triage). */
export const TRIAGE_PROMO_THRESHOLD = 30;

function severityRank(v: FindingView): number {
  return SEVERITY_ORDER[v.severity];
}

function isDecided(v: FindingView): boolean {
  return v.disposition != null;
}

/**
 * The triage tier for a row: 0 = escalated (pinned first — the decisions only you can make),
 * 1 = undecided, 2 = decided. Shared by the card's row sort and the api's DTO sort.
 */
export function triageTier(disposition: { readonly kind: string } | null | undefined): number {
  if (disposition == null) return 1;
  return disposition.kind === "escalate" ? 0 : 2;
}

/**
 * The §5.7 triage order: escalations pinned first, then undecided rows in severity order
 * (blocking → major → minor → note), then decided rows in severity order. Stable within each tier.
 */
export function triageOrder(views: readonly FindingView[]): FindingView[] {
  return views
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const d = triageTier(a.v.disposition ?? null) - triageTier(b.v.disposition ?? null);
      if (d !== 0) return d;
      const s = severityRank(a.v) - severityRank(b.v);
      if (s !== 0) return s;
      return a.i - b.i;
    })
    .map((x) => x.v);
}

export interface TriageQueue {
  /** the rows in §5.7 triage order (escalations first, then undecided, then decided). */
  readonly rows: readonly FindingView[];
  readonly total: number;
  readonly decided: number;
  readonly undecided: number;
  /** the first undecided row's id in triage order — where "next" lands (null when fully triaged). */
  readonly nextUndecidedId: string | null;
  /** true when the Drafter-proposed triage is advertised (> TRIAGE_PROMO_THRESHOLD findings). */
  readonly promoteAgentTriage: boolean;
}

/** Build the Approve-triage / pre-triage queue from the dossier's finding views. */
export function buildTriageQueue(views: readonly FindingView[]): TriageQueue {
  const rows = triageOrder(views);
  const decided = views.filter(isDecided).length;
  const next = rows.find((v) => !isDecided(v));
  return {
    rows,
    total: views.length,
    decided,
    undecided: views.length - decided,
    nextUndecidedId: next?.id ?? null,
    promoteAgentTriage: views.length > TRIAGE_PROMO_THRESHOLD,
  };
}

export interface PretriageSummary {
  readonly triaged: number;
  readonly total: number;
  readonly allTriaged: boolean;
}

/** "you pre-triaged N of M" — the counts; the surface composes the sentence. */
export function pretriageSummary(views: readonly FindingView[]): PretriageSummary {
  const triaged = views.filter(isDecided).length;
  return { triaged, total: views.length, allTriaged: views.length > 0 && triaged === views.length };
}

/**
 * Serialize a user disposition into a response-ledger entry — the row shape §5.7/§11.3 writes and the
 * Revise phase reads. User rows carry `actor: "user"` (REQ-SPEC-9) so the run never overrides them.
 */
export function dispositionToLedgerEntry(
  findingOrdinal: number,
  disposition: DispositionState,
): ResponseLedgerEntry {
  return {
    findingOrdinal,
    disposition: {
      kind: disposition.kind,
      status: "proposed",
      ...(disposition.rationale != null ? { rationale: disposition.rationale } : {}),
      ...(disposition.adaptedText != null ? { adaptedText: disposition.adaptedText } : {}),
      ...(disposition.applied != null ? { applied: disposition.applied } : {}),
      actor: "user",
    },
  };
}

/**
 * Build the pre-triage response ledger (REQ-IDE-28): the user-authored rows seeded into the Revise run's
 * `inputs.pretriage` — the file-level source the triage phase reads. Rows are written `actor: "user"`.
 */
export function buildPretriageLedger(
  rows: readonly { readonly findingOrdinal: number; readonly disposition: DispositionState }[],
): ResponseLedgerSidecar {
  return {
    sidecar: "response_ledger",
    version: 1,
    entries: rows
      .map((r) => dispositionToLedgerEntry(r.findingOrdinal, r.disposition))
      .sort((a, b) => a.findingOrdinal - b.findingOrdinal),
  };
}

/**
 * Merge the agent's proposed ledger with the human's rows (REQ-WF-9 / REQ-IDE-28): a user row always wins
 * over the agent's proposal for the same finding; agent rows for findings the human did not touch are
 * kept; user rows for findings the agent did not propose on are appended. Order follows the agent list,
 * then appended user rows in their given order. Deterministic and pure.
 */
export function mergeTriageProposals(
  agentEntries: readonly ResponseLedgerEntry[],
  userEntries: readonly ResponseLedgerEntry[],
): ResponseLedgerEntry[] {
  const byOrdinal = new Map<number, ResponseLedgerEntry>();
  for (const e of agentEntries) byOrdinal.set(e.findingOrdinal, e);
  for (const e of userEntries) byOrdinal.set(e.findingOrdinal, e);
  const out: ResponseLedgerEntry[] = [];
  const seen = new Set<number>();
  for (const e of agentEntries) {
    const row = byOrdinal.get(e.findingOrdinal);
    if (row != null && !seen.has(e.findingOrdinal)) {
      out.push(row);
      seen.add(e.findingOrdinal);
    }
  }
  for (const e of userEntries) {
    if (!seen.has(e.findingOrdinal)) {
      out.push(e);
      seen.add(e.findingOrdinal);
    }
  }
  return out;
}
