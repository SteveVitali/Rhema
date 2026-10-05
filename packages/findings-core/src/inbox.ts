// The Inbox read model (P1.19; §5.11; REQ-IDE-2 amended, REQ-IDE-48, REQ-OBJ-6). ONE ordering, ONE badge
// rule — the same pure functions the web's `/app/inbox` and the api's read endpoint (and later the 1.x
// app, REQ-MOBILE-19) share:
//
//   1. blocked-on-you — every open approval and decision across all projects, soonest deadline first;
//   2. the unread event rows (finished runs, chat replies, spend/approval echoes, …) newest first;
//   3. stale voices.
//
// The Rail badge counts ONLY group 1 — approvals and decisions — never finished runs or stale voices.
// Framework-free + DOM-free like the rest of this package.

/** A group-1 row: an open approval gate or an open decision_request — anything that is "blocked on you". */
export interface InboxBlockedRow {
  readonly kind: "gate" | "decision";
  readonly id: string;
  /** the gate's effective deadline (ISO) — absent on decisions + wait-forever gates. */
  readonly deadlineAt?: string | null;
  /** when the row opened (ISO) — the no-deadline tie-break: oldest waits longest. */
  readonly openedAt: string;
}

/** A group-2 row: a §5.11 in-app event (the `inbox_items` row projected). */
export interface InboxEventRow {
  readonly kind: "event";
  readonly id: string;
  readonly unread: boolean;
  readonly createdAt: string;
}

/** A group-3 row: a voice whose derived status is an attention state (seed/samples changed, aged, off). */
export interface InboxVoiceRow {
  readonly kind: "voice";
  readonly id: string;
  /** the §9.3 derived state — the sort key: actionable staleness before mere age. */
  readonly state: string;
  readonly name: string;
}

export type InboxRow = InboxBlockedRow | InboxEventRow | InboxVoiceRow;

/**
 * Group 1's internal order (§5.11 + REQ-IDE-2): rows carrying a deadline sort by SOONEST deadline first;
 * deadline-less rows follow by opening time (the row that has waited longest leads). Stable on id.
 */
export function inboxBlockedOrder<T extends { deadlineAt?: string | null; openedAt?: string; id?: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const da = a.deadlineAt ?? null;
    const db = b.deadlineAt ?? null;
    if (da != null && db != null && da !== db) return da < db ? -1 : 1;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    const oa = a.openedAt ?? "";
    const ob = b.openedAt ?? "";
    if (oa !== ob) return oa < ob ? -1 : 1;
    return (a.id ?? "") < (b.id ?? "") ? -1 : (a.id ?? "") > (b.id ?? "") ? 1 : 0;
  });
}

/** The voice staleness precedence — actionable changes lead, mere age trails (§9.3 tones). */
const VOICE_ORDER: readonly string[] = ["seed_changed", "samples_changed", "badly_off", "aged"];

/**
 * THE Inbox ordering (REQ-IDE-2 amended): blocked-on-you → unread events (newest first; read events
 * follow, still newest-first) → stale voices (state precedence, then name). Mixed input rows are
 * partitioned by `kind` — callers may also feed the groups separately.
 */
export function inboxOrder(rows: readonly InboxRow[]): InboxRow[] {
  const blocked = rows.filter((r): r is InboxBlockedRow => r.kind === "gate" || r.kind === "decision");
  const events = rows.filter((r): r is InboxEventRow => r.kind === "event");
  const voices = rows.filter((r): r is InboxVoiceRow => r.kind === "voice");
  const byNewest = (a: { createdAt: string }, b: { createdAt: string }) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1;
  const unread = events.filter((e) => e.unread).sort(byNewest);
  const read = events.filter((e) => !e.unread).sort(byNewest);
  const voiceSorted = [...voices].sort((a, b) => {
    const ia = VOICE_ORDER.indexOf(a.state);
    const ib = VOICE_ORDER.indexOf(b.state);
    const ra = ia === -1 ? VOICE_ORDER.length : ia;
    const rb = ib === -1 ? VOICE_ORDER.length : ib;
    if (ra !== rb) return ra - rb;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return [...inboxBlockedOrder(blocked), ...unread, ...read, ...voiceSorted];
}

/**
 * The Rail badge rule (§5.11; REQ-IDE-2 amended): counts ONLY approvals + decisions — the
 * blocked-on-you rows — never finished runs, chat replies, or stale voices.
 */
export function inboxBadgeCount(rows: readonly InboxRow[]): number {
  return rows.filter((r) => r.kind === "gate" || r.kind === "decision").length;
}

/** Grouped view for the api DTO + the page (the ordering is `inboxOrder` flattened). */
export interface InboxGroups {
  readonly blocked: readonly InboxBlockedRow[];
  readonly events: readonly InboxEventRow[];
  readonly voices: readonly InboxVoiceRow[];
  readonly badge: number;
}

export function inboxGroups(rows: readonly InboxRow[]): InboxGroups {
  const blocked = rows.filter((r): r is InboxBlockedRow => r.kind === "gate" || r.kind === "decision");
  return {
    blocked: inboxBlockedOrder(blocked),
    events: rows
      .filter((r): r is InboxEventRow => r.kind === "event")
      .sort((a, b) => (a.unread === b.unread ? (a.createdAt === b.createdAt ? 0 : a.createdAt > b.createdAt ? -1 : 1) : a.unread ? -1 : 1)),
    voices: rows.filter((r): r is InboxVoiceRow => r.kind === "voice"),
    badge: blocked.length,
  };
}
