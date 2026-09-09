#!/bin/sh
# privsep-check.sh — the KERNEL-LEVEL proof of AC1 + AC4, run inside the built image (no SDK needed).
#
# AC1: a process under uid `agent` cannot read the harness-only secrets file (mode 0600, owner harness).
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
SECRETS=/run/secrets/secrets.json
mkdir -p /run/secrets
printf '{"runToken":"jwt.SECRET","apiInternalUrl":"http://api.internal","proxyCredential":"cred.SECRET"}' > "$SECRETS"
chown harness:harness "$SECRETS"
chmod 0600 "$SECRETS"

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

# ---------- AC4 — the input-scoped mount namespace ----------
# Set up the source tree the scoped subagent must NOT see in full: a draft (enumerated) + the Drafter's
# notebook (NOT enumerated). The scoped query must see only the draft.
mkdir -p /work/project/drafts /work/project/agents/author
echo "THE DRAFT v3" > /work/project/drafts/v3.md
echo "DRAFTER PRIVATE NOTEBOOK" > /work/project/agents/author/notebook.md

# Run the namespace body in a NEW mount namespace; changes are invisible to the parent and every other seat.
unshare --mount --propagation private -- /bin/sh -eu -c '
  root=/work/scoped/second-reader
  # 1) stash the ENUMERATED file outside /work (a ro bind), so it survives the /work overmount:
  mkdir -p /stash
  : > /stash/v3.md
  mount --bind -o ro /work/project/drafts/v3.md /stash/v3.md
  # 2) overmount the whole seat tree with an empty tmpfs — every other-seat file (the Drafter notebook)
  #    now DOES NOT EXIST in this namespace at the kernel level:
  mount -t tmpfs -o nosuid,nodev,size=16m tmpfs /work
  mkdir -p "$root"
  # 3) bind ONLY the enumerated file into the scoped root, read-only:
  : > "$root/v3.md"
  mount --bind -o ro /stash/v3.md "$root/v3.md"
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

echo "----"
if [ "$fail" -eq 0 ]; then echo "ALL PRIVSEP CHECKS PASSED"; else echo "PRIVSEP CHECKS FAILED"; fi
exit "$fail"
