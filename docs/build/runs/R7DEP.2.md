# R7DEP.2 — the one R7b preview (walk every leg, H16, hero recording) → prod deploy under `GD-DEPLOY.R7` → Stage B → the one U6 paid run (run ledger)

- **Ticket:** `docs/tickets/250_R7DEP.2__r7b-deploy.md` (row 250, round 7 / R7b; contract)
- **Branch:** `stevevitali/r7dep-2-phase-preview` (forked off `stevevitali/r7pub-1-landing-pricing`)
- **Base / T0:** `stevevitali/r7pub-1-landing-pricing` @ `18b79c30c2b8d730414ce8fbb67d015b6a599611`
  — the R7b code tip (249a included). The operator has NOT merged the stack (mergePolicy
  OPERATOR), so the deploy SHA is the chain tip, not a post-merge `main` HEAD.
- **T1:** T0 + the hero-recording asset commit (249a's declared `HERO_RECORDING` paths).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-DACC-1…8; REQ-PUB-1/2 (B evidence + the committed recording);
  REQ-DOPS-6 (R7DEP.2 arm), REQ-DOPS-2 (assertion re-run); REQ-DWEB-10 (invalidation act);
  REQ-SPEED-5 (primary prod record); REQ-GUARD-4, REQ-PANE-4 (U3 Stage-B arm); REQ-TALK-2 (U6).
- **Started:** 2026-11-07T17:0xZ (`date -u`) · **Closed:** (open)
- **Live stage:** Part A — the ONE owned R7b phase preview `pr-<n>` (`GD-PREVIEW.R7`; round-7
  preview spend hard cap **$20**, target ≤ $16, 224's ≈$8 carried in; $0 inference). Part B —
  prod (`GD-DEPLOY.R7`, 8 conditions each evidenced before the act it guards).
- **Production mutations (ticket header scope — Part B only):** additive migration `0062` via
  `scripts/live/prod-migrate-seed.mjs` over the operator IAP tunnel (+ in-band
  `check-additive-migrations` vs prod `_migrations` max); `pulumi up --stack prod` at T1 (CI
  digests re-pinned in `infra/pulumi/Pulumi.prod.yaml` with dated comments);
  `scripts/live/record-deployment.mjs`; the Cloud CDN invalidation of `/bff/p/demo~*` through
  `scripts/live/cdn-invalidate-demo.mjs` (dry-run == act, committed); free journey legs on
  `is_test` identities; the one U6 paid run via the R4 row (`GD-UX-PAIDLEG.R7`); a post-deploy
  `gh workflow run journeys.yml` `paid=false` `expect-sha=T1`. Golden re-run: **none —
  classified NOT protocol-affecting** (below).
- **Gates:** `GD-DEPLOY.R7` (8 conditions; any failure → PAUSE) · `GD-PREVIEW.R7` ($20 round cap;
  voided at $20 → destroy + PAUSE) · `GD-GOLDEN.R7` (classified non-affecting → $0) ·
  `GD-UX-PAIDLEG.R7` (exactly one U6-class paid run < $10, target ≤ $0.50; voided ≥ $10 or by a
  second run — no retry) · `GD-PUBDELTA.R7` (enumerated deltas) · **HUMAN-H16** hosted in the
  Part A window (operator's optional UX session — recorded walked / declined verbatim /
  not-dispositioned, never fabricated) · GATE-ACCEPT.R7 expiry.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Round-7 rows whose "unblocked by" is this
preview walk — verify + close at the R7b phase preview (evidence paths per each row):

`D-R7SHELL.1a-1`, `D-R7SHELL.1b-1`, `D-R7SHELL.1c-1` (palette + two-tenant LIVE probe),
`D-R7PANE.1-1` (U3.occlusion + U3.stopgap re-disposition), `D-R7SHELL.2-1` (extended U1.shell),
`D-R7RELOAD.1-1` (U2.noreload flip), `D-R7TALK.1a-1` (U6.chat flip), `D-R7TALK.1b-1` (Findings/
Claims latest-review tabs), `D-R7HOME.1-1` (flat list + batch-c1), `D-R7HOME.2b-1` (opens-to-Page
contract), `D-R7HOME.2a-1` (U7.import flip), `D-R7WRITE.1a-1` (format bubble + strip),
`D-R7WRITE.1b-1` (comment/fork + U5.write flip), `D-R7WRITE.2-1` (source/paper/keymap + U5.write),
`D-R7KIT.3a-1` (settings/billing/usage + /pricing; appends to D-P1.20-1), `D-R7KIT.3a2-1`
(voices), `D-R7KIT.3b-1` (run-sheet/export/import/new-project), `D-R7KIT.3c2-1` (outline+figures),
`D-R7KIT.3d-1` (batch-d surfaces), `D-R7KIT.3e-1` (dossier + U4.controls flip),
`D-R7COPY.1b-1` (markdown evidence ×4), `D-R7COPY.1c-1` (mapped error on lock_held),
`D-R7SYNC.1-1` (SYNC legs + SPEED-5 preview record), `D-R7RO.2-1` (phone reader, real UA),
`D-R7TOUR.2-1` (D2.tour re-pin + sidebar-demo), `D-R7KIT.3f-1` (29 migrated surfaces),
`D-R7GUARD.1-1` (U3.occlusion at the deployed SHA — closes at prod Stage B), `D-R7PUB.1-1`
(landing + hero recording + LCP/CLS + signed-in /pricing + ADR-127 row).

Plus `D-R7OPEN.1-1` (the R7b half — U1–U7 flips + D2.tour re-flip; closes when all are green).
Append-evidence rows (never closed unless their own criteria are met): D-PRB.07-1, D-P1.20-1,
D-FIX.1-2, D-P1.19-2. Verify-then-disposition: D-P1.17-2 (Lighthouse/axe hero arm), D-FIX.1-2
(real-UA phone), D-OBS.1-3 (nightly green on the deployed SHA).

## Pre-state (captured 2026-11-07T18:0xZ, before any mutation)

- prod `/healthz` `build.gitSha` on web + api: `4bc8cf4a73402aed782546fe233235e9807cc990`
  (R7DEP.1's deploy SHA) — verified live.
- prod `_migrations` max: `0061_demo_events.sql` (61 applied; `0062_drafts_discard.sql` the only
  newer file) — via IAP tunnel `rhema-prod-proxy-5bv1` → `127.0.0.1:15433→10.46.0.3:5432`,
  PostgreSQL 16.15 (Cloud SQL — the engine `0062` needs no portability fix for).
- prod stack export: `logs/r7dep2/prod-stack-export-prestore.json` (182 resources).
- prod digests (`Pulumi.prod.yaml` at pre-state): the R7DEP.1 `4bc8cf4a` set — the rollback pins:
  api `794c6e66…`, web `8ae9b40f…`, worker `4d771eea…`, fetcher `cf8cb11d…`, convert `44062bde…`,
  export `2a4b3e7c…`, collab `a6da4f10…`, turbo-cache `9893066c…`; run-task `762c1d99…`;
  egress-proxy `81017be4…` (all `@sha256:` in `rhema-prod` AR).

## Classification (deliverable 1 — committed before any Part B act)

- **Deploy-neutral:** non-neutral payload → every `/healthz` service rebuilt at the deploy SHA.
- **Golden rule (`4bc8cf4a..18b79c30`):** **NOT protocol-affecting → no re-run → $0** —
  item-by-item in `reports/2026-11-07_R7DEP.2/golden-classification.md` (zero `packages/protocols`
  /`run-task`/`engine`/`worker` source changes; egress-proxy test-only; orchestrator change is a
  comment-anchoring column, not dispatch; mirror changes are draft-lifecycle).
- **Migrations:** `0062_drafts_discard.sql` only — additive lint PASS (two ADD COLUMN).

## Spend opening read (deliverable 2 — `GD-PREVIEW.R7`)

- 224's measured R7a preview spend (R7DEP.1 ledger): **≈ $8** (list-price inventory — honestly
  labelled, no billing export exists, D-OPS.2-1).
- pr-259 residual carry DISCHARGED this run (2026-11-07T18:0xZ): re-ran `destroy` — 51 resources
  removed (the orphaned `rhema-pr-259-iap-ssh` firewall, not in state, deleted via gcloud after
  the network block surfaced it) → zero-orphan sweep across compute/network/firewall/addresses/
  secrets/buckets/alloydb/redis/AR/GKE/Cloud Run → `rm pr-259`. Stack gone; residual spend was
  secrets/buckets/AR/subnetwork-class (≈ pennies over 2 days).
- This preview's committed estimate: ≈ $8–11 (same component profile as pr-259 at a similar
  window; the T1 rebuild adds ~1 Cloud Build ≈ $0.4).
- **Opening balance: ≈ $8 carried + ≤ ~$11 estimate = ≤ ~$19 projected worst-case < $20 →
  PROCEED.** (Target ≤ $16 means the window must stay tight: no idle holds outside the H16
  window; teardown immediately after the T1 re-walk.) Any read reaching $20 → tear down at
  once + PAUSE.

## Requirements (ticket deliverables) / Gap table

| # | Deliverable | Layer | Status | Evidence |
|---|---|---|---|---|
| 1 | Pre-state + payload classification committed | deterministic | DONE | this ledger + golden-classification.md |
| 2 | Spend opening read < $20 headroom | live-executed | DONE | § Spend opening read (≈$8 + ≤$11 < $20) |
| 3 | Part A: preview up at T0, every paid:false D*/U* leg + screenshots; D-rows closed | staging-verified | PENDING | — |
| 4 | HUMAN-H16 window recorded (walked/declined/not-dispositioned, `date -u`) | human-completed when walked | PAUSE | the operator's act inside the preview window |
| 5 | Hero recording → T1 commit at HERO_RECORDING paths + ADR-127 row | staging-verified | PENDING | — |
| 6 | T1 in-place update + re-walk + verified teardown + spend read | staging-verified | PENDING | — |
| 7 | Part B: classified diff → migrations → `pulumi up` → provenance → invalidation → deployments row | live-executed | PENDING | — |
| 8 | Stage B at prod: every D*/U* leg green at T1 + flips + N10/P1.public/smoke | live-executed/public | PENDING | — |
| 9 | U6 paid run — exactly one, < $10 (target ≤ $0.50), mechanism recorded | live-executed | PENDING | R4 row (capUsd 0.5) planned |
| 10 | REQ-SPEED-5 timings preview + prod (N≥20, `date -u`, SHA) | live-executed | PENDING | — |
| 11 | Close-out: rollback recipe, nightly dispatch, provenance re-read, records | live-executed | PENDING | — |

## Progress

- 2026-11-07T17:0xZ — branch `stevevitali/r7dep-2-phase-preview` cut at `18b79c30` (clean, base
  pushed). Contract + all Load files read: spec §§0–8 (verbatim rulings), LEDGER `### Round 7`
  gate rows verbatim, R7DEP.1/R7PUB.1/R7SYNC.1/R6DEP.1/R6DEP.4 ledgers, golden-rerun-rule,
  PROD-BRINGUP, INTEGRATION_PLAN, infra+journeys+docs AGENTS, DEFERRALS (every R7b row mapped).
  Tooling verified: pulumi v3.261.0 (login `14stevevitali-gmail-com`), gcloud → `rhema-507501`
  (ADC live), node v26.13.0, pnpm 10.32.1, ffmpeg/ffprobe present, vendored agent SDK in
  worktree (run-task image assert will pass), playwright chromium present.
- 2026-11-07T18:0xZ — pre-state captured (above); pr-259 carry discharged; golden classification
  committed **NOT affecting**; `0062` additive PASS; spend opening read committed → PROCEED.
