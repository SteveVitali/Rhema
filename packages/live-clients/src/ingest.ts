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
  readonly action: "write" | "read";
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

/**
 * STB.2 (P1.18 account-zip download) — a v4 GET presigner over one bucket: the api's
 * `exportPresign` seam turns an `account_exports.s3_key` into the emailed/downloaded URL. Same
 * signBlob path as the PUT provider — no key material on the service.
 */
export async function createGcsV4GetPresigner(
  bucket: string,
  expiresSeconds = 15 * 60,
): Promise<(objectKey: string) => Promise<string>> {
  const { Storage } = (await import("@google-cloud/storage")) as typeof import("@google-cloud/storage");
  const file = (key: string) =>
    (new Storage().bucket(bucket) as unknown as { file(k: string): GcsSignedUrlFileLike }).file(key);
  return async (objectKey) => {
    const res = await file(objectKey).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresSeconds * 1000,
    });
    return Array.isArray(res) ? String(res[0]) : String(res);
  };
}

// ---------------------------------------------------------------------------
// Object readback (converted/ results)
// ---------------------------------------------------------------------------

export interface GcsObjectFileLike {
  download(): Promise<readonly [Uint8Array | Buffer | string]>;
  /**
   * PRB.21 — the in-flight marker write. `preconditionOpts.ifGenerationMatch: 0` maps to GCS's
   * create-only precondition (412 when the object exists) — the atomic claim that makes two
   * simultaneous previews dedupe instead of racing two `jobs:run`s. Absent ⇒ dedupe is skipped.
   */
  save?(data: string | Uint8Array, opts?: { preconditionOpts?: { ifGenerationMatch?: number } }): Promise<unknown>;
  /** PRB.21 — clear a marker whose execution died or lied (404). */
  delete?(): Promise<unknown>;
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

/**
 * The bucket-bound byte store behind the ingestion `IngestBlobs`/`BlobPort` seams (P1.15): reads the
 * quarantined export zip + fetched originals, writes fetched bodies for the convert Job, deletes
 * retained bytes on `voice.purge`. Live impl over `createGcsObjects`; tests drive fakes.
 */
export async function createGcsBlobStore(bucket: string): Promise<{
  read(key: string): Promise<Uint8Array | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}> {
  const objects = await createGcsObjects(bucket);
  return {
    async read(key) {
      try {
        const [buf] = await objects.file(key).download();
        return typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf);
      } catch (e) {
        const code = (e as { code?: number | string }).code;
        if (code === 404 || code === "404" || /not.?found|no such object/i.test(String((e as Error)?.message ?? e))) {
          return null;
        }
        throw e;
      }
    },
    async write(key, bytes) {
      const f = objects.file(key);
      if (!f.save) throw new Error("gcs write unsupported");
      await f.save(bytes);
    },
    async delete(key) {
      await objects.file(key).delete?.().catch(() => undefined); // best-effort byte cleanup
    },
  };
}

// ---------------------------------------------------------------------------
// The fetcher-service client (P1.15 — the FetchPort prod binding)
// ---------------------------------------------------------------------------

/** The wire shape of the fetcher service's POST /fetch (apps/fetcher/src/server.ts). */
export interface FetcherServiceResponse {
  readonly ok: boolean;
  readonly status?: number;
  readonly finalUrl?: string;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly bytesBase64?: string;
  readonly denyReason?: string;
  readonly reason?: string;
}

/** The FetchPort shape @rhema/ingest consumes (duplicated here — live-clients has no ingest dep;
 *  structurally identical to `FetchPort`). */
export interface FetcherServicePort {
  get(
    url: string,
    opts?: { readonly accept?: readonly string[] },
  ): Promise<
    | {
        readonly ok: true;
        readonly status: number;
        readonly finalUrl: string;
        readonly contentType: string;
        readonly headers: Readonly<Record<string, string>>;
        readonly bytes: Uint8Array;
      }
    | {
        readonly ok: false;
        readonly status?: number;
        readonly denyReason?: string;
        readonly reason: string;
        readonly finalUrl?: string;
      }
  >;
}

/**
 * The live FetchPort: POST {url, accept} to the invoker-gated fetcher Cloud Run service — the ONLY
 * egress ingestion rides (§9.5 never-cookies: there is no credential parameter anywhere on this
 * client; the only auth is the OIDC token for the service hop itself). The service applies its own
 * content-type allowlist + SSRF/robots/rate guards; `accept` is advisory.
 */
export function createFetcherServicePort(
  baseUrl: string,
  fetchImpl: RestFetchLike = fetch as unknown as RestFetchLike,
  tokenFor?: (audience: string) => Promise<string>,
): FetcherServicePort {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async get(url, opts) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (tokenFor) headers["authorization"] = `Bearer ${await tokenFor(root)}`;
      let res: Awaited<ReturnType<RestFetchLike>>;
      try {
        res = await fetchImpl(`${root}/fetch`, {
          method: "POST",
          headers,
          body: JSON.stringify({ url, ...(opts?.accept ? { accept: [...opts.accept] } : {}) }),
        });
      } catch (e) {
        return { ok: false, reason: `fetcher unreachable: ${String((e as Error)?.message ?? e).slice(0, 160)}` };
      }
      const body = (await res.json().catch(() => null)) as FetcherServiceResponse | null;
      if (!res.ok || !body || body.ok !== true) {
        return {
          ok: false,
          status: body?.status ?? res.status,
          denyReason: body?.denyReason,
          reason: body?.reason ?? `fetcher ${res.status}`,
          finalUrl: body?.finalUrl,
        };
      }
      return {
        ok: true,
        status: body.status ?? res.status,
        finalUrl: body.finalUrl ?? url,
        contentType: body.contentType ?? "application/octet-stream",
        headers: body.headers ?? {},
        bytes: new Uint8Array(Buffer.from(body.bytesBase64 ?? "", "base64")),
      };
    },
  };
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
  }): Promise<{
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
}

interface RunOperation {
  readonly name: string;
  /** `metadata.name` is the EXECUTION resource (`.../jobs/<job>/executions/<exec>`) — poll that, not the
   *  LRO: executions are child resources covered by the Job-scoped IAM grant, while
   *  `projects/-/locations/-/operations/<id>` needs a project-level `run.operations.get` (surfaced live
   *  2026-09-22: job-scoped `roles/run.viewer` 403s the operations poll). */
  readonly metadata?: { readonly name?: string };
  readonly done?: boolean;
  readonly error?: { readonly message?: string };
}

/** The slice of the v2 Execution resource the poll needs. */
interface ExecutionStatus {
  readonly name?: string;
  readonly completionTime?: string;
  readonly failedCount?: number;
  readonly conditions?: ReadonlyArray<{
    readonly type?: string;
    readonly status?: string;
    readonly reason?: string;
    readonly message?: string;
  }>;
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
  /** Bound the wait for the Job run (default 300s — cold-start executions measure ~2.5–3min live:
   *  image import + gcsfuse mount + convert; surfaced 2026-09-22 with the 120s bound). */
  readonly timeoutMs?: number;
  /** Operation poll cadence (default 1s). */
  readonly pollIntervalMs?: number;
  /** Injected seams for the deterministic tests; prod wires fetch + metadata-server access token. */
  readonly fetchImpl?: RestFetchLike;
  readonly tokenFor?: () => Promise<string>;
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MOUNT = "/usercontent";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_MS = 1_000;
const RUN_API = "https://run.googleapis.com/v2";
// PRB.21 — the in-flight conversion marker (`converting/<ws>/<id>.json` on the same bucket; the api SA's
// bucket-wide objectAdmin covers the prefix). A fresh marker names the execution already converting this
// key, so a retried preview JOINS it instead of spawning a duplicate `jobs:run`; a marker older than the
// TTL means the launcher's execution is gone (executions are bounded by `timeoutMs`) — take over. The
// launch grace covers the claim→`jobs:run`→publish window: a marker without an execution younger than it
// is a launch in flight, older than it is a dead claim.
const MARKER_TTL_MS = 15 * 60_000;
const MARKER_LAUNCH_GRACE_MS = 30_000;

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The access-token source is k8s-launcher.ts's `fetchGceMetadataAccessToken` (metadata server, the runtime
// SA — the same pattern the worker's GKE launcher uses).

/**
 * The live Converter (apps/api/src/import.ts `Converter.preview`). Validates the quarantine key shape,
 * serves a cached converted object if the Job already ran for this upload, otherwise joins-or-launches a
 * Job execution (`jobs:run` + container-arg override → mounted paths — needs `run.jobs.runWithOverrides`,
 * granted via `roles/run.jobsExecutorWithOverrides` on the Job), polls the Execution resource (a Job child
 * the Job-scoped grant covers), then reads the result object.
 *
 * PRB.21 — pending + dedupe semantics: `opts.waitMs` is the per-request wait budget — a call that exhausts
 * it resolves `null` (still converting; the caller retries) instead of holding one request for the whole
 * ~2.5–4 min cold execution. The `converting/` marker records the launched execution so a retry JOINS it
 * rather than spawning a duplicate `jobs:run` (join-or-launch). With `waitMs` unset the call waits to the
 * full `timeoutMs` bound and throws on expiry — the pre-PRB.21 contract `import/create` still relies on.
 */
export function createConvertJobPreview(args: ConvertJobArgs): {
  preview(quarantineKey: string, opts?: { waitMs?: number }): Promise<ConversionResult | null>;
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

  // ---- the in-flight marker (converting/<ws>/<id>.json) — advisory; every write is best-effort. ----
  interface ConversionMarker {
    readonly startedAt?: number;
    readonly execution?: string;
  }
  const markerKey = (ws: string, id: string) => `converting/${ws}/${id}.json`;

  async function readMarker(key: string): Promise<ConversionMarker | null> {
    try {
      const [buf] = await args.objects.file(key).download();
      const text = typeof buf === "string" ? buf : Buffer.from(buf).toString("utf8");
      const m = JSON.parse(text) as ConversionMarker;
      return typeof m?.startedAt === "number" ? m : null;
    } catch (e) {
      const code = (e as { code?: number | string }).code;
      if (
        code === 404 ||
        code === "404" ||
        e instanceof SyntaxError ||
        /not.?found|no such object/i.test(String((e as Error)?.message ?? e))
      ) {
        return null;
      }
      throw e;
    }
  }

  const writeMarker = (key: string, m: ConversionMarker) =>
    args.objects.file(key).save?.(JSON.stringify(m)).then(() => true).catch(() => false);
  const clearMarker = (key: string) => args.objects.file(key).delete?.().then(() => undefined).catch(() => undefined);

  /**
   * The atomic claim: create-only write (`ifGenerationMatch: 0`). Resolves `true` when THIS call claimed
   * the marker, `false` when it already exists (412 — someone else is converting), `"unsupported"` when
   * the injected surface can't write (dedupe degrades to join-less launching, the pre-PRB.21 posture).
   */
  async function tryClaimMarker(key: string, m: ConversionMarker): Promise<boolean | "unsupported"> {
    const file = args.objects.file(key);
    if (!file.save) return "unsupported";
    try {
      await file.save(JSON.stringify(m), { preconditionOpts: { ifGenerationMatch: 0 } });
      return true;
    } catch (e) {
      const code = (e as { code?: number | string }).code;
      if (code === 412 || code === "412" || /precondition|412/i.test(String((e as Error)?.message ?? e))) {
        return false;
      }
      return false; // any other write failure ⇒ treat as "someone's converting" — never double-launch on doubt
    }
  }

  return {
    async preview(quarantineKey: string, opts?: { waitMs?: number }): Promise<ConversionResult | null> {
      const parsed = parseQuarantineKey(quarantineKey);
      if (!parsed) throw new Error("invalid_quarantine_key");

      // Idempotent re-preview: the result object already exists ⇒ skip the Job run entirely.
      const cached = await readResult(quarantineKey);
      if (cached) return cached;

      const outKey = convertedResultKey(quarantineKey);
      const mKey = markerKey(parsed.workspaceId, parsed.uploadId);
      const token = await tokenFor();
      const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const softDeadline = opts?.waitMs != null ? Date.now() + opts.waitMs : null;
      const hardDeadline = Date.now() + timeoutMs;

      async function launch(): Promise<string> {
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
        if (!run.ok) {
          // Surface the API's error body — a bare status hides IAM vs quota vs API-disabled failures.
          const detail = (await run.text().catch(() => "")).slice(0, 500);
          throw new Error(`convert job run failed (${run.status}): ${detail}`);
        }
        const op = (await run.json()) as RunOperation;
        const execName = op.metadata?.name;
        if (!execName) throw new Error("convert job run returned no execution name");
        return execName;
      }

      // Join-or-launch (PRB.21): the claim is atomic (create-only write). The claimer owns the launch;
      // everyone else reads the marker — a fresh `execution` is joined, a claim that never published one
      // inside the grace is dead (its `jobs:run` threw) and gets taken over, as is a stale marker.
      // A bounded caller that lands inside the launch window just reports pending — its next poll joins.
      async function launchAndPublish(): Promise<string> {
        try {
          const name = await launch();
          await writeMarker(mKey, { startedAt: Date.now(), execution: name });
          return name;
        } catch (e) {
          await clearMarker(mKey); // the launch died before an execution existed — don't hold the claim
          throw e;
        }
      }

      let joined = false;
      let execName: string;
      const claimed = await tryClaimMarker(mKey, { startedAt: Date.now() });
      if (claimed === true || claimed === "unsupported") {
        // we claimed (or dedupe is unsupported — marker writes then no-op): launch + publish.
        execName = await launchAndPublish();
      } else {
        const marker = await readMarker(mKey);
        const exec = marker?.execution;
        const age = marker?.startedAt != null ? Date.now() - marker.startedAt : Number.POSITIVE_INFINITY;
        if (exec != null && age < MARKER_TTL_MS) {
          execName = exec;
          joined = true;
        } else if (exec == null && age < MARKER_LAUNCH_GRACE_MS) {
          // A claim landed but its `jobs:run` hasn't published the execution yet. A bounded caller
          // reports pending — the next poll joins the published execution. An unbounded caller waits
          // out the grace, then takes over if nothing ever published.
          if (softDeadline != null) return null;
          execName = await launchAndPublish();
        } else {
          execName = await launchAndPublish(); // stale marker or a dead claim — take over
        }
      }

      // Poll the Execution until its `Completed` condition lands. The converted OBJECT is the durable
      // result — the execution only gates when to read it.
      let failed: string | null = null;
      for (;;) {
        const nowTs = Date.now();
        if (softDeadline != null && nowTs > softDeadline) return null; // still converting — caller retries
        if (nowTs > hardDeadline) throw new Error("convert job timed out");
        await sleep(pollMs);
        const got = await fetchImpl(`${RUN_API}/${execName}`, { headers: auth });
        if (!got.ok) {
          if (got.status === 404 && joined) {
            // The marker outlived its execution — clear it and launch a fresh one rather than wait the TTL out.
            await clearMarker(mKey);
            joined = false;
            execName = await launchAndPublish();
            continue;
          }
          const detail = (await got.text().catch(() => "")).slice(0, 500);
          throw new Error(`convert execution poll failed (${got.status}): ${detail}`);
        }
        const ex = (await got.json()) as ExecutionStatus;
        // The `Completed` condition exists from creation with status unset/"Unknown" ("Waiting for
        // execution to start") — only True/False is terminal (surfaced live 2026-09-22).
        const completed = ex.conditions?.find(
          (c) => c.type === "Completed" && (c.status === "True" || c.status === "False"),
        );
        if (completed || ex.completionTime) {
          if (completed?.status === "False" || (ex.failedCount ?? 0) > 0) {
            failed = completed?.message ?? completed?.reason ?? "execution failed";
          }
          break;
        }
      }
      if (failed) {
        await clearMarker(mKey); // a failed execution leaves no result — the next preview may relaunch
        throw new Error(`convert job failed: ${failed}`);
      }

      const result = await readResult(quarantineKey);
      if (!result) throw new Error("convert_output_missing"); // job done but no converted object — fail loud
      await clearMarker(mKey);
      return result;
    },
  };
}
