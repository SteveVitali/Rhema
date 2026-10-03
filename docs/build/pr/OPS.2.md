# OPS.2 — IaC drift, prod cost posture, and the Turbo remote cache

Ticket: `docs/tickets/81_OPS.2__iac-drift-cost-cache.md` · run ledger: `docs/build/runs/OPS.2.md`
Stacks on `stevevitali/ops-1-preview-stages` (PR #102, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Prod's preview is now **quiet** (`172 unchanged`, zero `alloydbCluster`
> warning), every hand-applied change is in IaC or the runbook, the real bill is
> **measured** (≈ $285.80/mo list — the warm floor, not the documented ~$95, is
> the true floor; ADR-082), a live **$50 budget alert** watches the gap, and the
> self-hosted **Turbo remote cache is running** on prod (D-P0.01-4 discharged,
> ADR-081) with CI wired (`vars.TURBO_API` + `secrets.TURBO_TOKEN`).

- **Drift zeroed, no stateful touch.** All seven `cloudrunv2.Service` resources
  carried a cosmetic `-scaling{}` service-level readback diff —
  `ignoreChanges:["scaling"]` declares it unmanaged (template.scaling stays the
  managed surface). Prod's `app-database-url` SecretVersion gets
  `ignoreChanges:["secretData"]` — the write-only field refresh wanted a
  `replace` on every preview, a standing rotation footgun. `alloydbCluster` /
  `cloudSqlInstance` stack outputs are now emitted only when the resource
  exists → the undefined-value warning is gone. Pre-up preview: `+9 create ·
  160 unchanged` (the 9 are exactly the cache module); post-up: `172
  unchanged`, no warnings.
- **`rhema_collab` adopted as-is — zero rotation.** The SEC.1/OPS.1 mechanism
  (secret container + `secretKeyRef` mount + fresh-stack `ALTER ROLE`) already
  covers the role; prod's hand state == declared state, so adoption is a
  verified no-op, proven live over an IAP tunnel (LOGIN + NOBYPASSRLS +
  NOSUPERUSER + NOINHERIT; SM secretData hash == `rhema:collabDatabaseUrl`
  config hash — values never printed). The deterministic half pins the census:
  `rls-catalog.test.ts` asserts `rhema_collab` lands LOGIN/NOBYPASSRLS with
  exactly the 0004+0028+0053+0054 grants on a fresh stack.
- **Runbook completeness is enforced.** `runbook-completeness.test.ts`
  statically extracts every `rhema:*` key `infra/pulumi/*.ts` reads and fails
  if `PROD-BRINGUP.md` doesn't document it (removal-catches mutant included);
  §2 gained the collab step, §12 the cost/cache/HA sections.
- **One committed image-build definition.** `infra/cloudbuild/image-set.yaml`
  (`_SERVICES` subset + unknown-name fail, `_AR`/`_TAG`/`_GIT_SHA`); root
  `cloudbuild.yaml` deleted, scratch helpers retired — proven live by Cloud
  Build `9b2d150b` on the `turbo-cache` subset (`turbo-cache@sha256:b62a2863…`
  is what prod serves).
- **Measured bill:** `scripts/live/billing-read.mjs` recomputes from the live
  inventory × Catalog API list prices (no populated export exists —
  `sig_billing_export` is empty, actuals leg is D-OPS.2-1): **≈ $285.80/mo**,
  dominated by a $152 Cloud Run warm floor (`convert-svc`/`worker` at
  instance-based billing ≈ $51.84 ea; five services at `minScale=1` ≈ $9.72
  ea). Ranked plan-only levers (D-OPS.2-2): `cpuIdle` flip −$44, `export`/
  `fetcher` minScale→0 −$19.4, user-facing minScale review −$29, worker
  right-size −$26; HA levers priced (REGIONAL +$25.55 / STANDARD_HA +$35.77 /
  MIG ×2 +$12.2) with the Cloud SQL HA pre-plan in runbook §12c (backups + PITR
  preserved). `rhema-prod — $50/mo posture alert` budget live + codified
  (`infra/pulumi/billing.ts`).
- **Turbo remote cache live:** `ducktors/turborepo-remote-cache@2.14.2`
  (lockfile-pinned wrapper `apps/turbo-cache`) on scale-to-zero Cloud Run →
  `gs://rhema-507501-turbo-cache-prod` (30-day lifecycle, public-access
  prevention); IaC-minted token in `rhema-prod-turbo-cache-token`, mounted
  `secretKeyRef`; public invoker with token auth in-app. Verified live: unauth
  artifact write rejected, authenticated PUT/GET round-trip 200, object
  observed in the bucket. Cost delta ≈ $0–2/mo ≪ $15 authorization.

## Evidence

- Pre-up preview `+9 · 160 unchanged`; post-up `172 unchanged`, zero warnings.
- Cache: `turboCacheUrl` output; unauth PUT rejected; authed PUT+GET 200;
  smoke object written then removed.
- Collab: live `pg_roles` + grant census via IAP tunnel; DSN parity by hash.
- Gates: `turbo build lint typecheck` 135/135 · `pnpm test` 4406 pass / 4 skip
  · licenses 745 pkgs OK · protocol-markers clean · infra batch 68/68.
- CI cache-hit evidence (two same-SHA runs): see `runs/OPS.2.md` evidence log —
  `TURBO_API`/`TURBO_TOKEN` are wired; second-run hit lines land with the push.

## Deferrals

- **D-P0.01-4 → DONE (discharged)** — the self-hosted cache is live with
  evidence (GCS not S3 — GCP-first per the 2026-09-02 amendment).
- **D-OPS.2-1 OPEN** — billed-actuals confirmation: `sig_billing_export` empty,
  console-only export flip is the operator step; `billing_export_prod` dataset
  is provisioned in-stack for it.
- **D-OPS.2-2 OPEN** — warm-floor lever execution + HA levers (plan-only by
  ticket authorization).
- Append-only notes on D-OPS.1-1/2/3 unchanged.

## Gates

Universal phase-gate green; AC1–AC6/AC8/AC9 proven in the run ledger; AC7 (two
same-SHA CI cache-hit runs) lands with this push — CI reruns record hits for
`build` tasks; log excerpts go in the run ledger, the token never prints.

## Spend

$0 inference. GCP delta ≈ $0–2/mo (scale-to-zero service + ~empty bucket + 1
secret + free budget). No stateful replace/delete; all additions inside the
≤$15/mo pre-authorization.
