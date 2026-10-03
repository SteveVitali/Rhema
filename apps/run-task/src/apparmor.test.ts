// SEC.3 — the deterministic AppArmor surface test. Three pins:
//   1. the committed profile `infra/k8s/apparmor/rhema-run-task` names the same profile constant the
//      launcher emits, and carries every mount rule the scoped runner's mount plan needs — and no
//      broader mount grant;
//   2. the loader DaemonSet exists, is privileged on the sandbox-pool selector, and is digest-pinned;
//   3. the removed profile type never reappears in a tracked non-doc file (the F-StageB-5
//      regression guard — the launcher test pins the emitted value; this sweeps the rest of the
//      tree, needle built dynamically so this file cannot self-match).
// The compile-correctness of the profile grammar is a CI leg (`apparmor_parser -Q` in the images job);
// this file pins the SEMANTIC tuples.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const PROFILE_PATH = "infra/k8s/apparmor/rhema-run-task";
const DAEMONSET_PATH = "infra/k8s/50-apparmor-loader-daemonset.yaml";
const LOADER_DOCKERFILE_PATH = "infra/k8s/apparmor/Dockerfile.loader";
const LAUNCHER_PATH = "packages/live-clients/src/k8s-launcher.ts";

const profile = readFileSync(`${REPO}${PROFILE_PATH}`, "utf8");
const daemonset = readFileSync(`${REPO}${DAEMONSET_PATH}`, "utf8");
const loaderDockerfile = readFileSync(`${REPO}${LOADER_DOCKERFILE_PATH}`, "utf8");
// source-read (not an import — @rhema/live-clients is a server-side package, never a run-task dep).
const launcher = readFileSync(`${REPO}${LAUNCHER_PATH}`, "utf8");

describe("SEC.3 — the rhema-run-task AppArmor profile", () => {
  it("declares the profile name the launcher emits verbatim (RUN_TASK_APPARMOR_PROFILE)", () => {
    // the launcher constant and the profile declaration must agree — the pod's `localhostProfile`
    // is a NAME the kernel resolves; a mismatch fails container-create on every node.
    expect(launcher).toContain('RUN_TASK_APPARMOR_PROFILE = "rhema-run-task"');
    expect(profile).toMatch(/^profile rhema-run-task /m);
  });

  it("grants exactly the scoped runner's mount sequence — and no broader mount shape", () => {
    // scoped-subagent.ts → mountPlan argv; scoped-runner.js re-issues inside the private ns.
    // 1) unshare --mount --propagation private → recursive propagation-private on the ns root.
    expect(profile).toMatch(/^ {2}mount options=\(private,rprivate\) -> \/,$/m);
    // 2) stash binds: enumerated /work files → /tmp/scoped-stash/<role>/<name> (ro, two syscalls).
    expect(profile).toMatch(/^ {2}mount options=\(rw,bind\) \/work\/\*\* -> \/tmp\/scoped-stash\/\*\*,$/m);
    expect(profile).toMatch(/^ {2}mount options=\(ro,bind\) \/work\/\*\* -> \/tmp\/scoped-stash\/\*\*,$/m);
    expect(profile).toMatch(/^ {2}mount options=\(ro,remount,bind\) -> \/tmp\/scoped-stash\/\*\*,$/m);
    // 3) the /work tmpfs overmount — fstype-tagged; nosuid,nodev are mount FLAGS in the request
    // (only size=64m is data), so they must sit in the option set (F-SEC3-5).
    expect(profile).toMatch(/^ {2}mount options=\(rw,nosuid,nodev\) fstype=tmpfs -> \/work\/,$/m);
    // 4) stash → scoped-root binds + ro remounts.
    expect(profile).toMatch(/^ {2}mount options=\(rw,bind\) \/tmp\/scoped-stash\/\*\* -> \/work\/scoped\/\*\*,$/m);
    expect(profile).toMatch(/^ {2}mount options=\(ro,bind\) \/tmp\/scoped-stash\/\*\* -> \/work\/scoped\/\*\*,$/m);
    expect(profile).toMatch(/^ {2}mount options=\(ro,remount,bind\) -> \/work\/scoped\/\*\*,$/m);
  });

  it("denies every mount shape it does not name — the allowlist is closed", () => {
    const mountRules = profile
      .split("\n")
      .filter((l) => /^\s*mount/.test(l))
      .map((l) => l.trim());
    // every rule is either a typed fstype rule or names a dest under /tmp/scoped-stash | /work/scoped | / —
    // there is no bare `mount,` or `mount options=(rw)` catch-all.
    for (const rule of mountRules) {
      expect(rule).not.toBe("mount,");
      // no unrestricted `mount options=(rw)` catch-all — every rw rule is fstype- or path-scoped.
      expect(rule).not.toMatch(/^mount options=\(rw\)\s*(->|$)/);
    }
    // no capability beyond the pod's four-cap add-set appears.
    const caps = profile.match(/capability (\w+),/g) ?? [];
    expect(caps.sort()).toEqual(["capability setgid,", "capability setuid,", "capability sys_admin,", "capability sys_chroot,"].sort());
  });

  it("grants the absolute exec set the pure-argv runtime execs — and nothing else executable", () => {
    for (const bin of ["/nodejs/bin/node", "/usr/bin/dumb-init", "/usr/bin/setpriv", "/usr/bin/unshare", "/usr/bin/mount"]) {
      expect(profile).toContain(`${bin} ix,`);
    }
    // no other `ix` exec rule outside the five bins + the vendored SDK binary glob.
    const execRules = profile.split("\n").filter((l) => / ix,$/.test(l.trim()));
    for (const rule of execRules) {
      expect(rule.trim()).toMatch(/^\/(nodejs\/bin\/node|usr\/bin\/(dumb-init|setpriv|unshare|mount)|app\/vendor\/\*\*) ix,$/);
    }
  });
});

describe("SEC.3 — the apparmor-loader DaemonSet", () => {
  it("loads the SAME profile file the tests pin, privileged, on the sandbox-pool selector", () => {
    expect(daemonset).toContain("kind: DaemonSet");
    expect(daemonset).toContain("name: apparmor-loader");
    expect(daemonset).toContain("cloud.google.com/gke-nodepool: ${RUN_TASK_NODEPOOL}");
    expect(daemonset).toContain("privileged: true");
    // the image is a digest-pinned envsubst placeholder — never a mutable tag.
    expect(daemonset).toContain("image: ${APPARMOR_LOADER_IMAGE}");
    expect(daemonset).not.toMatch(/image:\s*\S+:(latest|main|prod)\b/);
    // the loader image ships the committed profile bytewise (a COPY, not a generate).
    expect(loaderDockerfile).toContain(`COPY ${PROFILE_PATH} /etc/apparmor.d/rhema-run-task`);
  });
});

describe("SEC.3 — the F-StageB-5 regression guard", () => {
  it("the removed profile type appears in NO tracked non-doc file", () => {
    // git grep exits 1 on NO MATCHES (the expected case) — only ≥2 is a real error. `--untracked`
    // keeps the sweep stage-independent; the needle is concatenated so this file does not self-match.
    // CASE-SENSITIVE: the k8s enum is capitalized — lowercase `unconfined` is a legitimate
    // *peer label* (`signal (receive) peer=unconfined` in the profile itself, F-SEC3-5).
    const r = spawnSync(
      "git",
      [
        "-C", REPO, "grep", "-l", "--untracked",
        "Unconfi" + "ned",
        "--", ":(exclude)*.md", ":(exclude)docs/**",
      ],
      { encoding: "utf8" },
    );
    expect(r.status === 0 || r.status === 1).toBe(true);
    const hits = (r.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(hits).toEqual([]);
  });
});
