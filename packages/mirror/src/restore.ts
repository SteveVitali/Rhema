// Restore points — the storage half (P1.03, moved from @rhema/collab in P1.08 so the api's
// browse/preview/restore routes reuse it; §11.4). Points are Yjs updates under
// `restore/<liveDocId>/<ts>` in the objects bucket: a daily `kind='snapshot'` holds the doc's full
// `encodeStateAsUpdate`; `kind='delta'` points hold the update diff against that snapshot's state
// vector — each delta is SELF-SUFFICIENT from its snapshot base, so reconstruction is "latest
// snapshot ≤ T, then the newest delta ≤ T" (deltas compose idempotently either way, but the
// relative-encoding keeps a lone delta meaningful). `cause` is 'timer' (5 min of activity), 'blur'
// (pagehide/hidden), 'pre_run' (the lock-landing checkpoint), 'named' (⌘S), 'auto'/'workflow' for
// compatibility with the pre-collab rows.
//
// Retention (ledger F12 — the per-plan values below are the MVP table, documented here and in the
// run ledger): a workspace's plan tier sets the window; `named` points never expire; the LATEST
// snapshot per live doc is always kept (a window that cut every snapshot would strand the deltas).
// The sweeper itself stays in @rhema/collab (it owns the hourly cron seam).

import * as Y from "yjs";
import type { SqlExecutor } from "./sql.js";

/** The object-store seam restore blobs ride (GCS in prod; in-memory in tests). Keys are verbatim. */
export interface RestoreBlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export class InMemoryRestoreBlobStore implements RestoreBlobStore {
  readonly blobs = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.blobs.set(key, bytes);
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}

/** `restore/<ydoc>/<ts>` (§11.4) — `<ts>` is epoch-millis + the row id so same-ms points never collide. */
export function restoreKey(liveDocId: string, at: Date, id: string): string {
  return `restore/${liveDocId}/${at.getTime()}-${id}`;
}

/** Per-plan restore-point retention (ledger F12's MVP values — see the module comment). */
export const RESTORE_RETENTION: Readonly<Record<string, { days: number }>> = {
  free: { days: 7 },
  writer: { days: 30 },
  studio: { days: 90 },
  studio_max: { days: 365 },
  team: { days: 365 },
};
export const DEFAULT_RESTORE_RETENTION_DAYS = RESTORE_RETENTION["free"]!.days;

/** How long since the last point before a `timer` point is owed ("every 5 min of activity"). */
export const RESTORE_ACTIVITY_MS = 5 * 60 * 1000;
/** The daily full-snapshot cadence deltas chain from. */
export const RESTORE_SNAPSHOT_MS = 24 * 60 * 60 * 1000;

export type RestoreCause = "auto" | "timer" | "blur" | "pre_run" | "named" | "workflow";
export type RestoreKind = "snapshot" | "delta";

export interface WriteRestorePointArgs {
  readonly kind: RestoreKind;
  readonly cause: RestoreCause;
  readonly label?: string | null;
  readonly bytes: Uint8Array;
  readonly at: Date;
}

/**
 * Write one restore point: the blob to `restore/<liveDoc>/<ts>` + the `restore_points` row. Returns
 * the row id. The caller decides kind/cause/bytes — this is the write, not the policy.
 */
export async function writeRestorePoint(
  exec: SqlExecutor,
  blobs: RestoreBlobStore,
  ids: (prefix: string) => string,
  liveDocId: string,
  args: WriteRestorePointArgs,
): Promise<string> {
  const id = ids("rp");
  const key = restoreKey(liveDocId, args.at, id);
  await blobs.put(key, args.bytes);
  await exec.query(
    `insert into restore_points(id, live_doc_id, s3_key, kind, cause, label, created_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, liveDocId, key, args.kind, args.cause, args.label ?? null, args.at],
  );
  return id;
}

/**
 * Reconstruct the document state a live doc held at `at` (default: latest): latest SNAPSHOT ≤ at,
 * then the newest DELTA ≤ at over it (each delta is encoded against the snapshot's state vector, so
 * one delta already contains everything the snapshot lacks — older deltas are redundant but harmless).
 * Returns null when no snapshot ≤ at exists.
 */
export async function reconstructDocState(
  exec: SqlExecutor,
  blobs: RestoreBlobStore,
  liveDocId: string,
  at?: Date,
): Promise<Y.Doc | null> {
  const bound = at ?? new Date("9999-12-31T00:00:00Z");
  const snap = (
    await exec.query(
      `select s3_key, created_at from restore_points
        where live_doc_id = $1 and kind = 'snapshot' and created_at <= $2
        order by created_at desc limit 1`,
      [liveDocId, bound],
    )
  ).rows[0] as { s3_key: string; created_at: Date } | undefined;
  if (!snap) return null;
  const snapBytes = await blobs.get(snap.s3_key);
  if (!snapBytes) return null;

  const doc = new Y.Doc();
  Y.applyUpdate(doc, snapBytes);
  const deltas = (
    await exec.query(
      `select s3_key from restore_points
        where live_doc_id = $1 and kind = 'delta' and created_at <= $2 and created_at > $3
        order by created_at asc, id asc`,
      [liveDocId, bound, snap.created_at],
    )
  ).rows as { s3_key: string }[];
  for (const d of deltas) {
    const bytes = await blobs.get(d.s3_key);
    if (bytes) Y.applyUpdate(doc, bytes);
  }
  return doc;
}

// ── The live binding ─────────────────────────────────────────────────────────────────────────────

/** The subset of a `@google-cloud/storage` File the restore blob store uses. */
export interface GcsRestoreFileLike {
  download(): Promise<[Buffer]>;
  save(data: Buffer): Promise<void>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}
/** The subset of a `@google-cloud/storage` Bucket the restore blob store uses. */
export interface GcsRestoreBucketLike {
  file(name: string): GcsRestoreFileLike;
}

function isGcsNotFound(err: unknown): boolean {
  return typeof err === "object" && err != null && (err as { code?: unknown }).code === 404;
}

/** `RestoreBlobStore` over the shared objects bucket (restore keys are verbatim, tenant-scoped by path). */
export class GcsRestoreBlobStore implements RestoreBlobStore {
  constructor(private readonly bucket: GcsRestoreBucketLike) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    await this.bucket.file(key).save(Buffer.from(bytes));
  }
  async get(key: string): Promise<Uint8Array | null> {
    try {
      const [buf] = await this.bucket.file(key).download();
      return new Uint8Array(buf);
    } catch (err) {
      if (isGcsNotFound(err)) return null;
      throw err;
    }
  }
  async delete(key: string): Promise<void> {
    try {
      await this.bucket.file(key).delete({ ignoreNotFound: true });
    } catch (err) {
      if (isGcsNotFound(err)) return;
      throw err;
    }
  }
}

/**
 * Construct a live `GcsRestoreBlobStore` for the objects bucket. Dynamically imports
 * `@google-cloud/storage` so the package's pure tests never load it.
 */
export async function createGcsRestoreBlobStore(bucketName: string): Promise<GcsRestoreBlobStore> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const bucket = storage.bucket(bucketName) as unknown as GcsRestoreBucketLike;
  return new GcsRestoreBlobStore(bucket);
}
