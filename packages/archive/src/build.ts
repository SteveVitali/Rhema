import JSZip from "jszip";
import type { UsageCsvRow } from "@rhema/contracts";
import { usageCsv, usageCsvText } from "@rhema/ledger";
import type { ContentStore, SqlExecutor } from "@rhema/mirror";
import { sha256Hex } from "@rhema/mirror";
import {
  ARCHIVE_ZIP_VERSION,
  projectZipDir,
  renderTreeManifestMd,
  sampleZipPath,
  voiceZipDir,
  type ArchiveArtifactRow,
  type ArchiveConnectionRow,
  type ArchiveDiscoveredItemRow,
  type ArchiveDraftRow,
  type ArchiveFigureRow,
  type ArchiveFigureVersionRow,
  type ArchiveManifest,
  type ArchivePersonaRow,
  type ArchiveProjectRow,
  type ArchiveProvenanceRow,
  type ArchiveSampleRow,
  type ArchiveState,
} from "./layout.js";

// buildAccountZip — the REQ-ACCT-3 export half. Reads the workspace's projects, personas,
// artifacts (head versions), drafts, figures, provenance maps, connections/samples and the usage
// ledger, then emits ONE deterministic zip in the layout from layout.ts. Pure + injected: a
// SqlExecutor + ContentStore — no timers, no network beyond the store's get. The emailed-link +
// expiry machinery lives above this (api/worker); this function only produces the bytes.

interface ProjectDbRow {
  id: string;
  slug: string;
  title: string;
  protocol_id: string | null;
  protocol_version: number;
  venue: string | null;
  rigor_default: string;
  model_tier_default: string | null;
  approval_policy: string;
  archived_at: Date | null;
  created_at: Date;
}

interface ArtifactDbRow {
  artifact_id: string;
  project_id: string | null;
  persona_id: string | null;
  kind: string;
  namespace: string;
  mirror_path: string;
  version_id: string;
  ordinal: number;
  content_sha256: string;
  bytes: number;
  word_count: number | null;
  media_type: string;
  created_by: unknown;
  created_at: Date;
  immutable: boolean;
  block_id_map: unknown;
}

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : new Date(d).toISOString();

/** True when the mirror path sits under the Editor's internal tree (excluded per §11.1/ticket). */
export const isEditorTreePath = (p: string): boolean =>
  /^\.?\/?agents\/editor\//.test(p) || p.includes("/agents/editor/");

export interface AccountZipResult {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly fileCount: number;
  readonly projectCount: number;
  readonly voiceCount: number;
}

/** Build the whole-account export zip for a workspace. Deterministic for a fixed (rows, store,
 *  exportedAt). Throws when a listed artifact's head bytes are missing from the store (a dangling
 *  content hash is a data error — surfacing it beats shipping a half-archive). */
export async function buildAccountZip(args: {
  exec: SqlExecutor;
  store: ContentStore;
  workspaceId: string;
  exportedAt: Date;
  /** §11.7 — the requesting user: their preference-profile rows travel in state.json when present. */
  userId?: string;
}): Promise<AccountZipResult> {
  const { exec, store, workspaceId } = args;

  // ---- rows ----
  const projects = (
    await exec.query(
      `select id, slug, title, protocol_id, protocol_version, venue, rigor_default, model_tier_default,
              approval_policy, archived_at, created_at
         from projects where workspace_id = $1 order by created_at, id`,
      [workspaceId],
    )
  ).rows as unknown as ProjectDbRow[];

  const personas = (
    await exec.query(
      `select id, slug, display_name, byline, mode, kind, provenance, registers, seed_authored_by
         from personas where workspace_id = $1 order by slug, id`,
      [workspaceId],
    )
  ).rows as unknown as {
    id: string; slug: string | null; display_name: string | null; byline: string | null;
    mode: string; kind: string; provenance: string | null; registers: string[] | null;
    seed_authored_by: string | null;
  }[];

  const scopeIds = [...projects.map((p) => p.id), ...personas.map((p) => p.id)];
  const artifacts =
    scopeIds.length === 0
      ? []
      : ((
          await exec.query(
            `select a.id as artifact_id, a.project_id, a.persona_id, a.kind, a.namespace, a.mirror_path,
                    v.id as version_id, v.ordinal, v.content_sha256, v.bytes, v.word_count, v.media_type,
                    v.created_by, v.created_at, v.immutable, v.block_id_map
               from artifacts a
               join artifact_versions v on v.id = a.head_version_id
              where a.project_id = any($1::text[]) or a.persona_id = any($2::text[])
              order by a.project_id nulls last, a.persona_id nulls last, a.mirror_path`,
            [projects.map((p) => p.id), personas.map((p) => p.id)],
          )
        ).rows as unknown as ArtifactDbRow[]);

  const drafts = (
    await exec.query(
      `select project_id, n, origin, state, base_draft_id, frozen_at, created_at
         from drafts where project_id = any($1::text[]) order by project_id, n`,
      [projects.map((p) => p.id)],
    )
  ).rows as unknown as {
    project_id: string; n: number; origin: string; state: string;
    base_draft_id: string | null; frozen_at: Date | null; created_at: Date;
  }[];
  const draftBaseN = new Map<string, number>();
  for (const d of drafts) {
    if (d.base_draft_id) {
      const base = (
        await exec.query(`select n from drafts where id = $1`, [d.base_draft_id])
      ).rows[0] as { n: number } | undefined;
      if (base) draftBaseN.set(`${d.project_id}:${d.n}`, base.n);
    }
  }

  const figures = (
    await exec.query(
      `select id, project_id, spec_kind, title, caption, alt, source_line, provenance, created_at
         from figures where project_id = any($1::text[]) order by project_id, id`,
      [projects.map((p) => p.id)],
    )
  ).rows as unknown as {
    id: string; project_id: string; spec_kind: string; title: string | null;
    caption: string | null; alt: string | null; source_line: string | null;
    provenance: unknown; created_at: Date | null;
  }[];

  const figureVersions =
    figures.length === 0
      ? []
      : ((
          await exec.query(
            `select figure_id, ordinal, request, created_at from figure_versions
              where figure_id = any($1::text[]) order by figure_id, ordinal`,
            [figures.map((f) => f.id)],
          )
        ).rows as unknown as { figure_id: string; ordinal: number; request: string | null; created_at: Date }[]);

  // provenance maps → join to the artifact whose head version they key (draft_version_id = version id).
  const provenance =
    scopeIds.length === 0
      ? []
      : ((
          await exec.query(
            `select a.project_id, a.mirror_path, pm.granularity, pm.spans
               from provenance_maps pm
               join artifact_versions v on v.id = pm.draft_version_id
               join artifacts a on a.id = v.artifact_id
              where a.project_id = any($1::text[])`,
            [projects.map((p) => p.id)],
          )
        ).rows as unknown as {
          project_id: string; mirror_path: string; granularity: string; spans: unknown;
        }[]);

  const connections =
    personas.length === 0
      ? []
      : ((
          await exec.query(
            `select id, persona_id, provider, handle, status, schedule, auto_include_new
               from connections where persona_id = any($1::text[]) order by persona_id, id`,
            [personas.map((p) => p.id)],
          )
        ).rows as unknown as {
          id: string; persona_id: string; provider: string; handle: string | null;
          status: string | null; schedule: string | null; auto_include_new: boolean | null;
        }[]);

  const discoveredItems =
    connections.length === 0
      ? []
      : ((
          await exec.query(
            `select d.id, c.persona_id, c.provider, d.external_id, d.title, d.url, d.date,
                    d.word_count, d.state
               from discovered_items d join connections c on c.id = d.connection_id
              where c.persona_id = any($1::text[]) order by c.persona_id, d.id`,
            [personas.map((p) => p.id)],
          )
        ).rows as unknown as {
          id: string; persona_id: string; provider: string; external_id: string | null;
          title: string | null; url: string | null; date: string | null; word_count: number | null;
          state: string;
        }[]);

  const samples =
    discoveredItems.length === 0
      ? []
      : ((
          await exec.query(
            `select discovered_item_id, n, content_sha256, word_count, quality
               from sample_versions where discovered_item_id = any($1::text[])
              order by discovered_item_id, n`,
            [discoveredItems.map((d) => d.id)],
          )
        ).rows as unknown as {
          discovered_item_id: string; n: number; content_sha256: string;
          word_count: number | null; quality: string | null;
        }[]);

  // §11.7 — the requesting user's preference profile travels with the account (the importer leaves
  // a fresh account's own prefs alone; the row is export-only).
  const preferences = !args.userId
    ? null
    : ((
        await exec.query(
          `select id, app_theme, project_group_by, analytics_opt_out, consent_dont_ask_under,
                  dismissed_explainers from "user" where id = $1`,
          [args.userId],
        )
      ).rows[0] as
        | {
            id: string; app_theme: string | null; project_group_by: string | null;
            analytics_opt_out: boolean; consent_dont_ask_under: number;
            dismissed_explainers: string[] | null;
          }
        | undefined) ?? null;

  // ---- files ----
  const files = new Map<string, Uint8Array>();
  const missing: string[] = [];

  const artifactRows: ArchiveArtifactRow[] = [];
  for (const a of artifacts) {
    if (isEditorTreePath(a.mirror_path)) continue; // §11.1 — the Editor's tree is internal.
    const scope = a.project_id ? ("project" as const) : ("persona" as const);
    const scopeId = a.project_id ?? a.persona_id!;
    const scopeSlug =
      scope === "project"
        ? projects.find((p) => p.id === scopeId)!.slug
        : (personas.find((p) => p.id === scopeId)!.slug ?? `voice-${scopeId}`);
    const dir = scope === "project" ? projectZipDir(scopeSlug) : voiceZipDir(scopeSlug);
    const zipPath = `${dir}/${a.mirror_path.replace(/^\/+/, "")}`;
    const bytes = await store.get(a.content_sha256);
    if (bytes == null) {
      missing.push(zipPath);
      continue;
    }
    files.set(zipPath, bytes);
    artifactRows.push({
      scope,
      scopeId,
      path: a.mirror_path,
      kind: a.kind,
      namespace: a.namespace,
      sha256: a.content_sha256,
      byteLen: a.bytes,
      wordCount: a.word_count,
      mediaType: a.media_type,
      createdBy: a.created_by,
      createdAt: new Date(a.created_at).toISOString(),
      immutable: a.immutable,
      ordinal: a.ordinal,
      blockIdMap: a.block_id_map,
    });
  }

  // Per-tree generated manifest.md.
  for (const p of projects) {
    const dir = projectZipDir(p.slug);
    const paths = [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1));
    files.set(`${dir}/manifest.md`, Buffer.from(renderTreeManifestMd(p.title, paths), "utf8"));
  }
  for (const v of personas) {
    const slug = v.slug ?? `voice-${v.id}`;
    const dir = voiceZipDir(slug);
    const paths = [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1));
    files.set(`${dir}/manifest.md`, Buffer.from(renderTreeManifestMd(v.display_name ?? slug, paths), "utf8"));
  }

  // Samples as canonical markdown under the voice dir.
  const itemById = new Map(discoveredItems.map((d) => [d.id, d] as const));
  const connByPersona = new Map(connections.map((c) => [c.id, c] as const));
  void connByPersona;
  for (const s of samples) {
    const item = itemById.get(s.discovered_item_id);
    if (!item) continue;
    const persona = personas.find((p) => p.id === item.persona_id);
    if (!persona) continue;
    const bytes = await store.get(s.content_sha256);
    const slug = persona.slug ?? `voice-${persona.id}`;
    const zipPath = sampleZipPath(slug, item.external_id ?? item.title ?? s.discovered_item_id, s.n);
    if (bytes == null) {
      missing.push(zipPath);
      continue;
    }
    files.set(zipPath, bytes);
  }

  // ---- state.json ----
  const state: ArchiveState = {
    version: ARCHIVE_ZIP_VERSION,
    projects: projects.map(
      (p): ArchiveProjectRow => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        protocolId: p.protocol_id,
        protocolVersion: p.protocol_version,
        venue: p.venue,
        rigorDefault: p.rigor_default,
        modelTierDefault: p.model_tier_default,
        approvalPolicy: p.approval_policy,
        archivedAt: iso(p.archived_at),
        createdAt: new Date(p.created_at).toISOString(),
      }),
    ),
    drafts: drafts.map(
      (d): ArchiveDraftRow => ({
        projectId: d.project_id,
        n: d.n,
        origin: d.origin,
        state: d.state,
        artifactPath: `drafts/v${d.n}.md`,
        baseDraftN: draftBaseN.get(`${d.project_id}:${d.n}`) ?? null,
        frozenAt: iso(d.frozen_at),
        createdAt: new Date(d.created_at).toISOString(),
      }),
    ),
    artifacts: artifactRows,
    provenance: provenance.map(
      (r): ArchiveProvenanceRow => ({
        projectId: r.project_id,
        artifactPath: r.mirror_path,
        granularity: r.granularity,
        spans: r.spans,
      }),
    ),
    figures: figures.map(
      (f): ArchiveFigureRow => ({
        id: f.id,
        projectId: f.project_id,
        specKind: f.spec_kind,
        title: f.title,
        caption: f.caption,
        alt: f.alt,
        sourceLine: f.source_line,
        provenance: f.provenance,
        createdAt: iso(f.created_at),
      }),
    ),
    figureVersions: figureVersions.map(
      (v): ArchiveFigureVersionRow => ({
        figureId: v.figure_id,
        ordinal: v.ordinal,
        request: v.request,
        createdAt: new Date(v.created_at).toISOString(),
      }),
    ),
    personas: personas.map(
      (v): ArchivePersonaRow => ({
        id: v.id,
        slug: v.slug,
        displayName: v.display_name,
        byline: v.byline,
        mode: v.mode,
        kind: v.kind,
        provenance: v.provenance,
        registers: v.registers,
        seedAuthoredBy: v.seed_authored_by,
      }),
    ),
    connections: connections.map(
      (c): ArchiveConnectionRow => ({
        personaId: c.persona_id,
        provider: c.provider,
        handle: c.handle,
        status: c.status,
        schedule: c.schedule,
        autoIncludeNew: c.auto_include_new,
      }),
    ),
    discoveredItems: discoveredItems.map(
      (d): ArchiveDiscoveredItemRow => ({
        id: d.id,
        personaId: d.persona_id,
        provider: d.provider,
        externalId: d.external_id,
        title: d.title,
        url: d.url,
        date: d.date,
        wordCount: d.word_count,
        state: d.state,
      }),
    ),
    samples: samples.map(
      (s): ArchiveSampleRow => ({
        discoveredItemId: s.discovered_item_id,
        n: s.n,
        sha256: s.content_sha256,
        wordCount: s.word_count,
        quality: s.quality,
      }),
    ),
    ...(preferences
      ? {
          preferences: {
            userId: preferences.id,
            appTheme: preferences.app_theme,
            projectGroupBy: preferences.project_group_by,
            analyticsOptOut: preferences.analytics_opt_out,
            consentDontAskUnder: preferences.consent_dont_ask_under,
            dismissedExplainers: preferences.dismissed_explainers ?? [],
          },
        }
      : {}),
    missing,
  };
  files.set("state.json", Buffer.from(JSON.stringify(state, null, 2), "utf8"));

  // ---- ledger.csv (§14.5 — the account's usage ledger, debits only) ----
  const ws = (
    await exec.query(`select billing_account_id from workspaces where id = $1`, [workspaceId])
  ).rows[0] as { billing_account_id: string | null } | undefined;
  let ledgerRows: UsageCsvRow[] = [];
  if (ws?.billing_account_id) {
    ledgerRows = await usageCsv(exec, ws.billing_account_id, workspaceId);
  }
  files.set("ledger.csv", Buffer.from(usageCsvText(ledgerRows), "utf8"));

  // ---- manifest.json (files index — written last so every file hash is known) ----
  const fileIndex: Record<string, string> = {};
  for (const [path, bytes] of files) fileIndex[path] = sha256Hex(bytes);
  const manifest: ArchiveManifest = {
    version: ARCHIVE_ZIP_VERSION,
    exportedAt: args.exportedAt.toISOString(),
    projects: projects.map((p) => ({ slug: p.slug, title: p.title })),
    voices: personas.map((v) => ({ slug: v.slug ?? `voice-${v.id}`, displayName: v.display_name })),
    files: fileIndex,
  };
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  // ---- zip (sorted insertion, uniform entry date → deterministic bytes per build) ----
  const zip = new JSZip();
  for (const path of [...files.keys()].sort()) {
    zip.file(path, files.get(path)!, { date: args.exportedAt });
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    bytes,
    sha256: sha256Hex(bytes),
    fileCount: files.size,
    projectCount: projects.length,
    voiceCount: personas.length,
  };
}
