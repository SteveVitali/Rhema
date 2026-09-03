// The live RS256 run-token key source (D-P0.08-1 / D-P0.07-2): the api mints run tokens with the PRIVATE key
// and the egress-proxy verifies attempts with the PUBLIC key only (it can check a token but never forge one —
// REQ-ARCH-11/31). Both keys live in GCP Secret Manager and are read at boot into an `Rs256Keys` bundle behind
// the orchestrator's `RunTokenService` seam. `loadRs256KeysFromSecretManager` is pure over an injected
// `SecretAccessor` (name → utf8 payload), so it is unit-tested with a generated keypair; the live binding wires
// the accessor to `@anthropic`-free `@google-cloud/secret-manager`.

import { createPrivateKey, createPublicKey } from "node:crypto";
import type { Rs256Keys } from "@rhema/orchestrator";

/** Reads a Secret Manager secret version's payload as a utf8 string. */
export type SecretAccessor = (name: string) => Promise<string>;

export interface Rs256SecretNames {
  /** the PRIVATE-key secret version (`projects/…/secrets/…/versions/latest`); omit for a verify-only holder. */
  readonly privateKeyName?: string;
  /** the PUBLIC-key secret version — required (both minter and verifier need it). */
  readonly publicKeyName: string;
  /** optional key id, stamped into the JWT header for rotation. */
  readonly keyId?: string;
}

/** Load the RS256 keypair (PEM) from Secret Manager into an `Rs256Keys` bundle. */
export async function loadRs256KeysFromSecretManager(access: SecretAccessor, names: Rs256SecretNames): Promise<Rs256Keys> {
  const publicPem = await access(names.publicKeyName);
  const publicKey = createPublicKey(publicPem);
  if (names.privateKeyName == null) {
    return names.keyId != null ? { publicKey, keyId: names.keyId } : { publicKey };
  }
  const privatePem = await access(names.privateKeyName);
  const privateKey = createPrivateKey(privatePem);
  return names.keyId != null ? { privateKey, publicKey, keyId: names.keyId } : { privateKey, publicKey };
}

/**
 * A live `SecretAccessor` over GCP Secret Manager. Dynamically imports the client so this package's pure tests
 * never load it. `name` is a full secret-version resource name (`projects/<p>/secrets/<s>/versions/latest`).
 */
export async function createSecretAccessor(): Promise<SecretAccessor> {
  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const client = new SecretManagerServiceClient();
  return async (name: string): Promise<string> => {
    const [version] = await client.accessSecretVersion({ name });
    const data = version.payload?.data;
    if (data == null) throw new Error(`secret-manager: ${name} has no payload`);
    return typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  };
}
