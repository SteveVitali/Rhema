# Pinned upstream baseline (`~/agent-discourse`)

A **read-only** vendored copy of the upstream `agent-discourse` skills + conventions at the commit in
`COMMIT` (`5fef4165042b080c1d4c6becc281dc5ce8860cb3`), used solely as the baseline for the upstream-diff
gate (`scripts/check-upstream-diff.mjs`; REQ-ARCH-5). The ported skills in `packages/protocols/{skills,conventions}`
must equal these files plus **only** the sanctioned transforms declared in
`packages/protocols/skills/upstream-port.manifest.mjs` — undeclared drift is a fork, not a diff (REQ-SPEC-22).

Do **not** edit these files by hand. To move the pin to a newer upstream commit:

```
git -C ~/agent-discourse archive <newcommit> skills/editorial-review skills/respond-to-review \
  skills/bootstrap-persona conventions | tar -x -C packages/protocols/upstream-pin/
echo <newcommit> > packages/protocols/upstream-pin/COMMIT   # must equal manifest.upstreamCommit
node scripts/check-upstream-diff.mjs --write                # regenerate ported files from pin + manifest
```

Upstream is MIT-licensed (see the upstream `LICENSE`); this baseline is retained under those terms.
