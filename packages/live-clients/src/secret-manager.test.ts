import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { Rs256RunTokenService, type Clock } from "@rhema/orchestrator";
import { loadRs256KeysFromSecretManager, type SecretAccessor } from "./secret-manager.js";

const clock: Clock = { now: () => new Date("2026-09-03T00:00:00Z") };

function keypairPem(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    publicPem: publicKey.export({ type: "spki", format: "pem" }) as string,
  };
}

describe("loadRs256KeysFromSecretManager", () => {
  it("loads a mint+verify keypair that round-trips a run token", async () => {
    const { privatePem, publicPem } = keypairPem();
    const access: SecretAccessor = (name) =>
      Promise.resolve(name === "sm/private" ? privatePem : name === "sm/public" ? publicPem : "");
    const keys = await loadRs256KeysFromSecretManager(access, {
      privateKeyName: "sm/private",
      publicKeyName: "sm/public",
      keyId: "k1",
    });
    const svc = new Rs256RunTokenService(keys, clock);
    const token = svc.mint({ runId: "r1", attempt: 1, workspaceId: "ws", seat: "harness" });
    expect(svc.verify(token)).toMatchObject({ runId: "r1", attempt: 1, seat: "harness" });
  });

  it("loads a verify-only holder (no private key) that cannot mint", async () => {
    const { publicPem } = keypairPem();
    const access: SecretAccessor = () => Promise.resolve(publicPem);
    const keys = await loadRs256KeysFromSecretManager(access, { publicKeyName: "sm/public" });
    const svc = new Rs256RunTokenService(keys, clock);
    expect(() => svc.mint({ runId: "r1", attempt: 1, workspaceId: "ws", seat: "harness" })).toThrow(/private key/);
  });

  it("a proxy verify-only holder validates a token the api minted (public key only)", async () => {
    const { privatePem, publicPem } = keypairPem();
    const minter = new Rs256RunTokenService(
      await loadRs256KeysFromSecretManager((n) => Promise.resolve(n === "priv" ? privatePem : publicPem), {
        privateKeyName: "priv",
        publicKeyName: "pub",
      }),
      clock,
    );
    const verifier = new Rs256RunTokenService(
      await loadRs256KeysFromSecretManager(() => Promise.resolve(publicPem), { publicKeyName: "pub" }),
      clock,
    );
    const token = minter.mint({ runId: "r2", attempt: 3, workspaceId: "ws", seat: "harness" });
    expect(verifier.verify(token)?.attempt).toBe(3);
  });
});
