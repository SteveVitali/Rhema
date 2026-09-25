import JSZip from "jszip";
import type { ContentStore, SqlExecutor } from "@rhema/mirror";
import { s3KeyFor, sha256Hex } from "@rhema/mirror";
import {
  ARCHIVE_ZIP_VERSION,
  projectZipDir,
  sampleZipPath,
  voiceZipDir,
  type ArchiveState,
} from "./layout.js";

// importAccountZip — the REQ-ACCT-3 fresh-account half. Replays a buildAccountZip archive into a
// workspace: projects, artifacts+versions (head bytes re-stored content-addressed under the NEW
// workspace key), drafts, provenance maps, figures, personas + their artifacts, connections,
// discovered items and sample versions. Deterministic + idempotent: every row's new id derives
// from sha256(workspaceId | kind | originalId), so a re-import targets the same primary keys and
// `on conflict do nothing` makes it a no-op — never a duplicate project or voice.
//
// The zip is the on-disk record: run/correspondence/obligation ROWS intentionally do not travel
// (the files ride under projects/<slug>/ — a fresh account has an empty run ledger, which is the
// honest import semantic; REQ-ACCT-3's parity bar is "every project and voice").

export class ArchiveImportError extends Error {
  constructor(
    readonly reason: "not_a_rhema_export" | "unsupported_version" | "corrupt_state",
    message: string,
  ) {
    super(message);
    this.name = "ArchiveImportError";
  }
}

export interface ImportResult {
  /** rows inserted this run (0 on a re-import). */
  readonly projects: number;
  readonly voices: number;
  readonly files: number;
  /** true when the import inserted nothing — a re-import of the same zip. */
  readonly deduped: boolean;
}

/** The deterministic imported id — `<kind>_imp_<16 hex>` from (workspace, kind, original id). */
export function importedId(workspaceId: string, kind: string, originalId: string): string {
  return `${kind}_imp_${sha256Hex(`${workspaceId}|${kind}|${originalId}`).slice(0, 16)}`;
}

const text = async (f: JSZip.JSZipObject | null | undefined): Promise<string | null> =>
  f == null ? null : f.async("string");

export async function importAccountZip(args: {
  exec: SqlExecutor;
  store: ContentStore;
  workspaceId: string;
  userId: string;
  zipBytes: Uint8Array;
}): Promise<ImportResult> {
  const { exec, store, workspaceId, userId, zipBytes } = args;
  const zip = await JSZip.loadAsync(zipBytes).catch(() => {
    throw new ArchiveImportError("not_a_rhema_export", "the file is not a zip archive");
  });
  const stateText = await text(zip.file("state.json"));
  if (stateText == null) {
    throw new ArchiveImportError("not_a_rhema_export", "state.json missing — not a Rhema export zip");
  }
  const state = JSON.parse(stateText) as ArchiveState;
  if (state.version !== ARCHIVE_ZIP_VERSION) {
    throw new ArchiveImportError(
      "unsupported_version",
      `export version ${state.version} — this build reads version ${ARCHIVE_ZIP_VERSION}`,
    );
  }

  // `returning *` — the row count lands in `rows` on pg AND PGlite, no rowCount dependency, and no
  // assumption that every table has an `id` column (provenance_maps keys by draft_version_id).
  const insert = async (sql: string, params: unknown[]): Promise<number> =>
    (await exec.query(`${sql} on conflict do nothing returning *`, params)).rows.length;

  let projects = 0;
  let voices = 0;
  let files = 0;
  let other = 0;
  const iid = (kind: string, orig: string) => importedId(workspaceId, kind, orig);

  // ---- projects ----
  const projectId = new Map<string, string>();
  for (const p of state.projects) {
    const id = iid("prj", p.id);
    projectId.set(p.id, id);
    projects += await insert(
      `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, protocol_version,
         venue, rigor_default, model_tier_default, approval_policy, archived_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id, workspaceId, userId, p.title, p.slug, p.protocolId, p.protocolVersion, p.venue,
        p.rigorDefault, p.modelTierDefault, p.approvalPolicy, p.archivedAt, p.createdAt,
      ],
    );
  }

  // ---- personas ----
  const personaId = new Map<string, string>();
  for (const v of state.personas) {
    const id = iid("per", v.id);
    personaId.set(v.id, id);
    voices += await insert(
      `insert into personas (id, workspace_id, slug, display_name, byline, mode, kind, provenance,
         registers, seed_authored_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, workspaceId, v.slug, v.displayName, v.byline, v.mode, v.kind, v.provenance,
        v.registers as unknown, v.seedAuthoredBy,
      ],
    );
  }

  // ---- artifacts + head versions (bytes re-stored content-addressed under this workspace) ----
  const artifactVersionId = new Map<string, string>(); // `${scopeId}|${path}` → new version id
  for (const a of state.artifacts) {
    const scopeRowId = a.scope === "project" ? projectId.get(a.scopeId) : personaId.get(a.scopeId);
    if (!scopeRowId) continue;
    const dirSlug =
      a.scope === "project"
        ? projectZipDir(state.projects.find((p) => p.id === a.scopeId)!.slug)
        : voiceZipDir(state.personas.find((p) => p.id === a.scopeId)!.slug ?? `voice-${a.scopeId}`);
    const zipPath = `${dirSlug}/${a.path.replace(/^\/+/, "")}`;
    const bytes = await zip.file(zipPath)?.async("uint8array");
    if (!bytes || sha256Hex(bytes) !== a.sha256) {
      // The manifest index promised these bytes — a mismatch means a corrupt export.
      throw new ArchiveImportError("corrupt_state", `missing or mismatched bytes for ${zipPath}`);
    }
    await store.put(workspaceId, a.sha256, bytes);

    const artifactId = iid("art", `${a.scope}:${a.scopeId}:${a.path}`);
    const versionId = iid("av", `${a.scope}:${a.scopeId}:${a.path}@${a.ordinal}`);
    artifactVersionId.set(`${a.scopeId}|${a.path}`, versionId);
    other += await insert(
      `insert into artifacts (id, workspace_id, project_id, persona_id, kind, namespace, mirror_path, head_version_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        artifactId, workspaceId,
        a.scope === "project" ? scopeRowId : null,
        a.scope === "persona" ? scopeRowId : null,
        a.kind, a.namespace, a.path, versionId,
      ],
    );
    files += await insert(
      `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
         media_type, created_by, created_at, immutable, block_id_map)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        versionId, artifactId, a.ordinal, a.sha256, s3KeyFor(workspaceId, a.sha256), a.byteLen,
        a.wordCount, a.mediaType, JSON.stringify(a.createdBy ?? { kind: "user", userId }),
        a.createdAt, a.immutable, a.blockIdMap == null ? null : JSON.stringify(a.blockIdMap),
      ],
    );
  }

  // ---- drafts (promoted_version_id resolved through the draft artifact path) ----
  const draftId = new Map<string, string>(); // `${projectId}:${n}` → new draft id
  for (const d of state.drafts) {
    const pid = projectId.get(d.projectId);
    if (!pid) continue;
    const id = iid("dft", `${d.projectId}:${d.n}`);
    draftId.set(`${d.projectId}:${d.n}`, id);
    const versionId = d.artifactPath ? artifactVersionId.get(`${d.projectId}|${d.artifactPath}`) : null;
    // A frozen draft whose promoted bytes didn't export must not violate the frozen check —
    // degrade it to working (honest: no freeze point without bytes).
    const state2 = d.state === "frozen" && versionId == null ? "working" : d.state;
    other += await insert(
      `insert into drafts (id, project_id, n, origin, state, promoted_version_id, frozen_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, pid, d.n, d.origin, state2, state2 === "frozen" ? versionId : null, d.frozenAt, d.createdAt],
    );
  }
  // base_draft links (second pass — all ids known).
  for (const d of state.drafts) {
    if (d.baseDraftN == null) continue;
    const id = draftId.get(`${d.projectId}:${d.n}`);
    const baseId = draftId.get(`${d.projectId}:${d.baseDraftN}`);
    if (id && baseId) {
      await exec.query(`update drafts set base_draft_id = $2 where id = $1`, [id, baseId]);
    }
  }

  // ---- provenance maps (block-level, keyed by the imported artifact version) ----
  for (const p of state.provenance) {
    const versionId = artifactVersionId.get(`${p.projectId}|${p.artifactPath}`);
    if (!versionId) continue;
    other += await insert(
      `insert into provenance_maps (draft_version_id, granularity, spans) values ($1,$2,$3)`,
      [versionId, p.granularity, JSON.stringify(p.spans)],
    );
  }

  // ---- figures + versions ----
  const figureId = new Map<string, string>();
  for (const f of state.figures) {
    const pid = projectId.get(f.projectId);
    if (!pid) continue;
    const id = iid("fig", f.id);
    figureId.set(f.id, id);
    other += await insert(
      `insert into figures (id, project_id, spec_kind, title, caption, alt, source_line, provenance, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, pid, f.specKind, f.title, f.caption, f.alt, f.sourceLine, JSON.stringify(f.provenance ?? null), f.createdAt],
    );
  }
  for (const v of state.figureVersions) {
    const fid = figureId.get(v.figureId);
    if (!fid) continue;
    other += await insert(
      `insert into figure_versions (id, figure_id, ordinal, request, created_at)
       values ($1,$2,$3,$4,$5)`,
      [iid("fv", `${v.figureId}:${v.ordinal}`), fid, v.ordinal, v.request, v.createdAt],
    );
  }

  // ---- connections + discovered items + sample versions ----
  const connectionId = new Map<string, string>(); // `${personaId}|${provider}` → new connection id
  for (const c of state.connections) {
    const pid = personaId.get(c.personaId);
    if (!pid) continue;
    const id = iid("con", `${c.personaId}:${c.provider}`);
    connectionId.set(`${c.personaId}|${c.provider}`, id);
    other += await insert(
      `insert into connections (id, persona_id, provider, handle, status, schedule, auto_include_new)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, pid, c.provider, c.handle, c.status, c.schedule, c.autoIncludeNew],
    );
  }
  const discoveredItemId = new Map<string, string>();
  for (const d of state.discoveredItems) {
    const connId = connectionId.get(`${d.personaId}|${d.provider}`);
    if (!connId) continue;
    const id = iid("di", d.id);
    discoveredItemId.set(d.id, id);
    other += await insert(
      `insert into discovered_items (id, connection_id, external_id, title, url, date, word_count, state)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, connId, d.externalId, d.title, d.url, d.date, d.wordCount, d.state],
    );
  }
  for (const s of state.samples) {
    const itemId = discoveredItemId.get(s.discoveredItemId);
    if (!itemId) continue;
    // The sample bytes live under voices/<slug>/samples/… — restore them to the store too so a
    // `sample_versions.content_sha256` read resolves (same content-addressed contract).
    const item = state.discoveredItems.find((d) => d.id === s.discoveredItemId)!;
    const persona = state.personas.find((p) => p.id === item.personaId);
    if (persona) {
      const slug = persona.slug ?? `voice-${persona.id}`;
      const zipPath = sampleZipPath(slug, item.externalId ?? item.title ?? s.discoveredItemId, s.n);
      const bytes = await zip.file(zipPath)?.async("uint8array");
      if (bytes && sha256Hex(bytes) === s.sha256) await store.put(workspaceId, s.sha256, bytes);
    }
    other += await insert(
      `insert into sample_versions (id, discovered_item_id, n, content_sha256, word_count, quality)
       values ($1,$2,$3,$4,$5,$6)`,
      [iid("sv", `${s.discoveredItemId}:${s.n}`), itemId, s.n, s.sha256, s.wordCount, s.quality],
    );
  }

  const total = projects + voices + files + other;
  return { projects, voices, files, deduped: total === 0 };
}
