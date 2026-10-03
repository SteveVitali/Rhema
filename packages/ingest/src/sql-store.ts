// The SQL-backed SyncStore — ONE implementation of the sync engine's persistence port, bound by
// the api (inline confirm/discover flows) and the worker (`ingest.sync` jobs) alike. The artifact
// write goes through the same shape POST /voices/:id/samples uses: a `sample` artifact row + an
// immutable artifact_version, the canonical document content-addressed in the byte store, and the
// raw source bytes stored under `original_sha256` for the quality drawer's side-by-side.

import type { ExistingItem, SyncStore, WriteSampleArgs } from "./sync.js";
import type { ConnectionRef, DiscoveredDraft } from "./types.js";

/** A minimal query client — pg.Pool/Tx and PGlite both satisfy this. */
export interface SqlQuery {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ByteSink {
  /** Put bytes under their content hash; returns the store key (e.g. `objects/<sha>`). */
  put(sha256: string, bytes: Uint8Array, mediaType: string): Promise<string>;
}

export interface SqlStoreDeps {
  readonly tx: SqlQuery;
  readonly ids: (prefix: string) => string;
  readonly personaId: string;
  readonly workspaceId: string;
  /** The canonical-document byte sink (the workspace's content store). */
  readonly bytes: ByteSink;
  /** The raw-source byte sink (quarantine or the content store — `original_key` points here). */
  readonly originalBytes?: ByteSink;
  readonly actor?: Record<string, unknown>;
}

const row = <T>(rows: unknown[]): T | undefined => rows[0] as T | undefined;

/** Bind the sync engine's store port to the connections/discovered_items/sample_versions tables. */
export function sqlSyncStore(deps: SqlStoreDeps): SyncStore {
  const { tx } = deps;

  return {
    async listItems(connectionId: string): Promise<ExistingItem[]> {
      // Alias every column to the camelCase ExistingItem field — the engine reads `externalId`,
      // `remoteChangeKey`, `currentSampleId`, `contentSha256` verbatim.
      const res = await tx.query(
        `select di.id, di.external_id as "externalId", di.state,
                di.remote_change_key as "remoteChangeKey", di.current_sample_id as "currentSampleId",
                sv.content_sha256 as "contentSha256", di.access, di.url, di.title
           from discovered_items di
           left join sample_versions sv on sv.id = di.current_sample_id
          where di.connection_id = $1
          order by di.id`,
        [connectionId],
      );
      return res.rows as ExistingItem[];
    },

    async createItem(connectionId: string, draft: DiscoveredDraft, state: string): Promise<ExistingItem> {
      const id = deps.ids("di");
      await tx.query(
        `insert into discovered_items (id, connection_id, external_id, title, url, date, word_count, access, remote_change_key, state)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict do nothing`,
        [
          id,
          connectionId,
          draft.externalId,
          draft.title,
          draft.url,
          draft.date,
          draft.wordCount,
          draft.access,
          draft.remoteChangeKey,
          state,
        ],
      );
      return {
        id,
        externalId: draft.externalId,
        state,
        remoteChangeKey: draft.remoteChangeKey,
        currentSampleId: null,
        contentSha256: null,
        access: draft.access,
        url: draft.url,
        title: draft.title,
      };
    },

    async setItemState(itemId: string, state: string): Promise<void> {
      await tx.query(`update discovered_items set state = $2 where id = $1`, [itemId, state]);
    },

    async setRemoteChangeKey(itemId: string, key: string | null): Promise<void> {
      await tx.query(`update discovered_items set remote_change_key = $2 where id = $1`, [itemId, key]);
    },

    async setItemMeta(
      itemId: string,
      meta: Pick<DiscoveredDraft, "title" | "url" | "date" | "wordCount" | "access">,
    ): Promise<void> {
      await tx.query(
        `update discovered_items set title = $2, url = $3, date = $4, word_count = $5, access = $6
           where id = $1`,
        [itemId, meta.title, meta.url, meta.date, meta.wordCount, meta.access],
      );
    },

    async nextVersionN(itemId: string): Promise<number> {
      const res = await tx.query(
        `select coalesce(max(n),0)+1 as n from sample_versions where discovered_item_id = $1`,
        [itemId],
      );
      return Number(row<{ n: number | string }>(res.rows)?.n ?? 1);
    },

    async writeSample(itemId: string, n: number, sample: WriteSampleArgs): Promise<void> {
      // Canonical document bytes → the content store (content-addressed), then the artifact rows.
      const docBytes = new TextEncoder().encode(sample.document);
      const docKey = await deps.bytes.put(sample.contentSha256, docBytes, "text/markdown");
      const artifactId = deps.ids("art");
      const versionId = deps.ids("av");
      await tx.query(
        `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path)
           values ($1,$2,$3,'sample','persona',$4)`,
        // docs/samples/<item>-v<n>.md — the persona-builder seat mounts docs/** (F18 verbatim path).
        [artifactId, deps.workspaceId, deps.personaId, `docs/samples/${itemId}-v${n}.md`],
      );
      await tx.query(
        `insert into artifact_versions
           (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
           values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,true)`,
        [
          versionId,
          artifactId,
          sample.contentSha256,
          docKey,
          docBytes.byteLength,
          sample.wordCount,
          JSON.stringify(deps.actor ?? { kind: "system", role: "ingest" }),
        ],
      );
      await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
      // The raw source bytes — retained for the side-by-side preview + any future re-convert.
      let originalKey: string | null = null;
      if (sample.originalBytes && deps.originalBytes) {
        originalKey = await deps.originalBytes.put(
          sample.originalSha256,
          sample.originalBytes,
          "application/octet-stream",
        );
      }
      const svId = deps.ids("sv");
      await tx.query(
        `insert into sample_versions
           (id, discovered_item_id, n, content_sha256, original_sha256, original_key,
            artifact_version_id, quality, quality_notes, word_count)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          svId,
          itemId,
          n,
          sample.contentSha256,
          sample.originalSha256,
          originalKey,
          versionId,
          sample.quality,
          [...sample.qualityNotes],
          sample.wordCount,
        ],
      );
      await tx.query(`update discovered_items set current_sample_id = $2 where id = $1`, [itemId, svId]);
    },

    async setConnectionError(connectionId: string, error: string | null): Promise<void> {
      await tx.query(`update connections set error = $2 where id = $1`, [connectionId, error]);
    },

    async setConnectionSynced(connectionId: string, at: Date): Promise<void> {
      await tx.query(`update connections set last_sync_at = $2, status = 'ok' where id = $1`, [
        connectionId,
        at,
      ]);
    },
  };
}

/** Load the ConnectionRef for a sync run — provider + handle + the per-connection knobs. */
export async function loadConnection(
  tx: SqlQuery,
  connectionId: string,
): Promise<(ConnectionRef & { personaId: string }) | null> {
  const res = await tx.query(
    `select id, persona_id, provider, handle, auto_include_new, schedule
       from connections where id = $1 and removed_at is null`,
    [connectionId],
  );
  const r = row<{
    id: string;
    persona_id: string;
    provider: string;
    handle: string | null;
    auto_include_new: boolean | null;
    schedule: string | null;
  }>(res.rows);
  if (!r) return null;
  return {
    id: r.id,
    personaId: r.persona_id,
    provider: r.provider as ConnectionRef["provider"],
    handle: r.handle,
    autoIncludeNew: r.auto_include_new ?? undefined,
    schedule: r.schedule,
  };
}
