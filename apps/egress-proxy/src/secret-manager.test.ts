import { describe, it, expect } from "vitest";
import { ReloadableAnthropicSecretProvider, type SecretAccessor } from "./secret-manager.js";

describe("ReloadableAnthropicSecretProvider", () => {
  it("reads the key at boot and refreshes a rotated value on SIGHUP", async () => {
    let current = "sk-old";
    let calls = 0;
    const accessor: SecretAccessor = (name) => {
      calls++;
      expect(name).toBe("projects/p/secrets/anthropic-api-key/versions/latest");
      return Promise.resolve(current);
    };
    const provider = await ReloadableAnthropicSecretProvider.create("projects/p/secrets/anthropic-api-key/versions/latest", accessor);
    expect(provider.anthropicApiKey()).toBe("sk-old");
    expect(calls).toBe(1); // one fetch at boot

    current = "sk-new"; // operator rotates the secret
    await provider.refresh(); // the SIGHUP handler calls this
    expect(provider.anthropicApiKey()).toBe("sk-new");
    expect(calls).toBe(2);
  });

  it("keeps the old key if a refresh throws", async () => {
    let fail = false;
    const accessor: SecretAccessor = () => (fail ? Promise.reject(new Error("SM unavailable")) : Promise.resolve("sk-good"));
    const provider = await ReloadableAnthropicSecretProvider.create("n", accessor);
    fail = true;
    await expect(provider.refresh()).rejects.toThrow(/unavailable/);
    expect(provider.anthropicApiKey()).toBe("sk-good"); // unchanged
  });
});
