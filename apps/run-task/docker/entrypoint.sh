#!/bin/sh
# run-task entrypoint — the two-uid bootstrap (§12.4 step 4; REQ-SPEC-10).
#
# Runs as root under tini for exactly one purpose: start the harness supervisor as uid `harness` (which holds
# the token/credential, the hook daemon and the audit writer), which in turn launches the SDK as uid `agent`
# with the scrubbed env. The uid drop is irreversible (`setpriv --reuid/--regid --clear-groups`), so a shell
# escape from `agent` cannot climb back to `harness` or root. The actual wiring (read secrets, start the hook
# daemon, launch the agent via bootstrap.buildAgentLaunch) lives in dist/index.js — the harness supervisor.
set -eu

HARNESS_UID=10001
HARNESS_GID=10001

# Drop root → harness, but RETAIN exactly the two capabilities the supervisor needs and nothing else:
#   • CAP_SETUID — to launch the SDK as uid `agent` (bootstrap.ts `setpriv --reuid agent`); without it the
#     second uid drop would EPERM (a non-root process cannot change to a different uid uncapably).
#   • CAP_SYS_ADMIN — to `unshare -m` + `mount` the private namespace for input-scoped subagents (§12.6).
# The caps are made INHERITABLE + AMBIENT so they survive the exec into node; every other capability is
# cleared from the bounding set, so the harness holds only these two and the model's `agent` uid inherits
# none (bootstrap.ts drops the agent with --clear-groups and no caps). We do NOT set --no-new-privs here:
# it would block the very setuid/setns operations the supervisor must perform; the AGENT launch sets it
# (bootstrap.ts) so the model side can never regain privilege.
exec setpriv \
  --reuid "$HARNESS_UID" --regid "$HARNESS_GID" --clear-groups \
  --bounding-set -all,+setuid,+sys_admin \
  --inh-caps -all,+setuid,+sys_admin \
  --ambient-caps -all,+setuid,+sys_admin \
  -- node /app/dist/index.js
