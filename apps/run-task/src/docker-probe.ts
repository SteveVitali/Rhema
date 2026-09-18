// PRB.19 — the bounded Docker-availability probe. `privsep.docker.test.ts` probes `docker version`
// SYNCHRONOUSLY at module load to decide `skipIf`; an unresponsive daemon (socket present, server hung)
// used to block the spawn indefinitely — hanging the whole `pnpm test` run before the CI opt-out was even
// evaluated. The probe is now (a) bounded by `timeout` (execFileSync SIGTERMs the child on expiry → throws
// → unusable) and (b) evaluated AFTER the CI opt-out so the unit CI job never spawns `docker` at all.

import { execFileSync } from "node:child_process";

/** Default bound for the probe — generous for a cold daemon start, small vs a hung socket. */
export const DOCKER_PROBE_TIMEOUT_MS = 10_000;

/** The `execFileSync` seam — injectable so the timeout contract is tested without a real hung daemon. */
export type DockerProbeRunner = (
  file: string,
  args: string[],
  opts: { stdio: "pipe"; timeout: number },
) => unknown;

/** True when `docker` answers a bounded `docker version` probe; false on error, missing binary, or timeout. */
export function dockerUsable(
  timeoutMs: number = DOCKER_PROBE_TIMEOUT_MS,
  run: DockerProbeRunner = execFileSync as DockerProbeRunner,
): boolean {
  try {
    run("docker", ["version", "--format", "{{.Server.Version}}"], { stdio: "pipe", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
