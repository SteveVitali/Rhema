// The source-editor routes (PRB.07; §5.4/§6.3/§11.6; REQ-BETA-21, REQ-DATA-24/26/41). Thin Hono adapters over
// the landed seams: the document read resolves the draft + its promoted-version bytes + the §6.3 run lock;
// the autosave POST goes through @rhema/mirror's `saveManualRevision` (frozen head → v(N+1) human_revision
// fork, findings projected, `human` provenance, a snapshot restore point, the move trace); the lock banner's
// Cancel goes through `cancelRun`; the one note field becomes a `Guidance` row (REQ-DATA-41's comment path);
// and "Revise using your edits" creates the revise run seeded with (review of vN, base v(N+1)) after
// auto-mooting the findings whose quotes no longer resolve (REQ-DATA-26). Session-authenticated; every
// project-scoped read verifies the workspace — a cross-workspace id is not_found, never a leak.

import { Hono } from "hono";
import { statusMeters, venueCapLabel, importBibliography, detectBibliographyFormat } from "@rhema/editor";
import {
  cancelRun,
  captureGuidance,
  createRun,
  editorLockForRuns,
  seatForWorkflow,
  phaseClassesForWorkflow,
  HOLDING_STATES,
  RUN_JOBS,
  type EditorLock,
} from "@rhema/orchestrator";
import { projectFindingsOntoMarkdown, type FindingProjectionResult } from "@rhema/findings-core";
import { mootObligation, findingObligationState } from "@rhema/obligations";
import { saveManualRevision, sha256Hex, type ContentStore, type SqlExecutor } from "@rhema/mirror";
import type { Actor, Anchor } from "@rhema/contracts";
import { artifactKindSchema, artifactPolicy } from "@rhema/contracts";
import { buildEstimate } from "@rhema/run-sheet";
import type { RunApiDeps } from "./run-routes.js";
import { upsertProjectSearchDoc } from "./search.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

export type EditorApiDeps = RunApiDeps & {
  /** the raw SQL client for project-scoped reads (the shell's `db`; same seam the triage routes take). */
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
};

export interface DraftHeadRow {
  id: string;
  project_id: string;
  n: number;
  origin: string;
  state: string;
  promoted_version_id: string | null;
  base_draft_id: string | null;
}

/** The §6.3 run lock for one draft head: the project's lock-holding runs through `editorLockForRuns`. */
async function editorLock(
  exec: SqlExecutor,
  projectId: string,
  draftId: string,
): Promise<EditorLock | null> {
  const runs = (
    await exec.query(
      `select id, workflow, lock_set from runs where project_id = $1 and state = any($2::text[])`,
      [projectId, HOLDING_STATES as unknown as string[]],
    )
  ).rows as { id: string; workflow: string; lock_set: string[] }[];
  return editorLockForRuns(
    runs.map((r) => ({ id: r.id, workflow: r.workflow, lockSet: r.lock_set ?? [] })),
    { projectId, draftId },
  );
}

/** The draft the editor is bound to: the requested draft, or — when it is a FROZEN base with a WORKING
 *  human_revision child — the child (the user's edits live there; a stale /edit/:frozenId load must see
 *  them). Returns undefined when the draft doesn't exist in the project. Exported for the export routes
 *  (PRB.11) — the export reads the same head the editor shows. */
export async function resolveEditorHead(
  exec: SqlExecutor,
  projectId: string,
  draftId: string,
  opts: { exact?: boolean } = {},
): Promise<DraftHeadRow | undefined> {
  let head = (
    await exec.query(
      `select id, project_id, n, origin, state, promoted_version_id, base_draft_id
         from drafts where id = $1 and project_id = $2`,
      [draftId, projectId],
    )
  ).rows[0] as DraftHeadRow | undefined;
  // P1.02: `?exact=1` reads THIS draft's bytes — /v/:n on a frozen draft shows vN itself (read-only),
  // never its working child.
  if (!opts.exact && head?.state === "frozen") {
    const child = (
      await exec.query(
        `select id, project_id, n, origin, state, promoted_version_id, base_draft_id
           from drafts
          where base_draft_id = $1 and origin = 'human_revision' and state = 'working'
          order by n desc limit 1`,
        [head.id],
      )
    ).rows[0] as DraftHeadRow | undefined;
    if (child) head = child;
  }
  return head;
}

export async function versionText(
  store: ContentStore | null,
  exec: SqlExecutor,
  versionId: string | null,
): Promise<{ text: string; sha256: string } | null> {
  if (!versionId || !store) return null;
  const row = (
    await exec.query("select content_sha256 from artifact_versions where id = $1", [versionId])
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await store.get(row.content_sha256);
  return bytes ? { text: Buffer.from(bytes).toString("utf8"), sha256: row.content_sha256 } : null;
}

interface FindingSourceRow {
  id: string;
  title: string;
  severity: string;
  kind: string;
  suggestion: { replacement: string } | null;
  anchor: Anchor | null;
  reviewed_n: number;
  corr_kind: string;
}

/** The editor's findings rail: the reviewed draft's findings re-projected onto the current text, each
 *  carrying its "from Review of vN" source label (§5.4) and the lost-anchor triage flag. */
export interface EditorFindingDto {
  readonly findingId: string;
  readonly title: string;
  readonly severity: string;
  /** P1.07 — the kind hue (§5.7) + the suggestion the "suggestions inline" toggle previews. */
  readonly kind: string;
  readonly suggestion: { replacement: string } | null;
  /** e.g. "from Review of v2" — the finding is a PROJECTION of the source review, not a re-file. */
  readonly sourceLabel: string;
  readonly anchor: Anchor;
  readonly method: FindingProjectionResult["method"];
  /** true ⇒ the passage changed; the card renders "passage changed — still applies?" under Whole piece. */
  readonly lost: boolean;
}

function findingsDto(rows: FindingSourceRow[], markdown: string): EditorFindingDto[] {
  const projections = projectFindingsOntoMarkdown(
    rows.map((f) => ({ id: f.id, anchor: f.anchor })),
    markdown,
  );
  const byId = new Map(projections.map((p) => [p.findingId, p]));
  return rows.map((f) => {
    const p = byId.get(f.id)!;
    return {
      findingId: f.id,
      title: f.title,
      severity: f.severity,
      kind: f.kind,
      suggestion: f.suggestion ?? null,
      sourceLabel: `from ${f.corr_kind === "review" ? "Review" : f.corr_kind} of v${f.reviewed_n}`,
      anchor: p.anchor,
      method: p.method,
      lost: p.lost,
    };
  });
}

export function createEditorRoutes(deps: EditorApiDeps): Hono {
  const app = new Hono();
  const oblDeps = { ids: deps.ids, clock: deps.clock };

  // P1.17 (§15.4) — the Showcase dossier is read-only: every mutating verb under /projects/:id/*
  // on a showcase project gets 409 showcase_read_only (reads pass through).
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;

  const ownProject = async (c: { req: { param(n: string): string } }, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  // ---- P1.02 — the project's CSL-JSON bibliography (kind='bibliography', mirror_path
  //      'bibliography/csl.json'). Items carry citeKey (the `[@key]` a cite node references) + the raw
  //      CSL-JSON item verbatim. ----
  const BIBLIOGRAPHY_PATH = "bibliography/csl.json";

  const readBibliography = async (
    exec: SqlExecutor,
    store: ContentStore | null,
    projectId: string,
  ): Promise<{ citeKey: string; item: Record<string, unknown> }[]> => {
    if (!store) return [];
    const row = (
      await exec.query(
        `select av.content_sha256
           from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [projectId, BIBLIOGRAPHY_PATH],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    if (!row) return [];
    const bytes = await store.get(row.content_sha256).catch(() => null);
    if (!bytes) return [];
    try {
      const items = JSON.parse(Buffer.from(bytes).toString("utf8")) as { id: string }[];
      return (Array.isArray(items) ? items : []).map((it) => ({
        citeKey: String(it.id),
        item: it as unknown as Record<string, unknown>,
      }));
    } catch {
      return [];
    }
  };

  /** The REQ-PROD-14 venue-cap meter: `projects.venue` → the seeded protocol's venue_bar row → the
   *  "+N over Venue" label. Only the rendered string crosses to the client (REQ-ARCH-33). */
  const venueCapFor = async (exec: SqlExecutor, projectId: string, words: number): Promise<string | null> => {
    const p = (
      await exec.query(`select venue, protocol_id, protocol_version from projects where id = $1`, [projectId])
    ).rows[0] as { venue: string | null; protocol_id: string | null; protocol_version: number } | undefined;
    if (!p?.venue || !p.protocol_id) return null;
    const proto = (
      await exec.query(`select body from protocols where id = $1 and version = $2`, [p.protocol_id, p.protocol_version])
    ).rows[0] as { body: { venue_bar?: { table?: { venue: string; maxWords?: number }[] } } } | undefined;
    const row = (proto?.body?.venue_bar?.table ?? []).find(
      (r) => r.venue.toLowerCase() === p.venue!.toLowerCase(),
    );
    if (!row?.maxWords) return null;
    return venueCapLabel(words, p.venue, row.maxWords);
  };

  // ---- /v/:n + /v/working draft-ref resolution (P1.02 + EDIT.1/ADR-048): 'working' → the
  //      project's EDITABLE head — the working head when one exists, else the highest-n draft
  //      (a frozen reviewed head, a frozen import, a seeded head) served as the lazy-fork
  //      source: the fork itself stays first-write (saveManualRevision), never open-time. A
  //      number → that draft exactly (the frozen base keeps answering as itself). 404 when
  //      absent — for 'working' that means the project has no drafts at all. ----
  app.get("/projects/:id/editor/resolve/:v", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const v = c.req.param("v");
    const row = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (v === "working") {
        return (
          (await tx.query(
            `select id, n, state, origin from drafts where project_id = $1
             order by (state = 'working') desc, n desc limit 1`,
            [c.req.param("id")],
          )).rows[0] as { id: string; n: number; state: string; origin: string } | undefined
        );
      }
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return undefined;
      return (
        (await tx.query(
          `select id, n, state, origin from drafts where project_id = $1 and n = $2`,
          [c.req.param("id"), n],
        )).rows[0] as { id: string; n: number; state: string; origin: string } | undefined
      );
    });
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ draftId: row.id, draftN: row.n, state: row.state, origin: row.origin });
  });

  // ---- the document + lock + findings rail the editor SSRs/refresh-loads. ----
  app.get("/projects/:id/editor/:draftId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    const exact = c.req.query("exact") === "1";

    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const head = await resolveEditorHead(tx, c.req.param("id"), c.req.param("draftId"), { exact });
      if (!head) return { ok: false as const, reason: "not_found" };

      const versionId =
        head.promoted_version_id ??
        (head.base_draft_id
          ? ((
              await tx.query("select promoted_version_id from drafts where id = $1", [head.base_draft_id])
            ).rows[0] as { promoted_version_id: string | null } | undefined)?.promoted_version_id ?? null
          : null);
      const text = await versionText(store, tx, versionId);
      const markdown = text?.text ?? "";

      const lock = await editorLock(tx, head.project_id, head.id);
      const baseRow = head.base_draft_id
        ? ((await tx.query("select n from drafts where id = $1", [head.base_draft_id])).rows[0] as
            | { n: number }
            | undefined)
        : undefined;

      // Findings were filed on the draft the review READ: the working human_revision child's frozen base,
      // or the head itself (a frozen vN's review targeted vN — not its own base).
      const findingDraftId =
        head.state === "working" && head.origin === "human_revision" && head.base_draft_id
          ? head.base_draft_id
          : head.id;
      const findingRows = (
        await tx.query(
          `select f.id, f.title, f.severity, f.kind, f.suggestion, f.anchor, d.n as reviewed_n, ci.kind as corr_kind
             from findings f
             join drafts d on d.id = f.draft_id
             join correspondence_items ci on ci.id = f.correspondence_id
            where f.draft_id = $1
            order by f.ordinal`,
          [findingDraftId],
        )
      ).rows as FindingSourceRow[];

      // ---- P1.02 sidecar reads (all best-effort — an old row without them yields nulls) ----
      const [provRow, mapRow, bibliography] = await Promise.all([
        versionId
          ? tx.query(`select spans from provenance_maps where draft_version_id = $1`, [versionId])
          : Promise.resolve({ rows: [] }),
        versionId
          ? tx.query(`select block_id_map from artifact_versions where id = $1`, [versionId])
          : Promise.resolve({ rows: [] }),
        readBibliography(tx, store, c.req.param("id")),
      ]);
      const spans = (provRow.rows[0] as { spans?: { blockId: string; source: unknown }[] } | undefined)?.spans;
      const provenance: Record<string, unknown> = {};
      if (Array.isArray(spans)) for (const s of spans) if (s?.blockId) provenance[s.blockId] = s.source;
      const blockIdMap = (mapRow.rows[0] as { block_id_map?: unknown } | undefined)?.block_id_map ?? null;
      const meters = statusMeters(markdown);
      const venueCap = await venueCapFor(tx, c.req.param("id"), meters.words);

      return {
        ok: true as const,
        dto: {
          draftId: head.id,
          draftN: head.n,
          origin: head.origin,
          state: head.state,
          baseDraftId: head.base_draft_id,
          baseDraftN: baseRow?.n ?? null,
          markdown,
          sha256: text?.sha256 ?? null,
          lock,
          findings: findingsDto(findingRows, markdown),
          provenance: Object.keys(provenance).length > 0 ? provenance : null,
          blockIdMap,
          bibliography,
          venueCap,
          meters,
          proposals: [],
        },
      };
    });
    if (!res.ok) return c.json({ error: res.reason }, 404);
    return c.json(res.dto);
  });

  // ---- the debounced autosave (no Save button — this IS the save; §5.4). A held run lock → 409. ----
  app.post("/projects/:id/editor/:draftId/save", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      markdown?: string;
      // P1.02 — the Page's live provenance capture (block map + write-only agent-span sets).
      provenanceSpans?: { blockId: string; source: unknown }[];
      agentSpans?: { blockId: string; from: number; to: number }[];
    };
    if (typeof body.markdown !== "string") return c.json({ error: "markdown required" }, 400);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);

    // STB.2 / D-P1.22-1 — the server-side half of the §13.5 autosave round-trip: time the save
    // transaction and sample it into `slo_samples` (0042; `autosave_save_ms` feeds the
    // `autosave_roundtrip_p95_ms` probe — the client leg of the round-trip stays unmeasured).
    const saveStartedAt = deps.clock.now().getTime();
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // Lock is checked against the RESOLVED head: a stale save to a frozen base routes to its working
      // human_revision child, so a draft:read lock on the base alone must not block it (the run reads
      // the immutable base version either way); the child's own locks + project writer locks apply.
      const head = await resolveEditorHead(tx, c.req.param("id"), c.req.param("draftId"));
      if (!head) return { ok: false as const, reason: "not_found" as const };
      const lock = await editorLock(tx, head.project_id, head.id);
      if (lock) return { ok: false as const, reason: "locked" as const, lock };
      const r = await saveManualRevision(tx, { store, ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter }, {
        workspaceId: principal.workspaceId,
        projectId: c.req.param("id"),
        draftId: c.req.param("draftId"),
        markdown: body.markdown!,
        userId: principal.userId,
        ...(body.provenanceSpans || body.agentSpans
          ? {
              provenance: {
                spans: body.provenanceSpans as never,
                agentSpans: body.agentSpans,
              },
            }
          : {}),
      });
      return r;
    });
    // Fire-and-forget: telemetry never fails or slows a save; a pre-0042 deploy just drops the row.
    void deps.db
      .query(`insert into slo_samples (signal, value_ms, workspace_id) values ('autosave_save_ms', $1, $2)`, [
        deps.clock.now().getTime() - saveStartedAt,
        principal.workspaceId,
      ])
      .catch(() => undefined);
    if (!res.ok) {
      if (res.reason === "locked") return c.json({ error: "locked", lock: res.lock }, 409);
      return c.json(
        { error: res.reason },
        res.reason === "draft_not_found" || res.reason === "not_found" ? 404 : 409,
      );
    }
    // P1.04 — keep the search index current on the save path (the materialized markdown the body match
    // reads). Non-fatal by contract: an index write never fails a save.
    if (res.changed) {
      await upsertProjectSearchDoc(deps.db, {
        projectId: c.req.param("id"),
        workspaceId: principal.workspaceId,
        kind: "draft",
        refId: res.draftId,
        body: body.markdown,
        id: deps.ids,
      }).catch(() => undefined);
    }
    return c.json({
      draftId: res.draftId,
      draftN: res.draftN,
      versionId: res.versionId,
      sha256: res.sha256,
      forked: res.forked,
      changed: res.changed,
      restorePointId: res.restorePointId,
      sync: "synced",
    });
  });

  // ---- the one note field (§6.3's comment path → Guidance; REQ-DATA-41 beta form). Project-scope,
  //      narrowed to `revise` — the next Revise's phase-boundary consume picks it up verbatim. ----
  app.post("/projects/:id/editor/:draftId/note", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    if (!body.text || !body.text.trim()) return c.json({ error: "text required" }, 400);
    const g = await captureGuidance(deps, {
      workspaceId: principal.workspaceId,
      projectId: c.req.param("id"),
      userId: principal.userId,
      source: "inline_comment",
      text: body.text.trim(),
      scope: "project",
      workflows: ["revise"],
    });
    return c.json({ guidanceId: g.guidanceId }, 201);
  });

  // ---- "Cancel run to edit" (§6.3): the banner's release — the run-level cancel (REQ-DATA-41). ----
  app.post("/projects/:id/editor/:draftId/cancel-run", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const lock = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const head = await resolveEditorHead(tx, c.req.param("id"), c.req.param("draftId"));
      if (!head) return null;
      return editorLock(tx, head.project_id, head.id);
    });
    if (!lock) return c.json({ error: "not_locked" }, 409);
    const r = await cancelRun(deps, { runId: lock.runId, workspaceId: principal.workspaceId });
    if (!r.ok) return c.json({ error: r.reason, state: r.state ?? null }, 409);
    return c.json({ ok: true, state: r.state, alreadyTerminal: r.alreadyTerminal });
  });

  // ---- "Revise using your edits" (REQ-DATA-26; §6.3): seed the revise run with
  //      (review = the vN review, base = the v(N+1) human_revision head); the human's edits are the made
  //      moves; findings whose quotes no longer resolve are auto-mooted pending the run's triage. ----
  app.post("/projects/:id/editor/:draftId/revise", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const draftId = c.req.param("draftId");
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);

    // 1. The working human_revision head + the review correspondence on its frozen base.
    const prep = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      let head = (
        await tx.query(
          `select id, project_id, n, origin, state, promoted_version_id, base_draft_id
             from drafts where id = $1 and project_id = $2 for update`,
          [draftId, projectId],
        )
      ).rows[0] as DraftHeadRow | undefined;
      // A stale form action still targets the FROZEN base — follow it to the human_revision child
      // (same resolution the GET/save routes use). P1.06: promote-on-launch may have already frozen
      // that child with the run that read it — a re-POST then resolves the frozen child so the
      // `revise-edits:` memo dedupes in createRun (a second run is never created) instead of 409ing.
      if (head?.state === "frozen") {
        head = (
          (
            await tx.query(
              `select id, project_id, n, origin, state, promoted_version_id, base_draft_id
                 from drafts
                where base_draft_id = $1 and origin = 'human_revision' and state in ('working','frozen')
                order by (state = 'working') desc, n desc limit 1 for update`,
              [head.id],
            )
          ).rows[0] as DraftHeadRow | undefined
        ) ?? head;
      }
      if (!head || head.origin !== "human_revision" || !head.base_draft_id) {
        return { ok: false as const, reason: "not_a_human_revision" };
      }
      if (head.state !== "working") {
        // The only legitimate frozen head here is one promote-on-launch froze for THIS submission's
        // run — identifiable by its fresh `revise-edits:<headId>` memo (the same 24-h TTL createRun's
        // findFreshMemo applies, so an expired memo still 409s rather than revising a frozen head).
        const memo = (
          await tx.query(
            `select 1 from run_idempotency
              where billing_account_id = $1 and idempotency_key = $2 and created_at > $3`,
            [principal.billingAccountId, `revise-edits:${head.id}`, new Date(deps.clock.now().getTime() - 24 * 60 * 60 * 1000)],
          )
        ).rows[0];
        if (!memo) return { ok: false as const, reason: "not_a_human_revision" };
      }
      const lock = await editorLock(tx, projectId, head.id);
      if (lock) return { ok: false as const, reason: "locked" as const, lock };

      const review = (
        await tx.query(
          `select id from correspondence_items
             where project_id = $1 and kind = 'review' and draft_id = $2
             order by delivered_at desc limit 1`,
          [projectId, head.base_draft_id],
        )
      ).rows[0] as { id: string } | undefined;
      if (!review) return { ok: false as const, reason: "no_review" };

      // 2. Auto-moot the findings whose quotes no longer resolve on the edited head (REQ-DATA-26) —
      //    through the obligation state machine (cause 'moot'; the run's triage confirms, and an
      //    unconfirmed moot returns to open by the mooted→open user edge).
      const md = (await versionText(store, tx, head.promoted_version_id))?.text ?? "";
      const findingRows = (
        await tx.query(
          `select f.id, f.anchor from findings f
             join correspondence_items ci on ci.id = f.correspondence_id
            where f.draft_id = $1 and ci.kind = 'review' order by f.ordinal`,
          [head.base_draft_id],
        )
      ).rows as { id: string; anchor: Anchor | null }[];
      const projections = projectFindingsOntoMarkdown(findingRows, md);
      const byActor: Actor = { kind: "user", userId: principal.userId };
      const mooted: string[] = [];
      for (const p of projections) {
        if (!p.lost) continue;
        const obl = await findingObligationState(tx, p.findingId);
        // only a LIVE obligation can moot — a closed one (discharged/rebutted/mooted) stays closed.
        if (!obl || !["open", "reopened", "addressed", "deferred"].includes(obl.state)) continue;
        await mootObligation(tx, oblDeps, { obligationId: obl.obligationId, byActor });
        mooted.push(p.findingId);
      }
      return {
        ok: true as const,
        headId: head.id,
        reviewId: review.id,
        mootedFindingIds: mooted,
        wordCount: md.split(/\s+/).filter(Boolean).length,
      };
    });
    if (!prep.ok) {
      if (prep.reason === "locked") return c.json({ error: "locked", lock: prep.lock }, 409);
      return c.json({ error: prep.reason }, prep.reason === "not_a_human_revision" ? 409 : 404);
    }

    // 3. Create the revise run — the same server-derived estimate/cap the sheet path enforces
    //    (REQ-BILL-3/6; a crafted POST can never size the guarantee), plus the manual-revision marker
    //    (the edits are the made moves; the triage sees the auto-mooted rows).
    const derived = buildEstimate({
      workflow: "revise",
      rigor: "standard",
      modelTier: "balanced",
      inputs: { words: prep.wordCount },
    });
    const nextDraftId = deps.ids("dft");
    const res = await createRun(deps, {
      idempotencyKey: `revise-edits:${prep.headId}`,
      workflow: "revise",
      workspaceId: principal.workspaceId,
      billingAccountId: principal.billingAccountId,
      requestedBy: principal.userId,
      projectId,
      seat: seatForWorkflow("revise"),
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: derived.estimateCredits,
      capCredits: derived.capCredits,
      rateTableVersion: 1,
      phaseClassesUsed: phaseClassesForWorkflow("revise"),
      inputs: {
        priorReviewId: prep.reviewId,
        nextDraftId,
        manualRevision: {
          baseDraftId: prep.headId,
          mootedFindingIds: prep.mootedFindingIds,
          note: "The human's edits are the made moves; auto-mooted findings await triage confirmation (REQ-DATA-26).",
        },
      },
      inputSnapshot: { wordCount: prep.wordCount },
      sheetLaunched: true,
      lockSetSpec: { projectId, draftId: prep.headId, nextDraftId },
    });
    if (!res.ok) {
      if (res.reason === "insufficient_balance") return c.json({ error: res.reason, required: res.required }, 402);
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403); // REQ-SPEC-24.7
      // PRB.21 — a non-terminal run already occupies the project (e.g. the writer lock's run); the
      // editor surfaces the conflict, never a second run.
      if (res.reason === "run_in_progress") return c.json({ error: res.reason, runId: res.activeRunId }, 409);
      // P1.16 (§14.3): a trial-entitlement refusal — never proceed free (REQ-SPEC-24.2).
      if (res.reason === "entitlement_unavailable") return c.json({ error: res.reason, detail: res.detail }, 403);
      return c.json({ error: res.reason, detail: res.error.message }, 422);
    }
    if (res.state === "queued" && !res.deduped) {
      await deps.queue.send(RUN_JOBS.start, { runId: res.runId, workspaceId: principal.workspaceId }, { singletonKey: res.runId });
    }
    return c.json({ runId: res.runId, state: res.state, deduped: res.deduped, mootedFindingIds: prep.mootedFindingIds }, res.deduped ? 200 : 201);
  });

  // ---- P1.02 — bibliography read + import (matrix row 37: BibTeX / CSL-JSON / Zotero into CSL-JSON
  //      items). The artifact is content-addressed like every other; the import REPLACES the item set
  //      (imports merge client-side via re-import; there is no per-item editor at MVP). ----
  app.get("/projects/:id/bibliography", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    const items = await deps.txRunner.run(principal.workspaceId, async (tx) =>
      readBibliography(tx, store, c.req.param("id")));
    return c.json({ items });
  });

  app.post("/projects/:id/bibliography", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { format?: string; content?: string };
    if (typeof body.content !== "string" || body.content.trim() === "") {
      return c.json({ error: "content required" }, 400);
    }
    const format = body.format ?? detectBibliographyFormat(body.content) ?? undefined;
    if (!format || !["bibtex", "csl-json", "zotero"].includes(format)) {
      return c.json({ error: "unrecognized bibliography format" }, 422);
    }
    let items;
    try {
      items = importBibliography(format as "bibtex" | "csl-json" | "zotero", body.content);
    } catch (e) {
      return c.json({ error: `import failed: ${e instanceof Error ? e.message : "parse error"}` }, 422);
    }
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);

    const payload = Buffer.from(JSON.stringify(items, null, 2), "utf8");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const sha256 = sha256Hex(new Uint8Array(payload));
      const { key } = await store.put(principal.workspaceId, sha256, new Uint8Array(payload));
      let artifactId = (
        (await tx.query(
          `select id from artifacts where project_id = $1 and mirror_path = $2`,
          [c.req.param("id"), BIBLIOGRAPHY_PATH],
        )).rows[0] as { id: string } | undefined
      )?.id;
      if (!artifactId) {
        artifactId = deps.ids("art");
        await tx.query(
          `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, created_at)
           values ($1,$2,$3,'bibliography','shared',$4,$5)`,
          [artifactId, principal.workspaceId, c.req.param("id"), BIBLIOGRAPHY_PATH, deps.clock.now()],
        );
      }
      const ordinal = (
        (await tx.query(
          "select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1",
          [artifactId],
        )).rows[0] as { n: number }
      ).n;
      const versionId = deps.ids("av");
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes,
           media_type, created_by, created_at, immutable)
         values ($1,$2,$3,$4,$5,$6,'application/json',$7,$8,false)`,
        [versionId, artifactId, ordinal, sha256, key, payload.byteLength,
         JSON.stringify({ kind: "user", userId: principal.userId }), deps.clock.now()],
      );
      await tx.query("update artifacts set head_version_id = $2 where id = $1", [artifactId, versionId]);
      return { versionId };
    });
    void res;
    return c.json({
      imported: items.length,
      format,
      items: items.map((it) => ({ citeKey: it.id, item: it as unknown as Record<string, unknown> })),
    });
  });

  // ---- P1.02 — the read-only Page read for a non-draft artifact (/a/:artifactId). Any artifact kind;
  //      only text/markdown bodies render on the Page (others 415). ----
  app.get("/projects/:id/artifacts/:artifactId/page", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const row = (
        await tx.query(
          `select a.id, a.kind, a.mirror_path, av.id as version_id, av.ordinal, av.media_type, av.block_id_map
             from artifacts a join artifact_versions av on av.id = a.head_version_id
            where a.id = $1 and a.project_id = $2`,
          [c.req.param("artifactId"), c.req.param("id")],
        )
      ).rows[0] as
        | { id: string; kind: string; mirror_path: string; version_id: string; ordinal: number; media_type: string; block_id_map: unknown }
        | undefined;
      if (!row) return null;
      // P1.08 / REQ-VIS-3: an H-level kind has NO route — a direct /a/:artifactId request refuses
      // (it is absent, not locked). I kinds DO render — the Files pane links to them from Advanced.
      const kindParsed = artifactKindSchema.safeParse(row.kind);
      if (kindParsed.success && artifactPolicy[kindParsed.data].level === "H") return null;
      if (row.media_type !== "text/markdown") return { notMarkdown: true as const };
      const text = await versionText(store, tx, row.version_id);
      if (!text) return null;
      const spans = (
        (await tx.query(`select spans from provenance_maps where draft_version_id = $1`, [row.version_id]))
          .rows[0] as { spans?: { blockId: string; source: unknown }[] } | undefined
      )?.spans;
      const provenance: Record<string, unknown> = {};
      if (Array.isArray(spans)) for (const s of spans) if (s?.blockId) provenance[s.blockId] = s.source;
      const meters = statusMeters(text.text);
      return {
        draftId: row.id, // the artifact id stands in — read-only; no save path binds
        draftN: row.ordinal,
        origin: "artifact",
        state: "frozen",
        baseDraftId: null,
        baseDraftN: null,
        markdown: text.text,
        sha256: text.sha256,
        lock: null,
        findings: [],
        provenance: Object.keys(provenance).length > 0 ? provenance : null,
        blockIdMap: row.block_id_map ?? null,
        bibliography: await readBibliography(tx, store, c.req.param("id")),
        venueCap: null,
        meters,
        proposals: [],
        artifactKind: row.kind,
        artifactPath: row.mirror_path,
      };
    });
    if (res == null) return c.json({ error: "not_found" }, 404);
    if ("notMarkdown" in res) return c.json({ error: "not_markdown" }, 415);
    return c.json(res);
  });

  return app;
}
