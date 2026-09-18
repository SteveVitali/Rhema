import { describe, expect, it, vi } from "vitest";
import { DOCKER_PROBE_TIMEOUT_MS, dockerUsable, type DockerProbeRunner } from "./docker-probe.js";

// PRB.19 — the probe's timeout contract, tested deterministically through the injected runner (a real hung
// daemon can't be conjured in a unit test, but the runner seam proves (a) the bound is passed to execFileSync
// — which SIGTERMs the child on expiry — and (b) every failure mode, including the timeout throw, reads as
// "not usable" instead of propagating or hanging).

describe("dockerUsable — the bounded availability probe (PRB.19)", () => {
  it("passes the timeout bound through to the runner", () => {
    const run = vi.fn<DockerProbeRunner>(() => Buffer.from("24.0.0"));
    expect(dockerUsable(1_234, run)).toBe(true);
    expect(run).toHaveBeenCalledWith("docker", ["version", "--format", "{{.Server.Version}}"], {
      stdio: "pipe",
      timeout: 1_234,
    });
  });

  it("defaults to the 10s bound", () => {
    const run = vi.fn<DockerProbeRunner>(() => Buffer.from("24.0.0"));
    dockerUsable(undefined, run);
    expect(run.mock.calls[0]![2].timeout).toBe(DOCKER_PROBE_TIMEOUT_MS);
  });

  it("an unresponsive daemon (the runner's timeout throw) reads as unusable — never propagates", () => {
    const timedOut: DockerProbeRunner = () => {
      // execFileSync's timeout surface: the child is killed and the call throws with `killed`/ETIMEDOUT.
      throw Object.assign(new Error("Command timed out"), { code: "ETIMEDOUT", killed: true });
    };
    expect(dockerUsable(50, timedOut)).toBe(false);
  });

  it("a missing binary / refused daemon also reads as unusable", () => {
    expect(dockerUsable(50, () => { throw Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }); })).toBe(false);
    expect(dockerUsable(50, () => { throw new Error("Cannot connect to the Docker daemon"); })).toBe(false);
  });
});
