import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { dockerUsable } from "./docker-probe.js";

// AC1 + AC4 — the KERNEL-level proof, run against the built image. This exercises the real mechanics no unit
// test can: a process under uid `agent` is denied the harness-only secrets file (EACCES), and an input-scoped
// subagent's private mount namespace contains exactly the enumerated files with an out-of-set read failing at
// the kernel (review 13 F13). It builds `Dockerfile.privsep-test` and runs it with CAP_SYS_ADMIN. Where Docker
// is unavailable (or lacks the capability), it SKIPS — the authoritative run is the `integration` CI job on
// Linux (recorded in DEFERRALS); it never silently passes.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Run where Docker is usable AND we are not in the plain unit CI job: locally (no CI env) it always runs;
// in CI it runs only when the integration job opts in with RHEMA_DOCKER_TESTS=1 (so the unit job is not
// surprised by a Docker build needing network + CAP_SYS_ADMIN). See DEFERRALS D-P0.06-2.
// PRB.19: the opt-out is evaluated FIRST — the unit CI job never spawns `docker` — and the probe itself is
// bounded (`docker-probe.ts`), so an unresponsive daemon can no longer hang the whole `pnpm test` run.
const CI_OPT_OUT = !!process.env.CI && process.env.RHEMA_DOCKER_TESTS !== "1";
const ENABLED = !CI_OPT_OUT && dockerUsable();
const HAVE_DOCKER = ENABLED;

describe.skipIf(!ENABLED)("run-task image privilege separation (AC1, AC4)", () => {
  it(
    "denies uid agent the secrets file and isolates the scoped mount namespace (kernel-level)",
    () => {
      execFileSync(
        "docker",
        ["build", "-q", "-f", "apps/run-task/Dockerfile.privsep-test", "-t", "rhema-privsep-test", "."],
        { cwd: repoRoot, stdio: "pipe" },
      );
      const out = execFileSync("docker", ["run", "--rm", "--cap-add", "SYS_ADMIN", "rhema-privsep-test"], {
        cwd: repoRoot,
        stdio: "pipe",
      }).toString();

      expect(out).toContain("AC1: uid agent is denied the harness secrets file (EACCES)");
      // D-P0.15f-1: the two-uid launch path — the harness (ambient CAP_SETUID+SETGID) drops to agent uid 10002
      // with no setresgid EPERM, the dropped agent still cannot read the secrets file, and the drop fails
      // without CAP_SETGID (the negative control that proves the +setgid entrypoint fix is load-bearing).
      expect(out).toContain("D-P0.15f-1: harness (ambient CAP_SETUID+SETGID) drops to agent uid 10002");
      expect(out).toContain("D-P0.15f-1: agent (via the harness drop) is denied the harness secrets file (EACCES)");
      expect(out).toContain("D-P0.15f-1: without CAP_SETGID the harness→agent --regid drop fails as expected");
      expect(out).toContain("AC4: scoped mount namespace contains exactly the enumerated file");
      // P0.15h: the kernel backstop — a read-only bind mount blocks a write even by uid agent (boundary true zero).
      expect(out).toContain("P0.15h: uid agent cannot write a read-only bind mount (EROFS)");
      expect(out).toContain("ALL PRIVSEP CHECKS PASSED");
    },
    240_000,
  );
});

if (!HAVE_DOCKER) {
  // make the skip visible in the report rather than a silent zero-test file.
  describe("run-task image privilege separation (AC1, AC4)", () => {
    it.skip("skipped: Docker not available — runs in the integration CI job (see DEFERRALS)", () => {});
  });
}
