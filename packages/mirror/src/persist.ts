// Persist a harvest diff: the content-addressed upload + the `artifacts` / `artifact_versions` row inserts
// (§12.2 commit step 2). Split out from the pure `harvest` diff so the diff stays testable without a store or a
// tx, and so the delivery transaction can upload the final phase's writes inside its own atomic tx. Identical
// files never reach here (the diff drops them), so re-running with no changes writes nothing (REQ-DATA-9a).

import type { ContentStore } from "./content-store.js";
import type { NewVersion } from "./harvest.js";
import type { SqlExecutor } from "./sql.js";

/** ID + clock seams (matching the orchestrator's injected `IdFactory` / `Clock`). */
export interface PersistDeps {
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
}

export interface PersistContext {
  readonly workspaceId: string;
  readonly projectId?: string | null;
  readonly personaId?: string | null;
  /** provenance recorded on the new version (`created_by`); defaults to `{kind:'agent'}`. */
  readonly createdBy?: unknown;
}

export interface PersistedVersion {
  readonly path: string;
  readonly artifactId: string;
  readonly versionId: string;
  readonly sha256: string;
  readonly kind: string;
}

function mediaTypeFor(path: string): string {
  return path.endsWith(".json") ? "application/json" : "text/markdown";
}

/** Find (or create) the `artifacts` row for a mirror path, returning its id. */
async function ensureArtifact(exec: SqlExecutor, deps: PersistDeps, ctx: PersistContext, v: NewVersion): Promise<string> {
  const scopeCol = ctx.personaId ? "persona_id" : "project_id";
  const scopeId = ctx.personaId ?? ctx.projectId;
  const existing = await exec.query(
    `select id from artifacts where ${scopeCol} = $1 and mirror_path = $2`,
    [scopeId, v.path],
  );
  const row = existing.rows[0] as { id: string } | undefined;
  if (row) return row.id;

  const id = deps.ids("art");
  await exec.query(
    `insert into artifacts(id, workspace_id, project_id, persona_id, kind, namespace, mirror_path, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, ctx.workspaceId, ctx.projectId ?? null, ctx.personaId ?? null, v.kind, v.namespace, v.path, deps.clock.now()],
  );
  return id;
}

/**
 * Persist every changed/new writable file as a fresh content-addressed `artifact_version` (next ordinal),
 * updating the artifact's `head_version_id`. Returns the persisted ids (for the step's `produced_version_ids`
 * and the delivery transaction's immutability marking).
 */
export async function persistHarvest(
  exec: SqlExecutor,
  store: ContentStore,
  deps: PersistDeps,
  ctx: PersistContext,
  newVersions: readonly NewVersion[],
): Promise<PersistedVersion[]> {
  const out: PersistedVersion[] = [];
  for (const v of newVersions) {
    const artifactId = await ensureArtifact(exec, deps, ctx, v);
    const nextRes = await exec.query(
      "select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1",
      [artifactId],
    );
    const ordinal = (nextRes.rows[0] as { n: number }).n;
    const { key } = await store.put(ctx.workspaceId, v.sha256, v.bytes);
    const versionId = deps.ids("av");
    await exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
         media_type, created_by, created_at, immutable, producer_query_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`,
      [
        versionId,
        artifactId,
        ordinal,
        v.sha256,
        key,
        v.bytes.byteLength,
        v.wordCount,
        mediaTypeFor(v.path),
        JSON.stringify(ctx.createdBy ?? { kind: "agent" }),
        deps.clock.now(),
        v.producerQueryId ?? null,
      ],
    );
    await exec.query("update artifacts set head_version_id = $2 where id = $1", [artifactId, versionId]);
    out.push({ path: v.path, artifactId, versionId, sha256: v.sha256, kind: v.kind });
  }
  return out;
}
