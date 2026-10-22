# R6DEP.1 — Tip deploy to prod under `GD-DEPLOY.R6` (REQ-DEP-1)

## Summary

First production deploy of the round-5/6 stack: prod moved from `ffbb8ad` (the ARMB.2 head) to
the chain tip `dc7fb15a0aa7caa5d47734656d06514d5b75b127` under the `GD-DEPLOY.R6`
pre-authorization — all four conditions evidenced in committed files **before** `pulumi up`
ran, none argued past. Then: post-deploy smoke (all green), the committed rollback recipe, and —
because R6MNY.1 measured notice recipients = 2 > 0 and the dry-run scope re-verified identical —
the metered-debit notice send (`GD-PREAUTH-ACTS.R6`, `EFFECTIVE_DATE=2026-12-01`, 40 days out).

## What happened

1. **`pr-207` preview of the tip** — full owned stack (189 resources), Cloud Build
   `f953fcf4` built all 10 images at `dc7fb15`, digests pinned, 58 migrations applied,
   invite `prv-207-test` seeded, OAuth configured so Better Auth mounts. `paid:false`
   suite: **40 PASS**; non-greens are preview posture (N8 collab-wire, N9 Stripe) or
   owed-reporting (T8, R10.keepalive) — never fabricated. `--expect-renderer spa` surface
   sweep: 30 gated legs, **zero renderer violations**. Two earlier artifact runs (unmounted
   auth; retired flag + throttle) committed as evidence.
2. **Prod preflight** — tip digests copied verbatim into `rhema-prod` AR (no rebuild),
   pinned in `Pulumi.prod.yaml`. `pulumi preview --diff` classified per-resource: 11
   updates + **1 replace (the stateless proxy InstanceTemplate only)** + 160 unchanged —
   zero stateful replace/delete. Additive lint PASS (no migrations newer than `0058`).
   Cost delta **$0** ≤ $15. Provenance plan committed.
3. **`pulumi up --stack prod`** — executed inside the envelope: 11 updated (image rolls +
   usercontent CORS response-headers), 1 replaced (proxy template; MIG rolled
   `…-3ms6` → `…-vxdt`).
4. **Provenance all-PASS** — `check-deploy-provenance --expect dc7fb15…` PASS on
   `https://rhema.tools` and `https://api.rhema.tools`; `deployments` row
   `prod:dc7fb15a0aa7caa5d47734656d06514d5b75b127` recorded (protocols
   `0.4.0+ec61156725a895ab`, ten digests).
5. **Post-deploy smoke** — public routes 200 with `data-renderer="ssr"`; signed-in shell +
   `/bff/*` (R8.inbox + T2.badge PASS, $0); worker consuming on the new revision;
   `N10`+`P1.public` PASS under `--expect-renderer ssr` — **D-SPA.6-1's residual prod leg
   discharged**.
6. **Rollback recipe committed** — `git revert` + redeploy of `ffbb8ad` + `record-deployment`
   + provenance `--expect ffbb8ad` (concrete commands, `rollback-recipe.md`).
7. **Metered notice sent** — dry-run scope re-verified (2 recipients, same classes as the
   R6MNY.1 read) then `--send`: 2 emails + 2 inbox rows, effective 2026-12-01. The debit-mode
   flip itself is **not** performed — preconditions 1–2 (`cap_calibration_reports`,
   admissible cost observations) remain UNMET.
8. **Teardown verified** — pr-207 destroy removed 193 resources (136+8 live, then 49 after the
   two GCP-managed `serverless-ipv4-cloudrun-*` reservations released at ~10:24Z — a ~2h20m
   GC lag, same class as pr-206; a direct `addresses delete` was correctly refused); `stack rm`
   done; **orphan sweep is zero across 25 classes**; spend ≈$4–6 ≤ $8; the manual IAP firewall
   was deleted in-window.

## Also in this PR

- `infra/config/stages.ts` — **reverted the RED soak candidate** the branch inherited
  (`3d2852e`): preview worker restored to 1 vCPU/1Gi instance-billed (D-P0.15h-3's shape,
  not the 0.5/512Mi request-billed posture R6SOAK.1 measured failing 6/6).
- `infra/pulumi/Pulumi.pr-207.yaml` — the preview stack record (encrypted secrets only).
- `infra/pulumi/Pulumi.prod.yaml` — the tip digest re-pin (dated comments à la ARMB).
- Evidence: `docs/build/reports/2026-10-22_R6DEP.1/` (preview runs, prod preflight +
  classification, rollback recipe, smoke, ssr leg, notice counts).

**Requirement ids:** REQ-DEP-1
**Merge policy:** OPERATOR — this PR is not merged by the run; it stacks on
`stevevitali/r6soak-1-worker-rightsize-soak`.

## Verification

- `pnpm turbo build lint typecheck` — 135/135.
- `pnpm test` — 512 files / **6,033 passed** / 4 skipped / **0 failed**.
- All six `check:*` gates green (licenses, protocol-markers, no-cookies, spa-budget,
  spa-env, dom-contract).
- `check-build-memory.sh` — warnings only (0 violations); `check-append-only.mjs --base
  dc7fb15` OK.
- CI: `ci: pass #207@1c8997d` (run 39729566641 — all seven legs + `ci-pass` anchor at the
  PR-open head); the post-impl closeout head re-runs the suite on push.
- Live: preview suite + ssr/spa renderer legs + provenance + smoke + notice send as above —
  `$0` third-party spend on every leg.
