import type { Actor, DispositionKind } from "@rhema/contracts";

// The disposition state machine (§5.7; REQ-IDE-15/27, REQ-MOBILE-11 amended, REQ-SPEC-6). Five verbs, the
// rationale rules, freeze semantics — framework-free, so the beta web and the 1.x mobile app enforce the SAME
// rules (REQ-MOBILE-4). This package holds the *logic only*: the disposition UI/verbs and gate cards are
// PRB.05. Reading surfaces use `canDispose` to know a card is read-only (provisional or frozen).

/** The five disposition verbs (§5.7). `apply` is the free verb (REQ-SPEC-6) — an `accept` with `applied:true`. */
export const DISPOSITION_VERBS: readonly DispositionKind[] = ["accept", "adapt", "rebut", "defer", "escalate"];

/** A rationale is required for `rebut` and `escalate` ONLY (§5.7; REQ-MOBILE-11 amended). */
export const RATIONALE_REQUIRED: readonly DispositionKind[] = ["rebut", "escalate"];

/** `defer` pre-fills "Not this round" (editable) when the user gives no rationale (§5.7). */
export const DEFER_DEFAULT_RATIONALE = "Not this round" as const;

/** True when the verb requires a non-empty rationale before it can be recorded. */
export function rationaleRequired(kind: DispositionKind): boolean {
  return RATIONALE_REQUIRED.includes(kind);
}

/** A disposition the reading surface renders (a frozen ledger row, or a live one for PRB.05 to edit). */
export interface DispositionState {
  readonly kind: DispositionKind;
  readonly rationale?: string;
  readonly by: Actor;
  readonly at: string;
  readonly moveId?: string;
  readonly frozen: boolean;
  /** the free Apply verb (REQ-SPEC-6): an accept that wrote the suggestion into the working head now. */
  readonly applied?: boolean;
}

/** The user's intent to dispose a finding (the input PRB.05's verbs will submit; validated here). */
export interface DispositionInput {
  readonly kind: DispositionKind;
  readonly rationale?: string;
  readonly applied?: boolean;
}

export interface DispositionValidation {
  readonly ok: boolean;
  /** a one-line reason when `ok` is false. */
  readonly error?: string;
  /** the input with defaults applied (e.g. `defer`'s default rationale). */
  readonly normalized: DispositionInput;
}

/**
 * Validate + normalize a disposition input against the §5.7 rationale rules: `rebut`/`escalate` require a
 * non-empty rationale; `defer` defaults to "Not this round"; `accept`/`adapt`/`apply` never require text.
 */
export function validateDisposition(input: DispositionInput): DispositionValidation {
  const rationale = input.rationale?.trim();
  if (rationaleRequired(input.kind) && !rationale) {
    return { ok: false, error: `a rationale is required for ${input.kind}`, normalized: input };
  }
  if (input.kind === "defer" && !rationale) {
    return { ok: true, normalized: { ...input, rationale: DEFER_DEFAULT_RATIONALE } };
  }
  return { ok: true, normalized: rationale ? { ...input, rationale } : input };
}

/** A frozen disposition is immutable — at delivery the ledger is frozen and cards lock (§5.7). */
export function isFrozen(d: DispositionState | undefined | null): boolean {
  return d?.frozen === true;
}

/**
 * Can the user dispose this finding? No while it is provisional (streaming during a run — REQ-IDE-15) and no
 * once the ledger is frozen at delivery (§5.7). Reading surfaces use this to render read-only cards.
 */
export function canDispose(view: { provisional: boolean; disposition?: DispositionState | null }): boolean {
  return !view.provisional && !isFrozen(view.disposition);
}

/**
 * Apply a disposition to a finding's current state (the PRB.05 write path; here as the shared rule). Throws if
 * the current row is frozen (delivery locked it) — an immutability invariant both clients honor.
 */
export function applyDisposition(
  current: DispositionState | undefined,
  input: DispositionInput,
  actor: Actor,
  clock: { now(): Date },
): DispositionState {
  if (isFrozen(current)) throw new Error("disposition is frozen (delivered): cards lock at delivery (§5.7)");
  const v = validateDisposition(input);
  if (!v.ok) throw new Error(v.error);
  const state: DispositionState = {
    kind: v.normalized.kind,
    by: actor,
    at: clock.now().toISOString(),
    frozen: false,
  };
  return {
    ...state,
    ...(v.normalized.rationale != null ? { rationale: v.normalized.rationale } : {}),
    ...(v.normalized.applied != null ? { applied: v.normalized.applied } : {}),
  };
}

/**
 * Freeze a disposition at delivery: cards lock, and the row links forward to its move (§5.7). Idempotent — a
 * frozen row is returned unchanged (never rewritten; append-only history).
 */
export function freezeDisposition(d: DispositionState, at: string, moveId?: string): DispositionState {
  if (d.frozen) return d;
  return { ...d, frozen: true, ...(moveId != null ? { moveId } : d.moveId != null ? { moveId: d.moveId } : {}), at: d.at === "" ? at : d.at };
}
