import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { dockerUsable } from "./docker-probe.js";

// AC1 + AC4 + D-P0.15f-1 + SEC.3 — the KERNEL-level proof, run against the PRODUCTION image (SEC.3
// absorbed D-P0.06-3: the check no longer runs on a separate bookworm-slim stand-in — the image under
// test is the distroless artifact the pod ships). `privsep-check.js` inside the image exercises the
// real mechanics no unit test can: a process under uid `agent` is denied the harness-only secrets file
// (EACCES), the harness→agent drop works only with ambient CAP_SETGID, and an input-scoped subagent's
// private mount namespace — built through the REAL unshare→setpriv→applyMountPlan chain — contains
// exactly the enumerated file with out-of-set reads + ro-bind writes failing at the kernel. It also
// asserts the image shape: no shell, no package manager, static applets, uids 10001–10006.
// Where Docker is unavailable it SKIPS — the authoritative run is the `integration` CI job on Linux
// (recorded in DEFERRALS); it never silently passes.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const IMAGE = "rhema-run-task:privsep-test";

// Run where Docker is usable AND we are not in the plain unit CI job: locally (no CI env) it always runs;
// in CI it runs only when the integration job opts in with RHEMA_DOCKER_TESTS=1 (so the unit job is not
// surprised by a Docker build needing network + CAP_SYS_ADMIN). See DEFERRALS D-P0.06-2.
// PRB.19: the opt-out is evaluated FIRST — the unit CI job never spawns `docker` — and the probe itself is
// bounded (`docker-probe.ts`), so an unresponsive daemon can no longer hang the whole `pnpm test` run.
const CI_OPT_OUT = !!process.env.CI && process.env.RHEMA_DOCKER_TESTS !== "1";
const ENABLED = !CI_OPT_OUT && dockerUsable();
const HAVE_DOCKER = ENABLED;

describe.skipIf(!ENABLED)("run-task PRODUCTION image privilege separation (AC1, AC4, SEC.3)", () => {
  it(
    "denies uid agent the secrets file, isolates the scoped mount namespace, and asserts the distroless shape",
    () => {
      // The production Dockerfile — the same artifact the images job builds + the pod runs.
      // R6FIX.2 — the vendored-SDK placeholder is opt-in (the Dockerfile fails closed without
      // it): this leg checks privsep, not the engine, so it explicitly builds the no-SDK image
      // (CI checkouts never carry the gitignored vendor trees).
      execFileSync(
        "docker",
        ["build", "-f", "apps/run-task/Dockerfile", "--build-arg", "ALLOW_PLACEHOLDER_SDK=1",
         "-t", IMAGE, "."],
        { cwd: repoRoot, stdio: "pipe" },
      );
      // The pod's security posture, mirrored EXACTLY: readOnlyRootFilesystem + tmpfs work dirs +
      // drop-ALL + the four caps the launcher grants — no SETPCAP anywhere (F-SEC3-1, live: the
      // pod's CapBnd is exactly the add list; the first prod pod proved CAPBSET_DROP EPERMs, so
      // neither the ENTRYPOINT nor this check narrows the bounding set at all).
      const out = execFileSync(
        "docker",
        [
          "run", "--rm",
          "--read-only",
          "--mount", "type=tmpfs,destination=/tmp,tmpfs-mode=1777",
          "--mount", "type=tmpfs,destination=/work,tmpfs-mode=1777",
          "--mount", "type=tmpfs,destination=/config,tmpfs-mode=1777",
          "--cap-drop", "ALL",
          "--cap-add", "SYS_ADMIN",
          "--cap-add", "SETUID",
          "--cap-add", "SETGID",
          "--cap-add", "SYS_CHROOT",
          "-e", "PRIVSEP_EXPECT_RO_ROOTFS=1",
          "--entrypoint", "/nodejs/bin/node",
          IMAGE, "/app/dist/privsep-check.js",
        ],
        { cwd: repoRoot, stdio: "pipe" },
      ).toString();
      // Surface privsep-check's PASS/SKIP lines in the CI log so which legs ran is auditable.
      console.log(out);

      expect(out).toContain("AC1: uid agent (production drop tuple) is denied the harness secrets file (EACCES)");
      // D-P0.15f-1: the two-uid launch path — harness (ambient CAP_SETUID+SETGID) drops to agent uid
      // 10002 with no setresgid EPERM; the dropped agent still cannot read the file; the drop fails
      // without CAP_SETGID and under --no-new-privs (the negative controls; ADR-076).
      expect(out).toContain("D-P0.15f-1: harness (ambient CAP_SETUID+SETGID) drops to agent uid 10002");
      expect(out).toContain("D-P0.15f-1: agent (via the harness drop) is denied the harness secrets file (EACCES)");
      expect(out).toContain("D-P0.15f-1: without CAP_SETGID the harness→agent --regid drop fails as expected");
      expect(out).toContain("SEC.3: the ambient-cap drop survives exec under no_new_privs");
      // F-SEC3-2: the model's process carries NO capability vector — the production drop tuple strips
      // ambient+inheritable and pins no-new-privs, so a setuid-back attempt to the harness uid fails.
      expect(out).toContain("F-SEC3-2: the agent's production drop leaves CapEff=CapAmb=CapInh=0 and NoNewPrivs=1");
      expect(out).toContain("F-SEC3-2: the dropped agent cannot setuid back to harness uid 10001");
      // AC4: the scoped namespace through the REAL launch chain + REAL mount plan — exact file set,
      // out-of-set ENOENT, ro-bind EROFS, and the ruid-0 gate (F-StageB-6).
      // The AC4 mount-namespace legs and the P0.15h bind leg need the runtime to permit unshare/mount.
      // privsep-check probes that in-image: where present they run and are asserted exactly as before;
      // where absent (e.g. GitHub-hosted runners) they SKIP visibly — asserted, never a silent pass.
      if (out.includes("MOUNT-NS-CAPABILITY: present")) {
        expect(out).toContain("AC4: harness-uid mount is refused without the ruid-0 wrap");
        expect(out).toContain("AC4: scoped mount namespace contains exactly the enumerated file");
        expect(out).toContain("AC4: scoped uid cannot write the read-only bind (EROFS)");
        expect(out).toContain("P0.15h: uid agent cannot write a read-only bind mount (EROFS)");
      } else {
        expect(out).toContain("MOUNT-NS-CAPABILITY: absent");
        expect(out).toContain("SKIP: AC4: harness-uid mount is refused without the ruid-0 wrap");
        expect(out).toContain("SKIP: AC4: scoped mount namespace isolates the seat tree");
        expect(out).toContain("SKIP: P0.15h: uid agent cannot write a read-only bind mount");
      }
      // SEC.3 image shape.
      expect(out).toContain("SEC.3: the image has no shell");
      expect(out).toContain("SEC.3: the image has no package manager");
      expect(out).toContain("SEC.3: /usr/bin/setpriv is a static binary (no PT_INTERP)");
      expect(out).toContain("SEC.3: the shipped applets execute");
      expect(out).toContain("SEC.3: /etc/passwd + /etc/group carry uids 10001–10006");
      expect(out).toContain("SEC.3: the root filesystem is read-only");
      expect(out).toContain("ALL PRIVSEP CHECKS PASSED");

      // SEC.3 — the SHIPPED ENTRYPOINT argv end-to-end: dumb-init → setpriv (the ambient four-cap
      // drop) → /nodejs/bin/node /app/dist/harness-main.js. harness-main fails fast after its
      // identity line (no run token/spec env in the probe container) — that is expected: the leg
      // asserts the chain reaches node AS uid harness, not that a run starts. Same exact pod cap
      // posture as the check run — this leg is what caught the F-SEC3-1 bounding-set EPERM class.
      let entrypointOut = "";
      try {
        entrypointOut = execFileSync(
          "docker",
          [
            "run", "--rm",
            "--cap-drop", "ALL",
            "--cap-add", "SYS_ADMIN",
            "--cap-add", "SETUID",
            "--cap-add", "SETGID",
            "--cap-add", "SYS_CHROOT",
            IMAGE,
          ],
          { cwd: repoRoot, stdio: "pipe" },
        ).toString();
      } catch (e) {
        entrypointOut = `${(e as { stdout?: Buffer }).stdout ?? ""}${(e as { stderr?: Buffer }).stderr ?? ""}`;
      }
      expect(entrypointOut).toContain("[harness] identity uid=10001");
    },
    900_000, // the production multi-stage build (pnpm install + turbo build + static util-linux) is heavy.
  );
});

if (!HAVE_DOCKER) {
  // make the skip visible in the report rather than a silent zero-test file.
  describe("run-task PRODUCTION image privilege separation (AC1, AC4, SEC.3)", () => {
    it.skip("skipped: Docker not available — runs in the integration CI job (see DEFERRALS)", () => {});
  });
}
