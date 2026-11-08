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

## Closeout — 2026-11-08 (prod @ `e578a767`)

- **Part A complete.** One preview `pr-293` (created once, updated in place 7×): full T0 walk →
  six owner insert rounds (250a–f) → **all-16 board green at `d0a77d0`** → U1–U7 flipped
  `expected:"green"` → hero clip + poster landed (13.72 s, 780,708 B, muted, 1280×720 —
  ADR-127 bytes+sha256 completed) → T1 `e578a767` re-walk green (N10, R8.showcase, P1.public,
  D1.hub, U1.shell, R8.showcase.spa) → hero vitals LCP 184–304 ms / CLS 0.000 → teardown:
  `destroy` ×4 (147+51 deleted — a Google-managed `serverless-ipv4-cloudrun-…023` lease held the
  private subnet ~65 min then auto-released) → **zero-orphan sweep 9 families, 0** → `rm`.
  Preview spend ≈ **$14 of $20**; inference $0.
- **Part B — all eight `GD-DEPLOY.R7` conditions evidenced in order:** build `7d470657` all-10
  @ `e578a767` (`_TAG=r7dep-2`, `rhema-prod` AR, `_ALLOW_PLACEHOLDER_SDK=0`, worktree at the
  exact SHA) · `pulumi preview --diff` classified — 10 updates + 1 stateless InstanceTemplate
  replace, zero stateful/delete, additive-only migrations, cost Δ≈$0 ≤$15 · `0062_drafts_discard`
  applied via `prod-migrate-seed` over the operator IAP tunnel (in-band additive lint PASS, 62
  recorded) · `pulumi up --stack prod` update 174 (1m42s) · **`check-deploy-provenance`
  all-PASS** — `rhema.tools` + `api.rhema.tools` → `e578a767…` · `deployments` row
  `prod:e578a767…` (`protocols_version 0.4.0+9c2b880dbee74bd8`) · committed rollback recipe
  (the `4bc8cf4a`/`c6d7dedb` digest set — never executed, the operator's go) · corpus-in-web-image
  asserted (in-build `RUN test -s` step `#15` green on the deployed digest `259973f9…`) · CDN
  invalidation `/bff/p/demo~*` on `rhema-prod-urlmap-6f2b86e` host `rhema.tools` (dry-run==act).
- **Stage B at prod T1** (`prod-stageb/`, 150+ captures): **U1–U7 all FLIP green at the deployed
  SHA** — the ticket's named flip set lands minus D2.tour. Green: D1.hub, D3.readonly, P1.demo,
  R11.demo, P1.public, N10, R8.showcase/spa/prefs/inbox, X1.*, T1–T3/T17, C1, R1/R5/R7/R10.keepalive,
  N2–N4/N7, P1.dossier. **`D-R7GUARD.1-1` closed (prod arm).**
- **Honest red tally (12 legs — F-R7DEP.2-9…16, DEFERRALS `D-R7DEP.2-2`):** new-at-T1 reds —
  D2.tour (hero mp4 206 counted by bundle parity; the clip first exists at T1), N9 (credits
  copy), P1.project/pill/runsheet/outline/figures (`.first()` picks the out-of-viewport
  `showcase-copy` recent), P1.app-new (2 WCAG), T4, T5; still-red pre-existing — N1/N3 (evolved
  shape), N8, T6; env-bound skipped — T7/R6F/T12F/T13F (`JOURNEY_DATABASE_URL` unbound), T8
  (D-FIX.1-1); `U3.stopgap` superseded (U3.occlusion green is the R7b arm). Compared against the
  Nov-7 nightly artifact (`journey-report-42374280018`) — none silently greened.
- **The ONE U6 paid run — FAILED, pause per `GD-UX-PAIDLEG.R7`.** Mechanism: the 232-updated
  paid `R4` row (`--paid --headroom 0.5`, `capUsd` $0.50 at target, `cogsLevers
  {testCheapRoute:false}`, Base tier, system-role DSN; ISO-week metered $3.34352 < $5 preflight).
  The turn POST answered **HTTP 402** — the journey identity carried no credits; the status poll
  never returned `optimistic`. **Metered spend $0.00** (usage_records delta 0; debits == burn:
  $0=$0). No second run — the single authorized dispatch was consumed; re-dispatch needs a fresh
  operator ruling (`D-R7DEP.2-1`). No pause sentinel written or cleared.
- **REQ-SPEED-5 prod primary** @ `e578a767`, N=20, 2026-11-08T08:59Z: hard-open p75 **123 ms**
  (≤1200), warm-open p75 **116 ms** (≤400), pending-indicator −1 (0 samples). Preview record:
  147/119/−1. No regressions.
- **Post-deploy nightly dispatched** — run `42465216426` (`paid=false`,
  `expect-sha=e578a767…`, ref `stevevitali/r7dep-2-t1-prod`).
- **Golden classification:** non-affecting; **$0** (no rerun). **Spend:** preview ≈$14/$20;
  paid leg $0.00; golden $0. **Provenance re-read at close:** see run ledger.
