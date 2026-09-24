// P1.07 — the findings-surface write/read routes (§5.7; REQ-SPEC-6 Apply, REQ-IDE-26 promote,
// REQ-OBJ-9 "Add to obligations", the shared deep link, and the one-preview bulk actions). Thin Hono
// adapters over the shared derivations: `applyGate`/`applySuggestionToMarkdown`/`buildBulkPreview`
// from findings-core, `recordDispositionInTx` (the SAME write the five-verb POST takes — no second
// path), the obligations package's spawn/add seams, and mirror's `saveManualRevision` with the
// `suggestion_applied` provenance mark. Tenant-scoped like the triage routes; deterministic under PGlite.

import { Hono } from "hono";
import type { Actor, Anchor, DispositionKind, Finding, Severity } from "@rhema/contracts";
import {
  applySuggestionToMarkdown,
  buildBulkPreview,
  buildFindingView,
  applyGate,
  bulkSelect,
  validateDisposition,
  type BulkAction,
} from "@rhema/findings-core";
import {
  addToObligations,
  spawnObligationFromFinding,
  spawnsAtDelivery,
  type ObligationDeps,
} from "@rhema/obligations";
import { saveManualRevision } from "@rhema/mirror";
import { resolveEditorHead, versionText } from "./editor-routes.js";
import {
  toDispositionState,
  toFinding,
  type DispositionRow,
  type FindingRow as DossierFindingRow,
} from "./dossier-routes.js";
import {
  DispositionFrozenError,
  recordDispositionInTx,
  type FindingRow,
  type TriageApiDeps,
} from "./triage-routes.js";

export type FindingApiDeps = TriageApiDeps & {
  /** emits `finding.applied` / `findings.bulk_*` analytics (server-owned facts — never client-minted). */
  emitFindingEvent?: (e: {
    userId: string;
    workspaceId: string;
    projectId: string;
    name: "finding.applied" | "findings.bulk_previewed" | "findings.bulk_applied";
    props: { severity?: string; count?: number };
  }) => void;
};

const BULK_ACTIONS: readonly BulkAction[] = ["apply_notes", "defer_minor", "accept_section"];

interface FindingJoinRow extends FindingRow {
  anchor: Anchor | null;
  suggestion: { replacement: string } | null;
  reconciliation: "kept" | "rejected" | null;
  letter_section: string | null;
  run_id: string | null;
}

/** The finding + its review's run, tenant-scoped (a cross-workspace id reads not_found — never a leak). */
async function loadFinding(
  deps: FindingApiDeps,
  projectId: string,
  workspaceId: string,
  findingId: string,
): Promise<FindingJoinRow | undefined> {
  return (
    await deps.db.query(
      `select f.id, f.correspondence_id, f.draft_id, f.ordinal, f.kind, f.severity, f.title,
              f.anchor, f.suggestion, f.reconciliation, f.letter_section,
              ci.project_id, ci.run_id, p.workspace_id
         from findings f
         join correspondence_items ci on ci.id = f.correspondence_id
         join projects p on p.id = ci.project_id
        where f.id = $1 and ci.project_id = $2 and p.workspace_id = $3`,
      [findingId, projectId, workspaceId],
    )
  ).rows[0] as FindingJoinRow | undefined;
}

/** The finding's live disposition row → the read-model state (undefined when undecided). */
async function liveDisposition(
  tx: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  findingId: string,
): Promise<ReturnType<typeof toDispositionState> | undefined> {
  const r = (
    await tx.query(
      `select id, finding_id, kind, rationale, adapted_text, reason_code, applied, by_actor,
              move_ordinal, frozen_at, created_at
         from dispositions where finding_id = $1 and response_id is null
         order by created_at desc limit 1`,
      [findingId],
    )
  ).rows[0] as DispositionRow | undefined;
  return r ? toDispositionState(r) : undefined;
}

/** The run's findings as FindingView[] — the same ONE-model read the dossier surfaces. */
async function runFindingViews(
  tx: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  projectId: string,
  runId: string,
): Promise<{ views: ReturnType<typeof buildFindingView>[]; rows: FindingJoinRow[]; draftId: string } | null> {
  const corr = (
    await tx.query(
      `select id, draft_id from correspondence_items
        where project_id = $1 and run_id = $2 and kind = 'review'`,
      [projectId, runId],
    )
  ).rows[0] as { id: string; draft_id: string } | undefined;
  if (!corr) return null;
  const rows = (
    await tx.query(
      `select f.id, f.correspondence_id, f.draft_id, f.ordinal, f.kind, f.severity, f.origin,
              f.reconciliation, f.anchor, f.title, f.body, f.evidence, f.suggestion, f.rubric_dims,
              f.letter_section, ci.run_id, ci.project_id
         from findings f join correspondence_items ci on ci.id = f.correspondence_id
        where f.correspondence_id = $1 order by f.ordinal`,
      [corr.id],
    )
  ).rows as (DossierFindingRow & { run_id: string; project_id: string })[];
  const dispositions = (
    await tx.query(
      `select d.id, d.finding_id, d.kind, d.rationale, d.adapted_text, d.reason_code, d.applied,
              d.by_actor, d.move_ordinal, d.frozen_at, d.created_at
         from dispositions d join findings f on f.id = d.finding_id
        where f.correspondence_id = $1 and d.response_id is null
        order by d.created_at desc`,
      [corr.id],
    )
  ).rows as DispositionRow[];
  const latest = new Map<string, ReturnType<typeof toDispositionState>>();
  for (const d of dispositions) if (!latest.has(d.finding_id)) latest.set(d.finding_id, toDispositionState(d));
  const views = rows.map((r) =>
    buildFindingView(toFinding(r), { ...(latest.has(r.id) ? { disposition: latest.get(r.id)! } : {}) }),
  );
  return {
    views,
    rows: rows.map((r) => ({
      id: r.id,
      correspondence_id: r.correspondence_id,
      draft_id: r.draft_id,
      ordinal: r.ordinal,
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      anchor: r.anchor,
      suggestion: r.suggestion ?? null,
      reconciliation: r.reconciliation ?? null,
      letter_section: r.letter_section ?? null,
      project_id: projectId,
      workspace_id: "",
      run_id: r.run_id,
    })),
    draftId: corr.draft_id,
  };
}

/** The markdown Apply splices: the reviewed draft's editable head (its working child when forked). */
async function headMarkdown(
  deps: FindingApiDeps,
  exec: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  workspaceId: string,
  projectId: string,
  draftId: string,
): Promise<{ headId: string; markdown: string } | null> {
  const head = await resolveEditorHead(exec, projectId, draftId);
  if (!head) return null;
  const store = deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store;
  if (!store) return null;
  const v = await versionText(store, exec, head.promoted_version_id);
  if (!v) return null;
  return { headId: head.id, markdown: v.text };
}

export function createFindingRoutes(deps: FindingApiDeps): Hono {
  const app = new Hono();
  const oblDeps: ObligationDeps = { ids: deps.ids, clock: deps.clock };

  const ownProject = async (c: { req: { param(n: string): string } }, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  // ---- Apply — the free verb (REQ-SPEC-6, §5.7). Splice the suggestion into the working head at the
  //      anchor's resolved span, provenance-mark the block `suggestion_applied`, record accept·applied,
  //      route the obligation — all inside ONE tenant transaction. ----
  app.post("/projects/:id/findings/:fid/apply", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const findingId = c.req.param("fid");
    const finding = await loadFinding(deps, projectId, principal.workspaceId, findingId);
    if (!finding) return c.json({ error: "not_found" }, 404);
    if (!finding.run_id) return c.json({ error: "not_found" }, 404);
    const byActor: Actor = { kind: "user", userId: principal.userId };

    try {
      const dto = await deps.txRunner.run(principal.workspaceId, async (tx) => {
        const disposition = await liveDisposition(tx, findingId);
        const gate = applyGate({
          id: finding.id,
          correspondenceId: finding.correspondence_id,
          draftId: finding.draft_id,
          kind: finding.kind as Finding["kind"],
          severity: finding.severity as Severity,
          origin: "editor",
          anchor: finding.anchor,
          title: finding.title,
          body: "",
          rubricDims: [],
          letterSection: (finding.letter_section ?? undefined) as Finding["letterSection"],
          provisional: false,
          ...(finding.suggestion ? { suggestion: finding.suggestion } : {}),
          ...(disposition ? { disposition } : {}),
        });
        if (!gate.ok) return { error: "not_applyable" as const, reason: gate.reason };

        const head = await headMarkdown(deps, tx, principal.workspaceId, projectId, finding.draft_id);
        if (!head) return { error: "no_head" as const };
        const splice = applySuggestionToMarkdown(
          head.markdown,
          finding.anchor,
          finding.suggestion!.replacement,
        );
        if (!splice.ok) return { error: splice.reason === "no_anchor" ? ("no_anchor" as const) : ("anchor_lost" as const) };

        const store = deps.contentStoreFor
          ? await deps.contentStoreFor(principal.workspaceId)
          : deps.store;
        if (!store) return { error: "no_store" as const };
        const saved = await saveManualRevision(
          tx,
          { store, ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter },
          {
            workspaceId: principal.workspaceId,
            projectId,
            draftId: head.headId,
            markdown: splice.markdown,
            userId: principal.userId,
            appliedSuggestions: [
              { blockId: splice.blockId, runId: finding.run_id!, findingId },
            ],
          },
        );
        if (!saved.ok) return { error: "not_editable" as const };

        const dispositionDto = await recordDispositionInTx(tx, deps, oblDeps, {
          projectId,
          finding,
          normalized: { kind: "accept", applied: true },
          byActor,
        });
        return { ok: true as const, draftId: saved.draftId, draftN: saved.draftN, versionId: saved.versionId, disposition: dispositionDto };
      });
      if ("error" in dto) {
        // a frozen card is a conflict (the ledger locked at delivery); the rest are unprocessable.
        const reason = (dto as { reason?: string }).reason;
        const status = dto.error === "not_applyable" && reason === "frozen" ? 409
          : dto.error === "not_applyable" || dto.error === "anchor_lost" || dto.error === "no_anchor" ? 422
          : 409;
        return c.json({ error: dto.error, ...(reason != null ? { reason } : {}) }, status);
      }
      deps.emitFindingEvent?.({
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId,
        name: "finding.applied",
        props: { severity: finding.severity },
      });
      return c.json(dto, 200);
    } catch (e) {
      if (e instanceof DispositionFrozenError) return c.json({ error: "frozen" }, 409);
      throw e;
    }
  });

  // ---- Promote — a reconciliation-rejected second-read finding joins the main list; a blocking/major
  //      row spawns its obligation on promotion (REQ-IDE-26 — it spawned nothing at delivery). ----
  app.post("/projects/:id/findings/:fid/promote", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const findingId = c.req.param("fid");
    const finding = await loadFinding(deps, projectId, principal.workspaceId, findingId);
    if (!finding) return c.json({ error: "not_found" }, 404);
    if (finding.reconciliation !== "rejected") return c.json({ error: "not_rejected" }, 409);
    const byActor: Actor = { kind: "user", userId: principal.userId };

    const obligationId = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      await tx.query(`update findings set reconciliation = 'kept' where id = $1`, [findingId]);
      if (!spawnsAtDelivery(finding.severity as Severity)) return null;
      return spawnObligationFromFinding(tx, oblDeps, {
        projectId,
        findingId,
        severity: finding.severity as Severity,
        kind: finding.kind,
        title: finding.title,
        correspondenceId: finding.correspondence_id,
        draftId: finding.draft_id,
        runId: finding.run_id,
        byActor,
      });
    });
    return c.json({ ok: true, findingId, ...(obligationId ? { obligationId } : {}) }, 200);
  });

  // ---- "Add to obligations" (REQ-OBJ-9): any finding, user-sourced, append-only transitions. ----
  app.post("/projects/:id/findings/:fid/obligations", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const findingId = c.req.param("fid");
    const finding = await loadFinding(deps, projectId, principal.workspaceId, findingId);
    if (!finding) return c.json({ error: "not_found" }, 404);
    const obligationId = await deps.txRunner.run(principal.workspaceId, async (tx) =>
      addToObligations(tx, oblDeps, {
        projectId,
        draftId: finding.draft_id,
        title: finding.title,
        severity: finding.severity as Severity,
        kind: finding.kind,
        byActor: { kind: "user", userId: principal.userId },
        findingId,
        correspondenceId: finding.correspondence_id,
        runId: finding.run_id,
      }),
    );
    return c.json({ ok: true, obligationId }, 200);
  });

  // ---- REQ-OBJ-10 — the palette's free-form obligation (`source: 'user'`, standing): the
  //      row-creation path any surface's "New obligation" posts to. No finding, no lineage. ----
  app.post("/projects/:id/obligations", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { title?: string; severity?: string };
    const title = (body.title ?? "").trim();
    if (!title) return c.json({ error: "title_required" }, 422);
    const severity = (["blocking", "major", "minor", "note"] as const).includes(body.severity as never)
      ? (body.severity as Severity)
      : "minor";
    const obligationId = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const head = (
        await tx.query(`select id from drafts where project_id = $1 order by n desc limit 1`, [projectId])
      ).rows[0] as { id: string } | undefined;
      if (!head) return null;
      return addToObligations(tx, oblDeps, {
        projectId,
        draftId: head.id,
        title,
        severity,
        byActor: { kind: "user", userId: principal.userId },
      });
    });
    if (!obligationId) return c.json({ error: "no_draft" }, 409);
    return c.json({ ok: true, obligationId }, 200);
  });

  // ---- the shared deep link: finding → its dossier anchor (§5.7; the palette + cross-page links). ----
  app.get("/projects/:id/findings/:fid/resolve", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const finding = await loadFinding(deps, c.req.param("id"), principal.workspaceId, c.req.param("fid"));
    if (!finding || !finding.run_id) return c.json({ error: "not_found" }, 404);
    return c.json({ findingId: finding.id, runId: finding.run_id, anchor: `finding-${finding.id}` });
  });

  // ---- the bulk preview (§5.7): one consolidated checklist — verb, spliced diff, obligation — the
  //      dispatch writes only what the preview showed. ----
  app.post("/projects/:id/runs/:rid/findings/bulk-preview", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const runId = c.req.param("rid");
    const body = (await c.req.json().catch(() => ({}))) as { action?: string; section?: string };
    if (!BULK_ACTIONS.includes(body.action as BulkAction)) {
      return c.json({ error: "invalid_action" }, 422);
    }
    const preview = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const data = await runFindingViews(tx, projectId, runId);
      if (!data) return null;
      const head = await headMarkdown(deps, tx, principal.workspaceId, projectId, data.draftId);
      return buildBulkPreview(data.views, body.action as BulkAction, head?.markdown ?? "", {
        ...(body.section != null ? { section: body.section } : {}),
      });
    });
    if (!preview) return c.json({ error: "not_found" }, 404);
    deps.emitFindingEvent?.({
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId,
      name: "findings.bulk_previewed",
      props: {},
    });
    return c.json(preview);
  });

  // ---- the bulk dispatch: the preview's rows write, each through the shared disposition path. ----
  app.post("/projects/:id/runs/:rid/findings/bulk", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    const runId = c.req.param("rid");
    const body = (await c.req.json().catch(() => ({}))) as { action?: string; section?: string; only?: string[] };
    if (!BULK_ACTIONS.includes(body.action as BulkAction)) {
      return c.json({ error: "invalid_action" }, 422);
    }
    const byActor: Actor = { kind: "user", userId: principal.userId };

    try {
      const result = await deps.txRunner.run(principal.workspaceId, async (tx) => {
        const data = await runFindingViews(tx, projectId, runId);
        if (!data) return null;
        const action = body.action as BulkAction;
        const head = await headMarkdown(deps, tx, principal.workspaceId, projectId, data.draftId);
        // `only` is the preview checklist's checked subset — the dispatch writes exactly what the
        // consolidated preview showed (unchecked rows are never touched; §5.7 "no blind accept-all").
        const selected = bulkSelect(data.views, action, body.section);
        const only = Array.isArray(body.only) ? new Set(body.only) : null;
        const covered = only == null ? selected : selected.filter((v) => only.has(v.id));
        const byId = new Map(data.rows.map((r) => [r.id, r]));
        const applied: string[] = [];
        const skipped: { findingId: string; reason: string }[] = [];

        if (action === "apply_notes") {
          // one save carries every splice — sequential resolution on the evolving markdown, then a
          // single content-addressed version + provenance marks per spliced block.
          if (!head) return { error: "no_head" as const };
          let markdown = head.markdown;
          const marks: { blockId: string; runId: string; findingId: string }[] = [];
          const splices: string[] = [];
          for (const v of covered) {
            const row = byId.get(v.id)!;
            const splice = applySuggestionToMarkdown(markdown, row.anchor, row.suggestion!.replacement);
            if (!splice.ok) {
              skipped.push({ findingId: v.id, reason: splice.reason });
              continue;
            }
            markdown = splice.markdown;
            marks.push({ blockId: splice.blockId, runId: row.run_id ?? runId, findingId: v.id });
            splices.push(v.id);
          }
          if (splices.length > 0) {
            const store = deps.contentStoreFor
              ? await deps.contentStoreFor(principal.workspaceId)
              : deps.store;
            if (!store) return { error: "no_store" as const };
            const saved = await saveManualRevision(
              tx,
              { store, ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter },
              {
                workspaceId: principal.workspaceId,
                projectId,
                draftId: head.headId,
                markdown,
                userId: principal.userId,
                appliedSuggestions: marks,
              },
            );
            if (!saved.ok) return { error: "not_editable" as const };
          }
          for (const id of splices) {
            await recordDispositionInTx(tx, deps, oblDeps, {
              projectId,
              finding: byId.get(id)!,
              normalized: { kind: "accept", applied: true },
              byActor,
            });
            applied.push(id);
          }
        } else {
          for (const v of covered) {
            const kind: DispositionKind = action === "defer_minor" ? "defer" : "accept";
            const norm = validateDisposition({ kind });
            if (!norm.ok) {
              skipped.push({ findingId: v.id, reason: norm.error ?? "invalid" });
              continue;
            }
            await recordDispositionInTx(tx, deps, oblDeps, {
              projectId,
              finding: byId.get(v.id)!,
              normalized: norm.normalized,
              byActor,
            });
            applied.push(v.id);
          }
        }
        return { ok: true as const, applied, skipped, count: applied.length };
      });
      if (result == null) return c.json({ error: "not_found" }, 404);
      if ("error" in result) return c.json({ error: result.error }, 409);
      deps.emitFindingEvent?.({
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        projectId,
        name: "findings.bulk_applied",
        props: { count: result.count },
      });
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof DispositionFrozenError) return c.json({ error: "frozen" }, 409);
      throw e;
    }
  });

  return app;
}
