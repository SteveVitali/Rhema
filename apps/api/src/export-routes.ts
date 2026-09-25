import { Hono } from "hono";
import {
  CSL_STYLES,
  CSL_STYLE_INFO,
  EXPORT_FORMAT_INFO,
  EXPORT_FORMATS,
  figureExportPackage,
  figureIdFromRef,
  isCslStyle,
  isExportFormat,
  isMdExportProfile,
  MD_EXPORT_PROFILE_INFO,
  MD_EXPORT_PROFILES,
  parseFigureMarker,
  PROVENANCE_APPENDIX_FORMATS,
  aiUseFileName,
  exportFileName,
  type Actor,
  type CslStyle,
  type ExportFigure,
  type ExportFormat,
  type FigureExportFormat,
  type FigureProvenance,
  type MdExportProfile,
  type ProvenanceSpan,
  SPEC_FILENAME,
} from "@rhema/contracts";
import {
  renderProvenanceAppendix,
  PROVENANCE_APPENDIX_LABEL,
  type ContentStore,
} from "@rhema/mirror";
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
import { recordAnalyticsEvent } from "@rhema/ledger";
import type { Principal } from "./run-routes.js";
import { showcaseReadOnlyGuard } from "./showcase.js";
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
    /** `md`-only profile (`substack`) — the container rejects it on any other format. */
    profile?: MdExportProfile | null;
    /** CSL style for `--citeproc` (honored only when `bibliography` is present). */
    cslStyle?: CslStyle | null;
    /** CSL-JSON items text (`bibliography/csl.json` bytes) — enables citeproc. */
    bibliography?: string | null;
    /** api-resolved figure payloads (REQ-VIZ-15). */
    figures?: readonly ExportFigure[] | null;
  }): Promise<{ bytes: Uint8Array; mediaType: string; extension: string }>;
}

/** The live binding: POST {markdown, format} to the export Cloud Run service (§12.1). The api never sees
 *  pandoc — it sends canonical markdown and receives converted bytes. The export service is invoker-gated
 *  (internal services have no allUsers grant — compute.ts), so prod wires `tokenFor` to the metadata
 *  server's OIDC identity endpoint and the hop carries `Authorization: Bearer <id-token>` with the
 *  audience = the service's root URL (LIVE FINDING 11 — an unauthenticated hop 403s at the frontend). */
export function createServiceExportRunner(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  tokenFor?: (audience: string) => Promise<string>,
): ExportRunner {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async run({ markdown, format, profile, cslStyle, bibliography, figures }) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (tokenFor) headers["authorization"] = `Bearer ${await tokenFor(root)}`;
      const res = await fetchImpl(`${root}/export`, {
        method: "POST",
        headers,
        body: JSON.stringify({ markdown, format, profile, cslStyle, bibliography, figures }),
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

// ----------------------------------------------------------------------------------------------------------------------
// P1.18 — the protocol-conditioned export surfaces (§6.7/REQ-GENRE-5 export half), the bibliography +
// figure resolution, and the §8.4 provenance appendix. Everything degrades rather than blocks: no
// protocol row ⇒ the §6.7 fallback defaults; no provenance map ⇒ the toggle greys; a figure whose
// assets are missing degrades to its alt/caption text.
// ----------------------------------------------------------------------------------------------------------------------

/** §6.7's op-ed exclusivity line, verbatim for the dialog (reminder, never a gate). */
export const OP_ED_EXCLUSIVITY_REMINDER =
  "Op-ed venues almost always require exclusive submission — confirm this piece is not under review anywhere else before you file.";

export interface ExportSurfaces {
  /** Academic ⇒ the disclosure statement surface (the ICMJE template registers at P1.21; until
   *  then the generator's general template ships under it — a service, never a gate). */
  readonly disclosure: boolean;
  /** Op-ed ⇒ the exclusivity reminder line, or null. */
  readonly exclusivityReminder: string | null;
}

/** Read the project's protocol integrity norms → its export surfaces (§6.7 degrade-safe). */
async function exportSurfaces(tx: SqlClient, projectId: string): Promise<ExportSurfaces> {
  const project = (
    await tx.query(`select protocol_id, protocol_version from projects where id = $1`, [projectId])
  ).rows[0] as { protocol_id: string | null; protocol_version: number } | undefined;
  const protocolId = project?.protocol_id ?? null;
  let norms: { disclosure_artifact?: string; exclusivity_reminder?: boolean } | null = null;
  if (protocolId) {
    const row = (
      await tx.query(`select body->'integrity_norms' as norms from protocols where id = $1 and version = $2`, [
        protocolId,
        project!.protocol_version,
      ])
    ).rows[0] as { norms: { disclosure_artifact?: string; exclusivity_reminder?: boolean } | null } | undefined;
    norms = row?.norms ?? null;
  }
  // §6.7 fallback: P1.21 hasn't registered the Academic/Op-ed bodies yet — the protocol id alone
  // still earns the surface (the disclosure ships the general template; the reminder is a line).
  const disclosure = norms?.disclosure_artifact === "icmje" || (norms == null && protocolId === "academic");
  const exclusivity =
    norms?.exclusivity_reminder === true || (norms == null && protocolId === "op-ed");
  return { disclosure, exclusivityReminder: exclusivity ? OP_ED_EXCLUSIVITY_REMINDER : null };
}

/** The version's block-level provenance spans (null ⇒ no map — the toggle greys). */
async function provenanceSpans(
  tx: SqlClient,
  versionId: string | null,
): Promise<ProvenanceSpan[] | null> {
  if (!versionId) return null;
  const row = (
    await tx.query(`select spans from provenance_maps where draft_version_id = $1`, [versionId])
  ).rows[0] as { spans: ProvenanceSpan[] } | undefined;
  return (row?.spans as ProvenanceSpan[] | undefined) ?? null;
}

/** The resolved head's provenance-map version id (same resolution the POST uses to read text). */
async function headProvenanceVersionId(tx: SqlClient, projectId: string): Promise<string | null> {
  const row = (
    await tx.query(`select id from drafts where project_id = $1 order by n desc limit 1`, [projectId])
  ).rows[0] as { id: string } | undefined;
  if (!row) return null;
  const head = await resolveEditorHead(tx, projectId, row.id);
  if (!head) return null;
  if (head.promoted_version_id) return head.promoted_version_id;
  if (!head.base_draft_id) return null;
  const base = (
    await tx.query(`select promoted_version_id from drafts where id = $1`, [head.base_draft_id])
  ).rows[0] as { promoted_version_id: string | null } | undefined;
  return base?.promoted_version_id ?? null;
}

/** `bibliography/csl.json` head bytes (null ⇒ no bibliography artifact — citeproc stays off). */
async function resolveBibliography(
  tx: SqlClient,
  store: ContentStore | null,
  projectId: string,
): Promise<string | null> {
  if (!store) return null;
  const row = (
    await tx.query(
      `select v.content_sha256 from artifacts a join artifact_versions v on v.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = 'bibliography/csl.json'`,
      [projectId],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  const bytes = await store.get(row.content_sha256);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

interface FigureDbRow {
  id: string;
  spec_kind: keyof typeof SPEC_FILENAME;
  title: string | null;
  caption: string | null;
  alt: string | null;
  source_line: string | null;
  provenance: FigureProvenance;
}

/**
 * REQ-VIZ-15's resolver: markers in doc order → figures rows + the asset bytes the embed needs.
 * The LIGHT render only — `render.dark.svg` is never read (dark renders never export). A figure
 * with no row/payload still produces a `text` embed so its alt + caption survive.
 */
async function resolveExportFigures(
  tx: SqlClient,
  store: ContentStore | null,
  projectId: string,
  markdown: string,
  format: ExportFormat,
  profile: MdExportProfile | null,
): Promise<readonly ExportFigure[]> {
  const markers = parseFigureMarker(markdown);
  if (markers.length === 0) return [];
  // md-appendix needs spec+data+provenance; the substack profile renders figures as text.
  const wireFormat: FigureExportFormat =
    format === "md" ? "md" : (format as FigureExportFormat);
  const embedFormat: FigureExportFormat = profile === "substack" ? "txt" : wireFormat;

  // Pull every figure asset artifact for the project once (few files; lazy per-marker reads would
  // still hit the store — one join is simpler + deterministic).
  const assetRows = store
    ? ((
        await tx.query(
          `select a.mirror_path, v.content_sha256 from artifacts a
             join artifact_versions v on v.id = a.head_version_id
            where a.project_id = $1 and a.mirror_path like 'assets/figures/%'`,
          [projectId],
        )
      ).rows as { mirror_path: string; content_sha256: string }[])
    : [];
  const assetSha = new Map(assetRows.map((r) => [r.mirror_path, r.content_sha256] as const));
  const assetBytes = async (path: string): Promise<Uint8Array | null> => {
    if (!store) return null;
    const sha = assetSha.get(path);
    return sha ? store.get(sha) : null;
  };
  const assetText = async (path: string): Promise<string | null> => {
    const b = await assetBytes(path);
    return b ? new TextDecoder().decode(b) : null;
  };

  const out: ExportFigure[] = [];
  for (const [i, m] of markers.entries()) {
    const figureNumber = i + 1;
    const figureId = figureIdFromRef(m.figureId);
    const row = (
      await tx.query(
        `select id, spec_kind, title, caption, alt, source_line, provenance from figures
          where id = $1 and project_id = $2`,
        [figureId, projectId],
      )
    ).rows[0] as FigureDbRow | undefined;
    if (!row) {
      out.push({
        figureId,
        embed: "text",
        title: "",
        caption: "",
        altText: "figure",
        sourceFootnote: "",
      });
      continue;
    }
    const dir = `assets/figures/${figureId}`;
    const specPath = `${dir}/${SPEC_FILENAME[row.spec_kind]}`;
    const svg = await assetText(`${dir}/render.svg`); // the LIGHT render — dark never exports
    const png2x = await assetBytes(`${dir}/render@2x.png`);
    const tableSource = await assetText(`${dir}/table.md`);
    // the embed the §7.5 map picks for this format + figure kind.
    const pkg = figureExportPackage({
      figure: {
        id: row.id,
        alt: row.alt ?? "figure",
        sourceLine: row.source_line ?? "",
        caption: row.caption ?? "",
        specKind: row.spec_kind,
        provenance: row.provenance,
      },
      format: embedFormat,
      figureNumber,
      ...(svg ? { svg } : {}),
      ...(png2x ? { png2x } : {}),
      ...(tableSource ? { tableSource } : {}),
    });
    out.push({
      figureId: row.id,
      embed: pkg.embed,
      title: row.title ?? "",
      caption: row.caption ?? "",
      altText: pkg.altText,
      sourceFootnote: pkg.sourceFootnote,
      ...(pkg.captionNote ? { captionNote: pkg.captionNote } : {}),
      ...(pkg.svg != null ? { svg: pkg.svg } : {}),
      ...(pkg.png2x != null ? { png2xBase64: Buffer.from(pkg.png2x).toString("base64") } : {}),
      ...(pkg.tableSource != null ? { tableSource: pkg.tableSource } : {}),
      // the `.md` figure-sources appendix travels with every package; the container only uses it
      // on the canonical-md path (spec + data + provenance, verbatim).
      ...(format === "md" ? { specSource: (await assetText(specPath)) ?? undefined } : {}),
      ...(format === "md" ? { dataCsv: (await assetText(`${dir}/data.csv`)) ?? undefined } : {}),
      ...(format === "md" ? { provenanceJson: (await assetText(`${dir}/provenance.json`)) ?? undefined } : {}),
    });
  }
  return out;
}

export function createExportRoutes(deps: ExportApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: export jobs + AI-use additions 409.
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));
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
    const store =
      (deps.contentStoreFor ? await deps.contentStoreFor(principal.workspaceId) : deps.store) ?? null;

    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const { counts, items, returnedIds } = await dialogState(tx, projectId, {
        kind: "user",
        userId: principal.userId,
      });
      const stmt = await statement(tx, projectId, counts);
      if (!stmt) return { ok: false as const };
      const surfaces = await exportSurfaces(tx, projectId);
      const hasBibliography = (await resolveBibliography(tx, store, projectId)) != null;
      // the §8.4 appendix toggle greys when the head version carries no block-level map.
      const headVersionId = await headProvenanceVersionId(tx, projectId);
      const spans = await provenanceSpans(tx, headVersionId);
      return {
        ok: true as const,
        dto: {
          projectId,
          formats: EXPORT_FORMATS.map((f) => ({
            id: f,
            label: EXPORT_FORMAT_INFO[f].label,
            extension: EXPORT_FORMAT_INFO[f].extension,
            blurb: EXPORT_FORMAT_INFO[f].blurb,
            provenanceAppendix: EXPORT_FORMAT_INFO[f].provenanceAppendix,
          })),
          mdProfiles: MD_EXPORT_PROFILES.map((p) => ({
            id: p,
            label: MD_EXPORT_PROFILE_INFO[p].label,
            blurb: MD_EXPORT_PROFILE_INFO[p].blurb,
          })),
          citations: {
            hasBibliography,
            styles: CSL_STYLES.map((s) => ({ id: s, label: CSL_STYLE_INFO[s].label })),
          },
          provenance: {
            available: spans != null && spans.length > 0,
            defaultOn: false,
            label: PROVENANCE_APPENDIX_LABEL,
            formats: [...PROVENANCE_APPENDIX_FORMATS],
          },
          surfaces,
          obligations: {
            blockingOpen: counts.blockingOpen,
            open: counts.open,
            line: counts.line,
            items,
            returnedIds,
          },
          statement: { ...statementDto(stmt), disclosure: surfaces.disclosure },
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
      attachProvenance?: unknown;
      profile?: unknown;
      cslStyle?: unknown;
    };
    if (!isExportFormat(body.format)) {
      return c.json({ error: "unsupported_format", formats: [...EXPORT_FORMATS] }, 422);
    }
    const format = body.format;
    // `substack` is a profile on `md`, never an eighth format — same rule the container enforces.
    if (body.profile != null && (!isMdExportProfile(body.profile) || format !== "md")) {
      return c.json({ error: "unsupported_profile", profiles: [...MD_EXPORT_PROFILES] }, 422);
    }
    const profile = isMdExportProfile(body.profile) ? body.profile : null;
    if (body.cslStyle != null && !isCslStyle(body.cslStyle)) {
      return c.json({ error: "unsupported_csl_style", styles: [...CSL_STYLES] }, 422);
    }
    const cslStyle = isCslStyle(body.cslStyle) ? body.cslStyle : null;
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
        if (stmt) markdown = `${markdown.trimEnd()}${attachmentSection(stmt)}`;
      }
      // §8.4 — the block-level appendix (off by default): rendered from the head version's
      // provenance map and appended as a trailing section for every format (the container's pdf
      // path carries it through the same typst pass — one document, one download).
      if (body.attachProvenance === true && EXPORT_FORMAT_INFO[format].provenanceAppendix) {
        const spans = await provenanceSpans(tx, versionId);
        const appendix = renderProvenanceAppendix({ markdown: text.text, spans });
        if (appendix) markdown = `${markdown.trimEnd()}\n\n${appendix}`;
      }
      const bibliography = await resolveBibliography(tx, store, projectId);
      // Figures resolve against the DRAFT text — the statement/appendix appends carry no markers.
      const figures = await resolveExportFigures(tx, store, projectId, text.text, format, profile);
      return { ok: true as const, markdown, bibliography, figures };
    });
    if (!prepared.ok) return c.json({ error: prepared.reason }, prepared.reason === "empty_draft" ? 422 : 404);

    const result = await deps.exportRunner.run({
      markdown: prepared.markdown,
      format,
      ...(profile ? { profile } : {}),
      ...(cslStyle ? { cslStyle } : {}),
      ...(prepared.bibliography ? { bibliography: prepared.bibliography } : {}),
      ...(prepared.figures.length > 0 ? { figures: prepared.figures } : {}),
    });
    // The export succeeded — this route owns `project.exported` (PRB.12; the audit scans this file for
    // the literal). Post-commit and non-fatal: a telemetry failure is logged, never a failed download;
    // opt-out is honored inside recordAnalyticsEvent (no row, no throw).
    await deps.txRunner
      .run(principal.workspaceId, async (tx) => {
        await recordAnalyticsEvent(tx, { ids: deps.ids, clock: deps.clock }, {
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          projectId,
          event: "project.exported",
          props: { format },
        });
      })
      .catch((err: unknown) =>
        console.error("[api] project.exported analytics failed:", err instanceof Error ? err.message : err),
      );
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
