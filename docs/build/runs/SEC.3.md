# SEC.3 — Run-task confinement: distroless image + a tight AppArmor profile (run ledger)

- **Status:** IN PROGRESS (Stage A — implementation landed + locally verified; Stage B pending)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/79_SEC.3__run-task-confinement.md` (manifest row 79)
- **Branch:** `stevevitali/sec-3-run-task-confinement` — base `stevevitali/def-4-ledger-integrity-refund-window`
  at `1d6039ebb230fd0ea74eaab7dc162fc710d7db6b` (DEF.4 / PR #100, unmerged, OPERATOR policy)
- **Goal:** replace the Phase-0 `node:22-bookworm-slim` run-task stand-in with a shell-less distroless
  image carrying statically vendored `setpriv`/`unshare`/`mount` + a static init, port the scoped
  runner + privsep check to TypeScript entries, replace `appArmorProfile: Unconfined` with a
  least-privilege `Localhost` profile loaded on every sandbox node, and prove it on the production
  image + one bounded live second_read run.
- **Spend cap:** Stage B ≤ **$5** metered, aim ≈$3 (round-3 cumulative entering: **$61.22**)
- **ADRs:** ADR-074 (distroless base + applet sourcing + init), ADR-075 (profile-loading mechanism),
  ADR-076 (profile allow-list + `allowPrivilegeEscalation` verdict)

## 0 — Context load

- DEFERRALS read first: **D-P0.06-3** (production image hardening — OPEN, this ticket closes it),
  **D-P0.15f-1** (two-uid cap model — DONE; literal `uid=` print caveat this ticket discharges),
  **D-P1.22-2(a)** (live two-uid pod-log caveat — annotate with direct evidence).
- Anchors confirmed at build time:
  - `privsep-check.sh` lives at `apps/run-task/docker/privsep-check.sh` (156 lines).
  - `unshareArgv` is `unshare --mount --propagation private -- setpriv --reuid 0 --regid 0
    --clear-groups -- <runnerArgv>` (engine `buildScopedLaunchSpec`) — **no user namespace**; the
    ruid-0 wrap is F-StageB-6 load-bearing.
  - Scoped uids 10003–10006 need passwd entries (F-StageB-7).
  - F-StageB-5: containerd's `cri-containerd.apparmor.d` denies mount(2)/propagation change
    regardless of `CAP_SYS_ADMIN` → the Localhost profile must allow the propagation change on `/`
    + tmpfs + the stash/scoped binds, and nothing wider.
  - macOS Docker Desktop has no AppArmor → profile legs assert behavior by reading
    `/proc/self/attr/current` inside the selftest; CI `integration` provides the authoritative
    confined/denied legs.
- Live cluster confirmed: `rhema-prod-run-task-gke` (zonal us-central1-a), sandbox pool
  `rhema-prod-run-task-pool-647f9f4`, 1 node, COS, kernel 6.12.94, containerd 2.2.7, kubelet
  v1.35.8 (`appArmorProfile` GA). `runs` ns live. **No node-pool replacement needed** — a loader
  DaemonSet does not touch the pool; the pause condition is not triggered.
- Image publish path: `cloudbuild.yaml` steps build every `apps/*/Dockerfile` and push
  `${_AR}/<svc>:${_TAG}`; digests get pinned in `Pulumi.prod.yaml` (`rhema:runTaskImageDigest`,
  `rhema:serviceImages`).

## 1 — Design decisions (to be ADR'd)

1. **Base:** `gcr.io/distroless/nodejs22-debian12` (verified: node v22.22.0 at
   `/nodejs/bin/node`, empty `/usr/bin`, existing root/nonroot passwd to overwrite). Multi-stage:
   `builder` (pnpm deploy bundle, bookworm — unchanged) → `toolsmith` (alpine:3.21 — static
   libcap-ng + util-linux 2.40.4 `setpriv`/`unshare`/`mount` via `make LDFLAGS="-all-static"`;
   static `dumb-init` from single .c source) → `assert` (distroless + all COPYs + exec-assert via
   node `accessSync(X_OK)` — distroless has a runtime but no shell) → `runtime` (scratch-ish copy
   of assert output). Verified empirically: alpine source build produces `statically linked`
   binaries; alpine's `libcap-ng-dev` ships no `.a` → libcap-ng 0.8.5 built static first.
2. **ENTRYPOINT:** pure argv `[init, --, setpriv, --reuid 10001, --regid 10001, --clear-groups,
   --inh-caps -all,+setuid,+setgid,+sys_admin,+sys_chroot, --ambient-caps <same>, --, node,
   /app/dist/harness-main.js]` — entrypoint.sh ported minus `--bounding-set` (F-SEC3-1: the flag
   was a no-op needing CAP_SETPCAP the pod lacks — see §6).
   init = `dumb-init` (MIT, single .c, static — equivalent approved init; ADR'd vs tini).
3. **scoped-runner TS:** `apps/run-task/src/scoped-runner.ts` → `/app/dist/scoped-runner.js`.
   `runnerArgv` becomes `[<node-abs>, SCOPED_RUNNER, spec]` (node via `process.execPath` at
   buildScopedPhasePlan callsite → `process.execPath` is the harness's own node). Mount ops via
   `spawnSync("/usr/bin/mount", …)`; fs ops via `node:fs` (no `env`/`cp`/`chmod` binaries needed).
   Child env = the same 8-key `env -i` set (7 ALLOWED_AGENT_ENV_KEYS + `HOME` scoped to the jail —
   F-StageB-7's documented single addition).
4. **AppArmor profile** `rhema-run-task` at `infra/k8s/apparmor/rhema-run-task`: `file,` (DAC +
   RO-rootfs do the file boundary — same as cri-containerd default), `network,`, capability
   `sys_admin/setuid/setgid/sys_chroot`, mount allows ONLY: `make-rprivate → /`,
   `tmpfs(rw) → /work/`, `bind /work/** → /tmp/scoped-stash/**/`, `bind /tmp/scoped-stash/** →
   /work/scoped/**/`, `bind /work/** → /work/**/` (selftest RO-bind leg), `ro,remount,bind →`
   the same three target classes, `umount → /work/**/` + `/tmp/scoped-stash/**/` (cleanup).
5. **Loader:** minimal privileged DaemonSet (`50-apparmor-loader-daemonset.yaml`, kube-system,
   nodeSelector sandbox pool) running `apparmor_parser -r` in a 5-min loop, profile delivered via
   a ConfigMap applied from the committed file by `infra/k8s/apply.sh`. Loader image
   `apps/apparmor-loader/Dockerfile` = debian-slim + `apparmor` package (parser) — published to
   our AR (sandbox pool has no internet; AR over Private Google Access). vs security-profiles-
   operator: rejected — a CRD controller + webhook fleet sized for a single fixed profile, with
   off-registry images to mirror (ADR-075).
6. **Launcher:** `GkeLauncherConfig.appArmor?: { type; localhostProfile? }`, default
   `{ type: "Localhost", localhostProfile: "rhema-run-task" }`; the type is forwarded verbatim
   from deploy config (`rhema:runTaskAppArmorType` → worker `RUN_TASK_APPARMOR_TYPE` env) so
   rollback is config-only — no k8s enum literal beyond the Localhost default ever lives in tree.
7. **allowPrivilegeEscalation:** stays `true` — under `no_new_privs` execve() clears the ambient
   set, so `setpriv --ambient-caps → exec node` leaves the harness capless → the harness→agent
   drop EPERMs. Privsep selftest gains a leg proving exactly this (ambient-cap drop under
   `--no-new-privs` fails). ADR-076 records the verdict.
8. **privsep-selftest.ts** → `/app/dist/privsep-selftest.js`: ports every privsep-check leg
   (AC1, D-P0.15f-1 + negative control, AC4 + ruid-gate F-StageB-6, P0.15h EROFS) plus:
   reads `/proc/self/attr/current`; under `rhema-run-task` asserts scoped sequence + an
   out-of-scope `/etc` bind denied; under a runtime-default enforced profile asserts the scoped
   sequence fails (F-StageB-5 reproduced); `PRIVSEP_EXPECT_PROFILE` hard-fails on mismatch;
   `--ns-body` subcommand runs the in-namespace mount sequence (all-node, no shell).
9. **Image layout:** `/usr/bin/{setpriv,unshare,mount,dumb-init}` (static),
   `/etc/passwd`/`/etc/group` static files for 0/10001–10006, `/app` bundle, `/app/skills`,
   vendored SDK + claude at `/app/vendor/…`, `/work`, `/run/secrets`, `/tmp` mountpoints.
   `/usr/bin/env` is NOT shipped (env -i → spawnSync env object).
10. **uid log lines:** `identity.ts` → `[harness] identity uid=10001 gid=10001 … capEff=…` and
    `[agent-entry] identity uid=10002 …` at main() head + `[scoped-runner]` identity line —
    no secrets/paths/env values (uids, gids, cap-name summary only).

## 2 — Test matrix

| # | Behavior | Test | Layer |
|---|----------|------|-------|
| 1 | manifest emits Localhost rhema-run-task, caps/ro-rootfs/caps-add unchanged | k8s-launcher.test.ts (update) | unit |
| 2 | `appArmor` config override → verbatim type; default → Localhost rhema-run-task | k8s-launcher.test.ts (new) | unit |
| 3 | no `Unconfined` literal in non-doc tracked files | security-checks sweep test (new) | unit |
| 4 | loader DS: nodeSelector = sandbox pool template var, priv ctx, AR image ref, ConfigMap source | infra manifests test (new, security-checks) | unit |
| 5 | scoped-runner TS: mount plan → exec order (stash→tmpfs→binds→spec copy→setpriv argv) | scoped-runner.test.ts (new, fake spawn/fs) | unit |
| 6 | scoped-runner child env = 8 keys, placeholder-only key, no token/credential | scoped-runner.test.ts | unit |
| 7 | unshareArgv carries `[node, scoped-runner.js, spec]` tail | scoped-phase.test.ts (update) | unit |
| 8 | DEF.4 guidance-in-prompt preserved | scoped-phase.test.ts (unchanged, re-run) | unit |
| 9 | privsep-check legs ported (AC1, f-1 ±setgid, AC4, ro-bind EROFS, ruid gate) | privsep.docker.test.ts on REAL image | docker |
| 10 | NEW: apparmor legs (profile-allow / out-of-scope deny / runtime-default deny / nnp-breaks-ambient) | same | docker+CI |
| 11 | image has no /bin/sh|bash|apt|dpkg|env; applets static (no INTERP) | image-filesystem test over built image | docker+CI |
| 12 | CI integration: apparmor_parser load → confined + runtime-default selftest legs | ci.yml update | CI |
| 13 | uid lines in harness-main/agent-entry main() | identity.test.ts (new) | unit |
| 14 | license exceptions: util-linux GPL-2.0, dumb-init MIT, libcap-ng MIT | check:licenses + exceptions json | unit |
| 15 | loader pinned to sandbox pool + imagePullPolicy + profile name consistency | infra manifests test | unit |
| 16 | D-P0.06-3 flip evidence = this row + image legs | DEFERRALS edit | docs |

## 3 — Stage-A landed (amendments to §1 as built; 2026-09-30)

Sections §1/§2 record the PLAN; the build corrected four points — recorded here rather than rewritten:

- **§1.4 → profile is a mount ALLOW-LIST, not `file,`-only.** The shipped profile
  (`infra/k8s/apparmor/rhema-run-task`) names the four capabilities and exactly eight mount rules:
  propagation-private on `/` (the `unshare --mount --propagation private` change), the typed tmpfs
  overmount `fstype=tmpfs → /work/`, `/work/** → /tmp/scoped-stash/**` stash binds (rw+ro+ro-remount
  variants — `mount --bind -o ro` is two syscalls; `/**` because the stash target is a FILE two
  components deep), and `/tmp/scoped-stash/** → /work/scoped/**` scoped binds. The selftest's own
  ro-bind leg (P0.15h) runs at the pod level, not under the profile's file allow — no extra mount
  rule needed. `apparmor.test.ts` pins the rules verbatim + asserts the closed-allowlist property.
- **§1.5 → the loader bakes the profile INTO its image, not a ConfigMap.**
  `infra/k8s/apparmor/Dockerfile.loader` (ubuntu:24.04 + `apparmor` package) COPYs the committed
  profile to `/etc/apparmor.d/` so the shipped policy is bytewise what `apparmor.test.ts` pins and
  what `apparmor_parser -Q` compiles in the `images` CI job. `loader-entrypoint.sh` mounts
  securityfs, `apparmor_parser -r -W`, verifies `rhema-run-task (enforce)` in
  `/sys/kernel/security/apparmor/profiles`, then re-applies hourly. The DaemonSet
  (`50-apparmor-loader-daemonset.yaml`, kube-system, sandbox-pool selector, `tolerations: Exists`,
  `priorityClassName: system-node-critical`) pins `${APPARMOR_LOADER_IMAGE}` by digest via
  `apply.sh` envsubst — same pattern as the image prewarmer.
- **§1.7 → the nnp premise was WRONG; corrected empirically.** `setpriv … --ambient-caps X
  --no-new-privs -- node` shows `CapAmb` intact with `NoNewPrivs: 1` — ambient capabilities SURVIVE
  execve under nnp (nnp gates file-cap/setuid escalation, not the ambient prctl raise — which also
  works under nnp). The ADR-076 verdict stays `allowPrivilegeEscalation: true`, but the reasoning is
  corrected: the flag is a **no-op under CAP_SYS_ADMIN** (k8s semantics) and the ambient-cap launch
  does not depend on exec-escalation — the selftest's nnp leg asserts the drop SUCCEEDS under nnp,
  proving that. The model's process still carries `--no-new-privs` from its own drop.
- **§1.9 → the selftest runs INSIDE the production image.** `privsep-check.js` +
  `privsep-ns-body.js` (the in-namespace half that reuses the runner's `applyMountPlan` on a real
  `buildScopedLaunchSpec` spec — the kernel legs exercise the production tuples, not a re-typed
  copy). `privsep.docker.test.ts` builds `apps/run-task/Dockerfile` and `docker run`s the pod's
  posture (`--read-only`, tmpfs `/tmp|/work|/config`, `cap-drop ALL` + the four caps — exactly the
  pod's set; the earlier +SETPCAP probe model was corrected by F-SEC3-1, §6).
- **Local verification (this session, Docker Desktop):** production image built (vendored SDK +
  native `claude` present); `privsep-check.js` = **ALL 18 LEGS PASSED** inside the production image
  — AC1 EACCES, harness→agent drop, −SETGID negative control, nnp-ambient leg, AC4 real-chain
  namespace isolation + ruid gate + scoped-uid EROFS, P0.15h EROFS, no shell / no package manager /
  4 static applets (ELF PT_INTERP parse) / passwd+group uids 10001–10006 / EROFS rootfs probe; the
  real ENTRYPOINT ran `dumb-init → setpriv → node harness-main` printing
  `[harness] identity uid=10001 … capEff=setgid,setuid,sys_chroot,sys_admin`; the AppArmor profile
  **compiled** under `apparmor_parser -Q` in the built loader image.
- **`/run/secrets` in §1.9 was stale** — the harness secret mount is `/var/run/rhema/harness`
  (HARNESS_SECRET_MOUNT); the profile allows `r` on it.
- **passwd/group keep the base's `nobody`/`nonroot`** entries alongside uids 10001–10006 so
  getpwnam() resolves for anything expecting the stock distroless users.
- **Prewarmer fix:** `40-image-prepull-daemonset.yaml`'s `/bin/sleep` does not exist in distroless →
  `/nodejs/bin/node -e 'setInterval(() => {}, 1e9)'`.

## 4 — Self-review findings (2026-09-30, second pass over the full diff)

- **REAL BUG: `dumb-init` path vs the AppArmor exec rule.** The image installed the init at
  `/sbin/dumb-init` while the profile (and `apparmor.test.ts`) named `/usr/bin/dumb-init ix` — under
  the Localhost profile the container's FIRST exec (the ENTRYPOINT itself) would have denied, so
  every run pod would have failed container-create. No deterministic leg caught it because the
  Docker VM has no AppArmor module — exactly the Stage-B landmine the profile exists to prevent.
  Fix: the init now ships at `/usr/bin/dumb-init` (one location for all four applets); Dockerfile,
  ENTRYPOINT, `privsep-check.js` static-ELF leg, and the ledger layout note all moved. Image
  rebuilt; the full production-image leg re-ran **green (54 s)** including the new leg below.
- **NEW LEG: the shipped ENTRYPOINT argv.** `privsep.docker.test.ts` now also `docker run`s the
  image with NO `--entrypoint` override — `dumb-init → setpriv(ambient four caps) → node
  harness-main.js` — and asserts `[harness] identity uid=10001` in the output. The init's exec,
  the ambient-cap drop, and the harness's own identity print are all proven against the shipped
  argv, not just the applets in isolation.
- **`git grep` sweep trap closed.** The `Unconfined` regression sweep originally ran tracked-only —
  the new files were `??` and would have been missed until commit, at which point the test file's
  own needle + the profile's comment would have self-matched. The needle is now concatenated
  (`"unconfi"+"ned"` so the test cannot match itself), the profile comment reworded, and the grep
  carries `--untracked` so the sweep is stage-independent. Live `git grep` after the fix: zero hits.
- **Stale comments swept:** `scoped-phase.ts` still claimed the runner env "needs PATH to resolve
  node/mount/env" — only the outer `unshare` head resolves via PATH; every exec inside the runner
  is absolute. Comment corrected.
- **Docs:** `docs/security/pen-test-scope.md` row updated (distroless image + Localhost profile +
  the profile's mount allow-list as the explicit target), `OPERATIONAL_READINESS.md` rows 2/7/11
  flipped off the `Unconfined` posture. ADR-074/075/076 written + `adr-index` regenerated
  (generated file, not hand-edited). `DEFERRALS.md` D-P0.06-3 flipped to DONE-in-code with the
  leg inventory; the live leg is this ticket's Stage B.

### Full verification re-run (post-review)
`turbo build lint typecheck` **135/135** · `check:licenses` 610 pkgs OK · `check:protocol-markers`
OK · `check-build-memory` **0 violations** · affected vitest suite **38 files / 332 pass / 1 skip**
· production-image docker leg **green** · loader image `apparmor_parser -Q` **PARSE OK**.

## 5 — Remaining (Phase 6 + Stage B)
Commit → push → PR (body at `docs/build/pr/SEC.3.md`) → Stage B: build+push the loader image to
the prod AR repo, apply `50-apparmor-loader-daemonset.yaml` BEFORE the worker config rolls
(order constraint in `apply.sh`), build+push the production run-task image and pin its digest in
`Pulumi.prod.yaml`, `pulumi up`, then ONE bounded live `second_read` (≤$5) capturing the pod-log
`uid=` lines (harness 10001 / agent 10002 / scoped 10003), the node's `rhema-run-task (enforce)`
line, `second_read_producer_checked`, and `boundary.attested` violations = 0 — the evidence that
fully closes D-P0.06-3 and D-P1.22-2(a).

## 6 — Stage B live findings (2026-10-03)

### F-SEC3-1 — the `--bounding-set` flag EPERM'd the entrypoint (live, first pod)
- The first prod run pod (`run-01m41693…-a1-8dclj`) failed at the entrypoint with
  `setpriv: apply bounding set: Operation not permitted`. Root cause: `PR_CAPBSET_DROP` needs
  `CAP_SETPCAP`, which the pod deliberately does not hold — its CapBnd is already EXACTLY the
  four-caps securityContext add list, so `--bounding-set -all,+four` was a NO-OP that only
  demanded a capability the profile doesn't grant. The ADR-076 premise that the uid-0 start
  inherits SETPCAP in CapBnd was wrong for this posture (an earlier inference, not a live fact).
- **Fix:** the flag removed outright — `--inh-caps` + `--ambient-caps` alone carry the ambient
  model (same semantic, zero EPERM surface). `privsep-check.js`'s harness-emulation setpriv calls
  de-flagged identically, and the docker test's `--cap-add SETPCAP` removed — the probe posture is
  now the pod's posture EXACTLY, which is the class of drift this leg exists to catch. ADR-076
  amended; Dockerfile comment + ledger record it.
- ~~The k8s admission path itself proved fine~~ — corrected by F-SEC3-4: the pod's spec carried
  `type: Unconfined`, not `Localhost` (the deployed worker image predated the launcher
  plumbing). The loader order was never exercised by an admission until the F-SEC3-4 fix.
- **Deploy evidence so far:** Cloud Build `843e2958` (sha `3415436`) → run-task
  `@sha256:3c2799ff…`, apparmor-loader `@sha256:37e9b0f9…`; loader DS rolled out 1/1 on
  `rhema-prod-run-task-pool-647f9f4`, log `profile rhema-run-task loaded+enforced`; `pulumi up`
  update 135 (7 updates, 0 replaces) → worker carries `RUN_TASK_APPARMOR_TYPE=Localhost`,
  `…_LOCALHOST_PROFILE=rhema-run-task`, `RUN_TASK_IMAGE_DIGEST=…3c2799ff…` (verified on the live
  Cloud Run revision). Run `01M41693MPHWEJG63Q2XYN13PH` dispatched on the operator's workspace
  (cap 500 cr = $5 hard bound); first attempt failed at F-SEC3-1 above — rebuilt below.

### Deploy correction (F-SEC3-1 fix) — second build + update 136
- The F-SEC3-1 fix (no `--bounding-set`) was committed as `e868b9a`, rebuilt via Cloud Build
  `cbc2cb21-7dd2-46a7-9f94-0c05d74fc9b2` → run-task `@sha256:2997ca6cd04ab275514b2ab9b2ada60a3ac581ca8ff99acabda64b0f82c16efc`,
  loader `@sha256:e680b099ca7532f5b24a8da559a9dd6484354b5c0dec7cfa20baf27885f3abbe` (loader
  rebuilt because it is tagged from the same build invocation; the profile bytes are unchanged).
- `pulumi up` update 136 pinned `RUN_TASK_IMAGE_DIGEST=…2997ca6c…`; loader DS rolled
  `@sha256:e680b099…` on the sandbox pool (preview
  `https://app.pulumi.com/14stevevitali-gmail-com/rhema/prod/previews/37f188fd-4cd3-4fc3-99d9-c7ffd8e5881b`).
- Replacement run `01M416S2XP7FN37PR3FGZ1SXBX` dispatched on the same bounded workspace.

### F-SEC3-2 — the ambient cap set propagated into the model's processes (identity-line find)
- **Live evidence:** the second pod's own identity lines showed
  `[agent-entry] identity uid=10002 … capEff=setgid,setuid,sys_chroot,sys_admin` — ambient
  capabilities survive `execve` of unmarked binaries, so the entrypoint's ambient four-cap set
  (raised for the HARNESS, which owns the scoped `unshare`/`mount` launches and the uid drops)
  propagated verbatim through `setpriv → node` into the agent's process. With `CAP_SETUID`
  effective the model's process could `setresuid(10001)` — a kernel-level path back to the
  harness uid and therefore the harness token; the two-uid boundary rested on the env scrub +
  0600 perms alone. The scoped child's `--no-new-privs` drop had the same gap (ambient clear
  was implicit, not asserted). Pre-existing in the Phase-0 ambient model — surfaced now only
  because SEC.3's new identity logging prints `capEff`.
- **Fix (this branch, kernel-proven):** `buildAgentLaunch` now appends
  `--inh-caps -all --ambient-caps -all --no-new-privs` to the drop argv (bootstrap.ts);
  `scopedChildArgv` gained the same clears (scoped-runner.ts). The agent needs NO capability
  vector — `runScopedPhase` is spawned by the harness supervisor, never the agent — and nnp
  makes the empty set unregainable for the agent's whole subtree.
- **Proof:** two new privsep legs on the PRODUCTION image assert
  `CapEff=CapAmb=CapInh=0 && NoNewPrivs=1` inside the dropped agent and that a
  `setpriv --reuid 10001` attempt from the dropped agent EPERMs — both PASS. The agent-denied
  legs (AC1, P0.15h) now exec the REAL `buildAgentLaunch` argv, not a re-typed copy.

### F-SEC3-3 — a prior round's delivered `second-read.json` poisoned delivery validation (product bug, live)
- **Live evidence:** run `01M416S2XP7FN37PR3FGZ1SXBX` — all five pod phases `done`
  (`predicatesPassed:true`, hook allow/deny lines flowing, run-task image
  `@sha256:2997ca6c…` — note the pod ran `Unconfined`, not `Localhost`: F-SEC3-4 below) —
  then `finalizing → failed`
  with `failure={code:validation,message:"producer"}` and `cost.refunded 340`.
- **Root cause (pre-existing oracle bug, not the image):** the run had `second_read:false`
  (quick rigor opts the phase out — ordinals 3/4 correctly skipped), but the seat tree was
  hydrated with a PRIOR review's delivered `correspondence/review/1/second-read.json`.
  `dossierForPhase`'s `readJson(files, ".rhema/second-read.json")` walked `resolveKey`'s
  basename cascade and resolved THAT stale marker, so the dossier carried a
  `secondReadProducerQueryId` from a different run — `checkSecondReadProducer` found no
  matching `subagent_launches` row for this run and rejected the delivery. The same cascade
  could have falsely SATISFIED `second_read_producer_checked` on a failed launch — the worse
  direction of the same bug.
- **Fix (this branch):** `work-reader.ts` gains `readSecondReadMarker` — the marker resolves
  only at `.rhema/second-read.json` or a `*/.rhema/second-read.json` suffix (the launch
  order's seat-scoped `markerPath`), never the bare basename, so a delivered correspondence
  twin can never impersonate this run's producer claim. Two regression tests pin both
  directions (stale marker ignored; real seat marker crosses). The fix ships inside the
  run-task image — the dossier is pod-computed.

### F-SEC3-4 — the worker image was not rebuilt: the AppArmor config chain was inert
- **Live evidence:** run `01M418EWWWZGSVHEHXSPRWT777`'s pod spec showed
  `securityContext.appArmorProfile: {type: Unconfined}` even though the worker's live env
  carried `RUN_TASK_APPARMOR_TYPE=Localhost` + `…_LOCALHOST_PROFILE=rhema-run-task` (verified
  on the Cloud Run revision) and update 137 had converged.
- **Root cause (deployment, not code):** the deployed worker image (`070c67fc…`, built at the
  DEF.4 tip) predates this branch's `env.ts`/`main.ts`/`k8s-launcher.ts` AppArmor plumbing —
  the env vars parsed on the OLD code are dropped, and the old launcher still hardcodes the
  F-StageB-5 `Unconfined` stopgap. `RUN_TASK_IMAGE_DIGEST` worked because that plumbing
  predates SEC.3. `cloudbuild-sec3.yaml` builds run-task + the loader only — the worker was
  never part of the image set.
- **Consequence:** no SEC.3 pod has run under `Localhost` yet — the first pod's "Localhost
  admission held" inference was wrong; the profile's real admission + scoped-mount verdict is
  exactly what the next bounded run must capture (it is the ticket's central claim).
- **Fix executed:** worker Cloud Build `c3d1f107-a482-43a5-bdc0-1d8fa2141833` (tag
  `sec3-73718cd`) → worker `@sha256:4c4efebe4939381e104f532f1e1a581901e4fccda0df9ae7559c287c1eed03f1`
  pinned in `serviceImages`; `pulumi up` **update 138** converged (worker revision carries
  `RUN_TASK_APPARMOR_TYPE=Localhost` + `…_LOCALHOST_PROFILE=rhema-run-task` + the new digest
  pin + the SEC.3 launcher code). Run-task `sec3-73718cd` = `@sha256:419f8e86…` (update 137).
- **F-SEC3-2 live confirmation (same pod):** run `01M418EWWWZGSVHEHXSPRWT777` (new run-task
  image, launched before the worker rebuild — `Unconfined`) shows
  `[harness] identity uid=10001 … capEff=setgid,setuid,sys_chroot,sys_admin` and
  `[agent-entry] identity uid=10002 … capEff=none` — the agent drop strips every capability
  vector exactly as the kernel legs proved; the ambient model is now scoped to the harness.

### F-SEC3-5 — the first real `Localhost` admission surfaced four live-mediation gaps the parser could not see
- **Live evidence:** with the worker rebuilt (F-SEC3-4), run `01M419Q5GBRW8M04F2PYK9NMGA`'s pod
  was the first to actually run `type: Localhost, localhostProfile: rhema-run-task`. The harness
  died instantly: `EACCES …/harness/run-token`. A second attempt (`01M41AE99M49Q5HNG4M9S6106Q`)
  cleared the token read but the intake query returned `success` with **0 events** and no
  `.rhema/phase-result.json` (`artifact_missing`).
- **Root cause (four gaps, all confirmed in the node's `journalctl` AVC stream — the audit log is
  host-side, not in dmesg):**
  1. **k8s Secret symlink farm** — a Secret volume materializes `run-token ->
     ..data/run-token -> ..<ts>/run-token`; AppArmor resolves links, so `harness/*` never
     matched. Fixed with `harness/ r` + `harness/** r`.
  2. **Dir-granule reads** — `/**` does not grant `r` on the dir itself; `stageSkills()`'s
     readdir of `/app/skills/` was DENIED → skills never staged → the SDK query emitted
     nothing. Added `/app/skills/ r`, `/app/dist/ r`, plus `w` on `/work/`, `/tmp/`,
     `/config/` for the runner's mkdirs.
  3. **`/etc/host.conf`** — glibc's resolver read was denied (benign but loud). Added.
  4. **NETLINK_ROUTE** — `libuv-worker` (node) and `Bun Pool` threads (the vendored `claude`
     binary is bun-compiled) open `family=netlink sock_type=raw` sockets at startup;
     repeated denials plausibly wedged the subprocess. Added `network netlink raw`
     (mutations still gate on CAP_NET_ADMIN, which the pod does not hold).
- **Also hardened in the same rev:** the tmpfs rule now lists `nosuid,nodev` in its option set
  (mount FLAGS, not data — only `size=64m` rides the data arg), `unix type=stream` for the
  hook socket, `signal (receive) peer=unconfined` for kubelet SIGTERM (docker-default's
  tuple), and `/dev/ptmx`. `abstractions/base` turned out to already carry unix/signal, but
  the explicit rules are kept so the profile reads self-contained.
- **Fix executed:** loader image `sec3-fsec35b` =
  `@sha256:1e03e6bf835766bb5147b23b21174ea124330b6855c1c0d492e57e6489d05c46` rolled via
  `kubectl set image` (DaemonSet converged, `profile rhema-run-task loaded+enforced`).
  `apparmor_parser -Q` validates the file in the loader image before every ship;
  `apparmor.test.ts`'s tmpfs pin updated to `(rw,nosuid,nodev)`.
- **Outcome:** attempt 2 (`a2-jhmdh`) admitted `Localhost/rhema-run-task` (pod spec),
  printed both identity lines, bound the credential injector, and ran a REAL model phase —
  hook allow/deny lines streamed for drafts/correspondence reads. The run is second_read:true
  with the scoped producer leg still to come.
- **Spend note:** attempt-1 pods died before any model call (0 credits); cancelled stale
  runs `01M418EWWW…` (118cr) + `01M419Q5…` (0cr) via the API to free the concurrency cap.
