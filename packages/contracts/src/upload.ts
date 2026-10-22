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

// ---------------------------------------------------------------------------
// §13.3 served-object policy (R6UCD.1 / ADR-113 — the API-minted V4-URL contract)
// ---------------------------------------------------------------------------
//
// Amended 2026-10-21 (ADR-113): user-uploaded bytes are served by API-minted GCS V4 signed GET
// URLs on `storage.googleapis.com` — not by an edge-signed CDN backend (that path is inert; the
// LB→bucket origin read was never granted). The serving contract is UNCHANGED: an object serves
// inline only when its type is on the rendered allowlist; EVERYTHING else downloads as
// `application/octet-stream` + `Content-Disposition: attachment`. With V4 URLs the contract is
// carried by the `response-content-type` / `response-content-disposition` params signed into the
// URL — GCS emits them verbatim regardless of the object's stored metadata. No cookie can ever
// ride: the URL lands on Google's host, outside every `rhema.tools` cookie scope.

/** Types safe to render inline from a served user-content URL (images only at beta). Everything
 *  else downloads. `apps/convert`'s `RENDERED_ALLOWLIST` re-derives from this — ONE allowlist for
 *  the legacy origin-header path and the minted-URL path. */
export const USERCONTENT_RENDERED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** The TTL the api mints user-content GET URLs at (R6UCD.1): 5 minutes — long enough for the
 *  browser to start the fetch, short enough that a leaked URL dies fast. The same bound the
 *  quarantine PUT presign uses. */
export const USERCONTENT_URL_TTL_SECONDS = 300;

/** The §13.3 response contract for a served object of `contentType`: allowlisted image types
 *  render inline as themselves; EVERYTHING else (html/js/svg/pdf/unknown/empty) downloads as
 *  `application/octet-stream` + `Content-Disposition: attachment`. The two returned values become
 *  the signed URL's `response-content-type` / `response-content-disposition` params — GCS cannot
 *  emit `X-Content-Type-Options`, so the attachment disposition carries the no-render guarantee
 *  on the minted path. */
export function userContentResponsePolicy(contentType?: string | null): {
  contentType: string;
  contentDisposition: "inline" | "attachment";
} {
  const base = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const rendered = (USERCONTENT_RENDERED_TYPES as readonly string[]).includes(base);
  return {
    contentType: rendered ? base : "application/octet-stream",
    contentDisposition: rendered ? "inline" : "attachment",
  };
}

/** Parse `converted/<workspaceId>/<uploadId>.json` — the tenant-declaring twin of
 *  `parseQuarantineKey` (the convert Job's write prefix; the same charset bound makes key
 *  traversal impossible). */
export function parseConvertedKey(
  key: unknown,
  workspaceId?: string,
): { workspaceId: string; uploadId: string } | null {
  if (typeof key !== "string") return null;
  const m = /^converted\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.json$/.exec(key);
  if (!m) return null;
  if (workspaceId != null && m[1] !== workspaceId) return null;
  return { workspaceId: m[1]!, uploadId: m[2]! };
}

/**
 * The owning workspace of a mint-eligible user-content key — the tenant segment a key carries on
 * its own. `quarantine/<ws>/<id>` and `converted/<ws>/<id>.json` are mint-eligible; every other
 * shape (`ingest-originals/<sha>` — sha-addressed, no tenant segment — and everything else)
 * returns null, meaning ownership can only be proven by a tenant-scoped row resolve (the
 * `/voices/:id/samples/:itemId/raw` path), never by the generic mint route.
 */
export function userContentKeyOwner(key: unknown): { workspaceId: string } | null {
  const q = parseQuarantineKey(key);
  if (q) return { workspaceId: q.workspaceId };
  const conv = parseConvertedKey(key);
  if (conv) return { workspaceId: conv.workspaceId };
  return null;
}

/** The cloud seam behind `mintUserContentUrl` (R6UCD.1): signs ONE bucket object GET, binding the
 *  §13.3 response headers into the signature. Live impl: `createGcsV4UserContentSigner`
 *  (`@rhema/live-clients`); tests drive fakes. The port owns NO tenant logic — callers own the
 *  check, exactly like `SignedUrlProvider` owns no auth. */
export interface UserContentSigner {
  signGet(args: {
    key: string;
    /** Seconds of signature validity — the helper clamps this to `USERCONTENT_URL_TTL_SECONDS`. */
    expiresSeconds: number;
    /** Becomes the signed `response-content-type` query param. */
    responseType: string;
    /** Becomes the signed `response-content-disposition` query param. */
    responseDisposition: string;
  }): Promise<{ url: string; expiresAt: number }>;
}

/**
 * The ONE mint decision (R6UCD.1 / REQ-POST-7 — consumed by this route, the R6POST.1 probe route,
 * and R6SECR.1): given a key the caller has ALREADY tenant-checked and its claimed content type,
 * mint a short-lived signed GET that serves the §13.3 policy — allowlisted image types inline as
 * themselves, everything else `attachment` + `application/octet-stream`, TTL clamped to
 * `USERCONTENT_URL_TTL_SECONDS`. Returns `{url, expiresAt}` — callers serialize it verbatim so a
 * URL never leaks into an error body.
 */
export async function mintUserContentUrl(
  signer: UserContentSigner,
  args: { key: string; contentType?: string | null; expiresSeconds?: number },
): Promise<{ url: string; expiresAt: number }> {
  const policy = userContentResponsePolicy(args.contentType);
  const asked = Math.floor(args.expiresSeconds ?? USERCONTENT_URL_TTL_SECONDS);
  const expiresSeconds = Math.max(1, Math.min(USERCONTENT_URL_TTL_SECONDS, asked));
  return signer.signGet({
    key: args.key,
    expiresSeconds,
    responseType: policy.contentType,
    responseDisposition: policy.contentDisposition,
  });
}

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
