# R5OPS.1 — Operations residuals: deterministic halves + scripted live legs

Manifest row 161 · stacks on `stevevitali/r5econ-3-funded-window-regime` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/161_R5OPS.1__ops-residuals.md` · run ledger `docs/build/runs/R5OPS.1.md`.

## What lands

The deterministic halves of every open ops residual, plus the two authorized live legs —
executed against prod over the IAP tunnel with nothing but the sanctioned reads and the ONE
scripted write (canary pause injection, rolled back in the same run).

- **REQ-OPS-1 — canary pause smoke: EXECUTED, PASS (live).**
  `scripts/live/canary-pause.mjs --execute` staged a synthetic `runs` row (`state='running'`,
  the newest `is_test` workspace `01M501P5H4A1TETKTJ15BY09XM`, `requested_by NULL`,
  `estimate/cap_credits 0` — cost- and human-inert) + ONE `pause_signals` row
  (`egress_denied_spike`). The prod worker's `drainPauseSignals` sweep claimed it
  (`claimed_at`→`processed_at` inside the 5 s cadence), `pauseRun` drove
  `running → waiting_gate`, and the blocking `refusal` gate opened with `on_expiry='cancel'`
  — `run.state_changed` + `gate.opened` events observed verbatim. Rollback deleted both rows;
  post-state residue is zero across `runs`/`pause_signals`/`gates`/`run_events`. Evidence:
  `docs/build/reports/2026-10-15_R5OPS.1/canary-pause.json`. The `notify:waiting` pgboss
  singleton the gate armed (+15 min) fires to `not_found` — recorded honestly.
- **REQ-OPS-2 — alert path: closed on the existing Path-A receipts** (ratified Q-ALERT) —
  the catcher's `ops_alert_received` POST→200 records stand; `rhema:opsAlertWebhookUrl`
  remains the documented-optional literal arm.
- **REQ-OPS-3 — usercontent CDN leg: EXECUTED — config verified, delivery path nonfunctional.**
  `usercontent-cdn-verify.mjs` confirmed via `gcloud` that `rhema-prod-usercontent-backend-7dea6dd`
  carries `enableCdn` + `cacheMode=USE_ORIGIN_HEADERS` + `signedUrlKeyNames=[rhema-tools-key]`
  wired through `rhema-prod-urlmap-6f2b86e`'s `usercontent` host rule — then minted a real
  `rhema-tools-key`-signed URL (`gcloud compute sign-url`, key = the documented
  `rhema-prod-user-content-signing-key` value) and fetched a real object: **403
  `AccessDenied` from the GCS origin — identical for unsigned and corrupted-signature
  probes.** The CDN edge is not gating signatures, and the LB→private-bucket origin read is
  denied (bucket IAM grants `objectViewer` to `rhema-prod-convert@` only — no compute/LB
  service-agent grant). Honest verdict `CONFIG-OK-ORIGIN-DENIED`; the repair leg is owed →
  **D-R5OPS.1-2** + LEDGER OPEN FINDINGS. Evidence:
  `docs/build/reports/2026-10-15_R5OPS.1/usercontent-cdn-verify.json`.
- **REQ-OPS-4 — first-finding ≤4-min: measurement query committed, execution deferred.**
  `scripts/live/first-finding-latency.mjs` carries `FIRST_FINDING_QUERY` /
  `FIRST_FINDING_SUMMARY` (`signup.completed` → first `finding.viewed` per real user,
  non-test workspaces, opt-out honored); **D-R5OPS.1-1** carries the query verbatim — blocked
  on organic signups, empty cohort = no data, never evidence.
- **REQ-OPS-6 — BL-74 merge dependency recorded** (dated note on D-OBS.1-3): the scheduled
  nightly's `github.sha` is `main` HEAD and satisfies "deployed SHA" only after the merge
  sweep + deploy land; `workflow_dispatch` runs never satisfy the row.
- **REQ-OPS-7 — nightly-golden driver landed behind the budget ruling.**
  `scripts/live/nightly-golden-driver.mjs` is dry-run by default; `--execute` is fail-closed
  on `GOLDEN_BUDGET_RULING=approved` + a measured `--scores` file (never fabricates a
  manifest). The ~$150–300/night ruling is registered: ⚑ **Q-GOLDEN** in
  `docs/post-spa-disposition-spec.md` §10 + **GD-R5OPS.1-1 AWAITING** in the LEDGER GATE
  DECISIONS. `nightly-golden.mjs`'s absent-manifest exit-0 is now marked **NON-EVIDENCE**
  verbatim (pinned).
- **BL-07 classification — landed, from the rows.** `unverified_review_rate_7d_pct`=100 was
  driven by a single run (`01M41AE99M49Q5HNG4M9S6106Q`, `unverified`, ended
  2026-10-03T17:27Z) on the operator's own **non-test** workspace carrying the
  `[autosave SLO probe — edit 1]` marker — instrumented test traffic on an unflagged
  workspace, not real-tenant degradation. It aged out of the 7-day window 2026-10-10T17:27Z;
  the catcher pages stopped on their own (last `slo_violation` 17:26:17Z). Probe reads
  `rate=null`/`n=0` now — no remediation owed. Report:
  `docs/build/reports/2026-10-15_R5OPS.1/bl07-classification.md`.

## Adjacent live datum (recorded, scope-bound)

A NEW alert kind pages the catcher: `balance_divergence` (`nightly-assertion`,
2026-10-15T03:15:33Z) — six included-bucket billing accounts read `expectedHeld=-3860` /
`actual=0`. → LEDGER OPEN FINDINGS; classification owed to a BL-07-family follow-up.

## What changed

- `scripts/live/canary-pause.mjs` + `canary-pause.test.mjs` — the REQ-OPS-1 driver (9 pins).
- `scripts/live/usercontent-cdn-verify.mjs` + `usercontent-cdn-verify.test.mjs` — REQ-OPS-3
  (6 pins).
- `scripts/live/first-finding-latency.mjs` + `first-finding-latency.test.mjs` — REQ-OPS-4
  committed query (5 pins).
- `scripts/live/nightly-golden-driver.mjs` + `nightly-golden-driver.test.mjs` — REQ-OPS-7
  (5 pins).
- `scripts/nightly-golden.mjs` + `nightly-golden.test.mjs` — absent-manifest NON-EVIDENCE
  marker + pin.
- `docs/tickets/DEFERRALS.md` — dated notes on D-P1.22-2 (canary DONE, CDN leg verdict),
  D-OBS.1-3 (BL-74 merge dependency), D-P0.15-4 (driver + ruling linkage); new rows
  **D-R5OPS.1-1** (REQ-OPS-4 execution) + **D-R5OPS.1-2** (CDN signed-delivery repair leg).
- `docs/post-spa-disposition-spec.md` §10 — **Q-GOLDEN** registered.
- `docs/build/LEDGER.md` — GD-R5OPS.1-1 GATE DECISIONS row; OPEN FINDINGS entry (BL-07
  classification, CDN origin-denied, `balance_divergence`).
- `docs/build/runs/R5OPS.1.md` · `docs/build/reports/2026-10-15_R5OPS.1/` — ledger + evidence.

## Test plan

| Contract clause | Test |
|---|---|
| canary fail-closed (ack + DSN + reason whitelist + is_test-only) | `canary-pause.test.mjs` |
| canary evidence chain + unconditional rollback | `canary-pause.test.mjs` |
| CDN driver: gcloud seams, key-tmpfile hygiene, three probes, honest verdicts | `usercontent-cdn-verify.test.mjs` |
| REQ-OPS-4 query verbatim + opt-out + is_test exclusion + 4-min bar | `first-finding-latency.test.mjs` |
| golden driver: ruling fail-closed, no fabricated manifest, gate seam, NON-EVIDENCE marker | `nightly-golden-driver.test.mjs` |
| absent-manifest exit-0 says NON-EVIDENCE | `nightly-golden.test.mjs` |
| live canary PASS + CDN leg verdict | `docs/build/reports/2026-10-15_R5OPS.1/*.json` |

## Boundaries

Prod interactions were exactly the authorized three arms: the `gcloud` CDN verification reads
+ fetches, the `slo_samples`/runs classification reads (all `begin read only … rollback`), and
the ONE scripted write (canary `runs`+`pause_signals` insert → rolled back same-run, residue
verified zero). No paid legs, no deploys, no other tenants' data, no secrets in artifacts.

Requirement ids stamped: **REQ-OPS-1 · REQ-OPS-2 · REQ-OPS-3 · REQ-OPS-4 · REQ-OPS-6 ·
REQ-OPS-7**.
