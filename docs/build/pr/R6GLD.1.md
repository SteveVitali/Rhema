# R6GLD.1 — Golden validation: $100 minimal four-protocol cohort at the launch SHA (REQ-DISC-3)

Manifest row 196 · ADR-111 amended §17 launch criterion · stacks on
`stevevitali/r6secr-1-adversarial-review` · mergePolicy: **OPERATOR** (never self-merges).

**Honest headline: the machinery is landed, the live rerun executed end-to-end — all four
protocol legs `completed` with delivered, schema-valid reviews at measured $33.89 (≤$100) —
and the golden gate is GREEN on all four** after the operator ruled verbatim **"I accept the
band"** on `F-R6GLD.1-2` (GD-GOLDEN-BAND.R6): the a-priori `major` band was re-calibrated
`{max: 10 → max: 12}` (headroom +1 over the academic leg's measured 11 non-degenerate majors)
and the **same measured scores re-gated** — `gate-report-reamended.txt`: 4/4 PASS,
`Promotion OK`, `promotionBlocked: false`. Deterministic re-evaluation, **$0**, no new
dispatch. The credential block (`F-R6GLD.1-1`, stale proxy key cache) is cleared and proven
green by this run.

## Delivered

- **Full four-protocol golden coverage** — `golden-essay` + `golden-academic` fixtures;
  `GOLDEN_EVAL_FIXTURES` covers `essay`/`academic`/`op-ed`/`memo` with committed floors, each
  paired with `review`/`base`/`standard`.
- **`--cohort minimal`** in `scripts/live/nightly-golden-driver.mjs`: one fixture per protocol,
  launch-SHA check, `is_test` check, estimate + `GOLDEN_BUDGET_RULING=approved` fail-closed
  `--execute`, measured `--scores`/`--scores-out`. Never fabricates a manifest.
- **`docs/ops/golden-rerun-rule.md`** — rerun after every protocol-affecting deploy incl.
  REQ-ENG-3 / REQ-SEC-3 fixes; nightly cadence stays declined (GD-R5OPS.1-1).
- **DSN seam**: `GOLDEN_DATABASE_URL` binds the one privileged read (`.ts`-scoped boundary
  allowlist doesn't cover `scripts/`).

## Landed on resume — two live-found machinery fixes

- **`--dispatch-tag <attempt>` is now required for `--dispatch`.** The first rerun attempt
  silently deduped onto the prior dispatch's failed runs — the idempotency key was
  `golden-<fixture>-<sha>`, so `POST /runs` returned the old terminal rows and *zero* new model
  calls happened (`golden-scores-dedupe-noop.json` is the honest record). Keys are now
  (fixture · sha · tag): same-tag re-invocation is retry-safe mid-cohort, a rerun names a new
  attempt. The rerun rule documents it.
- **`schemaValid` re-predicated.** It demanded `correspondence_items.verdict != null` — a column
  the real delivery path (`mirror/delivery.ts`) never writes (per-claim verdicts live on
  `claims`), so all four *successful* legs measured false-red. Now: completed run + review CI +
  protocol stamp + parseable rubric with non-empty `dimensions[]` + ≥1 artifact + ≥1 claim.

## Live evidence (2026-10-23, prod @ `80db0d5`, `is_test` workspace `01M5M2C6NC3058T528ZX2D44SG`)

Dispatch 1 (pre-fix): 4 runs, all failed `research_preflight_failed` HTTP 401 — **$0**.
Dispatch 2 (`--dispatch-tag rerun1`, post-proxy-cycle):

| leg | run | state | spend (list) | findings b/M/m/n |
|---|---|---|---|---|
| golden-essay | `01M5MFYJ3P04SXRBPN26FYEE11` | completed | $10.65 | 0/7/5/5 |
| golden-academic | `01M5MJ7CGGPF3CMHDFZV80VFE2` | completed | $8.69 | 0/**11**/5/6 |
| golden-op-ed | `01M5MM5AV1RHC4RJ1NWSA0X07G` | completed | $8.56 | 3/3/3/6 |
| golden-memo | `01M5MP4XV5CVNP3301DFED7EJP` | completed | $5.99 | 0/7/7/5 |

Every leg: schema-valid review CI (8 rubric dims, 13–14 artifacts, 7–11 claims), correct
protocol stamp, `citedFetched` clean, zero attestation violations.
**Measured total across both dispatches: $33.89** (usage_records, meter of record).

**Gate:** the first gate (`gate-report.txt`) read essay / op-ed / memo PASS · academic FAIL
`findingCount:major` 11 > 10 → `PROMOTION BLOCKED` — one real finding over an a-priori band
on a deliberately weak draft. The operator accepted the band (GD-GOLDEN-BAND.R6); the
re-calibrated floor (`major: {max: 12}`, pinned by a test line) re-gated the same measured
scores green — `gate-report-reamended.txt`: **4/4 PASS, `Promotion OK`** ($0, no rerun).

## Deferrals

- **D-P0.15-4 → DONE** (2026-10-23): the GD-S17.R6 closing clause holds — cohort green on
  all four protocols at the launch SHA `80db0d5` (amended-floor re-gate) + the re-run rule
  committed as a standing ops rule. The recurring nightly cadence stays declined
  (GD-R5OPS.1-1). **F-R6GLD.1-2 RESOLVED.**

## Verification

- `pnpm exec vitest run scripts/live/nightly-golden-driver.test.mjs` — 12 pass (incl. the
  `--dispatch-tag` pin)
- `pnpm exec vitest run packages/protocols/src/eval-fixtures.test.ts` — 12 pass
- `@rhema/protocols` build + lint + typecheck — green · eslint clean on touched scripts
- build-memory + append-only + CI boundary: `docs/build/runs/R6GLD.1.md`
