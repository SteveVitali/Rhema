# SEC.3 — Run-task confinement: distroless image + a tight AppArmor profile

- **Sequence:** 79 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** security
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** DEF.4
- **Scope (one line):** rebuild the run-task image on a shell-less distroless base with statically vendored util-linux applets and the ambient-capability model, replace the run-task container's AppArmor `Unconfined` with a least-privilege Localhost profile that permits only the scoped runner's mount/unshare, and prove both live on the production image with the privsep check plus a two-uid pod-log proof.
- **Spec §§:** 12.6 (the mount layer: input-scoped subagents in a private mount namespace under a distinct uid; attestation), 12.4 step 4 (the two-uid launch), 12.1 (run-task), 12.8 (threat model), 13.2 (the `images` job; the licence exception list), 13.3
- **REQ coverage:** REQ-SPEC-10, REQ-ARCH-19, REQ-DATA-17, REQ-ARCH-40, REQ-ARCH-39 (stamp in the PR)
- **Absorbs (backlog):** BL-26 (D-P0.06-3, X-apparmor-unconfined-runtask; DEF.1 F-StageB-5), plus the "no literal `uid=` print" caveat on D-P0.15f-1 / D-P1.22-2(a)
- **Run:** `implement-spec spec=docs/tickets/79_SEC.3__run-task-confinement.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013). The image digest roll and the profile loader ride a pre-authorized `pulumi up prod` / `infra/k8s/apply.sh`: stateless, zero stateful replace/delete, ≤ $15/mo delta. It pauses if the chosen mechanism needs a GKE cluster or node-pool replace, because in-flight runs die.
- **Live stage:** Stage A: code + tests ($0; the Docker privsep legs run locally and in CI `integration`). Stage B: push + pin the distroless image; load the profile on the sandbox pool; run the production-image privsep self-test pod ($0); then one bounded run that exercises the scoped second read under the new profile — ≤$10

## Goal
The run-task pod is the product's hardest boundary: the model's process runs there. Two gaps separate it from the
spec's target.
- **The base image.** The image is the Phase-0 stand-in (`node:22-bookworm-slim` + apt `util-linux`), with a shell
  and a package manager. D-P0.06-3 has been re-deferred since P0.06.
- **AppArmor.** DEF.1 Stage B set AppArmor to `Unconfined` on the run-task container (F-StageB-5): containerd's
  default `cri-containerd.apparmor.d` profile denied `unshare`/mount even with `CAP_SYS_ADMIN`
  (`write /proc/self/uid_map: Operation not permitted`), and the input-scoped second read needs both.

This ticket closes both gaps:
- a distroless runtime with no shell, holding exactly the static applets the two-uid drop and the scoped namespace
  call
- a Localhost AppArmor profile that allows those mount operations and nothing wider
- proof on the **production image**: the privsep check, a pod log that prints uid 10001 and uid 10002 directly, and
  a live scoped second read under the new profile

## Load (read these — do not re-read others)
- Spec §12.6 (mount-layer table + "Input-scoped subagents" + "Attestation"), §12.4 step 4, §12.8; §13.2 `images` + licence paragraph.
- `docs/tickets/DEFERRALS.md` rows D-P0.06-3, D-P0.15f-1, D-P1.22-2 (leg a); `docs/build/runs/DEF.1.md` §7.1 (def1f F-StageB-5; def1g/h F-StageB-6 `setpriv --reuid 0`; F-StageB-7 passwd entries).
- `apps/run-task/Dockerfile` (header ~1–22 incl. the HARDENING TARGET note ~19; builder ~24; runtime ~39–111; the native-binary exec assert; `ENTRYPOINT` ~111), `apps/run-task/docker/entrypoint.sh` (the `setpriv` ambient-caps argv), `docker/scoped-runner.sh` (78 lines: `sh`, `mkdir`, `chmod`, `cp`, `env -i`, `setpriv`, `mount` via argv), `docker/privsep-check.sh` (156 lines), `Dockerfile.privsep-test`.
- `apps/run-task/src/privsep.docker.test.ts`, `scoped-phase.ts` (`buildScopedPhasePlan` ~86–110 as DEF.4 left it; `runScopedPhase` ~136; the `setpriv --reuid 0` re-escalation note ~113–118), `harness-main.ts`, `agent-entry.ts`.
- `packages/live-clients/src/k8s-launcher.ts` ~178–205 (container `securityContext`: `appArmorProfile: Unconfined` ~196, caps ~197–202, `allowPrivilegeEscalation: true` ~203) + `k8s-launcher.test.ts` ~95–97.
- `infra/k8s/apply.sh` + `infra/k8s/*.yaml`; `infra/pulumi/Pulumi.prod.yaml` ~99–106 (the def1f note) and ~140 (`rhema:runTaskImageDigest`); `.github/workflows/ci.yml` `integration` ~102–103 (privsep step) and `images` ~105–166.
- `LICENSES.md` + `licenses.exceptions.json` (the pandoc separate-process precedent); `packages/security-checks/src/{infra-rbac,secrets-manifests}.test.ts` (the compensating controls); `docs/security/pen-test-scope.md` (run-task row ~29).

## In scope — deliverables
1. **Distroless runtime (D-P0.06-3; REQ-SPEC-10).** Rebuild `apps/run-task/Dockerfile`'s runtime stage on a
   distroless Node 22 base, with no shell and no package manager.
   - **The builder stage** produces **statically linked** util-linux applets: exactly those the entrypoint and
     the scoped runner call (`setpriv`, `unshare`, `mount` — re-confirm against the code), plus a static init
     (tini or equivalent), copied into the runtime.
   - **Unchanged contract:**
     - uids 10001–10006 with static `/etc/passwd` / `/etc/group` entries (F-StageB-7)
     - 0600/0440 harness secrets
     - read-only rootfs + tmpfs mounts
     - the vendored SDK, the native `claude` binary and `/app/skills`
   - **The build-time exec assertion** (uid `agent` can execute the native binary) moves to a stage that has a
     runtime to run it.
2. **A shell-free launch path.**
   - **`ENTRYPOINT`** becomes a pure argv: init → `setpriv` with `entrypoint.sh`'s exact reuid/regid, bounding,
     inheritable and ambient caps → `node /app/dist/harness-main.js`.
   - **`scoped-runner.sh`** is ported to a TypeScript runner. It keeps the same stash → tmpfs overmount →
     read-only bind → `setpriv --reuid <scoped> --clear-groups --no-new-privs` sequence and the same explicit,
     `env -i`-equivalent environment.
   - **`buildScopedLaunchSpec` / `buildScopedPhasePlan`** are updated. DEF.4's guidance-in-prompt behaviour is
     preserved.
3. **A tight AppArmor profile (X-apparmor-unconfined-runtask).**
   - **The profile.** A committed Localhost profile (e.g. `rhema-run-task`, under `infra/k8s/apparmor/`). It
     starts from the runtime default's denials and adds only the `mount`/`umount`/namespace operations the scoped
     runner performs, restricted to the stash dir and the `/work` overmount targets. Every other mount is denied.
   - **Loading it.** A loader places the profile on every sandbox-pool node (applied by `infra/k8s/apply.sh`,
     pinned to the sandbox node pool).
   - **Using it.**
     - `k8s-launcher.ts` sets `appArmorProfile: { type: "Localhost", localhostProfile: … }`, and its test flips.
     - `Unconfined` appears nowhere in the tree.
     - Revisit `allowPrivilegeEscalation: true`: set it false if the ambient-cap model allows, else record why.
4. **Privsep proof on the production image (REQ-SPEC-10; REQ-ARCH-19).**
   - **The check.** Port `privsep-check.sh` to a mode the distroless image runs itself (e.g. a
     `dist/privsep-selftest.js` entry). It asserts every line `privsep.docker.test.ts` asserts today: AC1,
     D-P0.15f-1 including the no-CAP_SETGID negative control, AC4, and P0.15h EROFS.
   - **New assertions:**
     - under the profile, the scoped sequence succeeds
     - a mount outside the allowed targets is denied
     - under the runtime default profile, the scoped sequence fails (F-StageB-5 reproduced), which proves the
       profile is load-bearing
   - **Where it runs.** `privsep.docker.test.ts` builds the **real** runtime image, not a look-alike. The CI
     `integration` job loads the profile (`apparmor_parser`) and runs the test under it. Hosts without AppArmor
     skip the profile legs visibly, never silently.
5. **Direct uid evidence (D-P0.15f-1 caveat).** `harness-main` and `agent-entry` each log one line with their real
   uid/gid and capability summary. The line holds no secret, env value or path content, so the pod-log proof no
   longer rests on inference.
6. **Licences and images (REQ-ARCH-40; REQ-ARCH-39).**
   - Add documented exceptions for the vendored util-linux (GPL-2.0, separate-process system binaries, like
     pandoc) and the init to `licenses.exceptions.json` + `LICENSES.md`.
   - The `images` job builds, scans and pins the new digest.
7. **Docs.**
   - Remove the Dockerfile's "HARDENING TARGET (deferred)" note.
   - Update the `pen-test-scope.md` run-task row: distroless, the Localhost profile.
   - Flip D-P0.06-3 with evidence.

## Out of scope
- The external pen test → **HUMAN-H7** (BL-35).
- A custom seccomp profile, GKE Sandbox/gVisor, and hardening the convert/export/fetcher images: not in BL-26.
- The mechanism for vendoring the SDK itself (D-P0.06-4; unchanged).
- The scoped second read's guidance semantics → **DEF.4** (preserved, not redesigned).
- The dev/preview stages → **OPS.1**. The external IaC drift → **OPS.2**.

## Acceptance criteria
- [ ] The runtime image contains no shell or package manager: `/bin/sh`, `bash`, `apt` and `dpkg` are absent,
      asserted by a test over the image filesystem. The vendored applets are static: no dynamic loader dependency.
      *(deterministic)*
- [ ] The production-image self-test prints every existing privsep line plus the new profile lines, and ends with
      `ALL PRIVSEP CHECKS PASSED`. Removing `+setgid` from the entrypoint argv fails D-P0.15f-1. *(deterministic —
      Docker/CI)*
- [ ] Under the committed profile the scoped stash → overmount → bind sequence succeeds. Under the runtime default it
      fails with the F-StageB-5 error. A mount outside the allowed targets is denied under the profile. *(deterministic
      — CI Linux with AppArmor)*
- [ ] The launcher emits the Localhost profile, and a tree-wide test fails if `Unconfined` reappears. The
      compensating controls stay green: `infra-rbac`, `secrets-manifests`, read-only rootfs, cap drop ALL, and the
      egress NetworkPolicy. *(deterministic)*
- [ ] The scoped TypeScript runner reproduces the shell runner's mount plan and env exactly. Golden tests cover the
      argv and env: no token, no credential, and only the `ALLOWED_AGENT_ENV_KEYS` set. *(deterministic)*
- [ ] **Stage B, live on prod (`runs` ns):**
  - [ ] The loader reports the profile loaded on every sandbox node. *(agentic)*
  - [ ] The self-test pod, on the pinned digest and under the Localhost profile, prints
        `ALL PRIVSEP CHECKS PASSED`. *(agentic)*
  - [ ] A real run's pod logs show `uid=10001` for the harness and `uid=10002` for the agent, with no `setresgid`
        EPERM. *(agentic)*
- [ ] Stage B: a bounded run's input-scoped second_read completes under the new profile:
      `second_read_producer_checked` green, `boundary.attested` violations = 0, total ≤ $10 metered. Deployed
      provenance equals the chain-tip SHA. *(agentic)*
- [ ] A rollback is documented and rehearsed as config: the previous digest pin plus the previous profile type,
      with no code revert. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-10 (primary: privilege separation in the run task, now on the hardened image), REQ-ARCH-19 (private mount
namespace + distinct uid), REQ-DATA-17 (exactly the enumerated files), REQ-ARCH-40 (licence exceptions for the
vendored binaries), REQ-ARCH-39 (the new digest pinned and recorded).

## Cross-cutting invariants
- Manifest **2** (TypeScript everywhere, so the ported runner is TS; the applets are upstream C built from source in
  the builder stage, never repo code in another language; licence allowlist and exceptions), **5** (independence is
  enforced by the kernel, never advised), **3** (no protocol text in logs; the uid log line carries no prompt),
  **10** (the new log lines carry no prompt, env or page text).
- Round 3: **REQ-SPEC-29** (no user surface changes; the evidence is pod logs + the self-test + a live run),
  **REQ-SPEC-30** (untouched: the run-task never connects to Postgres directly), **REQ-SPEC-32** (the Stage B run is
  metered and capped).

## Notes
- **Owned decisions (write ADRs):**
  - (a) **The distroless base and applet sourcing:** which base; building util-linux statically versus an
    alternative; which init.
  - (b) **The profile-loading mechanism on GKE sandbox nodes:** a minimal loader DaemonSet versus the
    security-profiles-operator. Account for the loader's own privilege, and for the fact that the sandbox pool has
    no internet (the loader image must come from Artifact Registry over Private Google Access).
  - (c) **The profile's allow-list,** and whether `allowPrivilegeEscalation` can drop to false.
- **Why DEF.4 first:** DEF.4 edits `scoped-phase.ts` (the guidance in the prompt), and this ticket ports the
  runner around it. Re-run DEF.4's scoped-guidance tests after the port.
- **Anchors to re-confirm at build time:**
  - The brief's `scripts/privsep-check.sh` actually lives at `apps/run-task/docker/privsep-check.sh`.
  - util-linux `mount` gates on the **real** uid (F-StageB-6), so keep the `setpriv --reuid 0` re-escalation inside
    the namespace.
  - Every scoped uid needs a passwd entry (F-StageB-7).
  - macOS Docker Desktop has no AppArmor. The profile legs skip there and run in CI.
- **DEFERRALS rule:** any leg not verifiable at build time becomes a `D-SEC.3-<n>` row with its compensating
  control. That includes a CI runner without AppArmor, and a sandbox node the loader cannot reach.
