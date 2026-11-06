// Chat routes (P1.11; §7.1/§7.4/§7.6) — the Assistant seat's HTTP surface. Thin Hono adapters over
// @rhema/assistant (the domain) + the orchestrator's run seams. A chat turn IS a `chat_turn` run —
// created through the same `createRun` path the sheet uses (one provenance, one cost meter, feed
// events) — with the §7.1 per-turn budgets as the run's cap and the plan card emitted as the run's
// first user-visible event (`chat.plan_card`). Nothing here parses model text: every number the
// strips show comes from metered rows (usage_records / runs.spent_credits) or run events.

import { Hono } from "hono";
import { sha256Hex, type ContentStore } from "@rhema/mirror";
import {
  MODEL_TIERS,
  CURRENT_RATE_TABLE_VERSION,
  ASSISTANT_TURN_BUDGET,
  PINS_MAX_PER_THREAD,
  parseQuarantineKey,
  type ModelTier,
  type AnalyticsEventName,
} from "@rhema/contracts";
import {
  ensureDefaultThread,
  createThread,
  renameThread,
  archiveThread,
  deleteThread,
  listThreads,
  threadPaths,
  effectiveBudget,
  planCard,
  costStrip,
  activityStrip,
  runSheetResult,
  parsePins,
  serializePins,
  addPin,
  removePin,
  pinsFootprint,
  remembersView,
  correctionGuidance,
  attachmentNote,
  upsertIndexEntry,
  sourceCards,
  parseIndex,
  serializeIndex,
  shapeSuggestion,
  emptyProjectState,
  pasteNotesWrite,
  ATTACHABLE_MEDIA,
  type ThreadRow,
  type ResearchIndex,
  type TurnUsage,
} from "@rhema/assistant";
import {
  createRun,
  cancelRun,
  phaseClassesForWorkflow,
  seatForWorkflow,
  captureGuidance,
  RUN_JOBS,
  isTerminal,
} from "@rhema/orchestrator";
import type { OrchestratorDeps, SqlClient, RunState } from "@rhema/orchestrator";
import { estimatorSpec, estimateCredits } from "@rhema/protocols";
import { recordAnalyticsEvent } from "@rhema/ledger";
import { resolveRunCogsLevers } from "./cogs-levers.js";
import type { Principal } from "./run-routes.js";
import { showcaseReadOnlyGuard } from "./showcase.js";
import type { Converter } from "./import.js";

/** The chat surface's deps: the orchestrator bundle (run creation, cancel, events, queue) + the
 *  session principal + the content store the assistant-namespace files live in + the convert seam
 *  for attachments. `db` is the tenant-scoped client the route layer shares with the other surfaces. */
export interface ChatApiDeps extends OrchestratorDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** tenant-scoped reads/writes outside txRunner (the other route files' `db`). */
  readonly db: SqlClient;
  /** the project-tree blob store (assistant session/pins/brief/source-note bytes) — `contentStore` in
   *  ApiDeps terms. */
  readonly contentStore?: ContentStore;
  /** the convert service seam (quarantine key → canonical markdown; PRB.02) — `importConverter` in
   *  ApiDeps terms. */
  readonly converter?: Converter;
}

const MESSAGE_MAX_CHARS = 16_000;

// -----------------------------------------------------------------------------------------------
// file + sql helpers

/** Read a project-tree file's head bytes (utf8) — null when absent or no store is bound. */
async function readTextFile(
  deps: ChatApiDeps,
  projectId: string,
  path: string,
): Promise<string | null> {
  if (!deps.contentStore) return null;
  const row = (
    await deps.db.query(
      `select av.content_sha256 from artifacts a
         join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, path],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await deps.contentStore.get(row.content_sha256);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

/**
 * Write a chat-namespace file (session transcript entry, pins.json, brief, source note, notes.md) as
 * a content-addressed artifact + a new head version. Existing artifact ⇒ a new version (the head
 * pointer moves; chat files are mutable — `immutable:false`). Never writes outside the caller's
 * namespace — the conduit rule is the package-level contract test; this is just the io.
 */
async function writeTextFile(
  deps: ChatApiDeps,
  args: {
    workspaceId: string;
    projectId: string;
    path: string;
    kind: string;
    namespace: "agent:assistant" | "agent:author" | "shared";
    markdown: string;
    actor: { kind: "user"; userId: string } | { kind: "run"; runId: string };
  },
): Promise<{ path: string; words: number }> {
  if (!deps.contentStore) throw new Error("chat store not bound");
  const bytes = new TextEncoder().encode(args.markdown);
  const sha = sha256Hex(bytes);
  await deps.contentStore.put(args.workspaceId, sha, bytes);
  const words = args.markdown.trim().split(/\s+/).filter(Boolean).length;
  const actorJson = JSON.stringify(args.actor);
  const existing = (
    await deps.db.query(
      `select id, head_version_id from artifacts where project_id = $1 and mirror_path = $2`,
      [args.projectId, args.path],
    )
  ).rows[0] as { id: string } | undefined;
  if (!existing) {
    const artifactId = deps.ids("art");
    const versionId = deps.ids("arv");
    await deps.db.query(
      `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
         values ($1,$2,$3,$4,$5,$6)`,
      [artifactId, args.workspaceId, args.projectId, args.kind, args.namespace, args.path],
    );
    await deps.db.query(
      `insert into artifact_versions
         (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
         values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,false)`,
      [versionId, artifactId, sha, `chat/${sha}`, bytes.byteLength, words, actorJson],
    );
    await deps.db.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
    return { path: args.path, words };
  }
  const versionId = deps.ids("arv");
  const next = (
    await deps.db.query(
      `select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1`,
      [existing.id],
    )
  ).rows[0] as { n: number };
  await deps.db.query(
    `insert into artifact_versions
       (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
       values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8::jsonb,false)`,
    [versionId, existing.id, next.n, sha, `chat/${sha}`, bytes.byteLength, words, actorJson],
  );
  await deps.db.query(`update artifacts set head_version_id = $2 where id = $1`, [existing.id, versionId]);
  return { path: args.path, words };
}

/** The research index (`agents/assistant/research/index.json`), read-modify-write. */
async function readIndex(deps: ChatApiDeps, projectId: string): Promise<ResearchIndex> {
  return parseIndex(await readTextFile(deps, projectId, "agents/assistant/research/index.json"));
}

async function writeIndex(deps: ChatApiDeps, principal: Principal, projectId: string, index: ResearchIndex) {
  await writeTextFile(deps, {
    workspaceId: principal.workspaceId,
    projectId,
    path: "agents/assistant/research/index.json",
    kind: "research_note",
    namespace: "agent:assistant",
    markdown: serializeIndex(index),
    actor: { kind: "user", userId: principal.userId },
  });
}

/** A thread row scoped to this project (never trust a bare thread id across projects). */
async function loadThread(deps: ChatApiDeps, projectId: string, threadId: string): Promise<ThreadRow | null> {
  const rows = await listThreads(deps.db, projectId);
  return rows.find((t) => t.id === threadId) ?? null;
}

/** A project row (slug + lifecycle gates) for the CALLER'S tenant or null. The explicit
 *  `workspace_id` predicate is the SEC.1 code-level guard — RLS is the backstop, not the check (a
 *  bypass role must still answer 404 for a foreign id). */
async function loadProject(deps: ChatApiDeps, projectId: string, workspaceId: string) {
  return (
    ((await deps.db.query(
      `select id, slug, archived_at, deleted_at from projects where id = $1 and workspace_id = $2`,
      [projectId, workspaceId],
    ))
      .rows[0] as
      | { id: string; slug: string; archived_at: string | Date | null; deleted_at: string | Date | null }
      | undefined) ?? null
  );
}

/** Emit a server-owned chat analytics event (REQ-CHAT-30's instrumentation half). Telemetry never
 *  breaks the request — a write failure is swallowed. */
async function emitChat(
  deps: ChatApiDeps,
  principal: Principal,
  event: AnalyticsEventName,
  props: Record<string, unknown> = {},
  ids: { projectId?: string; runId?: string; dedupeKey?: string } = {},
): Promise<void> {
  try {
    await deps.txRunner.run(principal.workspaceId, (tx) =>
      recordAnalyticsEvent(tx, { ids: deps.ids, clock: deps.clock }, {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        ...(ids.projectId ? { projectId: ids.projectId } : {}),
        ...(ids.runId ? { runId: ids.runId } : {}),
        event,
        props,
        ...(ids.dedupeKey ? { dedupeKey: ids.dedupeKey } : {}),
      }),
    );
  } catch {
    /* telemetry is best-effort */
  }
}

/** R7TALK.1a (REQ-TALK-2; RV-21) — a turn's DEBITED credits: net `credit_ledger` debits for the
 *  run (cap-clamped by construction — the ledger never nets a run above its cap). Read under the
 *  request-scoped db like every other chat read; the two-tenant probe covers it. The metered
 *  `spent_credits` is burn, never the charge — this field is the charge. */
async function turnDebited(deps: ChatApiDeps, runIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (runIds.length === 0) return out;
  const rows = (
    await deps.db.query(
      `select run_id,
              sum(case when kind = 'debit' then credits when kind = 'refund' then -credits else 0 end)::int
                as debited
         from credit_ledger where run_id = any($1) group by run_id`,
      [runIds],
    )
  ).rows as { run_id: string; debited: number }[];
  for (const r of rows) out.set(r.run_id, r.debited);
  return out;
}

/** The turn's `turn-result.json` sidecar (reply abstract + refs — REQ-DATA-37 keeps reply TEXT
 *  out of every DTO; `replySummary` ≤600 chars is the distilled fact the bubble renders). */
interface TurnReply {
  readonly replySummary?: string;
  readonly refs?: readonly string[];
}

async function turnReplies(deps: ChatApiDeps, runIds: readonly string[]): Promise<Map<string, TurnReply>> {
  const out = new Map<string, TurnReply>();
  if (runIds.length === 0 || !deps.contentStore) return out;
  const rows = (
    await deps.db.query(
      `select s.run_id, av.content_sha256 from steps s
         join artifact_versions av on av.id = any(s.produced_version_ids)
         join artifacts a on a.id = av.artifact_id
        where s.run_id = any($1) and a.mirror_path like '%turn-result.json'
        order by s.ordinal desc`,
      [runIds],
    )
  ).rows as { run_id: string; content_sha256: string }[];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 40)) {
    if (seen.has(row.run_id)) continue;
    seen.add(row.run_id);
    const bytes = await deps.contentStore.get(row.content_sha256).catch(() => null);
    if (!bytes) continue;
    try {
      const sidecar = JSON.parse(new TextDecoder().decode(bytes)) as {
        replySummary?: unknown;
        refs?: unknown;
      };
      out.set(row.run_id, {
        ...(typeof sidecar.replySummary === "string" ? { replySummary: sidecar.replySummary } : {}),
        ...(Array.isArray(sidecar.refs)
          ? { refs: sidecar.refs.filter((r): r is string => typeof r === "string").slice(0, 12) }
          : {}),
      });
    } catch {
      /* an unparsable sidecar never blocks the read */
    }
  }
  return out;
}

/** The user's own words for one turn — the `<turnId>-user.md` session entry the send wrote
 *  (`> message` blockquote). Strip the quote marker; bound the text a bubble can carry. */
async function turnUserTexts(
  deps: ChatApiDeps,
  projectId: string,
  messagePaths: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!deps.contentStore) return out;
  for (const [runId, path] of [...messagePaths].slice(0, 20)) {
    const row = (
      await deps.db.query(
        `select av.content_sha256 from artifacts a
           join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [projectId, path],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    if (!row) continue;
    const bytes = await deps.contentStore.get(row.content_sha256).catch(() => null);
    if (!bytes) continue;
    const text = new TextDecoder()
      .decode(bytes)
      .split("\n")
      .map((l) => l.replace(/^>\s?/, ""))
      .join("\n")
      .trim()
      .slice(0, 4000);
    if (text !== "") out.set(runId, text);
  }
  return out;
}

/** A turn's metered usage (the strip's truth): usage_records sums — never model text. */
async function turnUsage(deps: ChatApiDeps, runId: string): Promise<TurnUsage & { credits: number }> {
  const row = (
    await deps.db.query(
      `select coalesce(sum(searches),0)::int as searches, coalesce(sum(fetches),0)::int as fetches,
              coalesce(sum(credits),0)::int as credits
         from usage_records where run_id = $1 and source = 'proxy'`, // ECON.1 D-A: meter of record only — the sdk twins measure the same tokens
      [runId],
    )
  ).rows[0] as { searches: number; fetches: number; credits: number } | undefined;
  return { searches: row?.searches ?? 0, fetches: row?.fetches ?? 0, credits: row?.credits ?? 0 };
}

/** The workspace's metered spend total (the strip's "workspace spend" line). */
async function workspaceSpend(deps: ChatApiDeps, workspaceId: string): Promise<number> {
  const row = (
    await deps.db.query(
      // ECON.1 D-A: `source='proxy'` (meter of record — sdk twin rows double-count) and run-scoped
      // rows only (`claim_prepass` COGS has no run_id and is never charged to the workspace).
      `select coalesce(sum(credits),0)::int as c from usage_records
         where workspace_id = $1 and source = 'proxy' and run_id is not null`,
      [workspaceId],
    )
  ).rows[0] as { c: number } | undefined;
  return row?.c ?? 0;
}

/** Validate a client-supplied §12.8d URL policy (`inputs.urlPolicy` — frozen at run creation). */
function parseUrlPolicy(v: unknown): Record<string, unknown> | undefined {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const p = v as Record<string, unknown>;
  const strList = (x: unknown): string[] | undefined =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 64) : undefined;
  const out: Record<string, unknown> = {};
  const blocked = strList(p.blockedDomains);
  const allowed = strList(p.allowedDomains);
  const known = strList(p.knownDomains);
  if (blocked) out.blockedDomains = blocked;
  if (allowed) out.allowedDomains = allowed;
  if (known) out.knownDomains = known;
  if (typeof p.novelDomainCap === "number" && Number.isFinite(p.novelDomainCap))
    out.novelDomainCap = Math.max(0, Math.round(p.novelDomainCap));
  return out;
}

// -----------------------------------------------------------------------------------------------

export function createChatRoutes(deps: ChatApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: threads/turns/pins/remembers on it 409
  // ("Duplicate it first" — Ask stays a verb on the user's own projects).
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  // ---- the Desk Chat read: threads (+ ensured default), the active thread's turns, pins, the
  // source-card list, the §7.6 empty-state model, and the live-run flag (REQ-CHAT-20's read filter).
  app.get("/projects/:id/chat", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);

    const defaultThread = await ensureDefaultThread(deps.db, { projectId, createdBy: principal.userId }, () =>
      deps.ids("thr"),
    );
    const threads = await listThreads(deps.db, projectId);
    const activeThreadId = c.req.query("thread") ?? defaultThread.id;
    const active = threads.find((t) => t.id === activeThreadId) ?? defaultThread;

    // the thread's recent turns (runs where workflow='chat_turn' + this thread id in frozen inputs).
    // R7TALK.1a: `inputs` rides along — the bubble's user text + reply/ref facts resolve off the
    // frozen `messagePath`; `debitedCredits` comes from the ledger (the CHARGE — spent_credits is
    // burn, never rendered as the charge).
    const turns = (
      await deps.db.query(
        `select id, state, created_at, spent_credits, cap_credits, model_tier, inputs from runs
          where project_id = $1 and workflow = 'chat_turn' and inputs->>'threadId' = $2
          order by created_at desc limit 20`,
        [projectId, active.id],
      )
    ).rows as {
      id: string; state: string; created_at: string; spent_credits: number; cap_credits: number;
      model_tier: string; inputs: Record<string, unknown>;
    }[];
    const turnIds = turns.map((t) => t.id);
    const messagePaths = new Map<string, string>();
    for (const t of turns) {
      const p = t.inputs?.["messagePath"];
      if (typeof p === "string" && p !== "") messagePaths.set(t.id, p);
    }
    const [debited, replies, userTexts] = await Promise.all([
      turnDebited(deps, turnIds),
      turnReplies(deps, turnIds),
      turnUserTexts(deps, projectId, messagePaths),
    ]);
    const enrichedTurns = turns.map((t) => {
      const reply = replies.get(t.id);
      const debitedCredits = debited.get(t.id);
      return {
        id: t.id,
        state: t.state,
        created_at: t.created_at,
        spent_credits: t.spent_credits,
        cap_credits: t.cap_credits,
        model_tier: t.model_tier,
        ...(debitedCredits != null ? { debited_credits: debitedCredits } : {}),
        ...(userTexts.has(t.id) ? { user_text: userTexts.get(t.id) } : {}),
        ...(reply?.replySummary != null ? { reply: reply.replySummary } : {}),
        ...(reply?.refs != null && reply.refs.length > 0 ? { refs: reply.refs } : {}),
      };
    });

    // session files (the transcript entries the thread owns)
    const session = (
      await deps.db.query(
        `select a.mirror_path, a.created_at, av.word_count from artifacts a
           left join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path like $2 order by a.created_at`,
        [projectId, `${threadPaths(active.id).sessionDir}%`],
      )
    ).rows as { mirror_path: string; created_at: string; word_count: number | null }[];

    const pinsFile = parsePins(
      await readTextFile(deps, projectId, threadPaths(active.id).pins),
    );
    const index = await readIndex(deps, projectId);
    const hasDraft =
      (((
        await deps.db.query(`select 1 from drafts where project_id = $1 limit 1`, [projectId])
      ).rows[0] as unknown) ?? null) != null;
    const liveRun =
      ((
        await deps.db.query(
          `select id from runs where project_id = $1 and workflow <> 'chat_turn'
             and state not in ('completed','completed_partial','failed','cancelled') limit 1`,
          [projectId],
        )
      ).rows[0] as { id: string } | undefined)?.id ?? null;

    // §7.6 — a project with no draft renders the quiet Page + the four starter chips + one next-step
    // card; the activation instrumentation emits once per project (dedupe-keyed).
    let emptyState = null;
    if (!hasDraft) {
      emptyState = emptyProjectState();
      await emitChat(deps, principal, "chat.empty_state_shown", {}, {
        projectId,
        dedupeKey: `chat-empty:${projectId}`,
      });
    }

    // REQ-CHAT-20 — while a non-chat run is live the assistant sees only committed artifacts; the
    // sources list is committed-only by construction (committed artifact rows), and the flag lets the
    // composer state it.
    return c.json({
      threads: threads.map((t) => ({
        id: t.id,
        name: t.name,
        isDefault: t.isDefault,
        archived: t.archivedAt != null,
      })),
      activeThreadId: active.id,
      turns: enrichedTurns,
      messages: session,
      pins: { pins: pinsFile.pins, footprint: pinsFootprint(pinsFile), cap: PINS_MAX_PER_THREAD },
      sources: sourceCards(index),
      liveRun,
      emptyState,
      budgets: ASSISTANT_TURN_BUDGET,
      defaultTier: "base",
    });
  });

  // ---- thread CRUD (REQ-CHAT-1…5) ----

  app.post("/projects/:id/chat/threads", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    if (project.archived_at != null) return c.json({ error: "project_archived" }, 409);
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "name required" }, 422);
    const t = await createThread(deps.db, { projectId, name, createdBy: principal.userId }, () =>
      deps.ids("thr"),
    );
    return c.json({ thread: { id: t.id, name: t.name, isDefault: false } }, 201);
  });

  app.patch("/projects/:id/chat/threads/:tid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    if (typeof body?.name !== "string" || !body.name.trim())
      return c.json({ error: "name required" }, 422);
    const res = await renameThread(deps.db, threadId, body.name);
    if (!res.ok) return c.json({ error: res.error }, res.error === "not_found" ? 404 : 409);
    return c.json({ ok: true });
  });

  app.post("/projects/:id/chat/threads/:tid/archive", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const res = await archiveThread(deps.db, threadId);
    if (!res.ok) return c.json({ error: res.error }, 404);
    return c.json({ ok: true });
  });

  app.delete("/projects/:id/chat/threads/:tid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const res = await deleteThread(deps.db, threadId);
    if (!res.ok) return c.json({ error: res.error }, res.error === "undeletable" ? 409 : 404);
    // purge the thread's own files (transcript + brief + pins) — REQ-CHAT-4 keeps the project-level
    // `agents/assistant/research/` source notes by omission (the purge list never names them).
    const prefixes = res.purgedKeys;
    await deps.db.query(
      `delete from artifact_versions where artifact_id in
         (select id from artifacts where project_id = $1 and
            (mirror_path like $2 or mirror_path = $3 or mirror_path = $4))`,
      [projectId, `${prefixes[0]}%`, prefixes[1], prefixes[2]],
    );
    await deps.db.query(
      `delete from artifacts where project_id = $1 and
         (mirror_path like $2 or mirror_path = $3 or mirror_path = $4)`,
      [projectId, `${prefixes[0]}%`, prefixes[1], prefixes[2]],
    );
    return c.json({ ok: true, purgedKeys: res.purgedKeys });
  });

  // ---- turns: create a `chat_turn` run (the plan card IS the consent; §6.2/REQ-CHAT-10) ----

  app.post("/projects/:id/chat/threads/:tid/turns", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    if (project.archived_at != null) return c.json({ error: "project_archived" }, 409);
    const thread = await loadThread(deps, projectId, threadId);
    if (!thread || thread.archivedAt != null) return c.json({ error: "not_found" }, 404);
    if (!deps.contentStore) return c.json({ error: "chat_not_wired" }, 503);

    const body = (await c.req.json().catch(() => null)) as {
      message?: unknown;
      budget?: unknown;
      modelTier?: unknown;
      urlPolicy?: unknown;
      idempotencyKey?: unknown;
      /** R5ECON.2 — a per-leg COGS-lever arm (`{testCheapRoute:false}` is REQ-ECON-11's opt-out);
       *  honored only on `is_test` workspaces — sanitized off everywhere else. */
      cogsLevers?: unknown;
    } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return c.json({ error: "message required" }, 422);
    if (message.length > MESSAGE_MAX_CHARS) return c.json({ error: "message_too_long" }, 422);
    const tier: ModelTier =
      typeof body?.modelTier === "string" && (MODEL_TIERS as readonly string[]).includes(body.modelTier)
        ? (body.modelTier as ModelTier)
        : "base";

    // The §7.1 budget: an edited plan may only SHRINK the consented caps (effectiveBudget clamps).
    const requested = (body?.budget ?? {}) as { credits?: unknown; searches?: unknown; fetches?: unknown };
    const budget = effectiveBudget({
      ...(typeof requested.credits === "number" ? { credits: requested.credits } : {}),
      ...(typeof requested.searches === "number" ? { searches: requested.searches } : {}),
      ...(typeof requested.fetches === "number" ? { fetches: requested.fetches } : {}),
    });

    // The user's message lands in the thread's session dir (an assistant-namespace artifact the run
    // mounts readwrite) — the frozen inputs name the PATH, never smuggle prose the run row would hold.
    const turnId = deps.ids("turn");
    const messagePath = `${threadPaths(threadId).sessionDir}${turnId}-user.md`;
    await writeTextFile(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      path: messagePath,
      kind: "chat_session",
      namespace: "agent:assistant",
      markdown: `> ${message}\n`,
      actor: { kind: "user", userId: principal.userId },
    });

    // Estimate sizes the row; the per-turn budget is the run's cap (the proxy enforces it — the
    // estimate can never price a turn above the §7.1 ceiling).
    const est = estimateCredits(estimatorSpec("chat_turn")!, { fetchedTokens: 0 }, { tier, rigor: "standard" });
    const estimate = Math.min(est, budget.credits);
    const inputs: Record<string, unknown> = {
      threadId,
      turnId,
      messagePath,
      budget,
      modelTier: tier,
    };
    const urlPolicy = parseUrlPolicy(body?.urlPolicy);
    if (urlPolicy) inputs.urlPolicy = urlPolicy;
    // R5ECON.2 — the UI-launched-leg path (R4): a chat turn creates a run too, so the SAME
    // lever resolution + freeze applies — `COGS_LEVERS_TEST` defaults the cheap arm on is_test,
    // a posted `cogsLevers` is the per-leg opt-out (stripped off-test).
    const cogsLevers = await resolveRunCogsLevers(deps, principal.workspaceId, body?.cogsLevers);
    inputs.cogsLevers = cogsLevers;

    const res = await createRun(deps, {
      idempotencyKey:
        typeof body?.idempotencyKey === "string" && body.idempotencyKey
          ? body.idempotencyKey
          : `chat-turn:${threadId}:${sha256Hex(message).slice(0, 24)}`,
      workflow: "chat_turn",
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      projectId,
      seat: seatForWorkflow("chat_turn"),
      modelProfile: { tier },
      modelTier: tier,
      rigor: "standard",
      estimateCredits: estimate,
      capCredits: budget.credits,
      rateTableVersion: CURRENT_RATE_TABLE_VERSION,
      phaseClassesUsed: phaseClassesForWorkflow("chat_turn"),
      inputs,
      inputSnapshot: { threadId, turnId, modelTier: tier, cogsLevers },
      sheetLaunched: true, // the plan card is the consent — a sent turn is consented
      lockSetSpec: { projectId },
    });
    if (!res.ok) {
      if (res.reason === "run_in_progress")
        return c.json({ error: res.reason, runId: res.activeRunId }, 409);
      if (res.reason === "insufficient_balance")
        return c.json({ error: res.reason, required: res.required }, 402);
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403);
      return c.json({ error: res.reason }, 422);
    }

    // The plan card is the run's first user-visible event (ids + budgets + tier — never the message).
    if (!res.deduped) {
      await deps.txRunner
        .run(principal.workspaceId, (tx) =>
          deps.eventWriter.append(tx, {
            runId: res.runId,
            type: "chat.plan_card",
            payload: {
              threadId,
              capCredits: budget.credits,
              searches: budget.searches,
              fetches: budget.fetches,
              modelTier: tier,
            },
            at: deps.clock.now(),
          }),
        )
        .catch(() => undefined);
      await emitChat(deps, principal, "chat.plan_card_shown", {}, { projectId, runId: res.runId });
      if (res.state === "queued") {
        await deps.queue
          .send(RUN_JOBS.start, { runId: res.runId, workspaceId: principal.workspaceId }, { singletonKey: res.runId })
          .catch(() => undefined);
      }
    }

    const card = planCard({
      threadId,
      summary: message.slice(0, 140),
      steps: [
        "Read this thread's brief, pins, and your message",
        "Answer under the consented budgets (searches/fetches ride the metered path)",
        "Land any sources as chat source notes — never drafts",
      ],
      modelTier: tier,
      requestedBudget: budget,
      researchSheetHref: runSheetResult({
        projectSlug: project.slug,
        workflow: "research_burst",
        inputs: { threadId, sources: 5 },
      }).href,
    });
    return c.json({ runId: res.runId, state: res.state, deduped: res.deduped, planCard: card }, 201);
  });

  // ---- a turn's status + strips (REQ-CHAT-9/11): metered rows, never model text ----

  app.get("/projects/:id/chat/threads/:tid/turns/:runId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    const runId = c.req.param("runId");
    const run = (
      await deps.db.query(
        `select id, state, spent_credits, cap_credits, model_tier, inputs from runs
          where id = $1 and project_id = $2 and workflow = 'chat_turn'`,
        [runId, projectId],
      )
    ).rows[0] as
      | { id: string; state: string; spent_credits: number; cap_credits: number; model_tier: string; inputs: Record<string, unknown> }
      | undefined;
    if (!run || run.inputs?.threadId !== threadId) return c.json({ error: "not_found" }, 404);

    const usage = await turnUsage(deps, runId);
    const frozen = (run.inputs.budget ?? {}) as { searches?: number; fetches?: number };
    const events = (
      await deps.db.query(
        `select type from run_events where run_id = $1`, [runId],
      ).catch(() => ({ rows: [] as { type: string }[] }))
    ).rows as { type: string }[];
    const activity = activityStrip(events);
    const strip = costStrip(
      {
        spentCredits: run.spent_credits,
        capCredits: run.cap_credits,
        workspaceSpent: await workspaceSpend(deps, principal.workspaceId),
      },
      { searches: usage.searches || activity.searches, fetches: usage.fetches || activity.fetches },
      run.model_tier as ModelTier,
      {
        credits: run.cap_credits,
        searches: typeof frozen.searches === "number" ? frozen.searches : ASSISTANT_TURN_BUDGET.searches,
        fetches: typeof frozen.fetches === "number" ? frozen.fetches : ASSISTANT_TURN_BUDGET.fetches,
      },
    );

    // the turn's structured outcome (the distilled reply facts) when the phase committed a
    // turn-result sidecar — located through the step's produced version ids.
    const sidecar = (
      await deps.db
        .query(
          `select a.mirror_path, av.content_sha256 from steps s
             join artifact_versions av on av.id = any(s.produced_version_ids)
             join artifacts a on a.id = av.artifact_id
            where s.run_id = $1 and a.mirror_path like '%turn-result.json'
            order by s.ordinal desc limit 1`,
          [runId],
        )
        .catch(() => ({ rows: [] as { mirror_path: string; content_sha256: string }[] }))
    ).rows[0] as { mirror_path: string; content_sha256: string } | undefined;

    if (isTerminal(run.state as RunState)) {
      await emitChat(
        deps,
        principal,
        "chat.turn_completed",
        { searches: usage.searches, fetches: usage.fetches },
        { projectId, runId, dedupeKey: `chat-turn:${runId}` },
      );
    }

    // R7TALK.1a (REQ-TALK-2) — the turn's CHARGE: net cap-clamped ledger debits. Kept beside the
    // metered strip so the footnote never presents burn as the charge.
    const debitedCredits = (await turnDebited(deps, [runId])).get(runId) ?? null;
    return c.json({
      runId,
      state: run.state,
      strip,
      activity,
      ...(debitedCredits != null ? { debitedCredits } : {}),
      result: sidecar ? { turnResultSha: sidecar.content_sha256 } : null,
    });
  });

  // ---- the plan card's decisions (REQ-CHAT-10): run_research → the research_burst SHEET (the only
  // run creator), first_step/edit continue the turn, cancel stops it. ----
  app.post("/projects/:id/chat/threads/:tid/plan-decision", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { runId?: unknown; action?: unknown } | null;
    const action = body?.action;
    if (action !== "run_research" && action !== "first_step" && action !== "edit" && action !== "cancel")
      return c.json({ error: "action required" }, 422);
    await emitChat(
      deps,
      principal,
      "chat.plan_card_decided",
      { action: action === "run_research" ? "run" : action },
      { projectId, ...(typeof body?.runId === "string" ? { runId: body.runId } : {}) },
    );
    if (action === "run_research") {
      // Never creates a run (REQ-CHAT-6) — returns the sheet link the user's Run click opens.
      return c.json({
        ok: true,
        action,
        sheet: runSheetResult({
          projectSlug: project.slug,
          workflow: "research_burst",
          inputs: { threadId, ...(typeof body?.runId === "string" ? { fromRunId: body.runId } : {}) },
        }),
      });
    }
    if (action === "cancel" && typeof body?.runId === "string") {
      const res = await cancelRun(deps, { runId: body.runId, workspaceId: principal.workspaceId });
      if (!res.ok) return c.json({ error: res.reason }, 409);
      return c.json({ ok: true, action, state: res.state });
    }
    return c.json({ ok: true, action });
  });

  // ---- pins (REQ-CHAT-13): the ≤12-pin set with its token footprint ----

  app.get("/projects/:id/chat/threads/:tid/pins", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const file = parsePins(await readTextFile(deps, projectId, threadPaths(threadId).pins));
    return c.json({ pins: file.pins, footprint: pinsFootprint(file), cap: PINS_MAX_PER_THREAD });
  });

  app.post("/projects/:id/chat/threads/:tid/pins", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    if (!deps.contentStore) return c.json({ error: "chat_not_wired" }, 503);
    const body = (await c.req.json().catch(() => null)) as {
      summary?: unknown;
      kind?: unknown;
      ref?: unknown;
      dropOldest?: unknown;
    } | null;
    const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
    if (!summary) return c.json({ error: "summary required" }, 422);
    const kind = body?.kind === "ref" || body?.kind === "source" ? body.kind : "fact";
    const file = parsePins(await readTextFile(deps, projectId, threadPaths(threadId).pins));
    const res = addPin(
      file,
      {
        id: deps.ids("pin"),
        kind,
        ...(typeof body?.ref === "string" && body.ref ? { ref: body.ref } : {}),
        summary,
        pinnedAt: deps.clock.now().toISOString(),
      },
      { dropOldest: body?.dropOldest === true },
    );
    if (!res.ok)
      return c.json({ error: res.error, cap: PINS_MAX_PER_THREAD }, res.error === "pins_full" ? 409 : 422);
    await writeTextFile(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      path: threadPaths(threadId).pins,
      kind: "chat_session",
      namespace: "agent:assistant",
      markdown: serializePins(res.file),
      actor: { kind: "user", userId: principal.userId },
    });
    return c.json(
      { ok: true, pins: res.file.pins, footprint: pinsFootprint(res.file), droppedOldest: res.droppedOldest },
      201,
    );
  });

  app.delete("/projects/:id/chat/threads/:tid/pins/:pinId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    if (!deps.contentStore) return c.json({ error: "chat_not_wired" }, 503);
    const file = parsePins(await readTextFile(deps, projectId, threadPaths(threadId).pins));
    const next = removePin(file, c.req.param("pinId"));
    await writeTextFile(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      path: threadPaths(threadId).pins,
      kind: "chat_session",
      namespace: "agent:assistant",
      markdown: serializePins(next),
      actor: { kind: "user", userId: principal.userId },
    });
    return c.json({ ok: true, pins: next.pins, footprint: pinsFootprint(next) });
  });

  // ---- "What the assistant remembers" (§7.1): brief + pins read-only; a correction is a
  // Guidance-class note (source chat_promote) the next turn reads. ----

  app.get("/projects/:id/chat/threads/:tid/remembers", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const brief = await readTextFile(deps, projectId, threadPaths(threadId).brief);
    const pins = parsePins(await readTextFile(deps, projectId, threadPaths(threadId).pins));
    return c.json({ ...remembersView(brief, pins), footprint: pinsFootprint(pins) });
  });

  app.post("/projects/:id/chat/threads/:tid/remembers/corrections", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const threadId = c.req.param("tid");
    if (!(await loadThread(deps, projectId, threadId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "text required" }, 422);
    const g = correctionGuidance({ threadId, text });
    const { guidanceId } = await captureGuidance(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      userId: principal.userId,
      source: g.source,
      text: g.body,
      scope: "project",
      anchors: g.anchors,
    });
    return c.json({ ok: true, guidanceId }, 201);
  });

  // ---- attachments (§7.1; PRB.02 reuse): quarantine → convert → a chat source note under
  // agents/assistant/research/attachments/ — never the author corpus. ----

  app.post("/projects/:id/chat/attachments", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    if (project.archived_at != null) return c.json({ error: "project_archived" }, 409);
    if (!deps.contentStore || !deps.converter) return c.json({ error: "chat_not_wired" }, 503);
    const body = (await c.req.json().catch(() => null)) as {
      quarantineKey?: unknown;
      filename?: unknown;
      mediaType?: unknown;
      threadId?: unknown;
      waitMs?: unknown;
    } | null;
    const key = typeof body?.quarantineKey === "string" ? body.quarantineKey : "";
    const parsed = parseQuarantineKey(key);
    if (!parsed) return c.json({ error: "quarantineKey required" }, 400);
    if (parsed.workspaceId !== principal.workspaceId) return c.json({ error: "forbidden" }, 403);
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const mediaType = typeof body?.mediaType === "string" ? body.mediaType : "";
    // PDF/DOCX/MD/TXT only — images are 1.x (§7.1).
    if (!ATTACHABLE_MEDIA.has(mediaType)) return c.json({ error: "unsupported_media" }, 415);
    const result = await deps.converter.preview(key, {
      waitMs: typeof body?.waitMs === "number" ? body.waitMs : 25_000,
    });
    if (result == null) return c.json({ pending: true, quarantineKey: key }, 202);
    const note = attachmentNote({
      filename,
      mediaType,
      markdown: result.markdown,
      ...(typeof body?.threadId === "string" ? { threadId: body.threadId } : {}),
    });
    if ("ok" in note) return c.json({ error: "unsupported_media" }, 415);
    const n = note;
    await writeTextFile(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      path: n.path,
      kind: "source_note",
      namespace: "agent:assistant",
      markdown: n.markdown,
      actor: { kind: "user", userId: principal.userId },
    });
    const index = upsertIndexEntry(await readIndex(deps, projectId), n.entry);
    await writeIndex(deps, principal, projectId, index);
    return c.json({ ok: true, note: { path: n.path, entry: n.entry } }, 201);
  });

  // ---- Browser → Research → "Chat sources" (read-only, newest first) ----

  app.get("/projects/:id/chat/sources", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await loadProject(deps, projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const index = await readIndex(deps, projectId);
    return c.json({ sources: sourceCards(index) });
  });

  // ---- "Ask about this draft" (§7.4; REQ-CHAT-19 amended): the anchored suggestion is a proposal
  // card with `assistant` provenance; anything over one paragraph refuses with the /lineedit|/revise
  // pointer (named as commands — never implied to run inline). ----

  app.post("/projects/:id/chat/suggestions", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await loadProject(deps, projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      anchor?: unknown;
      replacement?: unknown;
    } | null;
    const anchor = body?.anchor as { ref?: unknown; version?: unknown; block?: unknown } | undefined;
    if (typeof anchor?.ref !== "string" || !anchor.ref.startsWith("@"))
      return c.json({ error: "anchor required" }, 422);
    if (typeof body?.replacement !== "string" || !body.replacement.trim())
      return c.json({ error: "replacement required" }, 422);
    const res = shapeSuggestion({
      replacement: body.replacement,
      anchor: {
        ref: anchor.ref,
        ...(typeof anchor.version === "number" ? { version: anchor.version } : {}),
        ...(typeof anchor.block === "string" ? { block: anchor.block } : {}),
      },
    });
    if (!res.ok) return c.json({ error: "suggestion_too_large", refusal: res.refusal }, 422);
    return c.json(
      {
        ok: true,
        proposal: {
          id: deps.ids("prp"),
          label: `Assistant suggestion on ${anchor.ref}`,
          markdown: res.proposal.replacement,
          kind: "replace",
          anchor: res.proposal.anchor,
          provenance: res.proposal.provenance, // "assistant" — the block-provenance tag (§7.4)
        },
      },
      201,
    );
  });

  // ---- "Paste my notes" (§7.6; REQ-CHAT-29): the scratch path writes agents/author/notes.md through
  // the author seat's normal write path (an artifact row in the author namespace — never a draft). ----

  app.post("/projects/:id/chat/notes", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const project = await loadProject(deps, projectId, principal.workspaceId);
    if (!project || project.deleted_at != null) return c.json({ error: "not_found" }, 404);
    if (project.archived_at != null) return c.json({ error: "project_archived" }, 409);
    if (!deps.contentStore) return c.json({ error: "chat_not_wired" }, 503);
    const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) return c.json({ error: "text required" }, 422);
    const spec = pasteNotesWrite({ text });
    // append into the existing notes file when one exists (a second paste extends, never destroys)
    const existing = await readTextFile(deps, projectId, spec.path);
    const content = existing ? `${existing.trimEnd()}\n\n${spec.content.trimStart()}` : spec.content;
    await writeTextFile(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      path: spec.path,
      kind: spec.kind,
      namespace: spec.namespace,
      markdown: content,
      actor: { kind: "user", userId: principal.userId },
    });
    return c.json({ ok: true, path: spec.path }, 201);
  });

  return app;
}

export type { TurnUsage };
