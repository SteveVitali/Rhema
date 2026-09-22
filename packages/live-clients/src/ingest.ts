// The live ingestion bindings (PRB.20; D-PRB.02-1): the api-side halves of the browser-upload golden path.
//  - `createGcsV4SignedUrlProvider` — the SignedUrlProvider the presign route composes. A v4 `getSignedUrl`
//    for a PUT bound by `x-goog-content-length-range`; on Cloud Run the client library signs through IAM
//    Credentials `signBlob` automatically (no private key material on the service — the api SA carries a
//    self `roles/iam.serviceAccountTokenCreator` grant, infra/pulumi/iam.ts).
//  - `createConvertJobPreview` — the Converter the import routes compose. It runs the no-network convert
//    Cloud Run Job (Cloud Run Admin API v2 `jobs:run`, container args = mounted-bucket paths) and reads the
//    ConversionResult back from `converted/<ws>/<id>.json` — the Job's ONLY write grant. The converted object
//    is the completion signal AND the transport (the Job's logs are not a contract). Read-back-first makes a
//    re-preview idempotent: a second preview of the same key skips the Job run entirely.
// Everything heavy is injected — the GCS surface, the fetch impl, the token source, the clock — so the wire
// shape is unit-tested here and proven live in Stage B.

import {
  convertedResultKey,
  conversionResultSchema,
  parseQuarantineKey,
  type ConversionResult,
  type SignedUrlProvider,
} from "@rhema/contracts";
import { fetchGceMetadataAccessToken } from "./k8s-launcher.js";

// ---------------------------------------------------------------------------
// Signed PUTs (v4)
// ---------------------------------------------------------------------------

export interface SignedUrlRequest {
  readonly version: "v4";
  readonly action: "write";
  /** Epoch ms when the signature expires. */
  readonly expires: number;
  /** Headers the signature binds — the client MUST send them verbatim. */
  readonly extensionHeaders?: Readonly<Record<string, string>>;
}

/** The slice of @google-cloud/storage's File the presigner needs. */
export interface GcsSignedUrlFileLike {
  getSignedUrl(cfg: SignedUrlRequest): Promise<unknown>; // resolves [url] (or the bare string on some fakes)
}

export interface GcsSignedUrlStorageLike {
  bucket(name: string): { file(key: string): GcsSignedUrlFileLike };
}

/**
 * The live SignedUrlProvider over @google-cloud/storage v4 signing. `maxBytes` becomes a signed
 * `x-goog-content-length-range: 0,<n>` extension header — GCS rejects an over-cap PUT (413) before the
 * bytes land in quarantine (the api-side cap is the friendlier boundary; this is the enforceable one).
 */
export function createGcsV4SignedUrlProvider(
  storage: GcsSignedUrlStorageLike,
  now: () => number = Date.now,
): SignedUrlProvider {
  return {
    async signedPut({ bucket, key, maxBytes, expiresSeconds }) {
      const range = `0,${maxBytes}`;
      const res = await storage.bucket(bucket).file(key).getSignedUrl({
        version: "v4",
        action: "write",
        expires: now() + expiresSeconds * 1000,
        extensionHeaders: { "x-goog-content-length-range": range },
      });
      const url = Array.isArray(res) ? String(res[0]) : String(res);
      return { url, requiredHeaders: { "x-goog-content-length-range": range } };
    },
  };
}

/** The deploy binding: @google-cloud/storage with Application Default Credentials (IAM signBlob on Cloud Run). */
export async function createStorageV4SignedUrlProvider(): Promise<SignedUrlProvider> {
  const { Storage } = (await import("@google-cloud/storage")) as typeof import("@google-cloud/storage");
  return createGcsV4SignedUrlProvider(new Storage() as unknown as GcsSignedUrlStorageLike);
}

// ---------------------------------------------------------------------------
// Object readback (converted/ results)
// ---------------------------------------------------------------------------

export interface GcsObjectFileLike {
  download(): Promise<readonly [Uint8Array | Buffer | string]>;
}
export interface GcsObjectsLike {
  file(name: string): GcsObjectFileLike;
}

/** The deploy binding: a bucket-bound object reader over @google-cloud/storage. */
export async function createGcsObjects(bucket: string): Promise<GcsObjectsLike> {
  const { Storage } = (await import("@google-cloud/storage")) as typeof import("@google-cloud/storage");
  const b = new Storage().bucket(bucket);
  return { file: (name) => b.file(name) as unknown as GcsObjectFileLike };
}

// ---------------------------------------------------------------------------
// The convert Job runner (Cloud Run Admin API v2)
// ---------------------------------------------------------------------------

/** A fetch shape wide enough for the Run Admin API (method + JSON body); k8s-launcher.ts's `FetchLike` is GET-only. */
export interface RestFetchLike {
  (input: string, init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  }): Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;
}

interface RunOperation {
  readonly name: string;
  readonly done?: boolean;
  readonly error?: { readonly message?: string };
}

export interface ConvertJobArgs {
  /** Full Job resource name: `projects/<p>/locations/<r>/jobs/<name>`. */
  readonly job: string;
  /** The user-content bucket the Job's volume mounts (the api reads the result back from it). */
  readonly bucket: string;
  /** Bucket-bound object reader for `converted/` readback. */
  readonly objects: GcsObjectsLike;
  /**
   * The mount path inside the Job container (a gcsfuse volume over `bucket`; deploy fact, Pulumi-owned —
   * default `/usercontent`). Container args are `<mount>/<quarantineKey>` → `<mount>/<convertedKey>`.
   */
  readonly mountPath?: string;
  /** Bound the wait for the Job run (default 120s — the dev gate measures ~20s for an 8k docx). */
  readonly timeoutMs?: number;
  /** Operation poll cadence (default 1s). */
  readonly pollIntervalMs?: number;
  /** Injected seams for the deterministic tests; prod wires fetch + metadata-server access token. */
  readonly fetchImpl?: RestFetchLike;
  readonly tokenFor?: () => Promise<string>;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MOUNT = "/usercontent";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 1_000;
const RUN_API = "https://run.googleapis.com/v2";

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The access-token source is k8s-launcher.ts's `fetchGceMetadataAccessToken` (metadata server, the runtime
// SA — the same pattern the worker's GKE launcher uses).

/**
 * The live Converter (apps/api/src/import.ts `Converter.preview`). Validates the quarantine key shape,
 * serves a cached converted object if the Job already ran for this upload, otherwise runs the Job
 * (`jobs:run` + container-arg override → mounted paths), polls the LRO, then reads the result object.
 */
export function createConvertJobPreview(args: ConvertJobArgs): {
  preview(quarantineKey: string): Promise<ConversionResult>;
} {
  const mount = (args.mountPath ?? DEFAULT_MOUNT).replace(/\/+$/, "");
  const fetchImpl: RestFetchLike = args.fetchImpl ?? (fetch as unknown as RestFetchLike);
  const tokenFor = args.tokenFor ?? (() => fetchGceMetadataAccessToken());
  const sleep = args.sleep ?? sleepMs;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = args.pollIntervalMs ?? DEFAULT_POLL_MS;

  async function readResult(key: string): Promise<ConversionResult | null> {
    try {
      const [buf] = await args.objects.file(convertedResultKey(key)).download();
      const text = typeof buf === "string" ? buf : Buffer.from(buf).toString("utf8");
      return conversionResultSchema.parse(JSON.parse(text));
    } catch (e) {
      // A missing object is "not converted yet"; a malformed one is a real failure — rethrow.
      const code = (e as { code?: number | string }).code;
      if (code === 404 || code === "404" || /not.?found|no such object/i.test(String((e as Error)?.message ?? e))) {
        return null;
      }
      throw e;
    }
  }

  return {
    async preview(quarantineKey: string): Promise<ConversionResult> {
      const parsed = parseQuarantineKey(quarantineKey);
      if (!parsed) throw new Error("invalid_quarantine_key");

      // Idempotent re-preview: the result object already exists ⇒ skip the Job run entirely.
      const cached = await readResult(quarantineKey);
      if (cached) return cached;

      const outKey = convertedResultKey(quarantineKey);
      const token = await tokenFor();
      const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const run = await fetchImpl(`${RUN_API}/${args.job}:run`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          overrides: {
            taskCount: 1,
            containerOverrides: [{ args: [`${mount}/${quarantineKey}`, `${mount}/${outKey}`] }],
          },
        }),
      });
      if (!run.ok) throw new Error(`convert job run failed (${run.status})`);
      const op = (await run.json()) as RunOperation;
      if (!op.name) throw new Error("convert job run returned no operation name");

      // Poll the LRO until done/error/timeout. The converted OBJECT is the durable result — the
      // operation only gates when to read it.
      const deadline = Date.now() + timeoutMs;
      let cur: RunOperation = op;
      while (!cur.done) {
        if (Date.now() > deadline) throw new Error("convert job timed out");
        await sleep(pollMs);
        const got = await fetchImpl(`${RUN_API}/${cur.name}`, { headers: auth });
        if (!got.ok) throw new Error(`convert operation poll failed (${got.status})`);
        cur = (await got.json()) as RunOperation;
      }
      if (cur.error) throw new Error(`convert job failed: ${cur.error.message ?? "unknown"}`);

      const result = await readResult(quarantineKey);
      if (!result) throw new Error("convert_output_missing"); // job done but no converted object — fail loud
      return result;
    },
  };
}
