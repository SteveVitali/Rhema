# ADR-076: the rhema-run-task profile allow-lists exactly the scoped mount sequence, and allowPrivilegeEscalation stays true as a no-op

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** SEC.3
- **Requirement ids:** REQ-SPEC-10, REQ-ARCH-19, REQ-DATA-17
- **Spec:** §12.6 (input-scoped mount boundary), §12.4 step 4

## Context
Two coupled decisions owned by this ticket. (1) What the `rhema-run-task` profile may allow:
too narrow and the scoped runner's mounts deny like F-StageB-5; too wide and the profile is a
decorative `Unconfined`. (2) `allowPrivilegeEscalation`: the pod also carries `CAP_SYS_ADMIN`,
and k8s documents the flag as effectively forced-true in that posture — so what does an
*explicit* value even decide? The ambient-capability launch added a real question: does the
`setpriv --ambient-caps → exec node` chain break under `no_new_privs`, which `false` would set?

Empirical findings that shaped the answer (verified on the built production image):
- **Ambient capabilities SURVIVE `execve` under `no_new_privs`.** `setpriv … --ambient-caps X
  --no-new-privs -- node` shows `CapAmb` intact with `NoNewPrivs: 1` — nnp gates
  setuid/file-capability escalation at exec, not the ambient prctl raise (which itself
  succeeds under nnp). The ambient-cap model therefore does not *rely* on the flag at all.
- **`PR_CAPBSET_DROP` needs `CAP_SETPCAP` — and the pod lacks it (F-SEC3-1, live 2026-10-03).**
  The entrypoint originally carried `--bounding-set -all,+four` as belt-and-braces narrowing.
  The first prod pod died at the entrypoint: `setpriv: apply bounding set: Operation not
  permitted`. The k8s bounding set is *already* exactly the securityContext add list (SETUID,
  SETGID, SYS_ADMIN, SYS_CHROOT — nothing else exists to narrow), and the AppArmor profile
  grants the same four, so the flag was a no-op that EPERM'd. It was removed outright —
  `--inh-caps` + `--ambient-caps` alone carry the ambient model. The earlier guess that the
  uid-0 start inherits a full bounding set was wrong for this posture.

## Decision
**Allow-list (closed mount grammar).** `infra/k8s/apparmor/rhema-run-task` grants the four
capabilities (`setuid, setgid, sys_admin, sys_chroot`) and exactly the mount shapes the scoped
runner emits — propagation-private on `/`, a fstype-tagged tmpfs on `/work/`, ro binds
`/work/** → /tmp/scoped-stash/**`, ro binds `/tmp/scoped-stash/** → /work/scoped/**` — each in
`rw,bind`, `ro,bind`, and `ro,remount,bind` variants (util-linux's two-syscall
`mount --bind -o ro`). Every other mount shape is denied by absence. File rules allow the five
exec'd binaries (`ix`), `/app/**` reads (+ `m` for `.node` addons, `ix` only for the vendored
`claude`), the writable work roots, the harness secret mount read-only, procfs/sysfs reads, and
`inet/inet6` stream+dgram (the pod's egress boundary stays the NetworkPolicy, not the profile).
`apparmor.test.ts` pins the rules verbatim and asserts the allow-list is closed.

**`allowPrivilegeEscalation: true` — explicitly.** `false` is not a real option: k8s makes the
flag a no-op whenever the container holds `CAP_SYS_ADMIN` (which the scoped mount boundary
requires), and the ambient launch provably does not depend on exec-granted privilege (the nnp
leg asserts the harness→agent drop *succeeds* under nnp). The flag stays `true` to say so
honestly rather than posture `false` while the kernel ignores it. The model's process still
carries `--no-new-privs` from its own setpriv drop — nnp applies exactly where it matters.

## Consequences
The pod's AppArmor posture stops being decorative: a mount outside the scoped sequence
(e.g. binding `/etc` or a host path into the namespace) denies even with `CAP_SYS_ADMIN`. The
profile + `drop ALL` caps + the two-uid uid boundary compose into three independent layers —
which is why the ticket calls the pod the hardest boundary. The `true` flag is documented as a
no-op so a future tightening pass does not mistake it for live machinery; if `CAP_SYS_ADMIN` is
ever dropped (e.g. a userns-based runner), the flag should flip to `false` the same day.

**Amended 2026-10-03 (F-SEC3-2):** the same ambient-survives-execve property this ADR relies on
for the HARNESS also propagated the four-cap set into the AGENT's process — the live pod's own
`[agent-entry] identity … capEff=…` line showed it. `CAP_SETUID` in the model's hands is a
kernel path back to uid 10001 and the harness token, so `buildAgentLaunch` and
`scopedChildArgv` now append `--inh-caps -all --ambient-caps -all` (with `--no-new-privs`,
which the scoped drop already carried and the agent drop now does too): the ambient model is
scoped to exactly the harness supervisor that needs it, and the kernel legs in
`privsep-check.js` prove `CapEff=CapAmb=CapInh=0` inside the dropped agent (the scoped argv
carries the identical tuple, goldened in `scoped-runner.test.ts`).

**Amended 2026-10-03 (F-SEC3-5):** the first REAL `Localhost` admission proved the allowlist's
compile-clean rules still missed live mediations the parser cannot see (run `01M41AE99M49…`,
node `journalctl` AVC stream — GKE routes denials to the host journal, not the pod). Four
additions, all evidence-backed: (1) a k8s Secret volume is a **symlink farm**
(`run-token -> ..data/run-token -> ..<ts>/run-token`) and AppArmor resolves links, so the
secret mount needs `harness/**` (plus the dir rule) rather than `harness/*`; (2) `/**` does
not grant `r`/`w` on the dir itself — `stageSkills()`'s readdir of `/app/skills/` denied and
wedged the intake query (0 events, `artifact_missing`), so dir-granule rules sit beside every
glob the runtime readdir's or mkdir's under; (3) `/etc/host.conf` for glibc's resolver; (4)
`network netlink raw` — libuv's interface enumeration and the **Bun** runtime's pool threads
(the vendored `claude` binary is bun-compiled) open NETLINK_ROUTE sockets at startup; writes
stay gated on CAP_NET_ADMIN which the pod does not hold. The tmpfs rule also gained
`nosuid,nodev` in its option set — they are mount FLAGS in the request (only `size=` is data),
so a bare `(rw)` rule would have denied the overmount. `unix type=stream`, the
docker-default-style `signal (receive) peer=unconfined` + same-profile pair, and `/dev/ptmx`
were added at the same rev (the latter two already ride `abstractions/base`, but the profile
reads self-contained with them explicit). (5) util-linux ≥2.40's **new mount API**: the live
AVC showed `mount --bind -o ro` decomposes to open_tree clone → mount_setattr(ro) →
`move_mount`, and move_mount audits as `mount` `flags="rw, move"` on the destination — the
`bind`/`remount` tuples never see it. `mount options=(rw,move)` rules now cover the stash
dest, the scoped root, and `/work/` (the tmpfs attach is a move_mount too); the ro setattr
audits ⊆ the remount rules. Methodology note for the next profile change:
`kubectl debug node/<node> --profile=sysadmin -- chroot /host journalctl` is the audit
source; Cloud Logging does not carry kernel AVCs.

## Alternatives considered
- **`file,`-style broad profile (allow all files, scope only mounts):** rejected — the file
  rules are cheap to name and the harness secret mount gets a *read-only* profile rule under a
  profile it could otherwise only lose to DAC. Defense in depth is the point of the layer.
- **`allowPrivilegeEscalation: false` anyway:** posturing — the flag is inert under
  `CAP_SYS_ADMIN`, and writing `false` would claim a control the kernel isn't applying.
- **Drop `CAP_SYS_ADMIN` (userns remap or `sysbox`):** the scoped mounts need real
  `CAP_SYS_ADMIN` in the pod's userns; containerd doesn't offer pod-level userns mapping on
  GKE's standard runtime. Out of scope by design (a future runner could revisit).
- **Profile the model's process separately (child profile / `aa_change_profile`):** the scoped
  query already runs as a distinct uid with `--no-new-privs` behind a mount namespace; a second
  profile transition adds a transition-permission surface for marginal gain.

## Revisit trigger
Revisit when any new mount argv lands in `scoped-subagent.ts`/`scoped-runner.ts` (the profile
must name it or the scoped phase breaks — `apparmor.test.ts` is the drift tripwire); if the
container ever drops `CAP_SYS_ADMIN`, flip `allowPrivilegeEscalation` to `false` the same day;
and if the sandbox pool runs non-run workloads, re-scope the profile's `/work/**` and network
rules per workload.
