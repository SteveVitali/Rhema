/**
 * OBS.1 — plain-`fetch` GCS JSON-API byte transport.
 *
 * Root fix for the api's `MaxListenersExceededWarning: 11 close/error listeners added to
 * [PassThrough]` (docs/build/runs/OBS.1.md). The `@google-cloud/storage` `file.download()` /
 * `file.save()` path funnels every byte call through teeny-request stream mode
 * (retry-request → teeny-request → node-fetch@3 `res.body` PassThrough). Three libraries each
 * attach a `pipeline()`/end-of-stream listener set to that ONE emitter — node-fetch's own `pump`,
 * teeny-request's `.on('error')` + `pipeline(responseStream, requestStream)` (index.js:194,203),
 * and storage's second `pipeline(rawResponseStream, …, throughStream)` (file.js:1119). When a
 * consumer abort races the response, the retry path adds still more sets to the same emitter
 * (and throws `ERR_STREAM_UNABLE_TO_PIPE`) until it crosses the 10-listener threshold — the
 * prod warning bursts tracked in OBS.1.
 *
 * This transport performs the same three byte ops (download/save/delete) with the platform
 * `fetch`: **no node streams are created**, so there is no shared emitter for listeners to
 * accumulate on. Retry posture stays bounded and deterministic (matching the library's
 * intent without its stream machinery). `getSignedUrl` is unaffected — it never touches the
 * byte path and stays on `@google-cloud/storage`.
 *
 * GCS JSON API endpoints:
 *   GET    {api}/download/storage/v1/b/{b}/o/{name}?alt=media
 *   POST   {api}/upload/storage/v1/b/{b}/o?uploadType=media&name={name}[&ifGenerationMatch=n]
 *   DELETE {api}/storage/v1/b/{b}/o/{name}
 * `{name}` is percent-encoded as one path segment (`/` → %2F), matching the library.
 */

/** Error shape mirrors `@google-cloud/storage`'s ApiError: callers branch on `.code`. */
export class GcsApiError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "GcsApiError";
    this.code = code;
  }
}

/**
 * The File-shaped seam the byte stores are written against (`GcsFileLike`, `GcsRestoreFileLike`,
 * `GcsObjectFileLike` all resolve to this surface or a subset of it).
 */
export interface GcsByteFileLike {
  download(): Promise<readonly [Uint8Array]>;
  save(
    data: Uint8Array | string,
    opts?: { preconditionOpts?: { ifGenerationMatch?: number } },
  ): Promise<void>;
  delete(opts?: { ignoreNotFound?: boolean }): Promise<void>;
}

export interface GcsBytesTransport {
  bucket(name: string): { file(name: string): GcsByteFileLike };
}

export interface GcsBytesTransportDeps {
  /**
   * Resolve Authorization headers for `url` — the live bindings supply
   * `(url) => storage.authClient.getRequestHeaders(url)` (Application Default Credentials;
   * token refresh is handled inside google-auth-library).
   */
  getAuthHeaders(url: string): Promise<Record<string, string>>;
  /** Injected for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /** Total attempts per op, including the first. Default 3 (matches the library's retry ceiling). */
  maxAttempts?: number;
  /** Base backoff; attempt n sleeps baseDelayMs * n before retrying. Default 200. */
  baseDelayMs?: number;
  /** Per-request timeout. Default 30_000. */
  requestTimeoutMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** JSON API base; tests point at a local server. Default `https://storage.googleapis.com`. */
  apiBase?: string;
}

/** Statuses where another attempt is worthwhile (mirrors retry-request's posture). */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Create the transport. The returned object only exposes the `bucket().file()` surface, so the
 * byte stores keep their existing minimal-interface seams — tests still drive the same fakes.
 */
export function createGcsBytesTransport(deps: GcsBytesTransportDeps): GcsBytesTransport {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxAttempts = deps.maxAttempts ?? 3;
  const baseDelayMs = deps.baseDelayMs ?? 200;
  const timeoutMs = deps.requestTimeoutMs ?? 30_000;
  const sleep = deps.sleep ?? defaultSleep;
  const apiBase = (deps.apiBase ?? "https://storage.googleapis.com").replace(/\/$/, "");

  async function call(
    op: string,
    method: "GET" | "POST" | "DELETE",
    url: string,
    body?: Uint8Array,
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        const auth = await deps.getAuthHeaders(url);
        res = await fetchImpl(url, {
          method,
          headers: { ...auth, ...(body != null ? { "content-type": "application/octet-stream" } : {}) },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        // Transport-level failure (DNS/reset/timeout). No emitter state survives — retrying is clean.
        if (attempt >= maxAttempts) {
          throw err instanceof GcsApiError ? err : new GcsApiError(0, `gcs ${op} transport failure`);
        }
        await sleep(baseDelayMs * attempt);
        continue;
      }
      if (res.ok || attempt >= maxAttempts) return res;
      // 401 = a token that expired in flight: getRequestHeaders refreshes on the next attempt.
      if (res.status !== 401 && !isRetryableStatus(res.status)) return res;
      // Drain before retry so the connection is reusable; the body is never logged.
      await res.arrayBuffer().catch(() => new ArrayBuffer(0));
      await sleep(baseDelayMs * attempt);
    }
  }

  async function expectOk(op: string, res: Response): Promise<Response> {
    if (!res.ok) {
      // Deliberately no response-body text: it is neither needed nor safe for the log path.
      throw new GcsApiError(res.status, `gcs ${op} failed with status ${res.status}`);
    }
    return res;
  }

  function fileFor(bucket: string, name: string): GcsByteFileLike {
    const enc = encodeURIComponent(name);
    const b = encodeURIComponent(bucket);
    return {
      async download() {
        const url = `${apiBase}/download/storage/v1/b/${b}/o/${enc}?alt=media`;
        const res = await expectOk("download", await call("download", "GET", url));
        return [new Uint8Array(await res.arrayBuffer())];
      },
      async save(data, opts) {
        const precondition = opts?.preconditionOpts?.ifGenerationMatch;
        const url =
          `${apiBase}/upload/storage/v1/b/${b}/o?uploadType=media&name=${enc}` +
          (precondition != null ? `&ifGenerationMatch=${precondition}` : "");
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const res = await expectOk("upload", await call("upload", "POST", url, bytes));
        await res.arrayBuffer().catch(() => new ArrayBuffer(0)); // free the connection
      },
      async delete(opts) {
        const url = `${apiBase}/storage/v1/b/${b}/o/${enc}`;
        const res = await call("delete", "DELETE", url);
        if (res.status === 404 && opts?.ignoreNotFound === true) return;
        await expectOk("delete", res);
        await res.arrayBuffer().catch(() => new ArrayBuffer(0));
      },
    };
  }

  return { bucket: (name) => ({ file: (object) => fileFor(name, object) }) };
}
