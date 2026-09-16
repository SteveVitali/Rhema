import { Hono } from "hono";
import {
  EXPORT_FORMAT_INFO,
  EXPORT_FORMATS,
  aiUseFileName,
  exportFileName,
  isExportFormat,
  type Actor,
  type ExportFormat,
} from "@rhema/contracts";
import type { ContentStore } from "@rhema/mirror";
import {
  exportDialogObligations,
  liveObligations,
  sweepArrivedDeferrals,
  type ObligationDeps,
} from "@rhema/obligations";
import {
  appendAddition,
  attachmentSection,
  loadStatement,
  statementMarkdown,
  AdditionError,
  type AiUseStatement,
} from "@rhema/ai-use";
import type { SqlClient, TxRunner } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";
import { resolveEditorHead, versionText, type DraftHeadRow } from "./editor-routes.js";

// PRB.11 — export + the AI-use statement (§13.4, §8.4 REQ-VIS-10, §11.7). The conversion itself runs ONLY
// in the isolated `export` container (AC5): the api holds an `ExportRunner` seam (the Converter pattern from
// PRB.02) that POSTs the markdown + format to the export service and returns the bytes — no pandoc here.
// Export NEVER blocks on obligations (§11.7): the dialog surfaces the count line + links; the export POST
// runs the `pre_export` horizon sweep, counts, and — when the attach toggle is on — embeds the generated
// obligation sentence in the statement section. The statement's generated sentences are recomputed from
// run rows on every read; user additions are append-only (`POST .../additions` is the ONLY write — no
// update/delete route exists anywhere).

/** The conversion seam — implemented by `createServiceExportRunner` (live) or a test double. */
export interface ExportRunner {
  run(args: {
    markdown: string;
    format: ExportFormat;
  }): Promise<{ bytes: Uint8Array; mediaType: string; extension: string }>;
}

/** The live binding: POST {markdown, format} to the export Cloud Run service (§12.1). The api never sees
 *  pandoc — it sends canonical markdown and receives converted bytes. */
export function createServiceExportRunner(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ExportRunner {
  return {
    async run({ markdown, format }) {
      const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown, format }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`export service ${res.status}: ${text.slice(0, 300)}`);
      }
      const info = EXPORT_FORMAT_INFO[format];
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mediaType: res.headers.get("content-type") ?? info.mediaType,
        extension: info.extension,
      };
    },
  };
}

export interface ExportApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** the raw SQL client for project-scoped ownership reads (same seam the triage/editor routes take). */
  db: SqlClient;
  txRunner: TxRunner;
  ids: (prefix?: string) => string;
  clock: { now(): Date };
  /** content store for the draft's canonical markdown (readable store — the workspace-scoped variant wins). */
  store?: ContentStore;
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  /** unset ⇒ POST /export answers 503 (a deploy without the export service stays green). */
  exportRunner?: ExportRunner;
}

interface ObligationItemDto {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly state: string;
  readonly findingId: string | null;
  /** the review run the obligation's root finding was filed on — the dialog's link target. */
  readonly reviewRunId: string | null;
}

interface StatementDto {
  readonly template: string;
  readonly generated: readonly string[];
  readonly additions: readonly { id: string; sentence: string; createdAt: string }[];
  readonly markdown: string;
  readonly openObligations: number;
  readonly blockingOpen: number;
  readonly generatedAt: string;
}

function statementDto(s: AiUseStatement): StatementDto {
  return {
    template: s.template,
    generated: s.generated,
    additions: s.additions.map((a) => ({
      id: a.id,
      sentence: a.sentence,
      createdAt: a.createdAt.toISOString(),
    })),
    markdown: statementMarkdown(s, { standalone: true }),
    openObligations: s.openObligations,
    blockingOpen: s.blockingOpen,
    generatedAt: s.generatedAt.toISOString(),
  };
}

export function createExportRoutes(deps: ExportApiDeps): Hono {
  const app = new Hono();
  const oblDeps: ObligationDeps = { ids: deps.ids, clock: deps.clock };

  const ownProject = async (
    projectId: string,
    workspaceId: string,
  ): Promise<{ slug: string } | null> => {
    const r = (
      await deps.db.query(`select workspace_id, slug from projects where id = $1`, [projectId])
    ).rows[0] as { workspace_id: string; slug: string } | undefined;
    return r != null && r.workspace_id === workspaceId ? { slug: r.slug } : null;
  };

  /** Sweep the pre_export horizon, then count + list the open obligations (§11.7: informational only —
   *  nothing here can block the export). */
  const dialogState = async (tx: SqlClient, projectId: string, byActor: Actor) => {
    const returnedIds = await sweepArrivedDeferrals(tx, oblDeps, {
      projectId,
      context: "pre_export",
      byActor,
    });
    const counts = await exportDialogObligations(tx, projectId);
    const live = await liveObligations(tx, projectId);
    const open = live.filter((o) => o.state === "open" || o.state === "reopened");
    // obligation → the review run its root finding was filed on (the dialog's link target).
    const runIds = new Map<string, string>();
    if (open.length > 0) {
      const rows = (
        await tx.query(
          `select of.obligation_id, ci.run_id
             from obligation_findings of join correspondence_items ci on ci.id = of.correspondence_id
            where of.obligation_id = any($1::text[]) and of.relation = 'root'`,
          [open.map((o) => o.id)],
        )
      ).rows as { obligation_id: string; run_id: string }[];
      for (const r of rows) runIds.set(r.obligation_id, r.run_id);
    }
    const items: ObligationItemDto[] = open.map((o) => ({
      id: o.id,
      title: o.title,
      severity: o.severity,
      state: o.state,
      findingId: o.findingId,
      reviewRunId: runIds.get(o.id) ?? null,
    }));
    return { counts, items, returnedIds };
  };

  /** Facts → statement, composed with the post-sweep counts (the obligation sentence is generated iff
   *  obligations are open). */
  const statement = async (tx: SqlClient, projectId: string, counts: { open: number; blockingOpen: number }) =>
    loadStatement(tx, {
      projectId,
      openObligations: counts.open,
      blockingOpen: counts.blockingOpen,
      now: deps.clock.now(),
    });

  // ---- the export dialog read: formats, the (never-blocking) obligation line + links, the statement
  //      preview, and the pre_export horizon sweep (a deferred obligation whose horizon is 'pre_export'
  //      returns to open here — REQ-OBJ-3). ----
  app.get("/projects/:id/export/dialog", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const owned = await ownProject(projectId, principal.workspaceId);
    if (!owned) return c.json({ error: "not_found" }, 404);

    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const { counts, items, returnedIds } = await dialogState(tx, projectId, {
        kind: "user",
        userId: principal.userId,
      });
      const stmt = await statement(tx, projectId, counts);
      if (!stmt) return { ok: false as const };
      return {
        ok: true as const,
        dto: {
          projectId,
          formats: EXPORT_FORMATS.map((f) => ({
            id: f,
            label: EXPORT_FORMAT_INFO[f].label,
            extension: EXPORT_FORMAT_INFO[f].extension,
          })),
          obligations: {
            blockingOpen: counts.blockingOpen,
            open: counts.open,
            line: counts.line,
            items,
            returnedIds,
          },
          statement: statementDto(stmt),
        },
      };
    });
    if (!res.ok) return c.json({ error: "not_found" }, 404);
    return c.json(res.dto);
  });

  // ---- the export itself: canonical markdown (optionally + the AI-use section) → the export container →
  //      binary download. Open obligations NEVER block (§11.7). ----
  app.post("/projects/:id/export", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const owned = await ownProject(projectId, principal.workspaceId);
    if (!owned) return c.json({ error: "not_found" }, 404);
    if (!deps.exportRunner) return c.json({ error: "export_not_wired" }, 503);

    const body = (await c.req.json().catch(() => ({}))) as {
      format?: unknown;
      draftId?: unknown;
      attachAiUse?: unknown;
    };
    if (!isExportFormat(body.format)) {
      return c.json({ error: "unsupported_format", formats: [...EXPORT_FORMATS] }, 422);
    }
    const format = body.format;
    const store =
      (deps.contentStoreFor ? await deps.contentStoreFor(principal.workspaceId) : deps.store) ?? null;

    const prepared = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      // The head: the named draft (resolved like the editor — a frozen base with a working human-revision
      // child exports the child's text) or, unset, the highest-n head.
      let head: DraftHeadRow | undefined;
      if (typeof body.draftId === "string" && body.draftId) {
        head = await resolveEditorHead(tx, projectId, body.draftId);
      } else {
        const row = (
          await tx.query(
            `select id from drafts where project_id = $1 order by n desc limit 1`,
            [projectId],
          )
        ).rows[0] as { id: string } | undefined;
        if (row) head = await resolveEditorHead(tx, projectId, row.id);
      }
      if (!head) return { ok: false as const, reason: "not_found" };

      const versionId =
        head.promoted_version_id ??
        (head.base_draft_id
          ? ((
              await tx.query("select promoted_version_id from drafts where id = $1", [head.base_draft_id])
            ).rows[0] as { promoted_version_id: string | null } | undefined)?.promoted_version_id ?? null
          : null);
      const text = await versionText(store, tx, versionId);
      if (!text || text.text.trim() === "") return { ok: false as const, reason: "empty_draft" };

      // The export moment IS the pre_export horizon: sweep first so the statement's obligation sentence and
      // the dialog's count agree (§11.7; the sweep is informational, never a gate).
      const { counts } = await dialogState(tx, projectId, { kind: "user", userId: principal.userId });
      let markdown = text.text;
      if (body.attachAiUse === true) {
        const stmt = await statement(tx, projectId, counts);
        if (stmt) markdown = `${text.text.trimEnd()}${attachmentSection(stmt)}`;
      }
      return { ok: true as const, markdown };
    });
    if (!prepared.ok) return c.json({ error: prepared.reason }, prepared.reason === "empty_draft" ? 422 : 404);

    const result = await deps.exportRunner.run({ markdown: prepared.markdown, format });
    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "content-type": result.mediaType,
        "content-disposition": `attachment; filename="${exportFileName(owned.slug, format)}"`,
      },
    });
  });

  // ---- the AI-use statement: JSON read, or ?format=md|txt|docx for the standalone download. The
  //      generated sentences are recomputed from run rows on every read — they cannot be removed or edited
  //      through the API (there is no route that writes them at all). ----
  app.get("/projects/:id/ai-use", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const owned = await ownProject(projectId, principal.workspaceId);
    if (!owned) return c.json({ error: "not_found" }, 404);

    const formatParam = c.req.query("format");
    if (formatParam !== undefined && !isExportFormat(formatParam)) {
      return c.json({ error: "unsupported_format", formats: [...EXPORT_FORMATS] }, 422);
    }

    const stmt = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const { counts } = await dialogState(tx, projectId, { kind: "user", userId: principal.userId });
      return statement(tx, projectId, counts);
    });
    if (!stmt) return c.json({ error: "not_found" }, 404);

    if (formatParam === undefined) return c.json(statementDto(stmt));
    // the standalone download — markdown is rendered here; txt/docx go through the export container.
    if (!deps.exportRunner) return c.json({ error: "export_not_wired" }, 503);
    const markdown = statementMarkdown(stmt, { standalone: true });
    const result = await deps.exportRunner.run({ markdown, format: formatParam });
    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "content-type": result.mediaType,
        "content-disposition": `attachment; filename="${aiUseFileName(formatParam)}"`,
      },
    });
  });

  // ---- the ONLY statement write: append one author sentence (REQ-VIS-10 — append, never remove). ----
  app.post("/projects/:id/ai-use/additions", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const owned = await ownProject(projectId, principal.workspaceId);
    if (!owned) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => ({}))) as { sentence?: unknown };
    const sentence = typeof body.sentence === "string" ? body.sentence : "";
    if (!sentence.trim()) return c.json({ error: "sentence required" }, 400);
    try {
      const addition = await deps.txRunner.run(principal.workspaceId, (tx) =>
        appendAddition(tx, { ids: deps.ids, clock: deps.clock }, {
          workspaceId: principal.workspaceId,
          projectId,
          sentence,
          byActor: { kind: "user", userId: principal.userId },
        }),
      );
      return c.json(
        {
          id: addition.id,
          sentence: addition.sentence,
          createdAt: addition.createdAt.toISOString(),
        },
        201,
      );
    } catch (e) {
      if (e instanceof AdditionError) return c.json({ error: e.reason }, 422);
      throw e;
    }
  });

  return app;
}
