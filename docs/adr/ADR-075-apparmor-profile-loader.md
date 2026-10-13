# ADR-075: the rhema-run-task AppArmor profile is loaded by a minimal privileged DaemonSet, not security-profiles-operator

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** SEC.3
- **Requirement ids:** REQ-ARCH-19, REQ-ARCH-40
- **Spec:** §12.6 (the scoped mount boundary the profile exists to allow), §13.3

## Context
DEF.1 Stage B proved the default containerd AppArmor profile (`cri-containerd.apparmor.d`)
denies `mount(2)` outright regardless of `CAP_SYS_ADMIN` — the scoped runner's `unshare -m`
propagation change and its tmpfs/bind sequence can never apply under it (F-StageB-5). The
stopgap ran the container `Unconfined`. Closing that means a `Localhost` profile — a kernel
policy object that must be loaded into **every sandbox-pool node's** AppArmor module before the
kubelet will admit a pod naming it (`localhostProfile` unknown → container-create error).

Two real options existed: the upstream security-profiles-operator (SPO), or a small loader we
own. Constraints: the sandbox pool has no internet route (every image comes from our Artifact
Registry over Private Google Access); the loader must land on every node a run pod can (same
selector, all taints tolerated); and a node reboot or a dropped profile must self-heal.

## Decision
A minimal privileged DaemonSet (`infra/k8s/50-apparmor-loader-daemonset.yaml`, `kube-system`,
`priorityClassName: system-node-critical`, `tolerations: operator: Exists`, sandbox-pool
`nodeSelector`) runs one loader pod per sandbox node. The loader image
(`infra/k8s/apparmor/Dockerfile.loader`) is `ubuntu:24.04` + the `apparmor` package, with the
committed profile COPYed to `/etc/apparmor.d/rhema-run-task` — the policy the node enforces is
bytewise the file `apparmor.test.ts` pins and the `images` CI job compiles with
`apparmor_parser -Q`. `loader-entrypoint.sh` mounts securityfs, runs `apparmor_parser -r -W`,
verifies `rhema-run-task (enforce)` appears in `/sys/kernel/security/apparmor/profiles`, then
re-applies hourly (self-heal on node reboot or a manual profile drop). The DaemonSet image is
digest-pinned through the stack's own AR repo via `apply.sh` envsubst — same pattern as the
image prewarmer — and the apply order (loader Ready before the worker's `Localhost` config
flips) is documented in `apply.sh`.

Privileged because writing `/sys/kernel/security/apparmor/.load` requires `CAP_MAC_ADMIN` +
access to the host's apparmorfs; there is no narrower grant for kernel policy load. Policy is
kernel-global, so the loader's write reaches the same module the kubelet's admission check reads.

## Consequences
One ~60-line shell loop plus a profile file replaces an operator fleet. Every node the run pod
can schedule on carries the profile before admission. The failure mode is loud, not silent: a
missing profile fails container-create with a named error, and the loader's own logs +
`status.desiredNumberScheduled` are the Stage-B evidence. The cost is a privileged pod per
sandbox node — bounded to one node today and to the pool the run boundary already trusts with
`CAP_SYS_ADMIN` run pods.

## Alternatives considered
- **security-profiles-operator:** a CRD + webhook + cert-manager machinery sized for a fleet of
  profiles across many workloads. We need exactly one profile on one node pool; the operator's
  attack surface (a mutating webhook, spod daemon, RBAC) exceeds the profile's, and its images
  would all need mirroring into our AR anyway. Rejected as disproportionate — noted as the
  migration path if profile count grows.
- **Bake the profile into the node's boot config / a node-image rebuild:** no node-pool
  replacement is allowed by the ticket, and a boot-time apply can't self-heal a dropped policy.
- **security-profiles-operator-lite / hand-applied `kubectl exec` per node:** manual and
  unverifiable — the DaemonSet's per-node pod status *is* the "loaded on every node" evidence.
- **RuntimeDefault:** the F-StageB-5 denial — it is the thing this profile exists to fix.

## Revisit trigger
If the sandbox pool grows a second profile or per-role profiles (e.g. a stricter scoped-query
profile distinct from the harness's), re-evaluate SPO or a profile-templated loader — the
single-file COPY model stops scaling. Also revisit if GKE exposes managed profile loading on
the sandbox node's OS channel.
