#!/bin/sh
# run-task scoped-subagent runner — applies an input-scoped mount plan inside a private mount namespace, then
# launches the scoped query as a distinct uid (§12.6; REQ-DATA-17/18). Invoked as the runner argv of
# `unshare --mount --propagation private -- setpriv --reuid 0 --regid 0 --clear-groups -- /app/scoped-runner.sh
# <spec.json>`, so it already runs in a NEW mount namespace whose changes are invisible to the parent and to
# every other seat — and at REAL uid 0, because util-linux `mount` gates on `getuid()` before calling
# mount(2): the harness's ambient CAP_SYS_ADMIN is invisible to it, and the binary's setuid bit only fixes
# the EFFECTIVE uid (ruid stays harness → "must be superuser"). The harness holds ambient CAP_SETUID, so the
# `setpriv --reuid 0` re-escalation succeeds. This script still drops to the distinct scoped uid with
# --no-new-privs before the model's process execs — only this trusted setup runner carries ruid 0.
#
# The plan (from @rhema/engine buildScopedLaunchSpec, serialized to $1) — this is the SAME sequence the
# integration proof (docker/privsep-check.sh) exercises:
#   1. stashBinds: ro-bind each enumerated file OUTSIDE the overmount target, so it survives the overmount;
#   2. tmpfsArgv: overmount the seat tree (/work) with a FRESH tmpfs — every other-seat file now DOES NOT
#      EXIST in this namespace at the kernel (a `unshare -m` namespace is a copy of all parent mounts, so
#      without this a scoped uid could still Read /work/project/agents/<other-seat>/… by absolute path);
#   3. binds: ro-bind each stashed file into the scoped root — nothing else exists to read;
#   4. drop to the distinct scoped uid and exec the query with cwd = rootDir and tools: ["Read"].
# "The second read received the draft only" is then a statement about the kernel: a Read outside the set fails
# because the file is not in the namespace at all (review 13 F13). The scoped query has no Write tool — it
# returns its answer as text; the harness persists it with the recorded producerQueryId.
#
# DEF.1 wiring notes:
#   • The spec file $1 lives under the harness config dir (gid harness — the scoped uid may not traverse it),
#     so a COPY is staged inside the scoped root, which is chmod 0777 (the namespace's fresh tmpfs — the scoped
#     uid's ONLY writable area, doubling as its CLAUDE_CONFIG_DIR for SDK scratch).
#   • The model's process gets EXACTLY the scrubbed env allowlist (`env -i`, REQ-SPEC-10): PATH/HOME and every
#     other runner key are stripped at the uid drop; `node` is invoked by absolute path because there is no
#     PATH in the scrubbed set (same convention as bootstrap.ts).
set -eu

SPEC="${1:?usage: scoped-runner.sh <spec.json>}"
NODE=/usr/local/bin/node
get() { "$NODE" -e 'const s=require(process.argv[1]);let v=s;for(const k of process.argv[2].split("."))v=v[k];process.stdout.write(String(v))' "$SPEC" "$1"; }
run_binds() { # apply an array of {dest,argv} bind steps: create the mountpoint, then the ro bind
  "$NODE" -e '
    const { execFileSync } = require("node:child_process");
    const fs = require("node:fs");
    const s = require(process.argv[1]);
    for (const b of s.mountPlan[process.argv[2]]) {
      fs.mkdirSync(require("node:path").dirname(b.dest), { recursive: true });
      fs.writeFileSync(b.dest, "");
      execFileSync(b.argv[0], b.argv.slice(1));
    }
  ' "$SPEC" "$1"
}

root_dir=$(get mountPlan.rootDir)
stash_dir=$(get mountPlan.stashDir)
scoped_uid=$(get uid)

mkdir -p "$stash_dir"
run_binds stashBinds                                   # 1) stash the enumerated files outside the overmount
"$NODE" -e 'const s=require(process.argv[1]);const{execFileSync}=require("node:child_process");execFileSync(s.mountPlan.tmpfsArgv[0],s.mountPlan.tmpfsArgv.slice(1))' "$SPEC"  # 2) overmount the seat tree
mkdir -p "$root_dir"
chmod 0777 "$root_dir"                                 # the scoped uid's one writable area (its CLAUDE_CONFIG_DIR)
run_binds binds                                        # 3) ro-bind the stash into the scoped root
cp "$SPEC" "$root_dir/.scoped-spec.json"               # 3b) the scoped uid reads the spec HERE (/config is gid-harness)
chmod 0644 "$root_dir/.scoped-spec.json"               # world-readable — the scoped uid is not the owner

# 4) drop to the DISTINCT scoped uid and exec the scoped query, rooted at the scoped read tree, with EXACTLY
#    the scrubbed env allowlist (REQ-SPEC-10) — `env -i` strips PATH/HOME and everything the runner needed.
exec setpriv --reuid "$scoped_uid" --regid "$scoped_uid" --clear-groups --no-new-privs \
  -- env -i \
     RUN_ID="$RUN_ID" \
     ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
     ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
     CLAUDE_CONFIG_DIR="$root_dir" \
     CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
     ENABLE_PROMPT_CACHING_1H=1 \
     CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION=0 \
     "$NODE" /app/dist/scoped-query.js "$root_dir/.scoped-spec.json" --cwd "$root_dir"
