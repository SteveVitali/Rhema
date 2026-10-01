// Lock-set concurrency (§12.4 "Concurrency"; REQ-RUN-17; REQ-DATA-39/40), enforced in Postgres.
//
// Lock keys are strings stored in `runs.lock_set text[]` (GIN-indexed for conflict detection). The mode is
// encoded in the key: `draft:read:<id>` is SHARED; every other key is EXCLUSIVE. Two lock sets conflict iff
// they share an exclusive key. This gives the §12.4 permitted overlaps for free:
//   • review(vN) ∥ human working copy       — reader reads vN; the writer reserves the NEXT draft id
//   • review(vN, A) ∥ review(vN, B)         — variants take corr k=1 and k=2 → distinct keys
//   • review ∥ voice refresh                — a project reader vs a persona lock → disjoint keys
//   • Assistant ∥ anything                  — the Assistant/chat takes no lock
//   • section drafts for disjoint sections  — distinct draft:write ids

import type { WorkflowKey } from "@rhema/contracts";

export type LockMode = "shared" | "exclusive";
export type LockKey = string;

const READ_PREFIX = "draft:read:";

/** The mode a key carries: only `draft:read:<id>` is shared; everything else is exclusive. */
export function lockMode(key: LockKey): LockMode {
  return key.startsWith(READ_PREFIX) ? "shared" : "exclusive";
}

export const lockKeys = {
  draftRead: (draftId: string): LockKey => `${READ_PREFIX}${draftId}`,
  draftWrite: (draftId: string): LockKey => `draft:write:${draftId}`,
  head: (projectId: string): LockKey => `head:${projectId}`,
  /**
   * Correspondence slot lock (exclusive). P1.06 — a `scopeKey` discriminates same-kind reads of one draft
   * by their run scope (`corr:d1:review:1:sec-III` ∥ `corr:d1:review:1:sec-IV`), so scoped readers
   * parallelize while identical submissions still collide (no duplicate spend).
   */
  corr: (draftId: string, kind: string, k: number, scopeKey?: string): LockKey =>
    `corr:${draftId}:${kind}:${k}${scopeKey ? `:${scopeKey}` : ""}`,
  nsWrite: (seat: string, projectId: string): LockKey => `ns:write:agent:${seat}:${projectId}`,
  personaProfileWrite: (personaId: string): LockKey => `persona:profile:write:${personaId}`,
} as const;

/**
 * The first key in `candidate` that conflicts with the already-held set, or null when the candidate is
 * admissible. A conflict is a shared EXCLUSIVE key (two exclusive holders, or an exclusive vs the same key).
 */
export function firstConflict(candidate: readonly LockKey[], held: readonly LockKey[]): LockKey | null {
  const heldSet = new Set(held);
  for (const k of candidate) {
    if (heldSet.has(k) && lockMode(k) === "exclusive") return k;
  }
  return null;
}

export function conflicts(candidate: readonly LockKey[], held: readonly LockKey[]): boolean {
  return firstConflict(candidate, held) !== null;
}

/** Workflows that write a project draft (they take the writer locks + the per-project writer flag). */
const WRITER_WORKFLOWS: ReadonlySet<WorkflowKey> = new Set<WorkflowKey>([
  "draft",
  "revise",
  "cut_to_length",
  "line_edit",
]);

/** Persona workflows lock the persona, not the project (§12.4). */
const PERSONA_WORKFLOWS: ReadonlySet<WorkflowKey> = new Set<WorkflowKey>([
  "profile_voice",
  "refresh_voice",
  "compose_voice",
  "calibrate_voice",
  "reseed_charter",
]);

export function isWriterWorkflow(workflow: WorkflowKey): boolean {
  return WRITER_WORKFLOWS.has(workflow);
}
export function isPersonaWorkflow(workflow: WorkflowKey): boolean {
  return PERSONA_WORKFLOWS.has(workflow);
}

export interface LockSetSpec {
  readonly workflow: WorkflowKey;
  readonly seat: string; // the run's authoring/reading seat (agent_types.key), e.g. "author" | "editor"
  readonly projectId?: string;
  readonly personaId?: string;
  /** The current draft version being read (readers) or the base of a revision. */
  readonly draftId?: string;
  /** The next draft id a writer reserves at start (`draft:write:<nextId>`). */
  readonly nextDraftId?: string;
  /** Correspondence kind for reader locks (e.g. "review"), and the parallel-variant slot k. */
  readonly corrKind?: string;
  readonly corrK?: number;
  /**
   * P1.06 (ledger G22 / REQ-CHAT-23) — the run's scope discriminating the corr lock so scoped readers of
   * one draft parallelize (the §7.2 serialized scope, e.g. "section:III"). Unset ⇒ the unscoped slot.
   */
  readonly scopeKey?: string;
}

/**
 * The lock set a run acquires (§12.4). Writers take the namespace write lock + a draft:write on the reserved
 * next id; readers take a shared draft:read + a per-variant corr lock; persona runs take the persona lock;
 * the Assistant/chat takes none. `head:<project>` is the human's — runs never acquire it.
 */
export function computeLockSet(spec: LockSetSpec): LockKey[] {
  const keys: LockKey[] = [];
  if (isPersonaWorkflow(spec.workflow)) {
    if (spec.personaId) keys.push(lockKeys.personaProfileWrite(spec.personaId));
    return keys;
  }
  if (isWriterWorkflow(spec.workflow)) {
    if (spec.projectId) keys.push(lockKeys.nsWrite(spec.seat, spec.projectId));
    if (spec.nextDraftId) keys.push(lockKeys.draftWrite(spec.nextDraftId));
    if (spec.draftId) keys.push(lockKeys.draftRead(spec.draftId)); // reads its base version
    return keys;
  }
  // reader workflows (review, fact_check, …): a shared read + a per-variant correspondence lock.
  if (spec.draftId) keys.push(lockKeys.draftRead(spec.draftId));
  if (spec.draftId && spec.corrKind) keys.push(lockKeys.corr(spec.draftId, spec.corrKind, spec.corrK ?? 1, spec.scopeKey));
  return keys;
}

// ---------------------------------------------------------------------------------------------------------------------
// the editor's view of the locks (PRB.07; §5.4/§6.3 "read-only during runs · Cancel run to edit")
// ---------------------------------------------------------------------------------------------------------------------

/** The run states that HOLD their declared lock set (a queued run has not acquired locks yet — provision's
 *  conflict scan and the editor's read-only check share this list). */
export const HOLDING_STATES: readonly string[] = [
  "provisioning",
  "running",
  "waiting_gate",
  "orphaned",
  "cancelling",
  "finalizing",
];

/** What the editor's read-only banner names when a run holds the page. */
export interface EditorLock {
  readonly runId: string;
  /** 'writer' — a run is writing this project (ns:write / draft:write); 'reader' — a run is reading THIS head. */
  readonly kind: "writer" | "reader";
  readonly workflow: string;
}

/**
 * The run lock the Page surfaces (§6.3): a writer run in the project (any `ns:write:*:<projectId>` key, or a
 * `draft:write` on the head) locks the whole project; a reader run holding `draft:read:<headId>` locks that
 * frozen head. Writers win over readers. `runs` are the project's lock-holding rows (caller filters to
 * HOLDING_STATES); pure so the editor read + the save guard share one rule.
 */
export function editorLockForRuns(
  runs: readonly { readonly id: string; readonly workflow: string; readonly lockSet: readonly string[] }[],
  args: { readonly projectId: string; readonly draftId: string },
): EditorLock | null {
  for (const r of runs) {
    const writerKey =
      r.lockSet.some((k) => k.startsWith("ns:write:") && k.endsWith(`:${args.projectId}`)) ||
      r.lockSet.includes(lockKeys.draftWrite(args.draftId));
    if (writerKey) return { runId: r.id, kind: "writer", workflow: r.workflow };
  }
  for (const r of runs) {
    if (r.lockSet.includes(lockKeys.draftRead(args.draftId))) {
      return { runId: r.id, kind: "reader", workflow: r.workflow };
    }
  }
  return null;
}
