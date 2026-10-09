// The live `ContentStore` binding (D-P0.09-1): artifact bytes in GCS, content-addressed under the run's tenant
// prefix (`tenants/<ws>/objects/<sha256>` — `s3KeyFor`). The seam's `get(sha256)` carries no workspace, so the
// store is BOUND to the run's workspace id (a run is single-tenant): `get` reads `s3KeyFor(workspaceId, sha)`,
// so a run's store can never reach another tenant's objects (RLS's object-layer equivalent). Content addressing
// makes de-dup free — an identical file has the same key and is never re-uploaded.
//
// The store is written against a minimal `GcsBucketLike` surface (the exact @google-cloud/storage methods used),
// so its logic is unit-tested with a fake bucket; the live binding is `createGcsContentStore(...)`.

import { createGcsBytesTransport } from "@rhema/contracts";
import type { ContentStore } from "./content-store.js";
import { s3KeyFor } from "./content-store.js";

/** The subset of a `@google-cloud/storage` File the store uses. */
export interface GcsFileLike {
  download(): Promise<[Buffer]>;
  save(data: Buffer): Promise<void>;
}
/** The subset of a `@google-cloud/storage` Bucket the store uses. */
export interface GcsBucketLike {
  file(name: string): GcsFileLike;
}

/** GCS reports a missing object as an ApiError with `code` 404. */
function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err != null && (err as { code?: unknown }).code === 404;
}

/**
 * `ContentStore` over a GCS bucket. `put` is tenant-explicit (the workspace is a parameter). `get(sha256)` carries
 * no workspace, so a store that must READ is BOUND to the run's workspace (a run is single-tenant) and can never
 * reach another tenant's objects; an UNBOUND store (the api's write-only gate-overlay path) rejects `get` loudly
 * rather than risk a cross-tenant read.
 */
export class GcsContentStore implements ContentStore {
  constructor(
    private readonly bucket: GcsBucketLike,
    private readonly workspaceId?: string,
  ) {}

  async get(sha256: string): Promise<Uint8Array | null> {
    if (this.workspaceId == null) {
      throw new Error("GcsContentStore.get requires a workspace-bound store (a run is single-tenant); this is a write-only store");
    }
    const file = this.bucket.file(s3KeyFor(this.workspaceId, sha256));
    try {
      const [buf] = await file.download();
      return new Uint8Array(buf);
    } catch (err) {
      if (isNotFound(err)) return null; // a dangling manifest entry is a hard error upstream, not here
      throw err;
    }
  }

  async put(workspaceId: string, sha256: string, bytes: Uint8Array): Promise<{ key: string }> {
    const key = s3KeyFor(workspaceId, sha256);
    await this.bucket.file(key).save(Buffer.from(bytes));
    return { key };
  }
}

/**
 * Construct a live `GcsContentStore` for a run's workspace. Dynamically imports `@google-cloud/storage` so the
 * package's pure tests never load it. `bucketName` is the versioned objects bucket (§13.3).
 *
 * OBS.1 — byte ops go through `createGcsBytesTransport` (plain fetch, no node streams) instead of
 * `file.download()`/`file.save()`: the library path funnels every call through teeny-request's
 * stream mode, whose stacked pipeline()/eos listener sets on node-fetch's res.body PassThrough
 * are the MaxListenersExceededWarning leak. `Storage` is still constructed here only for ADC
 * (`authClient.getRequestHeaders`) — no stream APIs are touched.
 */
export async function createGcsContentStore(args: { bucketName: string; workspaceId?: string }): Promise<GcsContentStore> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const bucket = createGcsBytesTransport({
    getAuthHeaders: (url) => storage.authClient.getRequestHeaders(url),
  }).bucket(args.bucketName);
  const gcsBucket: GcsBucketLike = {
    file: (name) => {
      const f = bucket.file(name);
      return {
        download: async (): Promise<[Buffer]> => [Buffer.from((await f.download())[0])],
        save: (data: Buffer) => f.save(data),
      };
    },
  };
  return new GcsContentStore(gcsBucket, args.workspaceId);
}
