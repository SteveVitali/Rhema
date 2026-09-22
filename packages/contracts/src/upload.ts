// The quarantine upload path (REQ-ARCH-24; §13.3). Uploads go to a quarantine PREFIX via a presigned PUT with
// a size condition; the client-asserted Content-Type is NOT trusted (it is sniffed at conversion). The GCS
// signed-URL client is an injected seam so this is testable without cloud creds; the live binding is the
// `createGcsV4SignedUrlProvider` in @rhema/live-clients (PRB.20 — IAM signBlob, no private key on Cloud Run).
//
// This module lives in @rhema/contracts (moved from apps/convert/src/upload.ts in PRB.20) because the wire
// contract — the key shape, the size cap, the converted-output key derivation — is shared by the api's
// presign route, the web upload flow, and the convert Job, while @rhema/convert's parser deps (mammoth,
// pdf.js) must NEVER reach the api image (REQ-ARCH-23/F41).

export const QUARANTINE_PREFIX = "quarantine";
/** The prefix the convert Job writes the ConversionResult JSON to (its SA is objectCreator there only). */
export const CONVERTED_PREFIX = "converted";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB (§9.5 / §13.3)

/** The signed-URL provider (real impl: GCS v4 `getSignedUrl` with a content-length condition). */
export interface SignedUrlProvider {
  signedPut(args: {
    readonly bucket: string;
    readonly key: string;
    readonly maxBytes: number;
    readonly expiresSeconds: number;
  }): Promise<{ readonly url: string; readonly requiredHeaders?: Readonly<Record<string, string>> }>;
}

/** The quarantine object key for an upload (prefix-scoped so the fetcher/convert roles are prefix-limited). */
export function quarantineKey(workspaceId: string, uploadId: string): string {
  return `${QUARANTINE_PREFIX}/${workspaceId}/${uploadId}`;
}

/** The converted-result object key the convert Job writes and the api reads back (`quarantine/<ws>/<id>` → `converted/<ws>/<id>.json`). */
export function convertedResultKey(key: string): string {
  return `${CONVERTED_PREFIX}/${key.slice(QUARANTINE_PREFIX.length + 1)}.json`;
}

/**
 * Validate a client-supplied `quarantineKey`. The wire shape is `quarantine/<workspaceId>/<uploadId>` —
 * exactly what the presign route mints (the workspace segment is ULID-class `[A-Za-z0-9_-]`). When
 * `workspaceId` is passed the key must be under THAT tenant's prefix — a session can never preview or
 * create from another workspace's quarantine object (and the `..`/slash charset bound makes key
 * traversal impossible). Returns the parsed segments, or null on any violation.
 */
export function parseQuarantineKey(
  key: unknown,
  workspaceId?: string,
): { workspaceId: string; uploadId: string } | null {
  if (typeof key !== "string") return null;
  const m = /^quarantine\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/.exec(key);
  if (!m) return null;
  if (workspaceId != null && m[1] !== workspaceId) return null;
  return { workspaceId: m[1]!, uploadId: m[2]! };
}

export interface PresignedUpload {
  readonly url: string;
  readonly key: string;
  readonly maxBytes: number;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

/** Presign a quarantine PUT with a size condition. Content-type is deliberately NOT bound (sniffed later). */
export async function presignQuarantinePut(
  provider: SignedUrlProvider,
  args: {
    readonly bucket: string;
    readonly workspaceId: string;
    readonly uploadId: string;
    readonly maxBytes?: number;
    readonly expiresSeconds?: number;
  },
): Promise<PresignedUpload> {
  const maxBytes = Math.min(args.maxBytes ?? MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES);
  const key = quarantineKey(args.workspaceId, args.uploadId);
  const signed = await provider.signedPut({
    bucket: args.bucket,
    key,
    maxBytes,
    expiresSeconds: args.expiresSeconds ?? 300,
  });
  return { url: signed.url, key, maxBytes, requiredHeaders: signed.requiredHeaders ?? {} };
}
