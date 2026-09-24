import { Hono, type Context } from "hono";
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
import { upsertProjectSearchDoc } from "./search.js";

// Draft import (PRB.02, deliverable 5). The user uploads a manuscript → `convert` turns it into a
// ConversionResult (canonical markdown + the §5.3 preview) → this creates `v1 (imported)` with
// `origin=human_upload`, storing the normalized bytes in the content store. Conversion NEVER runs in `api`
// (the F41 split): the api calls the convert service through the injected `Converter` seam.

/** The convert-service seam: quarantine key → ConversionResult. Real impl runs the convert Cloud Run Job;
 *  tests fake it. */
export interface Converter {
  /**
   * Convert the quarantined upload → its ConversionResult, or `null` while still converting. `waitMs`
   * bounds how long the call waits on a cold conversion (a live cold Job runs ~2.5–4 min — PRB.21: a
   * bounded call returns `null` = pending and the caller retries; unset ⇒ wait to the runner's full bound).
   */
  preview(quarantineKey: string, opts?: { waitMs?: number }): Promise<ConversionResult | null>;
}

/**
 * The per-request preview wait bound (PRB.21). The prod HTTPS LB's backend timeout bounds a single
 * request well under a cold Job's ~2.5–4 min — the api holds at most this long, then answers 202 and the
 * caller retries (read-back cache / the in-flight marker make a retry ~190 ms and never re-run the Job).
 */
const IMPORT_PREVIEW_WAIT_MS = 25_000;

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
 * Write markdown bytes as a content-addressed artifact + its immutable head version (P1.04: extracted so
 * the draft-import AND the outline-upload paths share it). Order is the portable safeguard: artifact row
 * with a NULL head first, then the version, then the head pointer.
 */
export async function writeMarkdownArtifact(
  deps: CreateImportedDraftDeps,
  args: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly actor: ImportActor;
    readonly markdown: string;
    readonly wordCount: number;
    readonly kind: "draft" | "outline";
    readonly mirrorPath: string;
  },
): Promise<{ artifactId: string; versionId: string; contentSha256: string }> {
  const bytes = new TextEncoder().encode(args.markdown);
  const contentSha256 = sha256Hex(bytes);
  const { key } = await deps.contentStore.put(args.workspaceId, contentSha256, bytes);

  const artifactId = deps.ids();
  const versionId = deps.ids();
  const actorJson = JSON.stringify(args.actor);
  await deps.db.query(
    `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
       values ($1,$2,$3,$4,'shared',$5)`,
    [artifactId, args.workspaceId, args.projectId, args.kind, args.mirrorPath],
  );
  await deps.db.query(
    `insert into artifact_versions
       (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
       values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,true)`,
    [versionId, artifactId, contentSha256, key, bytes.byteLength, args.wordCount, actorJson],
  );
  await deps.db.query(`update artifacts set head_version_id = $2 where id = $1`, [artifactId, versionId]);
  return { artifactId, versionId, contentSha256 };
}

/**
 * Create an imported draft from a ConversionResult: store the normalized markdown bytes (content-addressed),
 * insert the immutable `artifact_versions` row, and create the `drafts` v1 (`origin=human_upload`, frozen to
 * its imported version). The stored markdown is already canonical, so a re-normalize is a no-op (REQ-DATA-9d).
 * `declaredN` (REQ-PROD-8, P1.04) lets a project start at v3 — it wins when ≥ the next free ordinal.
 */
export async function createImportedDraft(
  deps: CreateImportedDraftDeps,
  args: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly actor: ImportActor;
    readonly result: ConversionResult;
    /** the declared version label (a project may start at v3); never renumbers existing drafts. */
    readonly declaredN?: number;
  },
): Promise<CreatedDraft> {
  const { artifactId, versionId, contentSha256 } = await writeMarkdownArtifact(deps, {
    projectId: args.projectId,
    workspaceId: args.workspaceId,
    actor: args.actor,
    markdown: args.result.markdown,
    wordCount: args.result.counts.words,
    kind: "draft",
    mirrorPath: "drafts/pending.md",
  });
  const wordCount = args.result.counts.words;
  const draftId = deps.ids();

  // Compute the next draft ordinal and insert; on a concurrent (project_id, n) collision, recompute + retry.
  let n = 0;
  for (let attempt = 0; ; attempt++) {
    const nRes = await deps.db.query(
      `select coalesce(max(n), 0) + 1 as n from drafts where project_id = $1`,
      [args.projectId],
    );
    const next = Number((nRes.rows[0] as { n: number | string }).n);
    // REQ-PROD-8 — the declared label wins when it does not collide (importable version labels).
    n = args.declaredN != null && args.declaredN >= next ? args.declaredN : next;
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

/**
 * P1.04 — write the uploaded-and-converted outline as the project's `outline` artifact (the Upload-an-
 * outline entry of §5.3). Feeds `outlinePresent` on the §6.3 state input → the project lands `outlined`
 * with the "Draft v1" next-step card.
 */
export async function createOutlineArtifact(
  deps: CreateImportedDraftDeps,
  args: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly actor: ImportActor;
    readonly result: ConversionResult;
  },
): Promise<{ artifactId: string; versionId: string; contentSha256: string }> {
  return writeMarkdownArtifact(deps, {
    projectId: args.projectId,
    workspaceId: args.workspaceId,
    actor: args.actor,
    markdown: args.result.markdown,
    wordCount: args.result.counts.words,
    kind: "outline",
    mirrorPath: "outline.md",
  });
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

  // P1.04 — the shared preview handler. Workspace-scoped (`POST /import/preview`, the new-project
  // flow — no project exists yet) and project-scoped (`POST /projects/:id/import/preview`, the
  // in-project import). Both validate the quarantine key's workspace prefix against the session
  // tenant; the project-scoped variant never used its `:id` for anything else.
  const preview = async (c: Context) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = await c.req.json().catch(() => ({}));
    const key = tenantKey(c, body, principal.workspaceId);
    if (key instanceof Response) return key;
    // PRB.21 — `waitMs` is the caller's request budget (clamped): the call returns 202 `pending` instead
    // of holding open for a cold Job. The web polls this same route — read-back-first + the in-flight
    // marker make a retry cheap and idempotent (never a second `jobs:run`).
    const want = (body as { waitMs?: unknown }).waitMs;
    const waitMs = typeof want === "number" && Number.isFinite(want) ? Math.min(Math.max(want, 0), IMPORT_PREVIEW_WAIT_MS) : undefined;
    const result = await deps.converter.preview(key, waitMs != null ? { waitMs } : undefined);
    if (result == null) return c.json({ pending: true, quarantineKey: key }, 202);
    return c.json({ preview: result });
  };
  app.post("/import/preview", preview);
  app.post("/projects/:id/import/preview", preview);

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
    // Bounded like the preview route (PRB.21): create only proceeds once the converted object exists —
    // a still-converting key answers 409 `conversion_pending` rather than a multi-minute hang.
    const result = await deps.converter.preview(key, { waitMs: IMPORT_PREVIEW_WAIT_MS });
    if (result == null) return c.json({ error: "conversion_pending", quarantineKey: key }, 409);
    // REQ-PROD-8 (P1.04) — the caller may declare the imported draft's version label (start at v3).
    const declaredRaw = (body as { startVersion?: unknown }).startVersion;
    const declaredN =
      typeof declaredRaw === "number" && Number.isInteger(declaredRaw) && declaredRaw >= 1 ? declaredRaw : undefined;
    const created = await createImportedDraft(
      { db: deps.db, contentStore: deps.contentStore, ids: deps.ids },
      {
        projectId,
        workspaceId: principal.workspaceId,
        actor: { kind: "user", userId: principal.userId },
        result,
        ...(declaredN != null ? { declaredN } : {}),
      },
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
    // P1.04 — index the draft body for the §5.2 search (materialized markdown). Non-fatal by contract.
    await upsertProjectSearchDoc(deps.db, {
      projectId,
      workspaceId: principal.workspaceId,
      kind: "draft",
      refId: created.draftId,
      body: result.markdown,
      id: deps.ids,
    }).catch(() => undefined);
    return c.json({ draft: created }, 201);
  });

  return app;
}
