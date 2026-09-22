import { Hono } from "hono";
import { sha256Hex, type ContentStore } from "@rhema/mirror";
import {
  presignQuarantinePut,
  parseQuarantineKey,
  type ConversionResult,
  type SignedUrlProvider,
} from "@rhema/contracts";
import { recordAnalyticsEvent } from "@rhema/ledger";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";

// Draft import (PRB.02, deliverable 5). The user uploads a manuscript → `convert` turns it into a
// ConversionResult (canonical markdown + the §5.3 preview) → this creates `v1 (imported)` with
// `origin=human_upload`, storing the normalized bytes in the content store. Conversion NEVER runs in `api`
// (the F41 split): the api calls the convert service through the injected `Converter` seam.

/** The convert-service seam: quarantine key → ConversionResult. Real impl POSTs to `convert`; tests fake it. */
export interface Converter {
  preview(quarantineKey: string): Promise<ConversionResult>;
}

export interface ImportActor {
  readonly kind: "user";
  readonly userId: string;
}

export interface CreateImportedDraftDeps {
  readonly db: SqlClient;
  readonly contentStore: ContentStore;
  readonly ids: () => string;
}

export interface CreatedDraft {
  readonly draftId: string;
  readonly versionId: string;
  readonly artifactId: string;
  readonly n: number;
  readonly wordCount: number;
  readonly contentSha256: string;
}

/**
 * Create an imported draft from a ConversionResult: store the normalized markdown bytes (content-addressed),
 * insert the immutable `artifact_versions` row, and create the `drafts` v1 (`origin=human_upload`, frozen to
 * its imported version). The stored markdown is already canonical, so a re-normalize is a no-op (REQ-DATA-9d).
 */
export async function createImportedDraft(
  deps: CreateImportedDraftDeps,
  args: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly actor: ImportActor;
    readonly result: ConversionResult;
  },
): Promise<CreatedDraft> {
  const bytes = new TextEncoder().encode(args.result.markdown);
  const contentSha256 = sha256Hex(bytes);
  const { key } = await deps.contentStore.put(args.workspaceId, contentSha256, bytes);
  const wordCount = args.result.counts.words;

  const artifactId = deps.ids();
  const versionId = deps.ids();
  const draftId = deps.ids();
  const actorJson = JSON.stringify(args.actor);

  // Order the writes so a mid-way failure never leaves a dangling reference: the artifact is created with a
  // NULL head first, then the version, then the head is pointed at it. (A cross-pool transaction needs the
  // orchestrator's tx wrapper — the live api binding, D-P0.08-1 — so the ordering is the portable safeguard.)
  await deps.db.query(
    `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
       values ($1,$2,$3,'draft','shared',$4)`,
    [artifactId, args.workspaceId, args.projectId, "drafts/pending.md"],
  );
  await deps.db.query(
    `insert into artifact_versions
       (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
       values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,true)`,
    [versionId, artifactId, contentSha256, key, bytes.byteLength, wordCount, actorJson],
  );
  await deps.db.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);

  // Compute the next draft ordinal and insert; on a concurrent (project_id, n) collision, recompute + retry.
  let n = 0;
  for (let attempt = 0; ; attempt++) {
    const nRes = await deps.db.query(
      `select coalesce(max(n), 0) + 1 as n from drafts where project_id = $1`,
      [args.projectId],
    );
    n = Number((nRes.rows[0] as { n: number | string }).n);
    try {
      await deps.db.query(
        `insert into drafts (id, project_id, n, origin, state, promoted_version_id)
           values ($1,$2,$3,'human_upload','frozen',$4)`,
        [draftId, args.projectId, n, versionId],
      );
      break;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (attempt < 4 && /unique|duplicate/i.test(msg)) continue; // lost the (project_id, n) race — retry
      throw e;
    }
  }
  await deps.db.query(`update artifacts set mirror_path = $2 where id = $1`, [artifactId, `drafts/v${n}.md`]);

  return { draftId, versionId, artifactId, n, wordCount, contentSha256 };
}

/** The upload-presign binding (PRB.20): the signer + the user-content bucket the quarantine keys land in. */
export interface ImportUploadDeps {
  readonly provider: SignedUrlProvider;
  readonly bucket: string;
}

export interface ImportApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  readonly contentStore: ContentStore;
  readonly converter: Converter;
  readonly ids: () => string;
  /** the presign binding; when unset the `/import/presign` route is not mounted (PRB.20). */
  readonly uploads?: ImportUploadDeps;
  /** for the `draft.imported` analytics write (PRB.12); defaults to wall-clock when unset. */
  readonly clock?: { now(): Date };
}

/**
 * Validate the wire `quarantineKey` against the session tenant: `quarantine/<workspaceId>/<uploadId>`,
 * workspace segment === the principal's workspace. 400 on a malformed key, 403 on another tenant's prefix —
 * a session can never preview or create from an object it could not have presigned (PRB.20).
 */
function tenantKey(
  c: { json: (b: unknown, s: number) => Response },
  body: unknown,
  workspaceId: string,
): string | Response {
  const parsed = parseQuarantineKey((body as { quarantineKey?: unknown })?.quarantineKey);
  if (!parsed) return c.json({ error: "quarantineKey required" }, 400);
  if (parsed.workspaceId !== workspaceId) return c.json({ error: "forbidden" }, 403);
  return (body as { quarantineKey: string }).quarantineKey;
}

/** The import routes: presign a quarantine PUT, preview a conversion, create the draft (session-authed). */
export function createImportRoutes(deps: ImportApiDeps): Hono {
  const app = new Hono();

  // POST /import/presign — mint a workspace-scoped quarantine key + a v4-signed PUT bound to ≤25 MB.
  // The browser then PUTs bytes straight to GCS with the signed headers; no session cookie ever leaves
  // the api origin. Not project-scoped: the key carries the workspace, the project binds at create.
  if (deps.uploads) {
    const { provider, bucket } = deps.uploads;
    app.post("/import/presign", async (c) => {
      const principal = deps.principal(c);
      if (!principal) return c.json({ error: "unauthenticated" }, 401);
      const upload = await presignQuarantinePut(provider, {
        bucket,
        workspaceId: principal.workspaceId,
        uploadId: deps.ids(),
      });
      return c.json(upload);
    });
  }

  app.post("/projects/:id/import/preview", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const key = tenantKey(c, body, principal.workspaceId);
    if (key instanceof Response) return key;
    const result = await deps.converter.preview(key);
    return c.json({ preview: result });
  });

  app.post("/projects/:id/import/create", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const key = tenantKey(c, body, principal.workspaceId);
    if (key instanceof Response) return key;
    // The draft lands under projects/<id> — verify the project is real under this tenant's scope
    // (the scoped db returns no row for another workspace's project id) BEFORE paying a convert run.
    const project = await deps.db.query("select id from projects where id = $1", [projectId]);
    if (project.rows.length === 0) return c.json({ error: "not_found" }, 404);
    const result = await deps.converter.preview(key);
    const created = await createImportedDraft(
      { db: deps.db, contentStore: deps.contentStore, ids: deps.ids },
      { projectId, workspaceId: principal.workspaceId, actor: { kind: "user", userId: principal.userId }, result },
    );
    // draft.imported (PRB.12 emission audit — this route owns it): `origin` is the converted source
    // format; `is_new_manuscript` = the import opened the project (its first draft); `venue_set`
    // reports whether the partner had already declared a venue on the project. Post-commit and
    // non-fatal: a telemetry failure is logged, never a failed import.
    const venue = (
      await deps.db.query("select venue from projects where id = $1", [projectId]).catch(() => ({ rows: [] as unknown[] }))
    ).rows[0] as { venue: string | null } | undefined;
    await recordAnalyticsEvent(deps.db, { ids: deps.ids, clock: deps.clock ?? { now: () => new Date() } }, {
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      projectId,
      event: "draft.imported",
      props: {
        origin: result.sourceFormat,
        is_new_manuscript: created.n === 1,
        venue_set: venue?.venue != null,
      },
    }).catch((err: unknown) =>
      console.error("[api] draft.imported analytics failed:", err instanceof Error ? err.message : err),
    );
    return c.json({ draft: created }, 201);
  });

  return app;
}
