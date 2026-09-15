// The quarantine upload path (REQ-ARCH-24; §13.3). Uploads go to a quarantine PREFIX via a presigned PUT with
// a size condition; the client-asserted Content-Type is NOT trusted (it is sniffed at conversion). The GCS
// signed-URL client is an injected seam so this is testable without cloud creds; the live binding is the
// deploy leg (D-PRB.02-*).

export const QUARANTINE_PREFIX = "quarantine";
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
