# R6DEP.1 — Tip deploy to prod under `GD-DEPLOY.R6` (REQ-DEP-1)

> DRAFT skeleton — body finalized at closeout with the evidence table.

## Summary

First production deploy of the round-5/6 stack: prod moves from `ffbb8ad` (the ARMB.2 head) to the
chain tip `dc7fb15a0aa7caa5d47734656d06514d5b75b127` under the `GD-DEPLOY.R6` pre-authorization
(four conditions, all evidenced before `pulumi up`). Then: post-deploy smoke, the committed rollback
recipe, and — only because R6MNY.1 measured notice recipients = 2 > 0 — the metered-debit notice
send (`GD-PREAUTH-ACTS.R6`, `EFFECTIVE_DATE` ≥ 30 days after the send).

## Sequence

1. `pr-<n>` preview of the tip: `paid:false` journey suite with `--expect-renderer spa` (VERIF.2
   recipe), evidence committed, destroyed + orphan sweep.
2. Prod `pulumi preview --diff` classified against each condition, committed.
3. `pulumi up`; `check-deploy-provenance --expect <tip>` all-PASS; `deployments` row.
4. Post-deploy smoke.
5. Rollback recipe committed.
6. Metered notice send (dry-run scope re-verified first).

**Requirement ids:** REQ-DEP-1

## Verification

(pending)
