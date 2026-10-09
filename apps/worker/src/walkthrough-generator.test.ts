// RUN.1 — `loadWalkthroughGenerator` is the env→binding seam the 2026-09-30 prod regression proved
// untested: `WALKTHROUGH_MODEL_KEY_SECRET` was never wired by the Pulumi program, so every
// `run.walkthrough` job hit the failing stub. These tests pin the three seams — unset name ⇒ stub,
// placeholder value ⇒ stub (PRB.17 pattern), live value ⇒ the real Anthropic binding — and the
// infra-side half lives in `infra/pulumi/compute.test.ts` (the env var MUST be deployed).

import { describe, expect, it } from "vitest";
import { AnthropicWalkthroughGenerator, loadWalkthroughGenerator } from "./walkthrough-generator.js";

const neverCalled = () => Promise.reject(new Error("access must not run"));

describe("loadWalkthroughGenerator — the env→binding seam", () => {
  it("an UNSET secret name binds the failing stub without touching Secret Manager", async () => {
    const g = await loadWalkthroughGenerator(undefined, neverCalled);
    expect(g).not.toBeInstanceOf(AnthropicWalkthroughGenerator);
    await expect(
      g.generate({
        runId: "r",
        workflow: "research",
        state: "delivered",
        phases: [],
        claimsVerified: null,
        artifacts: [],
        spentCredits: 0,
      }),
    ).rejects.toThrow("walkthrough unconfigured");
  });

  it("a PLACEHOLDER value binds the failing stub (the PRB.17 seeded-name posture)", async () => {
    const g = await loadWalkthroughGenerator("rhema-dev-anthropic-api-key/versions/latest", () =>
      Promise.resolve("placeholder_pending_real_key"),
    );
    expect(g).not.toBeInstanceOf(AnthropicWalkthroughGenerator);
  });

  it("a live value binds the real Anthropic generator", async () => {
    const seen: string[] = [];
    const g = await loadWalkthroughGenerator("secret/versions/latest", (name) => {
      seen.push(name);
      return Promise.resolve("sk-live-value");
    });
    expect(seen).toEqual(["secret/versions/latest"]);
    expect(g).toBeInstanceOf(AnthropicWalkthroughGenerator);
  });
});
