// Content-addressed blob storage (§11.5, §12.2 "content-addressed S3 upload"). Artifact bytes live in GCS
// keyed by their sha256; the DB row (`artifact_versions.s3_key` + `content_sha256`) is the pointer. The mirror
// reads bytes to materialize a file and writes bytes to version a changed file. The store is an injected seam
// so materialize/harvest are pure of GCS: `InMemoryContentStore` (testing) and the live GCS client both
// satisfy `ContentStore`. Content addressing makes de-duplication free: an identical file has the same key and
// is never re-uploaded, which is exactly what the round-trip golden (REQ-DATA-9a) relies on.

import { createHash } from "node:crypto";

/** The sha256 of some bytes, lower-case hex — the content address (§11.5 manifest sha256). */
export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256")
    .update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes)
    .digest("hex");
}

/** The canonical object key for a content hash in a workspace's bucket (matches the seed's layout). */
export function s3KeyFor(workspaceId: string, sha256: string): string {
  return `tenants/${workspaceId}/objects/${sha256}`;
}

export interface ContentStore {
  /** Fetch the bytes at a content hash, or null if absent (a dangling manifest entry is a hard error upstream). */
  get(sha256: string): Promise<Uint8Array | null>;
  /** Store bytes under their content hash (idempotent — the caller passes the hash it computed). Returns the key. */
  put(workspaceId: string, sha256: string, bytes: Uint8Array): Promise<{ key: string }>;
}

/** In-memory `ContentStore` for tests — a Map keyed by sha256. Deterministic; no network. */
export class InMemoryContentStore implements ContentStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async get(sha256: string): Promise<Uint8Array | null> {
    return this.blobs.get(sha256) ?? null;
  }

  async put(workspaceId: string, sha256: string, bytes: Uint8Array): Promise<{ key: string }> {
    this.blobs.set(sha256, bytes);
    return { key: s3KeyFor(workspaceId, sha256) };
  }

  /** Test convenience: put UTF-8 text at its own hash and return that hash + key. */
  async putText(workspaceId: string, text: string): Promise<{ sha256: string; key: string }> {
    const sha256 = sha256Hex(text);
    const { key } = await this.put(workspaceId, sha256, Buffer.from(text, "utf8"));
    return { sha256, key };
  }

  has(sha256: string): boolean {
    return this.blobs.has(sha256);
  }

  get size(): number {
    return this.blobs.size;
  }
}
