// The P1.08 surfaces (§5.8 + §5.13; REQ-IDE-32/34/35/36/37, REQ-VIS-3, REQ-OBJ-6, REQ-PROD-11):
//
//   GET  /projects/:id/versions                              — the version rail read model
//   GET  /projects/:id/files                                 — the Files pane's typed sections
//   GET  /projects/:id/drafts/:did/restore-points            — the §5.8 grouped restore-point list
//   GET  /projects/:id/drafts/:did/restore-points/:rp/preview — the point's diff vs the current head
//   POST /projects/:id/drafts/:did/restore-points/:rp/restore — undoable apply (pre-restore point +
//                                                        saveManualRevision's frozen→fork rule)
//
// Session-authenticated; every read runs inside the tenant-scoped transaction (a cross-workspace
// project resolves to not_found, never a leak). Artifact visibility comes from `artifactPolicy`
// (§8.2) + `browserSectionFor` (§5.13) — H kinds produce a sealed COUNT, never a row or a route.

import { Hono } from "hono";
import * as Y from "yjs";
import {
  artifactKindSchema,
  artifactPolicy,
  browserSectionFor,
  type ArtifactPolicy,
  type BrowserSection,
} from "@rhema/contracts";
import { editorLockForRuns, HOLDING_STATES } from "@rhema/orchestrator";
import { diffMarkdown } from "@rhema/findings-core";
import { docToCanonicalMarkdown, replaceDocContent } from "@rhema/editor";
import {
  reconstructDocState,
  saveManualRevision,
  writeRestorePoint,
  type ContentStore,
  type DeliveryEventAppender,
  type RestoreBlobStore,
  type SqlExecutor,
} from "@rhema/mirror";
import { assembleWhatChangedView } from "./what-changed.js";
import type { Principal } from "./run-routes.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

export interface VersionApiDeps {
  readonly principal: (c: { req: { header(name: string): string | undefined } }) => Principal | null;
  readonly txRunner: {
    run<T>(workspaceId: string, fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  };
  /** the raw SQL client for the workspace-ownership check (same seam the editor routes take). */
  readonly db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  readonly store?: ContentStore;
  /** the restore-blob store (GCS live; in-memory in tests). Unset ⇒ `restore/`-keyed points answer
   *  `restore_unavailable` on preview/restore — content-addressed points still work. */
  readonly restoreBlobs?: RestoreBlobStore;
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
  /** saveManualRevision's required event appender (project-scoped timeline sink when no run). */
  readonly eventWriter: DeliveryEventAppender;
}

// ── the version rail (§5.8; REQ-IDE-32, REQ-OBJ-6, REQ-PROD-11) ────────────────────────────────────

const OPEN_OBLIGATION_STATES = ["open", "reopened", "deferred"];
const ADDRESSED_OBLIGATION_STATES = ["addressed", "discharged", "mooted", "rebutted"];

interface RailDraftRow {
  id: string;
  n: number;
  origin: string;
  state: string;
  frozen_at: Date | null;
  created_at: Date;
  claims_pending_verification: boolean;
  word_count: number | null;
  reviewed: boolean;
  answered: boolean;
}

export async function loadVersionRail(exec: SqlExecutor, projectId: string) {
  const drafts = (
    await exec.query(
      `select d.id, d.n, d.origin, d.state, d.frozen_at, d.created_at, d.claims_pending_verification,
              av.word_count,
              exists(select 1 from correspondence_items ci
                       where ci.draft_id = d.id and ci.kind = 'review') as reviewed,
              exists(select 1 from correspondence_items ci
                       where ci.draft_id = d.id and ci.kind = 'response') as answered
         from drafts d
         left join artifact_versions av on av.id = d.promoted_version_id
        where d.project_id = $1 order by d.n`,
      [projectId],
    )
  ).rows as RailDraftRow[];

  // The ⚑ chip (REQ-OBJ-6): blocking/major obligations only, opened-on this draft. `open` counts the
  // live states; `addressed` the closed ones. The project-level chip sums the same pair.
  const oblRows = (
    await exec.query(
      `select opened_on_draft_id, state from revision_obligations
        where project_id = $1 and severity in ('blocking','major')`,
      [projectId],
    )
  ).rows as { opened_on_draft_id: string | null; state: string }[];
  const byDraft = new Map<string, { open: number; addressed: number }>();
  const chip = { open: 0, addressed: 0 };
  for (const o of oblRows) {
    const open = OPEN_OBLIGATION_STATES.includes(o.state);
    if (open) chip.open += 1;
    else if (ADDRESSED_OBLIGATION_STATES.includes(o.state)) chip.addressed += 1;
    if (o.opened_on_draft_id) {
      const cur = byDraft.get(o.opened_on_draft_id) ?? { open: 0, addressed: 0 };
      if (open) cur.open += 1;
      else if (ADDRESSED_OBLIGATION_STATES.includes(o.state)) cur.addressed += 1;
      byDraft.set(o.opened_on_draft_id, cur);
    }
  }

  const outline = (
    await exec.query(
      `select a.id, av.created_at, av.word_count from artifacts a
         left join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.kind = 'outline' order by a.created_at asc limit 1`,
      [projectId],
    )
  ).rows[0] as { id: string; created_at: Date | null; word_count: number | null } | undefined;

  return {
    workingN: drafts.find((d) => d.state === "working")?.n ?? null,
    chip,
    outline: outline
      ? {
          artifactId: outline.id,
          createdAt: outline.created_at ? new Date(outline.created_at).toISOString() : null,
          words: outline.word_count,
        }
      : null,
    drafts: drafts.map((d) => ({
      draftId: d.id,
      n: d.n,
      origin: d.origin,
      state: d.state,
      frozen: d.state === "frozen",
      frozenAt: d.frozen_at ? new Date(d.frozen_at).toISOString() : null,
      createdAt: new Date(d.created_at).toISOString(),
      words: d.word_count,
      reviewed: d.reviewed,
      answered: d.answered,
      claimsPendingVerification: d.claims_pending_verification,
      obligations: byDraft.get(d.id) ?? { open: 0, addressed: 0 },
    })),
  };
}

// ── the Files pane (§5.13; REQ-IDE-35/36/37, REQ-VIS-3) ────────────────────────────────────────────

/** Kinds that describe a draft — the freshness note applies ("describes v1 as delivered; v1 has
 *  since been edited"). Facts, not guesses: a row is stale only when the subject draft resolves AND
 *  the subject's promoted head postdates this version. */
const DESCRIBING_KINDS = new Set([
  "drafting_note",
  "editors_letter",
  "claim_ledger",
  "discourse_report",
  "second_read",
  "response_letter",
  "response_ledger",
  "piece_brief",
  "argument_notes",
  "craft_notes",
  "fidelity_audit",
  "run_report",
  "walkthrough",
  "provenance_map",
  "reverse_outline",
]);

/** Agent-memory kinds open read-only (the voice charter offers "Add guidance", never editing). */
const AGENT_MEMORY_KINDS = new Set([
  "persona_seed",
  "persona_builder_note",
  "profile_index",
  "voice_print",
  "structure_repertoire",
  "lexicon",
  "exemplars",
  "positions",
  "continuity",
  "audience_venue",
  "calibration_report",
  "profile_provenance",
  "register_map",
  "shared_lexicon",
  "voice_charter",
  "preference_profile",
  "corpus_note",
  "holdout_note",
]);

function policyOf(kind: string): ArtifactPolicy | null {
  const parsed = artifactKindSchema.safeParse(kind);
  return parsed.success ? artifactPolicy[parsed.data] : null;
}

interface ArtifactJoinRow {
  id: string;
  kind: string;
  namespace: string;
  mirror_path: string;
  head_version_id: string | null;
  persona_id: string | null;
  artifact_created_at: Date;
  version_id: string | null;
  word_count: number | null;
  media_type: string | null;
  created_by: { kind?: string; userId?: string; seat?: string } | null;
  version_at: Date | null;
  immutable: boolean | null;
  run_id: string | null;
  phase: string | null;
  workflow: string | null;
  run_draft_id: string | null;
  inputs_draft_id: string | null;
  draft_n: number | null;
  draft_state: string | null;
}

export interface FileRowDto {
  readonly artifactId: string;
  readonly kind: string;
  readonly label: string;
  readonly level: "SE" | "SR" | "I";
  readonly editMode: string;
  /** the §5.13 lock-state icon: editable ✎ · immutable 🔒 · inspect-only 👁 (sealed never reaches a row). */
  readonly lock: "editable" | "immutable" | "inspect";
  /** agent-memory rows open read-only (REQ-IDE-37). */
  readonly readOnly: boolean;
  readonly words: number | null;
  readonly createdAt: string | null;
  /** the §5.13 provenance badge (ledger D21): who produced it + the run/phase link when run-born. */
  readonly provenance: {
    readonly actor: "you" | "system" | "agent";
    readonly userId?: string;
    readonly seat?: string;
    readonly runId?: string;
    readonly workflow?: string;
    readonly phase?: string;
  };
  /** draft artifacts resolve to their version-rail entry (`draftRef` = the draft's n). */
  readonly draftRef?: { readonly n: number; readonly state: string };
  readonly freshness?: { readonly subjectDraftN: number; readonly stale: boolean };
}

export interface FileSectionDto {
  readonly key: BrowserSection;
  readonly rows: FileRowDto[];
  /** I-level rows of this nominal section — rendered only behind the Advanced disclosure. */
  readonly advancedRows: FileRowDto[];
  /** H-kind artifacts attributed to this section — "N sealed", never a row (REQ-IDE-35). */
  sealedCount: number;
}

/** Human label for a kind — sentence-case the enum (no new vocabulary). */
function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
}

export async function loadFiles(exec: SqlExecutor, projectId: string) {
  const rows = (
    await exec.query(
      `select a.id, a.kind, a.namespace, a.mirror_path, a.head_version_id, a.persona_id,
              a.created_at as artifact_created_at,
              av.id as version_id, av.word_count, av.media_type, av.created_by,
              av.created_at as version_at, av.immutable,
              s.run_id, s.phase, r.workflow,
              ci.draft_id as run_draft_id,
              r.inputs->>'draftId' as inputs_draft_id,
              dn.n as draft_n, dn.state as draft_state
         from artifacts a
         left join artifact_versions av on av.id = a.head_version_id
         left join steps s on av.id = any(s.produced_version_ids)
         left join runs r on r.id = s.run_id
         left join lateral (
           select draft_id from correspondence_items
            where run_id = r.id order by delivered_at asc limit 1
         ) ci on true
         left join drafts dn on dn.promoted_version_id = a.head_version_id
        where a.project_id = $1
           or a.persona_id = (select persona_id from projects where id = $1)
        order by a.created_at, a.id`,
      [projectId],
    )
  ).rows as ArtifactJoinRow[];

  // Subject drafts for freshness: the describing artifact's subject is the draft its producing run's
  // correspondence covered (else the run's inputs.draftId). Stale ⇔ the subject's promoted head
  // postdates this artifact version.
  const subjectIds = [
    ...new Set(
      rows
        .filter((r) => DESCRIBING_KINDS.has(r.kind))
        .map((r) => r.run_draft_id ?? r.inputs_draft_id)
        .filter((x): x is string => x != null),
    ),
  ];
  const subjectHead = new Map<string, { n: number; headAt: Date | null }>();
  if (subjectIds.length > 0) {
    const subs = (
      await exec.query(
        `select d.id, d.n, dav.created_at as head_at from drafts d
           left join artifact_versions dav on dav.id = d.promoted_version_id
          where d.id = any($1::text[])`,
        [subjectIds],
      )
    ).rows as { id: string; n: number; head_at: Date | null }[];
    for (const s of subs) subjectHead.set(s.id, { n: s.n, headAt: s.head_at });
  }

  const sections = new Map<BrowserSection, FileSectionDto>();
  for (const row of rows) {
    const section = browserSectionFor(row.kind);
    const policy = policyOf(row.kind);
    if (!section || !policy) continue; // unknown kind ⇒ unlisted entirely (fail closed)
    const dto =
      sections.get(section) ??
      (() => {
        const s: FileSectionDto = {
          key: section,
          rows: [],
          advancedRows: [],
          sealedCount: 0,
        };
        sections.set(section, s);
        return s;
      })();

    if (policy.level === "H") {
      dto.sealedCount += 1; // §5.13: hidden kinds are a count, never a row
      continue;
    }

    const createdBy = row.created_by ?? {};
    const lock: FileRowDto["lock"] =
      row.draft_n != null
        ? row.draft_state === "frozen"
          ? "immutable"
          : "editable"
        : row.immutable === true || policy.editMode === "none"
          ? "immutable"
          : policy.editMode === "guidance_only"
            ? "inspect"
            : "editable";

    const subjectId = row.run_draft_id ?? row.inputs_draft_id;
    const subject = subjectId ? subjectHead.get(subjectId) : undefined;
    const stale =
      DESCRIBING_KINDS.has(row.kind) &&
      subject?.headAt != null &&
      row.version_at != null &&
      new Date(subject.headAt).getTime() > new Date(row.version_at).getTime();

    const fileRow: FileRowDto = {
      artifactId: row.id,
      kind: row.kind,
      label: kindLabel(row.kind),
      level: policy.level as FileRowDto["level"],
      editMode: policy.editMode,
      lock,
      readOnly: AGENT_MEMORY_KINDS.has(row.kind) || policy.editMode === "none",
      words: row.word_count,
      createdAt: row.version_at ? new Date(row.version_at).toISOString() : null,
      provenance: {
        actor: createdBy.kind === "user" ? "you" : createdBy.kind === "agent" ? "agent" : "system",
        ...(createdBy.userId ? { userId: createdBy.userId } : {}),
        ...(row.run_id
          ? {
              runId: row.run_id,
              ...(row.workflow ? { workflow: row.workflow } : {}),
              ...(row.phase ? { phase: row.phase } : {}),
              ...(createdBy.seat ? { seat: createdBy.seat } : {}),
            }
          : {}),
      },
      ...(row.draft_n != null ? { draftRef: { n: row.draft_n, state: row.draft_state! } } : {}),
      ...(subject && DESCRIBING_KINDS.has(row.kind)
        ? { freshness: { subjectDraftN: subject.n, stale: stale === true } }
        : {}),
    };
    if (policy.level === "I") dto.advancedRows.push(fileRow);
    else dto.rows.push(fileRow);
  }

  return {
    sections: [...sections.values()].sort(
      (a, b) =>
        (["outline", "drafts", "rounds", "research", "voice", "assets", "advanced"] as const).indexOf(
          a.key,
        ) -
        (["outline", "drafts", "rounds", "research", "voice", "assets", "advanced"] as const).indexOf(
          b.key,
        ),
    ),
  };
}

// ── restore points (§5.8; REQ-IDE-34) ──────────────────────────────────────────────────────────────

interface PointRow {
  id: string;
  live_doc_id: string | null;
  s3_key: string;
  kind: string;
  cause: string;
  label: string | null;
  created_at: Date;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** The markdown a restore point holds: `restore/`-keyed points are Yjs update chains reconstructed
 *  at the point's own timestamp; anything else is the content-addressed head snapshot (basename =
 *  sha256) the HTTP save path writes. Returns null when the bytes are unavailable. */
async function pointMarkdown(
  exec: SqlExecutor,
  store: ContentStore | null,
  blobs: RestoreBlobStore | undefined,
  point: PointRow,
): Promise<string | null> {
  if (point.s3_key.startsWith("restore/")) {
    if (!blobs || !point.live_doc_id) return null;
    const doc = await reconstructDocState(exec, blobs, point.live_doc_id, new Date(point.created_at));
    if (!doc) return null;
    const md = docToCanonicalMarkdown(doc);
    doc.destroy();
    return md;
  }
  if (!store) return null;
  const sha = point.s3_key.split("/").pop();
  if (!sha) return null;
  const bytes = await store.get(sha);
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

/** The draft's current materialized markdown (its promoted head, else its base's). */
async function headMarkdown(
  exec: SqlExecutor,
  store: ContentStore,
  draftId: string,
): Promise<string> {
  const d = (
    await exec.query("select promoted_version_id, base_draft_id from drafts where id = $1", [
      draftId,
    ])
  ).rows[0] as { promoted_version_id: string | null; base_draft_id: string | null } | undefined;
  const versionId =
    d?.promoted_version_id ??
    (d?.base_draft_id
      ? ((
          await exec.query("select promoted_version_id from drafts where id = $1", [d.base_draft_id])
        ).rows[0] as { promoted_version_id: string | null } | undefined)?.promoted_version_id
      : null);
  if (!versionId) return "";
  const row = (
    await exec.query("select content_sha256 from artifact_versions where id = $1", [versionId])
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return "";
  const bytes = await store.get(row.content_sha256);
  return bytes ? Buffer.from(bytes).toString("utf8") : "";
}

export function createVersionRoutes(deps: VersionApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: restore-point restores on it 409.
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));
  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;
  const ownProject = async (c: { req: { param(n: string): string } }, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  // ---- the version rail ----
  app.get("/projects/:id/versions", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const rail = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadVersionRail(tx, c.req.param("id")),
    );
    return c.json(rail);
  });

  // ---- the Files pane (REQ-VIS-3: default `rows` carry no I/H row; `advancedRows` are I-only;
  //      `sealedCount` is the only trace H kinds leave). ----
  app.get("/projects/:id/files", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const files = await deps.txRunner.run(principal.workspaceId, (tx) =>
      loadFiles(tx, c.req.param("id")),
    );
    return c.json(files);
  });

  // ---- the restore-point list, grouped per §5.8: "Earlier today / Yesterday / Before Review of
  //      vN / Named" — older-than-today non-named points ride `advanced: true` (progressive
  //      disclosure: restore points older than today are an Advanced control). ----
  app.get("/projects/:id/drafts/:did/restore-points", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const now = deps.clock.now();

    const grouped = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const draft = (
        await tx.query(
          `select id, live_doc_id from drafts where id = $1 and project_id = $2`,
          [c.req.param("did"), projectId],
        )
      ).rows[0] as { id: string; live_doc_id: string | null } | undefined;
      if (!draft) return null;

      const points = draft.live_doc_id
        ? ((
            await tx.query(
              `select id, live_doc_id, s3_key, kind, cause, label, created_at from restore_points
                where live_doc_id = $1 order by created_at desc`,
              [draft.live_doc_id],
            )
          ).rows as PointRow[])
        : [];

      // "Before Review of vN": a pre_run/auto point names the FIRST review delivered after it.
      const reviews = (
        await tx.query(
          `select ci.delivered_at, d.n from correspondence_items ci
             join drafts d on d.id = ci.draft_id
            where ci.project_id = $1 and ci.kind = 'review' order by ci.delivered_at asc`,
          [projectId],
        )
      ).rows as { delivered_at: Date; n: number }[];
      const reviewAfter = (at: Date) =>
        reviews.find((r) => new Date(r.delivered_at).getTime() >= new Date(at).getTime()) ?? null;

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const enriched = points.map((p) => {
        const at = new Date(p.created_at);
        const named = p.cause === "named" || p.label != null;
        const review = p.cause === "pre_run" ? reviewAfter(at) : null;
        const group = named
          ? "named"
          : sameDay(at, now)
            ? "earlier_today"
            : sameDay(at, yesterday)
              ? "yesterday"
              : review
                ? "before_review"
                : "earlier";
        return {
          id: p.id,
          kind: p.kind,
          cause: p.cause,
          label: p.label,
          createdAt: at.toISOString(),
          group,
          ...(review ? { beforeReviewN: review.n } : {}),
          // §5.8 progressive disclosure: restore points older than today sit behind Advanced.
          advanced: !named && !sameDay(at, now) && !sameDay(at, yesterday),
        };
      });
      return { draftId: draft.id, liveDocId: draft.live_doc_id, points: enriched };
    });
    if (!grouped) return c.json({ error: "not_found" }, 404);
    return c.json(grouped);
  });

  // ---- preview: the point's reconstructed markdown diffed against the current head — the
  //      all-Unlinked What-changed view (a restore point carries no ledger). ----
  app.get("/projects/:id/drafts/:did/restore-points/:rp/preview", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);

    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const point = (
        await tx.query(
          `select rp.id, rp.live_doc_id, rp.s3_key, rp.kind, rp.cause, rp.label, rp.created_at
             from restore_points rp
             join drafts d on d.live_doc_id = rp.live_doc_id
            where rp.id = $1 and d.id = $2 and d.project_id = $3`,
          [c.req.param("rp"), c.req.param("did"), c.req.param("id")],
        )
      ).rows[0] as PointRow | undefined;
      if (!point) return { ok: false as const, reason: "not_found" };
      const md = await pointMarkdown(tx, store, deps.restoreBlobs, point);
      if (md == null) return { ok: false as const, reason: "restore_unavailable" };
      const current = store ? await headMarkdown(tx, store, c.req.param("did")) : "";
      const diff = diffMarkdown(current, md);
      const view = await assembleWhatChangedView(tx, {
        projectId: c.req.param("id"),
        runId: null,
        reviewId: null,
        ledger: null,
        diff,
      });
      return {
        ok: true as const,
        point: {
          id: point.id,
          kind: point.kind,
          cause: point.cause,
          label: point.label,
          createdAt: new Date(point.created_at).toISOString(),
        },
        view,
      };
    });
    if (!out.ok) {
      return out.reason === "restore_unavailable"
        ? c.json({ error: out.reason }, 503)
        : c.json({ error: out.reason }, 404);
    }
    return c.json(out);
  });

  // ---- apply: undoable by construction — the route writes a "Before restore" snapshot of the
  //      CURRENT state first, then applies through saveManualRevision (a frozen head forks to
  //      v(N+1) origin='human_revision' per REQ-DATA-24; a working human_revision head updates in
  //      place; a working agent/imported head refuses 409). The live doc's y_state is replaced
  //      wholesale when one exists so the collab layer converges on the restored bytes. ----
  app.post("/projects/:id/drafts/:did/restore-points/:rp/restore", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "content store unavailable" }, 500);
    const projectId = c.req.param("id");
    const draftId = c.req.param("did");

    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const point = (
        await tx.query(
          `select rp.id, rp.live_doc_id, rp.s3_key, rp.kind, rp.cause, rp.label, rp.created_at
             from restore_points rp
             join drafts d on d.live_doc_id = rp.live_doc_id
            where rp.id = $1 and d.id = $2 and d.project_id = $3`,
          [c.req.param("rp"), draftId, projectId],
        )
      ).rows[0] as PointRow | undefined;
      if (!point) return { ok: false as const, reason: "not_found" as const };

      // A held §6.3 lock refuses the apply — restoring mid-run would write under the run's feet.
      const runs = (
        await tx.query(
          `select id, workflow, lock_set from runs where project_id = $1 and state = any($2::text[])`,
          [projectId, HOLDING_STATES as unknown as string[]],
        )
      ).rows as { id: string; workflow: string; lock_set: string[] }[];
      const lock = editorLockForRuns(
        runs.map((r) => ({ id: r.id, workflow: r.workflow, lockSet: r.lock_set ?? [] })),
        { projectId, draftId },
      );
      if (lock) return { ok: false as const, reason: "locked" as const };

      const md = await pointMarkdown(tx, store, deps.restoreBlobs, point);
      if (md == null) return { ok: false as const, reason: "restore_unavailable" as const };

      // The undo point — a snapshot of the CURRENT state written BEFORE the apply. Yjs live docs
      // snapshot the y_state bytes; content-addressed worlds point the row at the head's object.
      let undoPointId: string | null = null;
      const liveDoc = (
        await tx.query(
          `select ld.id, ld.y_state from live_docs ld join drafts d on d.live_doc_id = ld.id
            where d.id = $1`,
          [draftId],
        )
      ).rows[0] as { id: string; y_state: Buffer | Uint8Array } | undefined;
      const undoLabel = `Before restore — ${point.label ?? new Date(point.created_at).toISOString()}`;
      if (liveDoc && deps.restoreBlobs) {
        undoPointId = await writeRestorePoint(tx, deps.restoreBlobs, deps.ids, liveDoc.id, {
          kind: "snapshot",
          cause: "auto",
          label: undoLabel,
          bytes: new Uint8Array(liveDoc.y_state),
          at: deps.clock.now(),
        });
      } else {
        const headV = (
          await tx.query(
            `select av.s3_key from drafts d join artifact_versions av on av.id = d.promoted_version_id
              where d.id = $1`,
            [draftId],
          )
        ).rows[0] as { s3_key: string } | undefined;
        if (liveDoc && headV) {
          const id = deps.ids("rp");
          await tx.query(
            `insert into restore_points(id, live_doc_id, s3_key, kind, cause, label, created_at)
             values ($1,$2,$3,'snapshot','auto',$4,$5)`,
            [id, liveDoc.id, headV.s3_key, undoLabel, deps.clock.now()],
          );
          undoPointId = id;
        }
      }

      const res = await saveManualRevision(
        tx,
        { store, ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter },
        {
          workspaceId: principal.workspaceId,
          projectId,
          draftId,
          markdown: md,
          userId: principal.userId,
          restorePoint: "content-addressed",
        },
      );
      if (!res.ok) return { ok: false as const, reason: res.reason };

      // Converge the live doc the RESOLVED head owns (the forked child's, on a frozen target).
      // F-R6H11-1: the replace is CONVERGENT, not wholesale — apply the restored markdown as a
      // y-prosemirror diff over the STORED y_state so removed items tombstone relative to every
      // replica's items (a fresh-doc update carries none, so a replica's pre-restore items merge
      // back in and the removed text resurrects — the prod symptom), and bump `y_epoch` so a
      // loaded collab runtime converges its in-memory doc to this state at its next hook instead
      // of flushing the pre-restore bytes back over it.
      const headLive = (
        await tx.query("select live_doc_id from drafts where id = $1", [res.draftId])
      ).rows[0] as { live_doc_id: string | null } | undefined;
      if (headLive?.live_doc_id) {
        const stored = (
          await tx.query("select y_state from live_docs where id = $1", [headLive.live_doc_id])
        ).rows[0] as { y_state: Buffer | Uint8Array } | undefined;
        const tmp = new Y.Doc();
        if (stored?.y_state?.byteLength) {
          Y.applyUpdate(tmp, new Uint8Array(stored.y_state));
        }
        replaceDocContent(tmp, md);
        const update = Y.encodeStateAsUpdate(tmp);
        const sv = Y.encodeStateVector(tmp);
        tmp.destroy();
        await tx.query(
          `update live_docs set y_state = $2, state_vector = $3, y_epoch = y_epoch + 1 where id = $1`,
          [headLive.live_doc_id, update, sv],
        );
      }

      return {
        ok: true as const,
        draftId: res.draftId,
        draftN: res.draftN,
        forked: res.forked,
        restorePointId: res.restorePointId,
        undoPointId,
        restoredFrom: point.id,
      };
    });

    if (!out.ok) {
      const status =
        out.reason === "locked" ? 409 : out.reason === "not_editable" ? 409 : out.reason === "restore_unavailable" ? 503 : 404;
      return c.json({ error: out.reason }, status);
    }
    return c.json(out);
  });

  return app;
}
