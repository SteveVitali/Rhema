import {
  DEFAULT_THREAD_NAME,
  type AgentTypeConfig,
  ASSISTANT_AGENT_TYPE,
} from "@rhema/contracts";

// Threads (§7.1; REQ-CHAT-1…5). A project-scoped Assistant thread is a `threads` row plus a trio of
// files under the assistant namespace: `agents/assistant/threads/<id>/{session/,brief.md,pins.json}`.
// The transcript lives in the session store (the `session/` prefix); `brief.md` is the ≤600-word
// compaction brief; `pins.json` is the ≤12-pin set. Deleting a thread removes transcript + brief +
// pins but NEVER the project-level source notes under `agents/assistant/research/` (REQ-CHAT-4) —
// those are project-scoped, so the delete spec below lists exactly the keys to purge and no more.

/** The §7.1 per-thread path set under `agents/assistant/threads/<id>/`. */
export function threadPaths(threadId: string): {
  dir: string;
  sessionDir: string;
  brief: string;
  pins: string;
} {
  const dir = `agents/assistant/threads/${threadId}`;
  return {
    dir,
    sessionDir: `${dir}/session/`,
    brief: `${dir}/brief.md`,
    pins: `${dir}/pins.json`,
  };
}

/** The project-level research namespace a thread delete must never touch (REQ-CHAT-4). */
export const RESEARCH_ROOT = "agents/assistant/research/";

/** A threads-table row (mirrors `threads` in @rhema/db's schema — 0002 + 0033). */
export interface ThreadRow {
  id: string;
  projectId: string;
  name: string | null;
  sessionStoreKey: string | null;
  briefKey: string | null;
  pinsKey: string | null;
  isDefault: boolean;
  createdBy: string | null;
  archivedAt: string | Date | null;
  createdAt?: string | Date | null;
}

/** The minimal DB seam (matches @rhema/db's TenantClient / PGlite `.query`). */
export interface SqlLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

function rowToThread(r: Record<string, unknown>): ThreadRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    name: (r.name as string | null) ?? null,
    sessionStoreKey: (r.session_store_key as string | null) ?? null,
    briefKey: (r.brief_key as string | null) ?? null,
    pinsKey: (r.pins_key as string | null) ?? null,
    isDefault: r.is_default === true,
    createdBy: (r.created_by as string | null) ?? null,
    archivedAt: (r.archived_at as string | Date | null) ?? null,
    createdAt: (r.created_at as string | Date | null) ?? null,
  };
}

const COLS =
  "id, project_id, name, session_store_key, brief_key, pins_key, is_default, created_by, archived_at, created_at";

/** The ids minted for a thread row + its file keys, derived from the §7.1 paths. */
export function threadInsert(args: { id: string; projectId: string; name: string; isDefault?: boolean; createdBy?: string }): {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  sessionStoreKey: string;
  briefKey: string;
  pinsKey: string;
  createdBy: string | null;
} {
  const paths = threadPaths(args.id);
  return {
    id: args.id,
    projectId: args.projectId,
    name: args.name,
    isDefault: args.isDefault === true,
    sessionStoreKey: paths.sessionDir,
    briefKey: paths.brief,
    pinsKey: paths.pins,
    createdBy: args.createdBy ?? null,
  };
}

/**
 * Ensure the project's undeletable default thread exists (REQ-CHAT-1/2): "Project chat", created with
 * the project, `is_default` true. Idempotent — a project that already has a default returns it.
 */
export async function ensureDefaultThread(
  db: SqlLike,
  args: { projectId: string; createdBy?: string },
  newId: () => string,
): Promise<ThreadRow> {
  const existing = (
    await db.query(
      `select ${COLS} from threads where project_id = $1 and is_default = true and archived_at is null`,
      [args.projectId],
    )
  ).rows[0] as Record<string, unknown> | undefined;
  if (existing) return rowToThread(existing);
  const row = threadInsert({
    id: newId(),
    projectId: args.projectId,
    name: DEFAULT_THREAD_NAME,
    isDefault: true,
    ...(args.createdBy ? { createdBy: args.createdBy } : {}),
  });
  await db.query(
    `insert into threads (id, project_id, name, session_store_key, brief_key, pins_key, is_default, created_by)
     values ($1,$2,$3,$4,$5,$6,true,$7)
     on conflict (id) do nothing`,
    [row.id, row.projectId, row.name, row.sessionStoreKey, row.briefKey, row.pinsKey, row.createdBy],
  );
  return rowToThread({
    id: row.id,
    project_id: row.projectId,
    name: row.name,
    session_store_key: row.sessionStoreKey,
    brief_key: row.briefKey,
    pins_key: row.pinsKey,
    is_default: true,
    created_by: row.createdBy,
    archived_at: null,
    created_at: null,
  });
}

/** Create a named (non-default) thread. */
export async function createThread(
  db: SqlLike,
  args: { projectId: string; name: string; createdBy?: string },
  newId: () => string,
): Promise<ThreadRow> {
  const row = threadInsert({
    id: newId(),
    projectId: args.projectId,
    name: args.name.trim() || "Thread",
    ...(args.createdBy ? { createdBy: args.createdBy } : {}),
  });
  await db.query(
    `insert into threads (id, project_id, name, session_store_key, brief_key, pins_key, is_default, created_by)
     values ($1,$2,$3,$4,$5,$6,false,$7)`,
    [row.id, row.projectId, row.name, row.sessionStoreKey, row.briefKey, row.pinsKey, row.createdBy],
  );
  return rowToThread({
    id: row.id,
    project_id: row.projectId,
    name: row.name,
    session_store_key: row.sessionStoreKey,
    brief_key: row.briefKey,
    pins_key: row.pinsKey,
    is_default: false,
    created_by: row.createdBy,
    archived_at: null,
    created_at: null,
  });
}

/** A project's threads, undeleted-first then archived, newest first (the Desk's list order). */
export async function listThreads(db: SqlLike, projectId: string): Promise<ThreadRow[]> {
  const rows = (
    await db.query(
      `select ${COLS} from threads where project_id = $1
       order by archived_at is not null, created_at desc`,
      [projectId],
    )
  ).rows as Record<string, unknown>[];
  return rows.map(rowToThread);
}

export type ThreadMutation = { ok: true } | { ok: false; error: "not_found" | "undeletable" };

/** Rename a thread (REQ-CHAT-3). The default thread may be renamed — only its DELETE is refused. */
export async function renameThread(db: SqlLike, threadId: string, name: string): Promise<ThreadMutation> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "not_found" };
  const row = (
    await db.query(`select id from threads where id = $1 and archived_at is null`, [threadId])
  ).rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "not_found" };
  await db.query(`update threads set name = $2 where id = $1`, [threadId, trimmed]);
  return { ok: true };
}

/** Archive (hide) a thread — reversible, no file purge (REQ-CHAT-3). */
export async function archiveThread(db: SqlLike, threadId: string): Promise<ThreadMutation> {
  const row = (
    await db.query(`select id from threads where id = $1 and archived_at is null`, [threadId])
  ).rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "not_found" };
  await db.query(`update threads set archived_at = now() where id = $1`, [threadId]);
  return { ok: true };
}

/**
 * Delete a thread (REQ-CHAT-4): the DEFAULT thread refuses (undeletable — §7.1). On success the row
 * is gone and the caller purges exactly `purgedKeys` (the thread's session/, brief.md, pins.json) —
 * the project-level `agents/assistant/research/` source notes are deliberately NOT in the list.
 */
export async function deleteThread(
  db: SqlLike,
  threadId: string,
): Promise<{ ok: true; purgedKeys: string[] } | { ok: false; error: "not_found" | "undeletable" }> {
  const row = (
    await db.query(`select ${COLS} from threads where id = $1`, [threadId])
  ).rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "not_found" };
  if (row.is_default === true) return { ok: false, error: "undeletable" };
  await db.query(`delete from threads where id = $1`, [threadId]);
  const paths = threadPaths(threadId);
  // transcript + brief + pins only — research notes are project-scoped and survive (REQ-CHAT-4).
  return { ok: true, purgedKeys: [paths.sessionDir, paths.brief, paths.pins] };
}

/** The seat config the thread layer answers to (one place for the §7.1 numbers). */
export const ASSISTANT_CONFIG: AgentTypeConfig = ASSISTANT_AGENT_TYPE;
