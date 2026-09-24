// Figure routes (P1.13; §7.5; REQ-VIZ-1…16) — the Figures pane read model and the whole
// insert-as-proposal lifecycle. A figure is never inserted by the run or the pod: `propose` writes a
// `pending_proposal` (+ `figure.proposed`), `accept` performs ONE tx that splices the figure block
// through `saveManualRevision` — a FROZEN draft forks v(N+1) inside it (REQ-VIZ-9) —, and `reject`
// clears the card. The iterate verbs a card owns without a run — the type-chip (a 0-cr spec.vl.json
// mark edit) and a version restore — land as new figure_versions + a `figure.render` enqueue; a full
// prompt iterate stays a `/runs {kind:'figure'}` follow-up. `render.png` is the lazy PNG@2x endpoint
// (§7.5): the first request renders + persists `render@2x.png`, later ones serve it.

import { Hono } from "hono";
import {
  FIGURE_ALT_MAX,
  FIGURE_BADGE_TEXT,
  FIGURE_KIND_BY_SPEC,
  FIGURE_MARKER_RE,
  FIGURE_SPEC_KINDS,
  SPEC_FILENAME,
  figureAssetUri,
  figureBadge,
  figureBlockMarkdown,
  figureIdFromRef,
  figureInsertReadiness,
  figureProvenanceSchema,
  parseRunEvent,
  type FigureKind,
  type FigureProvenance,
  type FigureSpecKind,
} from "@rhema/contracts";
import { renderPng2x, validateVegaLiteSpec } from "@rhema/figures";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import {
  persistHarvest,
  saveManualRevision,
  sha256Hex,
  type ContentStore,
  type NewVersion,
  type SqlExecutor,
} from "@rhema/mirror";
import { FIGURE_RENDER_QUEUE, type OrchestratorDeps } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";

export interface FigureApiDeps extends OrchestratorDeps {
  readonly principal: (c: { req: { header(n: string): string | undefined } }) => Principal | null;
  readonly db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
  /** per-workspace content store (defaults to `store`). */
  readonly contentStoreFor?: (workspaceId: string) => Promise<ContentStore | undefined>;
  readonly store?: ContentStore;
}

// -----------------------------------------------------------------------------------------------------
// row + file helpers
// -----------------------------------------------------------------------------------------------------

/** The `figures` row as the pane reads it (kind derives from spec_kind — never stored). */
export interface FigureRow {
  readonly id: string;
  readonly projectId: string;
  readonly artifactId: string | null;
  readonly title: string;
  readonly caption: string;
  readonly alt: string;
  readonly sourceLine: string;
  readonly specKind: FigureSpecKind;
  readonly kind: FigureKind;
  readonly provenance: FigureProvenance;
  readonly latestRunId: string | null;
  readonly specVersionId: string | null;
  readonly dataVersionId: string | null;
  readonly renderedVersionId: string | null;
  readonly insertedInDraftId: string | null;
  readonly insertedAtVersionId: string | null;
  readonly pendingProposal: {
    draftId: string;
    afterBlockId: string | null;
    version: number;
    markdown: string;
    at: string;
  } | null;
}

interface FigureDbRow {
  id: string;
  project_id: string;
  artifact_id: string | null;
  title: string | null;
  caption: string | null;
  alt: string | null;
  source_line: string | null;
  spec_kind: string;
  provenance: unknown;
  latest_run_id: string | null;
  spec_version_id: string | null;
  data_version_id: string | null;
  rendered_version_id: string | null;
  inserted_in_draft_id: string | null;
  inserted_at_version_id: string | null;
  pending_proposal: unknown;
}

interface FigureVersionDbRow {
  ordinal: number;
  request: string | null;
  spec_version_id: string | null;
  data_version_id: string | null;
  rendered_version_id: string | null;
  render_status: string;
  render_error: string | null;
  created_at: string | Date;
}

function rowToFigure(r: FigureDbRow): FigureRow {
  const parsed = figureProvenanceSchema.safeParse(r.provenance);
  const specKind = (FIGURE_SPEC_KINDS as readonly string[]).includes(r.spec_kind)
    ? (r.spec_kind as FigureSpecKind)
    : "vega_lite";
  return {
    id: r.id,
    projectId: r.project_id,
    artifactId: r.artifact_id,
    title: r.title ?? "",
    caption: r.caption ?? "",
    alt: r.alt ?? "",
    sourceLine: r.source_line ?? "",
    specKind,
    kind: FIGURE_KIND_BY_SPEC[specKind],
    provenance: parsed.success
      ? parsed.data
      : { kind: "none", refs: [], computedBy: "drafter", verification: "unverified" },
    latestRunId: r.latest_run_id,
    specVersionId: r.spec_version_id,
    dataVersionId: r.data_version_id,
    renderedVersionId: r.rendered_version_id,
    insertedInDraftId: r.inserted_in_draft_id,
    insertedAtVersionId: r.inserted_at_version_id,
    pendingProposal: (r.pending_proposal as FigureRow["pendingProposal"]) ?? null,
  };
}

async function readFigureRow(
  exec: SqlExecutor,
  projectId: string,
  figureId: string,
): Promise<FigureRow | null> {
  const r = (
    await exec.query(`select * from figures where id = $1 and project_id = $2`, [
      figureIdFromRef(figureId),
      projectId,
    ])
  ).rows[0] as FigureDbRow | undefined;
  return r ? rowToFigure(r) : null;
}

async function figureVersions(
  exec: SqlExecutor,
  figureId: string,
): Promise<FigureVersionDbRow[]> {
  const res = await exec.query(
    `select ordinal, request, spec_version_id, data_version_id, rendered_version_id,
            render_status, render_error, created_at
       from figure_versions where figure_id = $1 order by ordinal`,
    [figureId],
  );
  return res.rows as FigureVersionDbRow[];
}

async function headVersionBytes(
  exec: SqlExecutor,
  store: ContentStore,
  projectId: string,
  mirrorPath: string,
): Promise<{ versionId: string; sha256: string; bytes: Uint8Array } | null> {
  const row = (
    await exec.query(
      `select av.id, av.content_sha256
         from artifacts a join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, mirrorPath],
    )
  ).rows[0] as { id: string; content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await store.get(row.content_sha256).catch(() => null);
  if (!bytes) return null;
  return { versionId: row.id, sha256: row.content_sha256, bytes };
}

/** `assets/figures/<id>/<leaf>` head bytes (null when absent). */
async function assetBytes(
  exec: SqlExecutor,
  store: ContentStore,
  projectId: string,
  figureId: string,
  leaf: string,
): Promise<Uint8Array | null> {
  const v = await headVersionBytes(exec, store, projectId, `assets/figures/${figureId}/${leaf}`);
  return v?.bytes ?? null;
}

// -----------------------------------------------------------------------------------------------------
// DTOs
// -----------------------------------------------------------------------------------------------------

function badgeDto(fig: FigureRow) {
  const badge = figureBadge(fig.provenance);
  return { badge, badgeText: badge ? FIGURE_BADGE_TEXT[badge] : null };
}

async function figureCardDto(
  exec: SqlExecutor,
  store: ContentStore | null,
  projectId: string,
  fig: FigureRow,
) {
  const versions = await figureVersions(exec, fig.id);
  const readiness = figureInsertReadiness({ alt: fig.alt, sourceLine: fig.sourceLine });
  const text = (b: Uint8Array | null) => (b ? Buffer.from(b).toString("utf8") : null);
  const svgLight = store ? await assetBytes(exec, store, projectId, fig.id, "render.svg") : null;
  const svgDark = store ? await assetBytes(exec, store, projectId, fig.id, "render.dark.svg") : null;
  const tableSource =
    store && fig.specKind === "table"
      ? await assetBytes(exec, store, projectId, fig.id, "table.md")
      : null;
  const specBytes = store
    ? await assetBytes(exec, store, projectId, fig.id, SPEC_FILENAME[fig.specKind])
    : null;
  const dataBytes = store ? await assetBytes(exec, store, projectId, fig.id, "data.csv") : null;
  const png = store ? await assetBytes(exec, store, projectId, fig.id, "render@2x.png") : null;
  return {
    id: fig.id,
    assetUri: figureAssetUri(fig.id),
    title: fig.title,
    caption: fig.caption,
    alt: fig.alt,
    sourceLine: fig.sourceLine,
    specKind: fig.specKind,
    kind: fig.kind,
    provenance: fig.provenance,
    ...badgeDto(fig),
    latestRunId: fig.latestRunId,
    insertedInDraftId: fig.insertedInDraftId,
    insertedAtVersionId: fig.insertedAtVersionId,
    pendingProposal: fig.pendingProposal,
    versions: versions.map((v) => ({
      n: v.ordinal,
      request: v.request,
      renderStatus: v.render_status,
      renderError: v.render_error,
      createdAt: v.created_at,
    })),
    files: {
      spec: text(specBytes),
      dataCsv: text(dataBytes),
      svgLight: text(svgLight),
      svgDark: text(svgDark),
      tableSource: text(tableSource),
    },
    render: {
      lightAvailable: svgLight != null,
      darkAvailable: svgDark != null,
      pngAvailable: png != null,
    },
    readiness,
  };
}

/** Catalogue-validated project-scoped event (the §5.5 timeline half — same shape as
 *  manual-revision's sink: no run → `timeline_events`). */
async function emitFigureEvent(
  exec: SqlExecutor,
  deps: FigureApiDeps,
  workspaceId: string,
  projectId: string,
  type: string,
  payload: unknown,
): Promise<void> {
  const parsed = parseRunEvent(type, payload);
  await exec.query(
    `insert into timeline_events(id, project_id, workspace_id, type, payload, at)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      deps.ids("ev"),
      projectId,
      workspaceId,
      parsed.type,
      JSON.stringify(parsed.payload),
      deps.clock.now(),
    ],
  );
}

/** A card-owned render enqueue (chip edit / restore) — the worker renders, never the pod/browser. */
async function enqueueRender(
  deps: FigureApiDeps,
  workspaceId: string,
  fig: FigureRow,
  reason: string,
): Promise<void> {
  await deps.queue.send(
    FIGURE_RENDER_QUEUE,
    { figureId: fig.id, runId: fig.latestRunId ?? null, workspaceId, reason },
    { singletonKey: `figure.render:${fig.id}:${reason}:${deps.ids("sg")}` },
  );
}

const VEGA_MARKS = new Set([
  "bar",
  "line",
  "point",
  "area",
  "rect",
  "tick",
  "arc",
  "rule",
  "circle",
  "square",
]);

// -----------------------------------------------------------------------------------------------------
// routes
// -----------------------------------------------------------------------------------------------------

export function createFigureRoutes(deps: FigureApiDeps): Hono {
  const app = new Hono();

  const storeFor = async (workspaceId: string): Promise<ContentStore | null> =>
    (deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store) ?? null;

  const ownProject = async (c: { req: { param(n: string): string } }, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  // ---- the Figures pane list (§7.5): every figure card with its badge + state. ----
  app.get("/projects/:id/figures", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const res = await deps.db.query(
      `select id from figures where project_id = $1 order by created_at`,
      [projectId],
    );
    const store = await storeFor(principal.workspaceId);
    const figures = await Promise.all(
      (res.rows as { id: string }[]).map(async (r) => {
        const fig = await readFigureRow(deps.db, projectId, r.id);
        if (!fig) return null;
        const versions = await figureVersions(deps.db, fig.id);
        const hasRender =
          store != null &&
          (await assetBytes(deps.db, store, projectId, fig.id, "render.svg")) != null;
        return {
          id: fig.id,
          assetUri: figureAssetUri(fig.id),
          title: fig.title,
          caption: fig.caption,
          specKind: fig.specKind,
          kind: fig.kind,
          ...badgeDto(fig),
          n: versions.at(-1)?.ordinal ?? 0,
          renderStatus: versions.at(-1)?.render_status ?? "pending",
          hasRender,
          insertedInDraftId: fig.insertedInDraftId,
          pendingProposal: fig.pendingProposal != null,
          latestRunId: fig.latestRunId,
        };
      }),
    );
    return c.json({ figures: figures.filter((f) => f != null) });
  });

  // ---- the figure card (§7.5): preview + spec/data + provenance + versions + readiness. ----
  app.get("/projects/:id/figures/:figureId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const fig = await readFigureRow(deps.db, projectId, c.req.param("figureId"));
    if (!fig) return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    return c.json(await figureCardDto(deps.db, store, projectId, fig));
  });

  // ---- the card's field edits (§7.5): title/caption/alt/sourceLine are USER-authored on the
  //      card (the caption phase drafts them; the user corrects). `alt` is bounded at FIGURE_ALT_MAX
  //      (REQ-VIZ-2); these are row fields, never a draft write — insert stays a proposal. ----
  app.patch("/projects/:id/figures/:figureId", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: unknown;
      caption?: unknown;
      alt?: unknown;
      sourceLine?: unknown;
    };
    const field = (v: unknown): string | null | undefined =>
      v === undefined ? undefined : typeof v === "string" ? v : null;
    const title = field(body.title);
    const caption = field(body.caption);
    const alt = field(body.alt);
    const sourceLine = field(body.sourceLine);
    if ([title, caption, alt, sourceLine].some((v) => v === null)) {
      return c.json({ error: "bad_request", detail: "fields must be strings" }, 400);
    }
    if (typeof alt === "string" && alt.length > FIGURE_ALT_MAX) {
      return c.json({ error: "alt_too_long", max: FIGURE_ALT_MAX }, 422);
    }
    return deps.txRunner.run(principal.workspaceId, async (tx) => {
      const fig = await readFigureRow(tx, projectId, c.req.param("figureId"));
      if (!fig) return c.json({ error: "not_found" }, 404);
      await tx.query(
        `update figures set
           title = coalesce($2, title), caption = coalesce($3, caption),
           alt = coalesce($4, alt), source_line = coalesce($5, source_line)
         where id = $1`,
        [fig.id, title ?? null, caption ?? null, alt ?? null, sourceLine ?? null],
      );
      const store = await storeFor(principal.workspaceId);
      const updated = await readFigureRow(tx, projectId, fig.id);
      return c.json(await figureCardDto(tx, store, projectId, updated!));
    });
  });

  // ---- propose (REQ-VIZ-9): insert-gated on alt + source line; the card carries the block the
  //      accept will splice. NOTHING touches the draft here — a proposal is not an insertion. ----
  app.post("/projects/:id/figures/:figureId/proposals", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      draftId?: unknown;
      afterBlockId?: unknown;
    };
    if (typeof body.draftId !== "string" || body.draftId === "") {
      return c.json({ error: "bad_request", detail: "draftId required" }, 400);
    }
    const afterBlockId =
      typeof body.afterBlockId === "string" && body.afterBlockId !== "" ? body.afterBlockId : null;
    const draftId = body.draftId;
    const store = await storeFor(principal.workspaceId);

    return deps.txRunner.run(principal.workspaceId, async (tx) => {
      const fig = await readFigureRow(tx, projectId, c.req.param("figureId"));
      if (!fig) return c.json({ error: "not_found" }, 404);
      const readiness = figureInsertReadiness({ alt: fig.alt, sourceLine: fig.sourceLine });
      if (!readiness.ok) {
        return c.json({ error: "figure_not_ready", missing: readiness.missing }, 409);
      }
      const draft = (
        await tx.query(`select id, n from drafts where id = $1 and project_id = $2`, [
          draftId,
          projectId,
        ])
      ).rows[0] as { id: string; n: number } | undefined;
      if (!draft) return c.json({ error: "draft_not_found" }, 404);

      // figure number = document-order count of existing markers + 1 (REQ-VIZ-11 — never typed).
      let figureNumber = 1;
      if (store) {
        const head = await headVersionBytes(tx, store, projectId, `drafts/v${draft.n}.md`);
        if (head) {
          const md = Buffer.from(head.bytes).toString("utf8");
          figureNumber = (md.match(new RegExp(FIGURE_MARKER_RE.source, "g")) ?? []).length + 1;
        }
      }
      const n = (await figureVersions(tx, fig.id)).at(-1)?.ordinal ?? 1;
      const footnoteId = `fig${figureNumber}`;
      const markdown = figureBlockMarkdown({
        figureId: fig.id,
        version: n,
        alt: fig.alt,
        caption: fig.caption,
        figureNumber,
        footnoteId,
        sourceLine: fig.sourceLine,
      });
      const pending = {
        draftId,
        afterBlockId,
        version: n,
        markdown,
        at: deps.clock.now().toISOString(),
      };
      await tx.query(`update figures set pending_proposal = $2 where id = $1`, [
        fig.id,
        JSON.stringify(pending),
      ]);
      await emitFigureEvent(tx, deps, principal.workspaceId, projectId, "figure.proposed", {
        figureId: fig.id,
        draftId,
        version: n,
      });
      return c.json({ ok: true, pendingProposal: pending, block: markdown });
    });
  });

  // ---- accept (REQ-VIZ-9): ONE tx — the block splices through saveManualRevision (a frozen draft
  //      forks v(N+1) inside it — never mutated), the row flips to inserted, `figure.accepted`
  //      lands. NOT a direct UPDATE on a frozen draft (PRB.05's own rule). ----
  app.post("/projects/:id/figures/:figureId/proposals/accept", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "store_unavailable" }, 503);

    return deps.txRunner.run(principal.workspaceId, async (tx) => {
      const fig = await readFigureRow(tx, projectId, c.req.param("figureId"));
      if (!fig?.pendingProposal) return c.json({ error: "no_pending_proposal" }, 409);
      const pending = fig.pendingProposal;
      const draft = (
        await tx.query(`select id, n from drafts where id = $1 and project_id = $2`, [
          pending.draftId,
          projectId,
        ])
      ).rows[0] as { id: string; n: number } | undefined;
      if (!draft) return c.json({ error: "draft_not_found" }, 404);
      const head = await headVersionBytes(tx, store, projectId, `drafts/v${draft.n}.md`);
      const base = head ? Buffer.from(head.bytes).toString("utf8") : "";

      // splice AFTER the anchor block (or at the end) — block-aligned so the diff stays clean.
      const blocks = splitMarkdownBlocks(base);
      const anchorIdx = pending.afterBlockId
        ? blocks.findIndex((b) => b.blockId === pending.afterBlockId)
        : -1;
      const nextMd =
        anchorIdx >= 0
          ? (() => {
              const texts = blocks.map((b) => b.text);
              texts.splice(anchorIdx + 1, 0, pending.markdown);
              return texts.join("\n\n") + "\n";
            })()
          : base.trimEnd() + (base.trim() === "" ? "" : "\n\n") + pending.markdown + "\n";

      const saved = await saveManualRevision(
        tx,
        {
          ids: deps.ids,
          clock: deps.clock,
          store,
          eventWriter: {
            async append(exec, ev) {
              const parsedEv = parseRunEvent(ev.type, ev.payload);
              await exec.query(
                `insert into timeline_events(id, project_id, workspace_id, type, payload, at)
                 values ($1,$2,$3,$4,$5,$6)`,
                [
                  deps.ids("ev"),
                  projectId,
                  principal.workspaceId,
                  parsedEv.type,
                  JSON.stringify(parsedEv.payload),
                  ev.at ?? deps.clock.now(),
                ],
              );
            },
          },
        },
        {
          workspaceId: principal.workspaceId,
          projectId,
          draftId: pending.draftId,
          markdown: nextMd,
          userId: principal.userId,
        },
      );
      if (!saved.ok) return c.json({ error: saved.reason }, 409);

      await tx.query(
        `update figures
            set inserted_in_draft_id = $2, inserted_at_version_id = $3, pending_proposal = null
          where id = $1`,
        [fig.id, saved.draftId, saved.versionId],
      );
      await emitFigureEvent(tx, deps, principal.workspaceId, projectId, "figure.accepted", {
        figureId: fig.id,
        draftId: saved.draftId,
        draftVersionId: saved.versionId,
      });
      return c.json({
        ok: true,
        inserted: {
          figureId: fig.id,
          draftId: saved.draftId,
          draftN: saved.draftN,
          draftVersionId: saved.versionId,
          forked: saved.forked,
        },
      });
    });
  });

  // ---- reject: clear the pending proposal (the figure row + versions are untouched). ----
  app.post("/projects/:id/figures/:figureId/proposals/reject", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const fig = await readFigureRow(deps.db, projectId, c.req.param("figureId"));
    if (!fig) return c.json({ error: "not_found" }, 404);
    if (!fig.pendingProposal) return c.json({ error: "no_pending_proposal" }, 409);
    await deps.db.query(`update figures set pending_proposal = null where id = $1`, [fig.id]);
    return c.json({ ok: true });
  });

  // ---- the type-chip iterate (§7.5 "chart-type chip"): a 0-cr mark edit on the head
  //      spec.vl.json → new artifact version + figure_versions row + figure.render enqueue.
  //      Full prompt iterates stay a follow-up `/runs {kind:'figure'}` (1 cr). ----
  app.post("/projects/:id/figures/:figureId/spec-edit", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { mark?: unknown };
    if (typeof body.mark !== "string" || !VEGA_MARKS.has(body.mark)) {
      return c.json({ error: "bad_request", detail: "mark must be a Vega-Lite mark" }, 400);
    }
    const mark = body.mark;
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "store_unavailable" }, 503);

    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const fig = await readFigureRow(tx, projectId, c.req.param("figureId"));
      if (!fig) return c.json({ error: "not_found" }, 404);
      if (fig.specKind !== "vega_lite") {
        return c.json({ error: "chip_not_supported", specKind: fig.specKind }, 409);
      }
      const specPath = `assets/figures/${fig.id}/${SPEC_FILENAME[fig.specKind]}`;
      const head = await headVersionBytes(tx, store, projectId, specPath);
      if (!head) return c.json({ error: "spec_missing" }, 409);
      let spec: Record<string, unknown>;
      try {
        spec = JSON.parse(Buffer.from(head.bytes).toString("utf8")) as Record<string, unknown>;
      } catch {
        return c.json({ error: "spec_invalid" }, 409);
      }
      spec.mark =
        typeof spec.mark === "object" && spec.mark !== null
          ? { ...(spec.mark as Record<string, unknown>), type: mark }
          : mark;
      const verdict = validateVegaLiteSpec(spec);
      if (!verdict.ok) {
        return c.json({ error: "spec_invalid", detail: verdict.errors }, 422);
      }
      const bytes = new TextEncoder().encode(JSON.stringify(spec, null, 2));
      const persisted = await persistHarvest(
        tx,
        store,
        deps,
        {
          workspaceId: principal.workspaceId,
          projectId,
          createdBy: { kind: "user", userId: principal.userId },
        },
        [
          {
            path: specPath,
            root: "project",
            kind: "figure",
            namespace: "shared",
            sha256: sha256Hex(bytes),
            bytes,
            wordCount: 0,
          },
        ],
      );
      const specVersionId = persisted[0]?.versionId ?? null;
      const nextN = ((await figureVersions(tx, fig.id)).at(-1)?.ordinal ?? 0) + 1;
      await tx.query(
        `insert into figure_versions (id, figure_id, ordinal, request, spec_version_id, data_version_id, render_status, created_at)
         values ($1,$2,$3,$4,$5,$6,'pending',$7)`,
        [
          deps.ids("figv"),
          fig.id,
          nextN,
          `chip:${mark}`,
          specVersionId,
          fig.dataVersionId,
          deps.clock.now(),
        ],
      );
      await tx.query(`update figures set spec_version_id = $2 where id = $1`, [fig.id, specVersionId]);
      return c.json({ ok: true, n: nextN, specVersionId });
    });
    if (res.ok) {
      const fig = await readFigureRow(deps.db, projectId, c.req.param("figureId"));
      if (fig) await enqueueRender(deps, principal.workspaceId, fig, "chip");
    }
    return res;
  });

  // ---- restore (§7.5 "Restore v_n"): copy the version's spec/data/provenance back to head as a
  //      NEW figure_versions row (the version dir itself is never rewritten) + re-render. ----
  app.post("/projects/:id/figures/:figureId/versions/:n/restore", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const n = Number(c.req.param("n"));
    if (!Number.isInteger(n) || n < 1) return c.json({ error: "bad_request" }, 400);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "store_unavailable" }, 503);

    const out = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const fig = await readFigureRow(tx, projectId, c.req.param("figureId"));
      if (!fig) return { status: 404 as const };
      const vdir = `assets/figures/${fig.id}/versions/${n}`;
      const leaves = [SPEC_FILENAME[fig.specKind], "data.csv", "provenance.json"];
      const files: NewVersion[] = [];
      let provenance: FigureProvenance | null = null;
      for (const leaf of leaves) {
        const b = await headVersionBytes(tx, store, projectId, `${vdir}/${leaf}`);
        if (!b) continue;
        if (leaf === "provenance.json") {
          const p = figureProvenanceSchema.safeParse(
            JSON.parse(Buffer.from(b.bytes).toString("utf8")),
          );
          if (p.success) provenance = p.data;
        }
        files.push({
          path: `assets/figures/${fig.id}/${leaf}`,
          root: "project",
          kind: "figure",
          namespace: "shared",
          sha256: b.sha256,
          bytes: b.bytes,
          wordCount: 0,
        });
      }
      if (files.length === 0) return { status: 404 as const };
      const persisted = await persistHarvest(
        tx,
        store,
        deps,
        {
          workspaceId: principal.workspaceId,
          projectId,
          createdBy: { kind: "user", userId: principal.userId },
        },
        files,
      );
      const specV = persisted.find((p) => p.path.endsWith(SPEC_FILENAME[fig.specKind]));
      const dataV = persisted.find((p) => p.path.endsWith("data.csv"));
      const nextN = ((await figureVersions(tx, fig.id)).at(-1)?.ordinal ?? 0) + 1;
      await tx.query(
        `insert into figure_versions (id, figure_id, ordinal, request, spec_version_id, data_version_id, render_status, created_at)
         values ($1,$2,$3,$4,$5,$6,'pending',$7)`,
        [
          deps.ids("figv"),
          fig.id,
          nextN,
          `restore:${n}`,
          specV?.versionId ?? fig.specVersionId,
          dataV?.versionId ?? fig.dataVersionId,
          deps.clock.now(),
        ],
      );
      await tx.query(
        `update figures set spec_version_id = $2, data_version_id = $3,
           provenance = coalesce($4, provenance)
         where id = $1`,
        [
          fig.id,
          specV?.versionId ?? fig.specVersionId,
          dataV?.versionId ?? fig.dataVersionId,
          provenance ? JSON.stringify(provenance) : null,
        ],
      );
      return { status: 200 as const };
    });
    if (out.status === 404) return c.json({ error: "not_found" }, 404);
    const fig = await readFigureRow(deps.db, projectId, c.req.param("figureId"));
    if (fig) await enqueueRender(deps, principal.workspaceId, fig, `restore:${n}`);
    return c.json({ ok: true });
  });

  // ---- lazy PNG@2x (§7.5): first request renders + persists `render@2x.png`; later ones serve
  //      the stored bytes. Table figures have no raster — 404. ----
  app.get("/projects/:id/figures/:figureId/render.png", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const fig = await readFigureRow(deps.db, projectId, c.req.param("figureId"));
    if (!fig || fig.specKind === "table") return c.json({ error: "not_found" }, 404);
    const store = await storeFor(principal.workspaceId);
    if (!store) return c.json({ error: "store_unavailable" }, 503);

    const cached = await assetBytes(deps.db, store, projectId, fig.id, "render@2x.png");
    if (cached) {
      return new Response(new Uint8Array(cached), { headers: { "content-type": "image/png" } });
    }
    const svg = await assetBytes(deps.db, store, projectId, fig.id, "render.svg");
    if (!svg) return c.json({ error: "not_rendered" }, 404);
    const png = await renderPng2x(Buffer.from(svg).toString("utf8"));
    if (!png) return c.json({ error: "rasterizer_unavailable" }, 501);
    await persistHarvest(
      deps.db,
      store,
      deps,
      { workspaceId: principal.workspaceId, projectId, createdBy: { kind: "system" } },
      [
        {
          path: `assets/figures/${fig.id}/render@2x.png`,
          root: "project",
          kind: "figure",
          namespace: "shared",
          sha256: sha256Hex(png),
          bytes: png,
          wordCount: 0,
        },
      ],
    );
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
  });

  return app;
}
