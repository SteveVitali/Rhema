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

/** The `anthropic-api-key` provider, async-refreshable on SIGHUP. */
export class ReloadableAnthropicSecretProvider implements SecretProvider {
  private key: string;
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
