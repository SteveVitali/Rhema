#!/bin/sh
# run-task scoped-subagent runner — applies an input-scoped mount plan inside a private mount namespace, then
# launches the scoped query as a distinct uid (§12.6; REQ-DATA-17/18). Invoked as the runner argv of
# `unshare --mount --propagation private -- /app/scoped-runner.sh <spec.json>`, so it already runs in a NEW
# mount namespace whose changes are invisible to the parent and to every other seat.
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
# returns its answer as text; the orchestrator persists it with the recorded producerQueryId.
set -eu

SPEC="${1:?usage: scoped-runner.sh <spec.json>}"
get() { node -e 'const s=require(process.argv[1]);let v=s;for(const k of process.argv[2].split("."))v=v[k];process.stdout.write(String(v))' "$SPEC" "$1"; }
run_binds() { # apply an array of {dest,argv} bind steps: create the mountpoint, then the ro bind
  node -e '
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
overmount_dir=$(get mountPlan.overmountDir)
stash_dir=$(get mountPlan.stashDir)
scoped_uid=$(get uid)

mkdir -p "$stash_dir"
run_binds stashBinds                                   # 1) stash the enumerated files outside the overmount
node -e 'const s=require(process.argv[1]);const{execFileSync}=require("node:child_process");execFileSync(s.mountPlan.tmpfsArgv[0],s.mountPlan.tmpfsArgv.slice(1))' "$SPEC"  # 2) overmount the seat tree
mkdir -p "$root_dir"
run_binds binds                                        # 3) ro-bind the stash into the scoped root

# 4) drop to the DISTINCT scoped uid and exec the scoped query, rooted at the scoped read tree.
exec setpriv --reuid "$scoped_uid" --regid "$scoped_uid" --clear-groups --no-new-privs \
  -- node /app/dist/scoped-query.js "$SPEC" --cwd "$root_dir"
