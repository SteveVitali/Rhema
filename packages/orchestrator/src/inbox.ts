// The Inbox read model (P1.19; §5.11; REQ-IDE-2 amended, REQ-IDE-48, REQ-OBJ-6, REQ-MOBILE-19).
//
// `listInbox` assembles the three row families INSIDE the caller's tenant tx and hands them to the ONE
// shared sorter (@rhema/findings-core's `inboxOrder`/`inboxGroups`) — the api's GET /inbox, the web
// `/app/inbox`, and later the 1.x app all render the same order:
//
//   1. blocked-on-you — open approval/spend gates on the user's runs + open decision_requests on the
//      user's projects (escalations, horizon-expired deferrals, stall escalations ride the SAME table —
//      no parallel state machine). Soonest deadline first.
//   2. unread event rows — `inbox_items` visible_at <= now (the quiet-hours arm), unread first then
//      read, newest first. Collapse means a run's notifications live in ONE row.
//   3. stale voices — personas whose read-time `deriveVoiceStatus` is an attention state.
//
// The rail badge (`readInboxBadge`) counts ONLY group 1 — never finished runs or stale voices (§5.11).

import {
  inboxGroups,
  inboxOrder,
  type InboxBlockedRow,
  type InboxEventRow,
  type InboxVoiceRow,
} from "@rhema/findings-core";
import type { Clock } from "./clock.js";
import type { SqlClient } from "./tx.js";
import type { TxRunner } from "./tx.js";
import { loadVoiceStatus } from "./voice-status.js";

/** The §9.3 states the Inbox surfaces as group-3 rows (tone 'attention'; unfalsified is neutral). */
const STALE_VOICE_STATES = new Set(["seed_changed", "samples_changed", "badly_off", "aged"]);

export interface InboxDeps {
  readonly txRunner: TxRunner;
  readonly clock: Clock;
}

/** A blocked-on-you gate row — the Needs-you card's wire fields the InboxItem embeds. */
interface BlockedGateRow {
  gate_id: string;
  kind: string;
  run_id: string;
  workflow: string;
  deadline_at: Date | null;
  presence_deadline_at: Date | null;
  opened_at: Date;
  project_id: string | null;
  project_slug: string | null;
  project_title: string | null;
}

interface BlockedDecisionRow {
  id: string;
  text: string;
  options: string[];
  obligation_id: string | null;
  source_run_id: string | null;
  project_id: string | null;
  project_slug: string | null;
  project_title: string | null;
}

interface InboxItemDb {
  id: string;
  project_id: string | null;
  payload: unknown;
  read_at: Date | null;
  created_at: Date;
  run_id: string | null;
}

export interface InboxListItem {
  readonly id: string;
  readonly kind: "blocked" | "event" | "voice";
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly href: string;
  readonly projectId?: string | null;
  readonly projectTitle?: string | null;
  readonly runId?: string | null;
  readonly unread: boolean;
  readonly createdAt: string;
  readonly gate?: {
    readonly gateId: string;
    readonly runId: string;
    readonly kind: string;
    readonly workflow: string;
    readonly deadlineAt: string | null;
  };
  readonly decision?: {
    readonly decisionId: string;
    readonly text: string;
    readonly options: readonly string[];
    readonly obligationId: string | null;
  };
}

/**
 * The §5.11 Inbox, fully ordered. `userId` scopes gates/decisions/items to the caller's own work
 * (project owner), matching `runRecipient`'s recipient rule for the notify jobs that write the rows.
 */
export async function listInbox(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string },
): Promise<InboxListItem[]> {
  const now = deps.clock.now();
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const rows = await loadRows(tx, args.userId, now);
    const ordered = inboxOrder(rows);
    return ordered.map((r) => (r as unknown as { view: InboxListItem }).view);
  });
}

/** The grouped variant the web page consumes (same ordering, kept as named sections). */
export async function listInboxGroups(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string },
): Promise<{ items: InboxListItem[]; badge: number }> {
  const now = deps.clock.now();
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const rows = await loadRows(tx, args.userId, now);
    const groups = inboxGroups(rows);
    void groups;
    const ordered = inboxOrder(rows);
    return {
      items: ordered.map((r) => (r as unknown as { view: InboxListItem }).view),
      badge: groups.badge,
    };
  });
}

/** The rail badge — open approvals + open decisions ONLY (§5.11; never runs or voices). */
export async function readInboxBadge(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string },
): Promise<{ count: number }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const gates = (
      await tx.query(
        `select count(*)::int as n
           from gates g
           join runs r on r.id = g.run_id
           join projects p on p.id = r.project_id
          where g.resolved_at is null and g.held = false and r.state = 'waiting_gate'
            and p.owner_id = $1`,
        [args.userId],
      )
    ).rows[0] as { n: number };
    const decisions = (
      await tx.query(
        `select count(*)::int as n
           from decision_requests d join projects p on p.id = d.project_id
          where d.state = 'open' and p.owner_id = $1`,
        [args.userId],
      )
    ).rows[0] as { n: number };
    return { count: gates.n + decisions.n };
  });
}

/** Affected-rows count across the drivers: pg reports `rowCount`, pglite `affectedRows`; a RETURNING
 *  query's rows.length is the last resort. */
function affected(res: unknown): number {
  const r = res as { rowCount?: number; affectedRows?: number; rows?: unknown[] };
  return r.rowCount ?? r.affectedRows ?? r.rows?.length ?? 0;
}

/** Mark ONE event/voice row read (blocked rows close by deciding — they aren't "read"). */
export async function markInboxItemRead(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string; itemId: string },
): Promise<boolean> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      `update inbox_items set read_at = $3 where id = $1 and user_id = $2 and read_at is null`,
      [args.itemId, args.userId, deps.clock.now()],
    );
    return affected(res) > 0;
  });
}

/** Mark the run-collapsed row read — the §4.2 deep-link landing's read receipt (REQ-IDE-48). */
export async function markInboxRunRead(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string; runId: string },
): Promise<number> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      `update inbox_items set read_at = $3 where user_id = $1 and run_id = $2 and read_at is null`,
      [args.userId, args.runId, deps.clock.now()],
    );
    return affected(res);
  });
}

/** Mark every visible event row read (blocked rows are untouched — they close by deciding). */
export async function markInboxRead(
  deps: InboxDeps,
  args: { userId: string; workspaceId: string },
): Promise<number> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      `update inbox_items set read_at = $2 where user_id = $1 and read_at is null and visible_at <= $2`,
      [args.userId, deps.clock.now()],
    );
    return affected(res);
  });
}

// ---- the assembly -------------------------------------------------------------------------------

type SortableRow = (InboxBlockedRow | InboxEventRow | InboxVoiceRow) & { view: InboxListItem };

async function loadRows(tx: SqlClient, userId: string, now: Date): Promise<SortableRow[]> {
  const out: SortableRow[] = [];

  // group 1a — open gates on the user's runs (unresolved, unheld, the run is still parked on them).
  const gates = (
    await tx.query(
      `select g.id as gate_id, g.kind, g.run_id, r.workflow,
              g.deadline_at, g.presence_deadline_at, g.opened_at,
              r.project_id, p.slug as project_slug, p.title as project_title
         from gates g
         join runs r on r.id = g.run_id
         join projects p on p.id = r.project_id
        where g.resolved_at is null and g.held = false and r.state = 'waiting_gate'
          and p.owner_id = $1`,
      [userId],
    )
  ).rows as BlockedGateRow[];
  for (const g of gates) {
    const deadline = g.presence_deadline_at ?? g.deadline_at;
    const href = g.project_slug
      ? `/p/${g.project_slug}/review/${g.run_id}?gate=${g.gate_id}`
      : "/app/inbox";
    out.push({
      kind: "gate",
      id: g.gate_id,
      deadlineAt: deadline ? deadline.toISOString() : null,
      openedAt: g.opened_at.toISOString(),
      view: {
        id: `gate:${g.gate_id}`,
        kind: "blocked",
        type: "gate",
        title: `${g.kind.replace(/_/g, " ")} needs your call`,
        ...(g.project_title ? { body: g.project_title } : {}),
        href,
        projectId: g.project_id,
        projectTitle: g.project_title,
        runId: g.run_id,
        unread: true,
        createdAt: g.opened_at.toISOString(),
        gate: {
          gateId: g.gate_id,
          runId: g.run_id,
          kind: g.kind,
          workflow: g.workflow,
          deadlineAt: deadline ? deadline.toISOString() : null,
        },
      },
    });
  }

  // group 1b — open decision_requests on the user's projects (REQ-OBJ-6: escalations, horizon-expired
  // deferrals, stall escalations all land here — the same table the triage routes resolve).
  const decisions = (
    await tx.query(
      `select d.id, d.text, d.options, d.obligation_id, d.source_run_id,
              d.project_id, p.slug as project_slug, p.title as project_title
         from decision_requests d join projects p on p.id = d.project_id
        where d.state = 'open' and p.owner_id = $1`,
      [userId],
    )
  ).rows as BlockedDecisionRow[];
  for (const d of decisions) {
    const href = d.project_slug ? `/p/${d.project_slug}#decisions` : "/app/inbox";
    out.push({
      kind: "decision",
      id: d.id,
      deadlineAt: null,
      openedAt: now.toISOString(), // the table carries no opened_at — the deadline-less tie-break only
      view: {
        id: `decision:${d.id}`,
        kind: "blocked",
        type: "decision",
        title: d.obligation_id ? "An obligation needs a decision" : "A decision is waiting",
        body: d.text.slice(0, 300),
        href,
        projectId: d.project_id,
        projectTitle: d.project_title,
        unread: true,
        createdAt: now.toISOString(),
        decision: {
          decisionId: d.id,
          text: d.text,
          options: d.options ?? [],
          obligationId: d.obligation_id,
        },
      },
    });
  }

  // group 2 — the user's event rows (quiet-hours-deferred rows stay invisible until visible_at).
  const items = (
    await tx.query(
      `select i.id, i.project_id, i.payload, i.read_at, i.created_at, i.run_id,
              p.slug as project_slug, p.title as project_title
         from inbox_items i left join projects p on p.id = i.project_id
        where i.user_id = $1 and i.visible_at <= $2
        order by i.created_at desc limit 200`,
      [userId, now],
    )
  ).rows as (InboxItemDb & { project_slug: string | null; project_title: string | null })[];
  for (const it of items) {
    const p = (typeof it.payload === "string" ? JSON.parse(it.payload) : it.payload) as {
      type?: string;
      title?: string;
      body?: string;
      href?: string;
    };
    out.push({
      kind: "event",
      id: it.id,
      unread: it.read_at == null,
      createdAt: it.created_at.toISOString(),
      view: {
        id: it.id,
        kind: "event",
        type: p.type ?? "event",
        title: p.title ?? "Notification",
        ...(p.body != null ? { body: p.body } : {}),
        href: p.href ?? "/app/inbox",
        projectId: it.project_id,
        projectTitle: it.project_title,
        runId: it.run_id,
        unread: it.read_at == null,
        createdAt: it.created_at.toISOString(),
      },
    });
  }

  // group 3 — stale voices (read-time derivation; §9.3's attention states only).
  const personas = (
    await tx.query(
      `select id from personas where deleted_at is null
         and workspace_id in (select workspace_id from workspace_members where user_id = $1)
        order by id`,
      [userId],
    )
  ).rows as { id: string }[];
  for (const p of personas) {
    const bundle = await loadVoiceStatus(tx, { personaId: p.id, now });
    if (!bundle || !STALE_VOICE_STATES.has(bundle.status.state)) continue;
    const persona = bundle.persona;
    const name = persona.display_name ?? persona.slug ?? "Voice";
    out.push({
      kind: "voice",
      id: p.id,
      state: bundle.status.state,
      name,
      view: {
        id: `voice:${p.id}`,
        kind: "voice",
        type: "voice_stale",
        title: `Voice needs attention: ${name.slice(0, 80)}`,
        body: bundle.status.pill.label,
        href: persona.slug ? `/v/${persona.slug}` : "/voices",
        unread: false,
        createdAt: now.toISOString(),
      },
    });
  }

  return out;
}
