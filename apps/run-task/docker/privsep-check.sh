#!/bin/sh
# privsep-check.sh — the KERNEL-LEVEL proof of AC1 + AC4 + D-P0.15f-1, run inside the built image (no SDK needed).
#
# AC1: a process under uid `agent` cannot read the harness-only secrets file (mode 0600, owner harness).
# D-P0.15f-1: the two-uid launch — the harness (uid 10001, non-root, ambient CAP_SETUID+CAP_SETGID) can
#      `setpriv --reuid agent --regid agent` drop to uid 10002 with NO setresgid EPERM; the dropped agent is
#      still denied the secrets file; and the drop FAILS without CAP_SETGID (proving the +setgid fix is required).
# AC4: an input-scoped subagent's private mount namespace (`unshare -m` + tmpfs + ro binds, then chroot)
#      contains EXACTLY the enumerated files, and a Read outside them fails at the KERNEL, not just the hook
#      (review 13 F13).
#
# Prints PASS/FAIL per assertion; exits non-zero on any failure. Requires CAP_SYS_ADMIN (mount/unshare/chroot).
set -u
fail=0
pass() { echo "PASS: $1"; }
bad()  { echo "FAIL: $1"; fail=1; }

# ---------- AC1 — the harness-only secrets file ----------
# /tmp not /run — the runtime pod's rootfs is READ-ONLY; /tmp is the writable emptyDir there (and rw in the
# privsep-test image too), so the check holds under either rootfs mode. The file is created AS harness
# (umask 077) rather than chown'd — the real pod's cap set drops CAP_CHOWN, so root could not chown there.
# The AC is the 0600-owner semantics, not the literal path.
SECRETS=/tmp/secrets/secrets.json
rm -rf /tmp/secrets
setpriv --reuid harness --regid harness --clear-groups -- sh -c '
  mkdir -p /tmp/secrets && umask 077 &&
  printf "%s" "{\"runToken\":\"jwt.SECRET\",\"apiInternalUrl\":\"http://api.internal\",\"proxyCredential\":\"cred.SECRET\"}" > /tmp/secrets/secrets.json
'

# harness CAN read it:
if setpriv --reuid harness --regid harness --clear-groups -- cat "$SECRETS" >/dev/null 2>&1; then
  pass "AC1: harness reads the secrets file"
else
  bad  "AC1: harness could not read the secrets file"
fi

# agent CANNOT read it (EACCES) — the crux of REQ-SPEC-10:
if setpriv --reuid agent --regid agent --clear-groups -- cat "$SECRETS" >/dev/null 2>&1; then
  bad  "AC1: uid agent READ the harness secrets file (must be denied)"
else
  pass "AC1: uid agent is denied the harness secrets file (EACCES)"
fi

# ---------- D-P0.15f-1 — the harness→agent setpriv drop (the two-uid launch) ----------
# The entrypoint drops root→harness retaining ambient CAP_SETUID+CAP_SETGID (+SYS_ADMIN,+SYS_CHROOT). The
# harness (uid 10001, non-root) then launches the agent via `setpriv --reuid agent --regid agent --clear-groups`
# (bootstrap.buildAgentLaunch). Changing to a DIFFERENT gid from a non-root process needs CAP_SETGID; without it
# the `--regid` (setresgid) fails EPERM and the agent exits 127 — the exact bug diagnosed live in P0.15f. Prove
# the drop succeeds WITH the entrypoint's ambient set (uid 10002 reached), and — the negative control — that it
# FAILS without CAP_SETGID (so we know the +setgid fix is load-bearing, not incidental).
HARNESS_AMBIENT="-all,+setuid,+setgid,+sys_admin,+sys_chroot"
harness_drop() { # $1 = ambient/inh/bounding cap set; runs the harness→agent drop, then "$@" (shifted)
  set="$1"; shift
  setpriv --reuid harness --regid harness --clear-groups \
    --bounding-set "$set" --inh-caps "$set" --ambient-caps "$set" \
    -- setpriv --reuid agent --regid agent --clear-groups -- "$@"
}
dropped_uid=$(harness_drop "$HARNESS_AMBIENT" id -u 2>/dev/null || true)
if [ "$dropped_uid" = "10002" ]; then
  pass "D-P0.15f-1: harness (ambient CAP_SETUID+SETGID) drops to agent uid 10002 (no setresgid EPERM)"
else
  bad  "D-P0.15f-1: harness could not setpriv-drop to agent (got uid '[$dropped_uid]', want 10002)"
fi

# the agent reached via the harness drop STILL cannot read the harness-only secrets file (REQ-SPEC-10 holds
# through the real two-hop launch path, not only the direct root→agent drop tested in AC1 above):
if harness_drop "$HARNESS_AMBIENT" cat "$SECRETS" >/dev/null 2>&1; then
  bad  "D-P0.15f-1: agent (via the harness drop) READ the harness secrets file (must be denied)"
else
  pass "D-P0.15f-1: agent (via the harness drop) is denied the harness secrets file (EACCES)"
fi

# negative control: WITHOUT CAP_SETGID the --regid drop must fail (the setresgid EPERM the +setgid fix cures):
if harness_drop "-all,+setuid,+sys_admin" id -u >/dev/null 2>&1; then
  bad  "D-P0.15f-1: agent drop SUCCEEDED without CAP_SETGID (the setresgid EPERM guard is not exercised)"
else
  pass "D-P0.15f-1: without CAP_SETGID the harness→agent --regid drop fails as expected (setresgid EPERM)"
fi

# ---------- AC4 — the input-scoped mount namespace ----------
# Set up the source tree the scoped subagent must NOT see in full: a draft (enumerated) + the Drafter's
# notebook (NOT enumerated). The scoped query must see only the draft.
mkdir -p /work/project/drafts /work/project/agents/author
echo "THE DRAFT v3" > /work/project/drafts/v3.md
echo "DRAFTER PRIVATE NOTEBOOK" > /work/project/agents/author/notebook.md

# Negative control (F-StageB-6): WITHOUT the ruid-0 re-escalation, util-linux `mount` refuses a harness-uid
# caller even WITH ambient CAP_SYS_ADMIN — it gates on `getuid()` before mount(2) and the binary's setuid
# bit only fixes the EFFECTIVE uid. This is the exact "must be superuser" failure diagnosed live in DEF.1;
# the check proves the `setpriv --reuid 0` wrap below is load-bearing, not incidental.
if setpriv --reuid harness --regid harness --clear-groups \
     --bounding-set "$HARNESS_AMBIENT" --inh-caps "$HARNESS_AMBIENT" --ambient-caps "$HARNESS_AMBIENT" \
     -- unshare --mount --propagation private -- mount -t tmpfs -o size=1m tmpfs /work 2>/dev/null; then
  bad  "AC4: harness-uid mount SUCCEEDED without the ruid-0 wrap (the 'must be superuser' guard is not exercised)"
else
  pass "AC4: harness-uid mount is refused without the ruid-0 wrap (must be superuser — ruid gate)"
fi

# Run the namespace body in a NEW mount namespace through the REAL launch chain — harness uid + ambient caps
# → unshare → `setpriv --reuid 0` (ruid-0 so `mount` accepts the mount(2) calls) → mounts → scoped uid drop.
# Changes are invisible to the parent and every other seat.
setpriv --reuid harness --regid harness --clear-groups \
  --bounding-set "$HARNESS_AMBIENT" --inh-caps "$HARNESS_AMBIENT" --ambient-caps "$HARNESS_AMBIENT" \
  -- unshare --mount --propagation private -- setpriv --reuid 0 --regid 0 --clear-groups -- /bin/sh -eu -c '
  root=/work/scoped/second-reader
  # 1) stash the ENUMERATED file outside /work (a ro bind), so it survives the /work overmount:
  # the stash mirrors where the real runner puts it (/tmp/scoped-stash): the pod rootfs is READ-ONLY.
  mkdir -p /tmp/scoped-stash
  : > /tmp/scoped-stash/v3.md
  mount --bind -o ro /work/project/drafts/v3.md /tmp/scoped-stash/v3.md
  # 2) overmount the whole seat tree with an empty tmpfs — every other-seat file (the Drafter notebook)
  #    now DOES NOT EXIST in this namespace at the kernel level:
  mount -t tmpfs -o nosuid,nodev,size=16m tmpfs /work
  mkdir -p "$root"
  # 3) bind ONLY the enumerated file into the scoped root, read-only:
  : > "$root/v3.md"
  mount --bind -o ro /tmp/scoped-stash/v3.md "$root/v3.md"
  # assert the scoped root contains EXACTLY the enumerated file:
  listing=$(ls -1A "$root")
  [ "$listing" = "v3.md" ] || { echo "NSFAIL: unexpected files in scoped ns: [$listing]"; exit 21; }
  # 4) drop to the DISTINCT scoped uid and try the reads (no chroot needed — the overmount hid the rest):
  setpriv --reuid 10003 --regid 10003 --clear-groups --no-new-privs -- /bin/sh -eu -c "
    cat $root/v3.md >/dev/null || { echo NSFAIL: scoped uid cannot read the enumerated draft; exit 22; }
    if cat /work/project/agents/author/notebook.md >/dev/null 2>&1; then
      echo NSFAIL: scoped uid READ an out-of-namespace file; exit 23;
    fi
    exit 0
  "
'
rc=$?
if [ "$rc" -eq 0 ]; then
  pass "AC4: scoped mount namespace contains exactly the enumerated file; out-of-set read fails at the kernel"
else
  bad  "AC4: scoped mount-namespace isolation failed (rc=$rc)"
fi

# ---------- P0.15h — a read-only bind mount BLOCKS a write at the KERNEL (boundary "true zero", defense in depth) ----------
# The §12.6 boundary's authoritative enforcer is the PreToolUse hook (proven at the daemon+SDK-contract layer in
# hook-enforcement.test.ts). This is the INDEPENDENT kernel backstop: a path mounted read-only cannot be written
# even by uid agent even if the hook were bypassed — so a read-only mount makes `boundary.attested` a true zero
# from two layers, closing the P0.15g concern that a correspondence/ write once SUCCEEDED.
mkdir -p /work/ro-src
echo "READ ONLY CORRESPONDENCE" > /work/ro-src/00-piece-brief.md
mkdir -p /work/ro-mnt
mount --bind /work/ro-src /work/ro-mnt
mount -o remount,ro,bind /work/ro-mnt   # apply MS_RDONLY on the bind (a plain --bind -o ro is not enough on all kernels)
if setpriv --reuid agent --regid agent --clear-groups -- /bin/sh -c 'echo x > /work/ro-mnt/00-piece-brief.md' 2>/dev/null; then
  bad  "P0.15h: uid agent WROTE a read-only bind mount (the kernel backstop is not enforcing)"
else
  pass "P0.15h: uid agent cannot write a read-only bind mount (EROFS) — the boundary is a true zero at the kernel"
fi
umount /work/ro-mnt 2>/dev/null || true

echo "----"
if [ "$fail" -eq 0 ]; then echo "ALL PRIVSEP CHECKS PASSED"; else echo "PRIVSEP CHECKS FAILED"; fi
exit "$fail"
