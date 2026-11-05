# R7DEP.1 — R7a deploy: the one R7a phase preview → H15 → prod (GD-DEPLOY.R7)

Implements `docs/tickets/224_R7DEP.1__r7a-deploy.md` (manifest row 224, round 7 / R7a).

**Requirement ids:** REQ-DOPS-6 (R7a half) · REQ-DACC-1…6 · REQ-DWEB-6/9/10/11/14/16 ·
REQ-TOUR-1/2/4 (Stage-B halves).

## Summary

The R7a phase deploy, in two parts with an internal operator pause:

- **Part A (this PR's live work):** the one owned R7a phase preview (`pr-<n>`,
  `GD-PREVIEW.R7` — the only R7a preview; $20 round cap shared with 250's R7b preview) at the
  deploy SHA `8f6ef4781d470172e4e2c4bb15ab8543288c107a` (the R7a chain tip). The
  `0061_demo_events` migration applies under the real migration role; every R7a ticket's held
  Stage-B legs run green on it; each `staging-verified at the R7a phase preview (224)`
  DEFERRALS row is verified and closed on the evidence; the ready-to-flip registry rows move
  to `expected:"green"`.
- **The H15 hold:** PAUSE at the Part A/Part B boundary — preview URL + SHA + per-step
  screenshots go to the operator for the demo-copy sign-off (223a). No Part B act runs until
  the operator ticks it.
- **Part B (after H15):** classified `pulumi preview --diff` → `pulumi up --stack prod` →
  provenance all-PASS → `deployments` row → CDN invalidation of `/bff/p/demo~*` → prod
  Stage-B → preview teardown → spend record + rollback recipe.

## What changed

- `scripts/live/cdn-invalidate-demo.mjs` + `.test.mjs` — the ticket's ONLY authored code: the
  scoped Cloud CDN invalidation for `/bff/p/demo~*` (refuses every non-demo path; dry-run ==
  act).
- `docs/build/reports/2026-11-04_R7DEP.1/golden-classification.md` — the committed
  GD-GOLDEN.R7 classification of `a34eb51..8f6ef478`: **NOT protocol-affecting → no golden
  re-run** (item-by-item vs the rule; cites 213's ADR-130 argument).
- `packages/journeys/src/registry.ts` — ready-to-flip legs → `expected:"green"` (lands with
  the preview evidence, below).
- `docs/tickets/DEFERRALS.md` — the R7a `staging-verified … (224)` rows verified/closed with
  dated evidence.
- `docs/build/runs/R7DEP.1.md` — the run ledger (evidence log, gap table, spend record,
  rollback recipe).

## Verification

- `scripts/live/cdn-invalidate-demo.test.mjs` — 9 legs green (namespace refusal set incl.
  `/bff/*`, `/p/demo~*`, mid-path `*`, `..`; dry-run == act argv; ambiguous map resolution
  refused).
- Part A live evidence: preview URLs, per-leg `--expect-sha 8f6ef478…` results and
  screenshots — `docs/build/reports/2026-11-04_R7DEP.1/` + `runs/R7DEP.1.md`.
- `pnpm turbo build lint typecheck` + `pnpm test`; `check-build-memory.sh` 0 violations;
  `check-append-only.mjs --base stevevitali/r7dem-6b-metrics` — reported in the run ledger.

## Spend

- Preview: measured from billing/resource-hours against the **$20 round cap** (target ≤ $8
  for R7a) — recorded in `runs/R7DEP.1.md`.
- Golden: **$0** (classified non-affecting). Journey legs: $0 (`paid:false`).

## Gates

`GD-DEPLOY.R7` (8 conditions, each evidenced before its act; any failure → PAUSE) ·
`GD-PREVIEW.R7` (one owned preview per phase; voids at $20) · `GD-GOLDEN.R7` (≤1 re-run only
if protocol-affecting) · `GD-PUBDELTA.R7` · **HUMAN-H15 unticked → PAUSE before Part B.**
mergePolicy = OPERATOR — never merged by the run.

---

## Part B — prod deploy of the R7a chain (2026-11-05; this PR's head carries the records)

**Deploy SHA `4bc8cf4a73402aed782546fe233235e9807cc990`** (R7a chain tip incl. R7FIX.2). All eight
GD-DEPLOY.R7 conditions evidenced before the act each guards:

| # | Condition | Evidence |
|---|---|---|
| 1 | preview first | Part A green + R7FIX.2 re-walk on pr-259 (all 7 R7a legs green) |
| 2 | all-service image build | Cloud Build `02a947ec` @ `4bc8cf4a`, `_TAG=r7dep-1` → `rhema-prod` AR |
| 3 | classified preview --diff | ~10 updates + 1 stateless template replace, 0 deletes/stateful, Δ≈$0 |
| 4 | provenance all-PASS | web+api serve `4bc8cf4a` |
| 5 | deployments row | `prod:4bc8cf4a` + protocols `0.4.0+9c2b880dbee74bd8` |
| 6 | rollback recipe | committed in `runs/R7DEP.1.md` (pre-state `4938b8e` digests) |
| 7 | image-content assertion | pulled web digest: corpus + 4 essay snapshots present |
| 8 | CDN invalidation | `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e` (dry-run == act) |

- `0061_demo_events` applied on prod PG16 via `prod-migrate-seed` (in-band additive lint vs `0060` PASS); census clean (owner `rhema_demo_writer` NOLOGIN/prosecdef; `rhema_app` select+insert denied, EXECUTE-only).
- `WALKTHROUGH_MODEL_KEY_SECRET` env binding removed (D-R7COPY.0-2) — verified absent live.
- **Prod Stage-B: all 10 legs PASS** at `--expect-sha 4bc8cf4a`: D1.hub, D2.tour (11 steps ×3 widths), D3.readonly, P1.demo, R11.demo, U3.stopgap, R8.showcase.spa, N10, P1.public, R8.showcase — $0 spend, screenshots in `reports/2026-11-05_R7DEP.1-prod/`.
- Beacon end-to-end on prod (14 `src=jrn` `demo_events` rows); twin `s-maxage`+ETag+CDN `age:` HIT; 405/404 refusals clean; public routes 200.
- Golden: classified **non-protocol-affecting** (re-derived on `a34eb51..4bc8cf4a`) → no re-run, $0.
- Preview spend ≈ **$8 list-price** of the $20 round cap; pr-259 destroyed → `rm` (orphan serverless address drained + removed).
- **Deferrals:** closed D-R7COPY.0-2, D-R7FIX.1-1, D-R7RO.1-1, D-R7DEM.4-1; progress D-R7OPEN.1-1, D-R7DEM.6b-1; open w/ reason D-R7KIT.1-1, D-R7COPY.0-1, D-R7DEM.5-1.
- Verify: turbo 138/138 · `pnpm test` 6,722 pass (1 flake re-verified) · compute.test 26/26 · REQ-DOPS-6 (R7a half), REQ-DACC-1…6, REQ-DWEB-6/9/10/11/14/16, REQ-TOUR-1/2/4 (B halves).
