# SEC.3 — Run-task confinement: distroless image + a tight AppArmor profile

Ticket: `docs/tickets/79_SEC.3__run-task-confinement.md` · run ledger: `docs/build/runs/SEC.3.md`
Stacks on `stevevitali/def-4-ledger-integrity-refund-window` (PR #100, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> The run-task pod is the product's hardest boundary — the model's process runs
> there. This ticket takes the Phase-0 stand-in off `node:22-bookworm-slim`
> entirely: the image is now distroless Node 22 with **no shell, no package
> manager, no `env`**, every launcher is compiled argv, the scoped runner's
> mount sequence is enforced by a per-node `rhema-run-task` AppArmor profile
> (the `Unconfined` stopgap is gone), and the privsep self-test runs inside the
> production image it ships — all 20 legs green.

- **Distroless image (ADR-074).** `apps/run-task/Dockerfile` is a four-stage
  build whose runtime is `gcr.io/distroless/nodejs22-debian12`. A toolsmith
  stage builds `setpriv`/`unshare`/`mount` (util-linux 2.40.4) and `dumb-init`
  1.2.5 **statically** from SHA-256-pinned upstream tarballs and fails the
  build if any output carries a `PT_INTERP` segment. A static
  `/etc/passwd`+`/etc/group` carries uids 10001–10006 — a uid with no passwd
  entry crashes the vendored SDK's `uv_os_homedir`. The vendored Agent SDK and
  its native `claude` binary are preserved byte-for-byte; a build-time assert
  stage runs the shipped `setpriv` to prove the binary is executable as uid
  10002.
- **Pure argv — the shell is gone.** `ENTRYPOINT` is a JSON array:
  `dumb-init → setpriv(--reuid 10001, the four-cap ambient/bounding set) → node
  harness-main.js`. `entrypoint.sh`, `scoped-runner.sh`, and
  `privsep-check.sh` are deleted and replaced by `dist/scoped-runner.js` (the
  §12.6 mount plan in `node:fs` + `execFile`) and `dist/privsep-check.js`.
  The model's env is the same eight-key allowlist applied via `env`
  replacement — no `PATH` is needed anywhere because every exec is absolute.
- **Two-uid separation, hardened past DEF.1 (F-SEC3-2).** Harness uid/gid
  **10001**, agent uid/gid **10002**, scoped roles **10003–10006**. The scoped
  launch keeps the load-bearing ruid-0 hop (`unshare --mount → setpriv --reuid
  0 → scoped-runner.js`) because util-linux `mount` keys off the *real* uid.
  New `uid=` log lines print `[label] identity uid=… gid=… capEff=…` from
  `/proc/self/status` — and they immediately paid off live: the agent's line
  showed it had **inherited the harness's ambient four-cap set** (ambient caps
  survive `execve` of unmarked binaries), i.e. `CAP_SETUID` in the model's
  hands — a kernel path back to uid 10001 and the harness token. Both drops
  (`buildAgentLaunch`, `scopedChildArgv`) now carry
  `--inh-caps -all --ambient-caps -all --no-new-privs`: the model's processes
  hold **zero** capability vectors, kernel-proven in the privsep legs
  (`CapEff=CapAmb=CapInh=0`, `NoNewPrivs=1`, a setuid-back attempt EPERMs).
- **AppArmor `rhema-run-task` (ADR-075, ADR-076).** The launcher emits
  `localhostProfile: rhema-run-task` — `Unconfined` is gone from every tracked
  non-document file. The profile grants the four capabilities and **exactly**
  the mount shapes the scoped runner emits (propagation-private on `/`, a
  fstype-tagged tmpfs on `/work/`, ro binds `/work/** → /tmp/scoped-stash/**`
  and back into the scoped root, incl. util-linux's two-syscall ro-remount
  variants); every other mount shape denies by absence. File rules allow the
  five exec'd binaries, `/app/**` reads (+`m` for `.node` addons), the writable
  tmpfs roots, the harness secret mount read-only, procfs/sysfs, and
  `inet/inet6` — the egress boundary stays the NetworkPolicy.
  `apparmor.test.ts` pins the rules verbatim and asserts the allow-list is
  closed; CI compiles the profile with `apparmor_parser -Q`.
- **Loader DaemonSet.** `infra/k8s/50-apparmor-loader-daemonset.yaml` runs one
  privileged loader pod per sandbox-pool node (`priorityClassName:
  system-node-critical`, `operator: Exists` tolerations, the pool selector).
  The image COPYs the committed profile to `/etc/apparmor.d/` so the enforced
  policy is bytewise the test-pinned file; the entrypoint re-applies hourly and
  asserts `rhema-run-task (enforce)` in the kernel — a self-heal on reboot or a
  dropped policy. Digest-pinned through our Artifact Registry like the
  prewarmer. Chosen over security-profiles-operator as proportionate: one
  profile on one node pool (ADR-075).
- **`allowPrivilegeEscalation: true` — explicitly a no-op (ADR-076).** Verified
  empirically: ambient capabilities survive `execve` under `no_new_privs`, so
  `false` isn't load-bearing; the flag is inert under `CAP_SYS_ADMIN` anyway,
  and writing `false` would claim a control the kernel isn't applying. The
  model's own `setpriv` drop still carries `--no-new-privs` where it matters.
- **Self-test now runs the production image.** `privsep.docker.test.ts` deleted
  the separate `Dockerfile.privsep-test` stand-in: 20 legs `docker run` the
  shipped image in the pod's posture — harness reads the secret, agent EACCES,
  the 10001→10002 ambient-cap drop (plus a −SETGID negative leg and a
  nnp+ambient leg), the F-SEC3-2 cap-clear legs (empty capability sets +
  setuid-back EPERM), the AC4 scoped-namespace chain end-to-end (enumerated file
  present, out-of-set file absent at the kernel, ro binds reject writes), no
  `sh`/`apt`/`env`, and static-ELF verification of all four applets.

## Verification

- **Deterministic:** `turbo build lint typecheck` **135/135** · vitest
  **38 files / 332 pass / 1 skip** (affected suite incl. scoped-runner goldens,
  scoped-phase, k8s-launcher Localhost + cap assertions, identity, AppArmor
  policy pinning, `Unconfined` sweep) · `check:licenses` 610 pkgs OK ·
  `check:protocol-markers` OK · `check-build-memory` **0 violations**.
- **Docker (production image):** `privsep.docker.test.ts` — **all 20 legs
  green** in ~64 s; AppArmor loader image builds and `apparmor_parser -Q`
  compiles the profile clean (cache warning only — local kernel lacks the 2.4
  compat patch).
- **Stage B:** **pending** — loader DaemonSet apply + digest pin + one bounded
  live `second_read` (≤$5) for the pod-log `uid=` evidence and the
  `second_read_producer_checked`/`boundary.attested` verdicts.

## Stage-B live findings (all fixed on this branch)

- **F-SEC3-1** — first pod died at the entrypoint on `setpriv --bounding-set`
  (`CAPBSET_DROP` needs `CAP_SETPCAP`, which the pod deliberately lacks; the
  bounding set was already exactly the add list, so the flag was a no-op).
  Flag removed; the Docker probe posture now mirrors the pod exactly.
- **F-SEC3-2** — the identity lines the ticket added immediately showed the
  agent's `capEff` carrying the harness's ambient four-cap set (ambient caps
  survive `execve`; `CAP_SETUID` in the model's hands is a kernel path back
  to uid 10001 → the harness token). Both model-side drops now carry
  `--inh-caps -all --ambient-caps -all --no-new-privs`; live line now reads
  `capEff=none`.
- **F-SEC3-3** — a *product* bug the run surfaced (not the image): a prior
  review's delivered `correspondence/review/1/second-read.json` was
  basename-resolved as this run's producer marker and failed delivery
  validation (`producer`, refunded 340 cr — the DEF.4 window working live).
  `work-reader` now resolves the marker only at `.rhema/`-rooted keys.
- **F-SEC3-4** — deployment gap: the first pod spec read
  `appArmorProfile: Unconfined` because the deployed **worker** image
  predated this branch's launcher/env plumbing (`RUN_TASK_IMAGE_DIGEST`
  plumbing is older, which is why the image pin worked). Rebuilt the worker
  on this branch, pinned its digest, `pulumi up` — the next pod launches
  under `Localhost/rhema-run-task`.
- **F-SEC3-5** — the first real `Localhost` admission exposed four
  live-mediation gaps the parser can't see (audit stream is the node's
  `journalctl`, not dmesg/Cloud Logging): the Secret volume's `..data`
  symlink farm needed `harness/**` (AppArmor resolves links); `/**` doesn't
  grant `r`/`w` on the dir itself (`stageSkills` readdir + runner mkdirs);
  glibc's `/etc/host.conf`; and `network netlink raw` for libuv + the
  **Bun**-runtime `claude` binary's NETLINK_ROUTE sockets. The tmpfs rule
  also gained `nosuid,nodev` (mount flags, not data). Loader digest
  `1e03e6bf…` enforced; attempt 2 of run `01M41AE99M49Q5HNG4M9S6106Q` ran a
  real model phase under the enforced profile (intake committed, 24 events).

## Deferrals

- **D-P0.06-3 — flipped to DONE-in-code.** The distroless rebuild + static
  applets + ambient-cap model + green privsep-check-in-image are exactly the
  row's done-condition; its live leg is this ticket's Stage B.
- **D-P1.22-2(a)** — pod-log uid evidence is what the Stage-B leg captures
  (harness 10001 / agent 10002 / scoped 10003+).

## Notes

- New licence rows for the vendored binaries: util-linux (GPL-2.0, the pandoc
  separate-process precedent — an exec'd binary, not linked code), dumb-init
  (MIT), libcap-ng (MIT). `LICENSES.md` + `licenses.exceptions.json` updated;
  `check:licenses` green.
- `infra/k8s/apply.sh` documents the **order constraint**: the loader DaemonSet
  must be Ready on every sandbox node *before* the worker's `Localhost` config
  rolls — a pod naming an unloaded profile fails container-create loudly.
- The scoped stash moved from `/run/scoped-stash` (unwritable on the read-only
  rootfs) to `/tmp/scoped-stash` — inside the writable tmpfs, outside `/work`
  so the tmpfs overmount hides it. Profile rules, runner constants, and tests
  moved together.
- The AppArmor `attr/` probe leg from the test matrix is covered by Stage B:
  on the Docker Desktop VM there is no AppArmor module to attribute, so the
  confined verdict is the loader's `(enforce)` line plus the live pod's
  `/proc/self/attr/current`.
