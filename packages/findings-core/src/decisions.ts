// The Decisions list (§5.7 "Decisions inbox"; beta Inbox stand-in; REQ-OBJ-7/8). One open row = one
// decision blocked on you. Sources: an `escalate` disposition, a deferred obligation's horizon arrival,
// or a stall escalation — all land in `decision_requests` (P0.11 routes them there; PRB.05 renders them).

/** A Decisions-inbox row (a `decision_requests` row projected for the list). */
export interface DecisionItemView {
  readonly id: string;
  readonly projectId: string | null;
  readonly obligationId: string | null;
  /** the decision's prompt ("Escalated finding: …" / "Deferred finding is back: …" / a stall ask). */
  readonly text: string;
  /** the choice labels the row offers (decide / dismiss for escalation asks). */
  readonly options: readonly string[];
  readonly createdAt: string | null;
}

/**
 * Project open `decision_requests` rows into the list. Open rows only; blocked-on-you-first ordering is
 * trivially satisfied (every open row is blocked on you) — stable ordering by creation time then id keeps
 * the list deterministic. The row's own source (escalation / horizon / stall) is already folded into its
 * text by the writer, so the list does not re-derive it.
 */
export function buildDecisionsList(
  rows: readonly {
    readonly id: string;
    readonly projectId: string | null;
    readonly obligationId: string | null;
    readonly text: string;
    readonly options: readonly string[];
    readonly state: string;
    readonly createdAt: string | null;
  }[],
): DecisionItemView[] {
  return rows
    .filter((r) => decisionNeedsYou(r.state))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const at = a.r.createdAt ?? "";
      const bt = b.r.createdAt ?? "";
      return at === bt ? a.i - b.i : at < bt ? -1 : 1;
    })
    .map(({ r }) => ({
      id: r.id,
      projectId: r.projectId,
      obligationId: r.obligationId,
      text: r.text,
      options: r.options,
      createdAt: r.createdAt,
    }));
}

/** True when a Decisions-inbox row is still blocked on the human (open = needs you). */
export function decisionNeedsYou(state: string): boolean {
  return state === "open";
}
