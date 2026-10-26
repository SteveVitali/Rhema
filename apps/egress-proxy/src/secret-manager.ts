// The live provider-key source (D-P0.07-2): the Anthropic API key from GCP Secret Manager `anthropic-api-key`,
// read at boot and re-read on SIGHUP so a rotated key needs no restart (REQ-ARCH-30; §12.7). Provider keys live
// ONLY here — the proxy presents the key to the provider; it is NEVER in the sandbox's env or the model's process.
//
// The base `ReloadableSecretProvider` takes a SYNCHRONOUS loader; a Secret Manager fetch is async, so this
// provider is async-aware: `create` awaits the initial fetch, `refresh` awaits a re-fetch and swaps the key
// atomically. The proxy main installs a SIGHUP handler → `refresh()`. Written against an injected async
// `SecretAccessor` so rotation is unit-tested with a fake; the live binding wires `@google-cloud/secret-manager`.

import type { SecretProvider } from "./sinks.js";

/** Reads a Secret Manager secret version's payload as a utf8 string. */
export type SecretAccessor = (name: string) => Promise<string>;

/** The default periodic refresh cadence — a dead upstream key propagates within one interval
 *  without an operator SIGHUP/recycle (F-R6GLD.1-1's design gap). */
export const ANTHROPIC_KEY_REFRESH_INTERVAL_MS = 300_000; // 5 min

export interface PeriodicRefreshDeps {
  /** `setInterval`-shaped scheduler — tests inject a manual queue (the page-sessions pattern). */
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
  /** refresh-failure sink (main.ts logs; a test asserts instead). Default: swallowed. */
  readonly onError?: (err: unknown) => void;
}

/** The `anthropic-api-key` provider, async-refreshable on SIGHUP + a bounded interval. */
export class ReloadableAnthropicSecretProvider implements SecretProvider {
  private key: string;
  private refreshInFlight = false;
  private constructor(
    key: string,
    private readonly accessor: SecretAccessor,
    private readonly secretName: string,
  ) {
    this.key = key;
  }

  /** Await the initial key fetch, then construct. */
  static async create(secretName: string, accessor: SecretAccessor): Promise<ReloadableAnthropicSecretProvider> {
    const key = await accessor(secretName);
    return new ReloadableAnthropicSecretProvider(key, accessor, secretName);
  }

  anthropicApiKey(): string {
    return this.key;
  }

  /** Re-fetch the key and swap it in atomically (call from the SIGHUP handler). A failed refresh keeps the old key. */
  async refresh(): Promise<void> {
    this.key = await this.accessor(this.secretName);
  }

  /**
   * Arm the bounded periodic re-fetch (F-R6GLD.1-1): a rotated — or upstream-killed — provider key
   * propagates to running instances within one interval instead of waiting for a SIGHUP/recycle.
   * Fail-CLOSED but stale-tolerant: a failed fetch keeps serving the last good key and reports
   * through `onError`; a slow fetch never stacks up (one in flight at a time). The timer is
   * `.unref()`'d — a held interval must never keep the process alive. Returns the stop handle.
   */
  startPeriodicRefresh(intervalMs: number = ANTHROPIC_KEY_REFRESH_INTERVAL_MS, deps: PeriodicRefreshDeps = {}): () => void {
    const setIv =
      deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms) as unknown);
    const clearIv =
      deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
    const onError = deps.onError ?? (() => {});
    const handle = setIv(() => {
      if (this.refreshInFlight) return; // a slow SM read never stacks up
      this.refreshInFlight = true;
      void this.refresh()
        .catch((err: unknown) => {
          // the sink itself can never fault the loop into an unhandled rejection
          try {
            onError(err);
          } catch {
            /* a throwing reporter is swallowed, never propagated */
          }
        })
        .finally(() => {
          this.refreshInFlight = false;
        });
    }, intervalMs);
    (handle as { unref?: () => void }).unref?.();
    return () => clearIv(handle);
  }
}

/**
 * A live `SecretAccessor` over GCP Secret Manager. Dynamically imports the client so tests never load it. `name`
 * is a full secret-version resource name (`projects/<p>/secrets/anthropic-api-key/versions/latest`).
 */
export async function createSecretAccessor(): Promise<SecretAccessor> {
  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const client = new SecretManagerServiceClient();
  return async (name: string): Promise<string> => {
    const [version] = await client.accessSecretVersion({ name });
    const data = version.payload?.data;
    if (data == null) throw new Error(`secret-manager: ${name} has no payload`);
    return (typeof data === "string" ? data : Buffer.from(data).toString("utf8")).trim();
  };
}
