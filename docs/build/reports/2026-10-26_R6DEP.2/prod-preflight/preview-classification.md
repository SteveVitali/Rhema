# R6DEP.2 prod preview classification (2026-10-26T15:1xZ) — `pulumi preview --diff --stack prod`

Result: **10 updates + 1 replace + 165 unchanged.**

## Per-resource classification

| resource | op | class |
|---|---|---|
| `gcp:compute:InstanceTemplate rhema-prod-proxy-tmpl` | **replace** | stateless — proxy VM template re-rolls on `proxy-image` digest swap (same class as R6DEP.1's single replace); MIG re-rolls VMs, no state |
| `gcp:compute:RegionInstanceGroupManager rhema-prod-proxy-mig` | update | version → new template (stateless roll) |
| `cloudrunv2:Service rhema-prod-api` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-web` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-worker` | update | image roll + env set re-pin ([secret]-masked; R6OPS.2 webhook binding posture) |
| `cloudrunv2:Service rhema-prod-fetcher` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-convert-svc` | update | image digest roll only |
| `cloudrunv2:Job rhema-prod-convert` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-export` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-collab` | update | image digest roll only |
| `cloudrunv2:Service rhema-prod-turbo-cache` | update | image digest roll only |

## GD-DEPLOY.R6 conditions

1. **Zero stateful replace/delete — PASS.** The sole replace is the stateless proxy
   `InstanceTemplate` (image roll → MIG re-rolls). Zero replace/delete on AlloyDB/Cloud SQL,
   Redis, GKE/nodepool, buckets, secrets, AR repo, network, IAM, or the internal LB.
2. **Additive migrations only — PASS.** `check-additive-migrations.mjs` → "no migrations newer
   than the base — pass" (`additive-lint.txt`); prod `_migrations` max `0058`; zero migration
   files in the `80db0d5..e04a8c8` diff.
3. **Cost delta ≤ $15 — PASS ($0).** Image swaps + template roll on identical shapes; no new
   resources, no resizing. (The `billing-read.json` inventory is the whole-stack figure, not
   the deploy delta.)
4. **Provenance plan — recorded.** Post-up: `scripts/check-deploy-provenance.mjs --expect
   e04a8c875c0e4cbf25b65c3b6784de6812f32dc7` on `https://rhema.tools` + `https://api.rhema.tools`;
   `scripts/live/record-deployment.mjs` over the IAP tunnel with all ten digest pins.

**Verdict: all four conditions PASS → `pulumi up --stack prod` authorized.**

Images: Cloud Build `a8d53c59` (all ten services at `e04a8c875c0e4cbf25b65c3b6784de6812f32dc7`,
`_TAG=r6dep-2`) → digests pinned in `Pulumi.prod.yaml` (dated comment).
