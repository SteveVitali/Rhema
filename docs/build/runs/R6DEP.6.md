# R6DEP.6 — maintenance deploy of `main` to prod (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — deploy `main` to prod under the
  same discipline as R6DEP.5: image build → pin → `pulumi preview --diff` classify → `pulumi up`
  → provenance → deployments row → CDN invalidation → records. Authorization: operator direction
  2026-11-18 ("let's deploy and then do all of the downstream work"). mergePolicy=OPERATOR.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); `infra/PROD-BRINGUP.md`;
  `docs/build/runs/R6DEP.5.md` (recipe); `docs/ops/golden-rerun-rule.md`.
- **Deploy target:** `279f45d3` (merged main tip — stack #394–#401).
- **Branch:** `stevenvitali/r6dep-6-main-deploy`.
- **Harness:** devin-cli/swe-2-high.
- **Started:** 2026-11-18T~00:00Z · **Closed:** 2026-11-18T~18:10Z.

## Production mutations (named scope)

- `gcloud builds submit` image-set (all 10 services) at `_GIT_SHA=279f45d3`.
- `pulumi preview --diff` + `pulumi up --stack prod` (image rolls + classified config changes).
- `scripts/live/record-deployment.mjs`.
- `scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~*'`.
- Rollback: `git revert` + redeploy of `73902381` (digest pins in `Pulumi.prod.yaml` history);
  no migrations in payload → no migration rollback.

## Pre-state (recorded BEFORE mutations, 2026-11-18)

- prod `/healthz` web+api = `739023816efae96fdadb885a4c171f0be097eebc` —
  `reports/2026-11-18_R6DEP.6/prestate-healthz-*.json`.
- No migrations in payload (ceiling stays `0065`; none added by #394–#401) → no migrate-first
  ordering needed.
- **Payload `73902381..279f45d3`:** 305 subscribe-guard (BL-114), U2 recents fallback,
  T12F/T13F findings-desk leg repair, 308 bound content-store reads (F-R6FIX.37-1 — live
  `/outline` 500s), U3.stopgap registry flip, **310 lifecycle prefix-match fix (F-R6FIX.39-1 —
  all row lifecycle actions dead on prod)**, 311 N8 editable-import arm; plus the AR
  cleanup-policy enforcement flip (dry-run → live, 11-17 cost review) + 7 read-only IAM
  bindings for the CI preview-orphan sweep.
- **Golden re-run: NOT armed** — zero `packages/protocols*` diff; the rule fires on
  protocol-affecting deploys only.

## Log

- **Image build** — Cloud Build `3df2aa7b-1793-46c4-9d86-a3d8bc9b072d` SUCCESS (15m20s), all 10
  service images published to `rhema-prod` AR at `_GIT_SHA=279f45d3` (run-task vendored-SDK gate
  files present in checkout; full-set build safe). Digests pinned into `Pulumi.prod.yaml`
  (`rhema:gitSha: 279f45d363e270778e5a63995dc575b7010a12b6`):
  api `923cee99…ac93a` · web `03019697…53fa` · worker `69e57332…f5f9a` · fetcher
  `79da040c…a90c0` · convert `91378960…33e3` · export `7ce426c0…9f8f6` · collab
  `20ff9dd2…50ef0` · turbo-cache `44bae1de…3f93` · run-task `b701ad9b…a88e` · egress-proxy
  `a178bc91…45d4`.
- **Preview** — `pulumi preview --diff --stack prod`: **10 updates + 1 replacement + 0
  creates/deletes, 184 unchanged.** 9 Cloud Run image rolls + the stateless
  `rhema-prod-proxy-tmpl` replace (egress-proxy pin, rolls the inference-egress MIG — same shape
  as R6DEP.5) + the worker env/gitSha roll. The AR cleanup-policy flip and the 7 sweep IAM
  bindings surfaced no diff (already applied by a ~20h-earlier stack update). Zero stateful
  touches — no Cloud SQL/GKE/bucket/LB changes.
- **Apply** — `pulumi up --stack prod` **update 186**, 10 updated + 1 replaced, 1m46s, zero
  destructive ops.
- **Provenance** — `node scripts/check-deploy-provenance.mjs --expect 279f45d3… --healthz
  https://rhema.tools --healthz https://api.rhema.tools` → **all-PASS** (both origins report the
  new SHA; web `/healthz` and api `/healthz` bodies recorded).
- **Deployments row** — `scripts/live/record-deployment.mjs` (IAP tunnel :15432, system-role DSN,
  never printed): `prod:279f45d3…` with all 10 digests, `protocols_version=0.4.0+e922c281a6830f49`.
- **CDN** — `scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~*'` submitted on
  `rhema-prod-urlmap-6f2b86e` (host `rhema.tools`).

## Post-deploy verification (the owed deploy-bound rows — all $0, flagged-tenant fixtures)

- **F-R6FIX.39-1 → RESOLVED.** `T6,T7` PASS at `--expect-sha 279f45d3…`
  (`reports/2026-11-18_R6DEP.6-T6T7c/`, spend $0): delete lands the tombstone, the row enters the
  30-day window with an actionable Restore, the restore removes it from `?scope=deleted`, and the
  `project.purge` job queues on `pgboss.job` (outbox intent `sent:true` ~19 s post-delete; job
  rows `state=created` with the 30-day `start_after` and `project.purge:<id>` singleton — live DB
  read over the tunnel). Every row lifecycle action works again.
- **F-R6FIX.37-1 → RESOLVED.** `P1.outline` PASS at `279f45d3`
  (`reports/2026-11-18_R6DEP.6-P1outline/`, $0) — the outline surface renders through the BFF/api
  read that previously 500'd; `gcloud logging read` over the 45-min post-deploy window shows
  **zero `unhandled_route_error`** on the api revision.
- **BL-114 deployed-arm → VERIFIED.** `sub_jrna_journey_seed` `past_due`/`writer` fixture seated
  on jrn-a's current billing account via the committed `ensureJrnaPaidFixture` seam
  (`JOURNEY_DATABASE_URL` tunnel); jrn-a signed in through the cached magic-link session;
  `POST /app/settings/billing/subscribe {tier:writer,cycle:monthly}` →
  `{"ok":true,"redirect":"/app/settings/billing?notice=subscription_active"}` — the api's 409
  guard fired in-tx **before any Stripe call** (zero checkout session minted, zero external side
  effects). Scratch probe `packages/journeys/bl114-probe.mjs` (deleted after use).
- **Harness drift found live during verification** (not product defects — `312_R6FIX.41` owns):
  (a) T6's restore-control locator expected the SSR `<form data-restore-form><button>` shape; the
  SPA emits `data-restore-form` ON the Button — fixed to accept both; (b) T7's 15 s `pgboss.job`
  poll pre-dates BL-115's `outbox.drain` indirection (*/1-min cron; job lands ~19–76 s) — widened
  to 90 s. The intermediate failed runs are preserved as `reports/2026-11-18_R6DEP.6-T6T7/` and
  `-T6T7b/`.
- **F-16 (BL-105) → discharged** — both halves green at the deployed SHA: N8 via 311_R6FIX.40's
  editable-import repair (PASS @ `73902381`, carried), T6/T7 via the deployed lifecycle fix.

## Spend

- Cloud Build image-set ≈ $0.6 list (est. same class as R6DEP.5) · `pulumi up` ≈ $0 · all journey
  legs $0 (flagged tenants, no inference) · **no paid spend.**
- **Golden re-run: NOT armed** (zero `packages/protocols*` diff — see Pre-state).
