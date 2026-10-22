# R6INF.1 — Rollback recipe (Cloud SQL REGIONAL → ZONAL)

Rollback target: the pre-change stage-fact posture — prod `database.cloudSqlAvailabilityType`
back to `"ZONAL"` (the `egressProxyTargetSize` fact stays `1` — the ×2 lever was withheld,
so nothing to roll back on the MIG side).

The rollback is the same stage-fact + `pulumi up` mechanism that landed the change —
**in place** (REGIONAL→ZONAL is again a `settings.availabilityType` patch with an instance
restart, never a replace). No image rebuild, no migration, no data movement.

```bash
# 1. Revert the stage fact (the R6INF.1 commit flips it forward; revert it or hand-set back).
git checkout -b rollback/r6inf-1 stevevitali/r6inf-1-infra-posture
# infra/config/stages.ts — prod database block:
#   cloudSqlAvailabilityType: "REGIONAL"  →  "ZONAL"
# (and re-pin the stages.test.ts REGIONAL assertion to "ZONAL")

# 2. Classify the preview — must show `~ update` on rhema-prod-postgres
#    (availabilityType REGIONAL → ZONAL), zero replaces/deletes.
cd infra/pulumi && pulumi preview --stack prod --diff

# 3. Apply.
pulumi up --stack prod --yes

# 4. Verify the rollback live.
gcloud sql instances describe rhema-prod-postgres --project rhema-507501 \
  --format='value(settings.availabilityType,state)'   # expect ZONAL / RUNNABLE
node scripts/check-deploy-provenance.mjs --expect dc7fb15a0aa7caa5d47734656d06514d5b75b127 \
  --healthz https://rhema.tools --healthz https://api.rhema.tools
```

Notes:

- The REGIONAL→ZONAL patch also restarts the instance — run it in a maintenance window,
  same as the forward flip. The `failoverReplica` standby is decommissioned by the flip.
- Backups + PITR survive both directions (35 daily / 7-day txn-log — verified preserved
  after the forward flip: `sql-describe-post.json`).
- Do NOT rollback by hand-editing the instance (`gcloud sql instances patch`) — that leaves
  Pulumi state drifted; the stage fact is the record.
- If the withheld MIG×2 leg is later landed via the internal-LB design (F-R6INF.1-1), its
  rollback is the same shape: revert the stage facts / remove the forwarding-rule +
  backend-service resources in the same commit and `pulumi up`.
