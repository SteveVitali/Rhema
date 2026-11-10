# R7DEP.2 — the one R7b phase preview → prod deploy → Stage B → the one U6 paid run

**Row 250 (round 7, R7b).** Contract: `docs/tickets/250_R7DEP.2__r7b-deploy.md`.
Run ledger: `docs/build/runs/R7DEP.2.md`. Harness: devin-desktop/swe-2-high/subagent.

**Requirement ids:** REQ-DACC-1…8 · REQ-PUB-1/2 · REQ-DOPS-2/6 · REQ-DWEB-10 · REQ-SPEED-5
(primary) · REQ-GUARD-4/REQ-PANE-4 · REQ-TALK-2.

## What this PR carries

- The R7b deploy evidence: pre-state capture, the committed `4bc8cf4a..18b79c30` payload
  classification (deploy-neutral: non-neutral → every `/healthz` service rebuilt; golden rule:
  **NOT protocol-affecting → no re-run → $0**; migrations: `0062` additive-only),
  `reports/2026-11-07_R7DEP.2/golden-classification.md`.
- Part A — the ONE owned R7b preview `pr-<n>` (`GD-PREVIEW.R7`, $20 round cap with 224's ≈$8
  carried in): up at T0, every `paid:false` D*/U* leg walked with screenshots, the HUMAN-H16
  window, the hero recording capture → the T1 commit at 249a's `HERO_RECORDING` paths + the
  ADR-127 asset row completion, an in-place T1 update + re-walk, verified teardown, and the
  measured spend record beside 224's.
- Every `staging-verified at the R7b phase preview (250)` DEFERRALS row closed with a dated note
  citing the T0/T1 SHA — or carried with its reason; the R7b `ready-to-flip` legs (U1–U7,
  D2.tour re-flip) flipped to `expected:"green"` citing this evidence.
- Part B — prod under `GD-DEPLOY.R7`'s eight conditions: preview walk first + verified teardown ·
  all-service image build at T1 · classified `pulumi preview --diff` (zero stateful
  replace/delete, additive-only, cost Δ ≤ $15) · `check-deploy-provenance` all-PASS ·
  `deployments` row · committed rollback recipe · corpus-in-web-image assertion · recorded CDN
  invalidation of `/bff/p/demo~*`.
- Stage B at prod at T1, the one U6 paid run via the R4 row (`capUsd` $0.50 < $10,
  `GD-UX-PAIDLEG.R7`, never retried), the REQ-SPEED-5 primary record, the post-deploy nightly
  dispatch, and the rollback recipe.

## Verification

- `pnpm turbo build lint typecheck` + `pnpm test` — fresh at each committed head.
- `node scripts/check-additive-migrations.mjs --files 0062_drafts_discard.sql` — PASS.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7pub-1-landing-pricing`.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .`.
- `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R7DEP.2 --json docs/build/logs/ci-R7DEP.2.json`.

## Spend

Preview: measured vs the $20 round cap (224's ≈$8 carried in). Inference: the one U6 paid run
< $10 (target ≤ $0.50). Golden: $0 (classified non-affecting).

## mergePolicy

OPERATOR — the run never merges its own PR; deploy acts are pre-authorized under the ticket's
quoted `GD-*` rulings only.
