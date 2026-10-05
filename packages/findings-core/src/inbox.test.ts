import { describe, it, expect } from "vitest";
import { inboxBadgeCount, inboxBlockedOrder, inboxGroups, inboxOrder, type InboxRow } from "./inbox.js";

// P1.19 — the §5.11 Inbox ordering + badge rule (REQ-IDE-2 amended; T8 in the run ledger):
//   1. blocked-on-you (gates + decisions) — soonest deadline first, no-deadline rows oldest-first;
//   2. unread event rows newest-first, then read event rows newest-first;
//   3. stale voices — actionable states before mere age, then name.
// The badge counts group 1 ONLY — never finished runs, chat replies, or stale voices.

const gate = (id: string, deadlineAt: string | null, openedAt = "2026-09-20T00:00:00Z"): InboxRow => ({
  kind: "gate",
  id,
  deadlineAt,
  openedAt,
});
const decision = (id: string, openedAt = "2026-09-19T00:00:00Z"): InboxRow => ({
  kind: "decision",
  id,
  deadlineAt: null,
  openedAt,
});
const event = (id: string, unread: boolean, createdAt: string): InboxRow => ({
  kind: "event",
  id,
  unread,
  createdAt,
});
const voice = (id: string, state: string, name: string): InboxRow => ({ kind: "voice", id, state, name });

describe("inboxOrder — the one ordering", () => {
  it("blocked-on-you first (soonest deadline, then oldest-waiting), then unread events, then read events, then voices", () => {
    const rows: InboxRow[] = [
      voice("v1", "aged", "Zeta"),
      event("e_old_unread", true, "2026-09-24T00:00:00Z"),
      event("e_read_new", false, "2026-09-26T00:00:00Z"),
      gate("g_late", "2026-10-01T00:00:00Z"),
      event("e_new_unread", true, "2026-09-25T00:00:00Z"),
      gate("g_soon", "2026-09-27T00:00:00Z"),
      decision("d1"),
      event("e_read_old", false, "2026-09-20T00:00:00Z"),
      voice("v2", "seed_changed", "Alpha"),
    ];
    expect(inboxOrder(rows).map((r) => r.id)).toEqual([
      // blocked: deadline rows soonest-first, then the no-deadline decision
      "g_soon",
      "g_late",
      "d1",
      // unread events newest-first
      "e_new_unread",
      "e_old_unread",
      // read events newest-first
      "e_read_new",
      "e_read_old",
      // voices: actionable state before age
      "v2",
      "v1",
    ]);
  });

  it("voices order by state precedence then name", () => {
    const rows: InboxRow[] = [
      voice("va", "aged", "Bravo"),
      voice("vb", "badly_off", "Alpha"),
      voice("vc", "seed_changed", "Zulu"),
      voice("vd", "samples_changed", "Alpha"),
    ];
    expect(inboxOrder(rows).map((r) => r.id)).toEqual(["vc", "vd", "vb", "va"]);
  });
});

describe("inboxBlockedOrder — group 1's internal order", () => {
  it("deadline rows lead (soonest first); no-deadline rows follow oldest-opened first", () => {
    const rows: InboxRow[] = [
      decision("d_recent", "2026-09-25T00:00:00Z"),
      gate("g_deadline", "2026-10-05T00:00:00Z"),
      decision("d_oldest", "2026-09-10T00:00:00Z"),
    ];
    expect(inboxBlockedOrder(rows).map((r) => r.id)).toEqual(["g_deadline", "d_oldest", "d_recent"]);
  });
});

describe("inboxBadgeCount — the Rail badge", () => {
  it("counts approvals + decisions ONLY — never finished runs, chat echoes, or voices", () => {
    const rows: InboxRow[] = [
      gate("g1", null),
      decision("d1"),
      event("e1", true, "2026-09-25T00:00:00Z"), // an unread run_finished — NOT badge-counted
      voice("v1", "seed_changed", "Alpha"), //      a stale voice — NOT badge-counted
    ];
    expect(inboxBadgeCount(rows)).toBe(2);
    expect(inboxBadgeCount([])).toBe(0);
  });
});

describe("inboxGroups — the page/api projection", () => {
  it("partitions rows into the three groups + the badge", () => {
    const g = inboxGroups([
      event("e_read", false, "2026-09-24T00:00:00Z"),
      gate("g1", null),
      event("e_unread", true, "2026-09-25T00:00:00Z"),
      voice("v1", "aged", "Alpha"),
      decision("d1"),
    ]);
    expect(g.blocked.map((r) => r.id)).toEqual(["d1", "g1"]); // no deadlines → oldest-opened first
    expect(g.events.map((r) => r.id)).toEqual(["e_unread", "e_read"]); // unread leads regardless of recency
    expect(g.voices.map((r) => r.id)).toEqual(["v1"]);
    expect(g.badge).toBe(2);
  });
});
