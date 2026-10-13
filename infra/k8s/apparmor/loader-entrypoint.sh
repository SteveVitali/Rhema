#!/bin/sh
# SEC.3 (ADR-075) — the apparmor-loader DaemonSet's container entrypoint. Runs PRIVILEGED on every
# sandbox-pool node; loads (and keeps loaded) the rhema-run-task profile into the node's kernel
# AppArmor module so the run-task pod's `appArmorProfile { type: Localhost, localhostProfile:
# rhema-run-task }` resolves. Policy is kernel-global, so a privileged container's write reaches
# the same module the kubelet's confinement check reads.
set -eu

# securityfs is not auto-mounted in a container's mount namespace; AppArmor's policy interface
# lives at /sys/kernel/security/apparmor. Idempotent — already-mounted is fine.
if ! grep -q securityfs /proc/mounts; then
  mount -t securityfs securityfs /sys/kernel/security
fi

load_and_verify() {
  # -r: replace-if-present (idempotent re-apply); -W: warn-not-fail on cache misses (the kernel
  # module, not a policy cache, is the real target).
  apparmor_parser -r -W /etc/apparmor.d/rhema-run-task
  # Verify the profile is actually enforced — a silent miss would leave run pods RuntimeDefault
  # and the scoped runner's mounts would deny (F-StageB-5). The loaded set is listed in
  # /sys/kernel/security/apparmor/profiles as `name (enforce)`.
  grep -q '^rhema-run-task (enforce)$' /sys/kernel/security/apparmor/profiles
  echo "apparmor-loader: profile rhema-run-task loaded+enforced on node $(uname -n)"
}

load_and_verify
# Stay running: re-apply hourly (a node reboot or a manual profile drop self-heals), and keep the
# DaemonSet pod's readiness truthful (a oneshot pod that exits would flap the DS).
while :; do
  sleep 3600
  load_and_verify
done
