# ADR-074: run-task ships a distroless Node-22 image with statically vendored util-linux applets + a static dumb-init

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** SEC.3
- **Requirement ids:** REQ-SPEC-10, REQ-ARCH-19, REQ-ARCH-39, REQ-ARCH-40
- **Spec:** §12.1 (the run-task pod), §12.4 step 4, §12.6, §13.2/§13.3

## Context
The run-task pod is the product's hardest boundary — the model's process runs there. The Phase-0
image was `node:22-bookworm-slim` plus `apt install util-linux tini`: a shell, a package manager,
and the whole Debian userland rode into the model's own container (D-P0.06-3, the absorbed BL-26
hardening row). The scoped runner and entrypoint were shell scripts; the privsep self-test ran in
a separate throwaway image, so the kernel proofs never exercised the artifact the pod ships.

Distroless removes the shell and package manager — which also removes every binary the launch
chain execs: `setpriv` (the two-uid drop + ambient caps + the scoped `--no-new-privs` drop),
`unshare` + `mount` (the §12.6 private mount namespace), the init, `env -i`, `cp`, `mkdir`,
`chmod`, `ls`, `id`. Nothing may be exec'd but what we deliberately vendor.

## Decision
Rebuild `apps/run-task/Dockerfile` as a multi-stage image whose runtime is
`gcr.io/distroless/nodejs22-debian12`:

- **toolsmith (alpine:3.21):** build the three applets **statically** from upstream source —
  libcap-ng 0.8.5 (Alpine ships no `.a`, so it is built static first), then util-linux 2.40.4
  `setpriv`/`unshare`/`mount` with `make LDFLAGS="-all-static"` (configure-time `LDFLAGS=-static`
  is swallowed by libtool). Every tarball is SHA-256-pinned; the stage fails if any output ELF
  carries a `PT_INTERP` segment.
- **init:** `dumb-init` 1.2.5 (MIT, a single `.c` file) built static — the equivalent-approved
  tini substitute (PID-1 reaping + signal forwarding to the harness).
- **pure-argv runtime:** the ENTRYPOINT is `dumb-init → setpriv(ambient four-cap set) → node
  harness-main.js` — the shell entrypoint ported flag-for-flag. The scoped runner is a TypeScript
  entry (`dist/scoped-runner.js`) applying the same mount plan via `node:fs` + `execFile`, and the
  model's env is the same eight-key `env -i` set applied by `spawnSync`'s env replacement.
- **static identity files:** `/etc/passwd` + `/etc/group` carry uids 10001–10006 (harness, agent,
  four scoped roles) plus the base's `nobody`/`nonroot` — a uid without a passwd entry crashes the
  vendored SDK's `uv_os_homedir` (F-StageB-7).
- **the self-test runs in this image:** `privsep-check.js` + `privsep-ns-body.js` ship in `dist/`
  and the vitest leg `docker run`s the pod's posture (`--read-only`, tmpfs work dirs, the pod's
  cap set) — the kernel proofs exercise the shipped artifact, not a stand-in.

## Consequences
The model's container has no shell, no package manager, no `env`, no `ls`/`cat`/`id` — an
exec-boundary break has to be built out of a Node REPL, three mount/namespace applets, and four
ambient capabilities, inside a read-only rootfs. The applets' GPL/LGPL licences ride the pandoc
separate-process precedent (LICENSES.md + exceptions). Build time grows by the util-linux compile
(cached layers); the image is larger than the slim base because Node's distroless tree is, but the
attack surface is the point. Every exec path is absolute — a broken `PATH` can no longer hide a
launch failure.

## Alternatives considered
- **Alpine runtime (musl node):** smaller and shell-optional, but Alpine still ships `/bin/sh` +
  `apk` by default, node-on-musl is not the runtime CI/prod agree on, and removing the package
  manager from Alpine is a fight against the base — distroless is built for exactly this.
- **Debian slim minus shell (rm /bin/sh /usr/bin/apt):** subtraction-based hardening — fragile to
  enumerate (dash, busybox-ish helpers, dpkg helpers remain) and unverifiable as a *presence*
  property. Distroless makes absence structural.
- **Distroless + dynamic applets:** impossible — there is no loader path for `setpriv` unless we
  also vendor glibc/musl loaders, which recreates an interpreter surface. Static is the only
  hermetic answer; musl (Alpine toolchain) gives clean static binaries where glibc `-static`
  leaves nss stubs.
- **security-profiles-operator / OCI hooks for tooling:** scoped to ADR-075 (the profile loader);
  the image decision stands alone.

## Revisit trigger
If the harness needs a fourth util-linux applet (e.g. `nsenter`, `switch_root`), revisit whether a
distroless debug/nonroot variant plus a maintained applets layer is better than another
hand-pinned source build. Also revisit if Google ships a distroless `nodejs24` the chain wants.
