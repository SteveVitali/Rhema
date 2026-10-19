# run-task — the two-uid Agent SDK task image (ledger M11; §12.1, §12.4 step 4). One GKE Job pod per run.
#
# Contract this image encodes:
#   • linux/amd64 (GKE default; arm64 optional), 1 vCPU / 2 GiB baseline (2/4 for Draft > 8k words) — set on
#     the GKE Job/Pod spec. Runs on GKE (not Cloud Run) because the input-scoped mount namespace needs
#     CAP_SYS_ADMIN, which Cloud Run/Autopilot cannot grant.
#   • The SDK is VENDORED into the image (a proprietary dependency, REQ-ARCH-4) — copied at build, never
#     fetched at run time; the sandbox subnet has no route out except the proxy.
#   • TWO uids: `harness` (uid 10001) holds the run token, the proxy credential, the hook daemon, and the
#     heartbeat/commit/audit clients; `agent` (uid 10002) runs the SDK + agent-entry (agent-entry.ts) with a
#     SCRUBBED env (@rhema/engine buildAgentEnv) and no secret in scope (REQ-SPEC-10).
#   • The secrets file lives under /var/run/rhema/harness, mode 0440 fsGroup harness — the agent uid cannot
#     read it.
#   • Root filesystem READ-ONLY at run time (Pod `securityContext.readOnlyRootFilesystem: true`); writable
#     tmpfs (emptyDir medium: Memory) is mounted only for the seat's writable namespaces (/work), per-run
#     config (/config), and /tmp — §11.5 mount mechanics.
#
# SEC.3 (D-P0.06-3 closed; ADR-074): the runtime is DISTROLESS (`gcr.io/distroless/nodejs22-debian12`) —
# no shell, no package manager, no /usr/bin/env. The three util-linux applets the launch chain execs
# (setpriv for the two-uid drop + ambient caps + no-new-privs scoped drop; unshare + mount for the §12.6
# private mount namespace) are built STATICALLY from upstream source in the `toolsmith` stage and vendored
# at /usr/bin — nothing else is exec'able but /nodejs/bin/node. `entrypoint.sh`/`scoped-runner.sh`/`env -i`
# are gone: the ENTRYPOINT is a pure argv and the scoped runner is dist/scoped-runner.js (TypeScript, same
# mount plan + scrubbed env). dumb-init is the static PID-1 reaper/signal forwarder.

# ---- builder: install the workspace, build the run-task slice + its deps, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
# The whole workspace is the build context (turbo needs the graph); the preinstall resolves protocols + the
# evals stub. A .dockerignore keeps node_modules/dist out so the install is reproducible from the lockfile.
COPY . .
RUN pnpm install --frozen-lockfile
# Build @rhema/run-task and every workspace package it depends on (turbo resolves the order).
RUN pnpm --filter @rhema/run-task... build
# `pnpm deploy` writes a self-contained bundle (run-task's dist + its workspace deps + prod node_modules) to
# /bundle — the only thing the runtime image needs.
RUN pnpm --filter @rhema/run-task --prod deploy --legacy /bundle

# Assemble the image-owned tree a RUN-less distroless stage cannot create (mountpoints the pod's volumes
# land on, the harness/agent homes the static passwd names, and the vendored SDK laid out at its runtime
# paths). Owners are NUMERIC — the runtime's /etc/passwd entries agree but nothing here needs them.
RUN mkdir -p \
      /img/work /img/config /img/tmp \
      /img/var/run/rhema/harness \
      /img/home/harness /img/home/agent \
      /img/app/vendor \
      /img/app/node_modules/@anthropic-ai \
  # /work + /config + /tmp sit under pod emptyDir mounts at run time; the dirs still exist so the mount
  # targets are pre-created on the read-only rootfs (and so the privsep self-test's mounts behave the
  # same). /var/run/rhema/harness is the 0440 per-run Secret's mount target (HARNESS_SECRET_MOUNT).
  && chmod 1777 /img/tmp \
  && chmod 0700 /img/var/run/rhema/harness \
  && chown -R 10001:10001 /img/work /img/config /img/tmp /img/var/run/rhema/harness /img/home/harness \
  && chown -R 10002:10002 /img/home/agent \
  # The vendored SDK wrapper → node_modules (the agent uid reads it under uid 10002), and the native
  # `claude` binary at its pinned path (0755, agent-owned — the `assert` stage proves the exec). A missing
  # vendored tree is a placeholder build: the run loop fails fast at loadSdkQuery(), never here.
  && if [ -d /repo/apps/run-task/vendor/claude-agent-sdk ]; then \
       cp -r /repo/apps/run-task/vendor/claude-agent-sdk /img/app/node_modules/@anthropic-ai/claude-agent-sdk \
       && echo "vendored @anthropic-ai/claude-agent-sdk into the image"; \
     else \
       echo "WARNING: @anthropic-ai/claude-agent-sdk NOT vendored — placeholder build (no live run)"; \
     fi \
  && if [ -f /repo/apps/run-task/vendor/claude-agent-sdk-linux-x64/claude ]; then \
       mkdir -p /img/app/vendor/claude-agent-sdk-linux-x64 \
       && cp /repo/apps/run-task/vendor/claude-agent-sdk-linux-x64/claude \
             /img/app/vendor/claude-agent-sdk-linux-x64/claude \
       && chmod 0755 /img/app/vendor/claude-agent-sdk-linux-x64/claude \
       && echo "vendored native claude binary at /app/vendor/claude-agent-sdk-linux-x64/claude"; \
     else \
       echo "WARNING: native claude binary NOT vendored — placeholder build (no live run)"; \
     fi \
  && chown -R 10002:10002 /img/app/node_modules /img/app/vendor

# ---- toolsmith: statically-linked util-linux applets + static init (ADR-074) ----
# The distroless runtime has no package manager, so the applets are SOURCE-BUILT here and vendored in.
# musl (alpine) is the toolchain: `gcc -static` on glibc leaves getpwnam/nss warning stubs; musl's static
# binaries are hermetic (no libc.so needed at run time — there is none in the runtime image). Every tarball
# is pinned by SHA-256 so a swapped upstream artifact fails the build deterministically.
FROM --platform=$TARGETPLATFORM alpine:3.21 AS toolsmith
ARG UTILLINUX_VERSION=2.40.4
ARG UTILLINUX_SHA256=5c1daf733b04e9859afdc3bd87cc481180ee0f88b5c0946b16fdec931975fb79
ARG LIBCAPNG_VERSION=0.8.5
ARG LIBCAPNG_SHA256=3ba5294d1cbdfa98afaacfbc00b6af9ed2b83e8a21817185dfd844cc8c7ac6ff
ARG DUMBINIT_VERSION=1.2.5
ARG DUMBINIT_SHA256=3eda470d8a4a89123f4516d26877a727c0945006c8830b7e3bad717a5f6efc4e
RUN apk add --no-cache alpine-sdk linux-headers xz
WORKDIR /build
# libcap-ng first: util-linux `setpriv` links it (cap bounding/inheritable/ambient ops). Alpine ships only
# the shared object — no .a — so it is built static from source (MIT). --without-python3 keeps the build C-only.
# Upstream (people.redhat.com) first; on failure, two mirrors verified to serve the byte-identical tarball
# (Fedora's content-addressed source lookaside, then Alpine distfiles). The sha256 pin below is checked
# whichever host answered, so a mirror can never change what is built.
RUN { wget -q -T 30 -O "libcap-ng-${LIBCAPNG_VERSION}.tar.gz" "https://people.redhat.com/sgrubb/libcap-ng/libcap-ng-${LIBCAPNG_VERSION}.tar.gz" \
      || wget -q -T 60 -O "libcap-ng-${LIBCAPNG_VERSION}.tar.gz" "https://src.fedoraproject.org/repo/pkgs/libcap-ng/libcap-ng-${LIBCAPNG_VERSION}.tar.gz/sha512/89fb86454847f354c012411ecdc7e17f07bb40d7e9719ca0b93ea81c436113685bbbb5c1b9cb1b7ac92d216c105c687285304135beb156aedd55ab1c61e4f269/libcap-ng-${LIBCAPNG_VERSION}.tar.gz" \
      || wget -q -T 60 -O "libcap-ng-${LIBCAPNG_VERSION}.tar.gz" "https://distfiles.alpinelinux.org/distfiles/v3.21/libcap-ng-${LIBCAPNG_VERSION}.tar.gz"; } \
  && echo "${LIBCAPNG_SHA256}  libcap-ng-${LIBCAPNG_VERSION}.tar.gz" | sha256sum -c - \
  && tar xf "libcap-ng-${LIBCAPNG_VERSION}.tar.gz" \
  && cd "libcap-ng-${LIBCAPNG_VERSION}" \
  && ./configure --enable-static --disable-shared --without-python3 >/dev/null \
  && make -j"$(nproc)" >/dev/null && make install >/dev/null
# util-linux: exactly the three applets the launch chain execs (GPL-2.0 — separate-process system binaries,
# the pandoc precedent; LICENSES.md). mount(8) requires libmount+libblkid+libsmartcols; setpriv requires the
# static libcap-ng installed above. LDFLAGS=-all-static is passed on the MAKE line (configure-time LDFLAGS is
# swallowed by libtool; -all-static is the libtool flag that reaches the link).
RUN wget -q "https://www.kernel.org/pub/linux/utils/util-linux/v${UTILLINUX_VERSION%.*}/util-linux-${UTILLINUX_VERSION}.tar.xz" \
  && echo "${UTILLINUX_SHA256}  util-linux-${UTILLINUX_VERSION}.tar.xz" | sha256sum -c - \
  && tar xf "util-linux-${UTILLINUX_VERSION}.tar.xz" \
  && cd "util-linux-${UTILLINUX_VERSION}" \
  && ./configure \
       --disable-all-programs \
       --enable-libblkid --enable-libmount --enable-libsmartcols \
       --enable-mount --enable-unshare --enable-setpriv \
       --without-ncurses --without-ncursesw --without-tinfo --without-readline \
       --without-udev --without-systemd --without-libz --without-btrfs \
       --without-libcap --without-audit --without-selinux --without-python \
       --disable-shared --enable-static >/dev/null \
  && make -j"$(nproc)" LDFLAGS="-all-static" mount unshare setpriv >/dev/null \
  && strip mount unshare setpriv \
  && mkdir -p /opt/applets \
  && install -m 0755 mount unshare setpriv /opt/applets/
# dumb-init: a single .c file — the static PID-1 init (MIT). Reaps zombies + forwards signals to the
# harness; equivalent-approved tini substitute (ADR-074).
RUN wget -q "https://github.com/Yelp/dumb-init/archive/refs/tags/v${DUMBINIT_VERSION}.tar.gz" \
  && echo "${DUMBINIT_SHA256}  v${DUMBINIT_VERSION}.tar.gz" | sha256sum -c - \
  && tar xf "v${DUMBINIT_VERSION}.tar.gz" \
  # VERSION.h (shipped in the tarball) already defines the version string — a -DVERSION macro would
  # collide with its `unsigned char VERSION[]` declaration.
  && cc -static -O2 -I"dumb-init-${DUMBINIT_VERSION}" -o /opt/applets/dumb-init \
       "dumb-init-${DUMBINIT_VERSION}/dumb-init.c" \
  && chmod 0755 /opt/applets/dumb-init \
  # hermeticity assertion: the four vendored binaries must be fully static — a dynamic interpreter would
  # fail at exec inside the distroless runtime where no loader path exists.
  && for b in /opt/applets/*; do \
       ! readelf -l "$b" | grep -q INTERP \
       || { echo "FATAL: $b is dynamically linked (INTERP segment present)"; exit 1; }; \
     done

# ---- assert: a stage WITH a shell+runtime runs the exec check the distroless stage cannot (SEC.3) ----
# The vendored native `claude` binary must be executable by uid `agent` (10002). Previously this ran as a
# RUN in the slim runtime; distroless has no shell, so the assertion moves here — a stage that still has a
# runtime — using the SAME static setpriv the runtime ships, so the check exercises the shipped binary.
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS assert
COPY --from=toolsmith /opt/applets/setpriv /usr/bin/setpriv
COPY --from=builder /img/app/vendor/ /check/vendor/
RUN CLAUDE_BIN=/check/vendor/claude-agent-sdk-linux-x64/claude; \
    if [ -f "$CLAUDE_BIN" ]; then \
      /usr/bin/setpriv --reuid 10002 --regid 10002 --clear-groups -- test -x "$CLAUDE_BIN" \
      && echo "vendored native claude binary at $CLAUDE_BIN (executable by uid agent=10002 via the shipped setpriv)" \
      && touch /exec-assert-ok; \
    else \
      echo "WARNING: native claude binary NOT vendored at $CLAUDE_BIN — placeholder build (no live run)" \
      && touch /exec-assert-ok; \
    fi

# ---- runtime: distroless Node 22 — no shell, no package manager, static applets only ----
FROM --platform=$TARGETPLATFORM gcr.io/distroless/nodejs22-debian12 AS runtime
ENV NODE_ENV=production

# The statically-linked applets + init — the ONLY binaries in the image besides /nodejs/bin/node.
COPY --from=toolsmith /opt/applets/setpriv /usr/bin/setpriv
COPY --from=toolsmith /opt/applets/unshare /usr/bin/unshare
COPY --from=toolsmith /opt/applets/mount /usr/bin/mount
COPY --from=toolsmith /opt/applets/dumb-init /usr/bin/dumb-init

# Static identity files (F-StageB-7): the scoped uids need passwd entries — a uid without one makes
# getpwuid()/os.homedir() ENOENT inside the vendored SDK. Distinct uids 10001–10006; `agent` is NOT in the
# harness group. No login shells exist to name.
COPY apps/run-task/docker/passwd /etc/passwd
COPY apps/run-task/docker/group /etc/group

WORKDIR /app
# The built, pruned run-task bundle: /app/dist/agent-entry.js is the agent command; the harness modules run
# under uid harness. Owned by root, world-readable — no secret is in it.
COPY --from=builder /bundle /app

# Bake the ported @rhema/protocols skills at /app/skills — the `skillsDir` the run spec points the SDK at
# (D-P0.15c-6). World-readable, no secret; the agent uid loads the SKILL.md dirs from here.
COPY packages/protocols/skills /app/skills

# The image-owned tree assembled in the builder stage (mountpoints + vendored SDK at its runtime paths —
# see the RUN comment there for the placeholder-build contract).
COPY --from=builder /img/ /

# Force the `assert` stage into the build graph — BuildKit skips unreferenced stages, so without this
# COPY the uid-10002 exec check above would never run. The marker is 0 bytes; the check already ran.
COPY --from=assert /exec-assert-ok /app/.exec-assert-ok

# The container starts as root under dumb-init ONLY so the entrypoint argv can drop root → harness
# (uid 10001) retaining the ambient capability set (the two-uid drop + scoped mount namespace), then
# node runs the harness supervisor which launches `agent` (uid 10002) itself. Root does nothing else.
# Root filesystem is read-only at run time. This argv is entrypoint.sh ported verbatim (SEC.3).
#
# NO `--bounding-set` flag (F-SEC3-1, live 2026-10-03): narrowing the bounding set is a no-op here —
# the pod's CapBnd is already EXACTLY the four caps its securityContext adds — and CAPBSET_DROP needs
# CAP_SETPCAP, which the pod deliberately does not hold (the profile grants the same four only). The
# first prod pod failed the entrypoint with `apply bounding set: Operation not permitted`; --inh-caps
# + --ambient-caps alone carry the launch's privilege model.
ENTRYPOINT ["/usr/bin/dumb-init", "--", \
            "/usr/bin/setpriv", \
            "--reuid", "10001", "--regid", "10001", "--clear-groups", \
            "--inh-caps", "-all,+setuid,+setgid,+sys_admin,+sys_chroot", \
            "--ambient-caps", "-all,+setuid,+setgid,+sys_admin,+sys_chroot", \
            "--", "/nodejs/bin/node", "/app/dist/harness-main.js"]
