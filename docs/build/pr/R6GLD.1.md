# R6GLD.1 — Golden validation: $100 minimal four-protocol cohort at the launch SHA (REQ-DISC-3)

Manifest row 196 · ADR-111 amended §17 launch criterion · stacks on
`stevevitali/r6secr-1-adversarial-review` · mergePolicy: **OPERATOR** (never self-merges).

**Honest headline: the machinery is landed and the dispatch was executed, but golden
validation is RED, not green.** All four paid legs failed at research preflight with
`HTTP 401 authentication_error` on `web_search`/`web_fetch` model calls — a platform-side
credential/tool problem (`F-R6GLD.1-1`, operator flag). Per the ticket's explicit rule the
runs were **never retried**; measured spend is **$0** and no manifest was fabricated.

## Delivered

- **Full four-protocol golden coverage** — added `golden-essay` + `golden-academic` protocol
  fixtures; `GOLDEN_EVAL_FIXTURES` now covers `essay`/`academic`/`op-ed`/`memo`, each with
  committed score floors, paired with the primary `review` workflow at default `base` /
  `standard`.
- **`--cohort minimal`** in `scripts/live/nightly-golden-driver.mjs`: exactly one fixture
  per protocol, launch-SHA check (`--expect-sha`), `is_test` workspace check, estimate +
  `GOLDEN_BUDGET_RULING=approved` fail-closed `--execute`, measured `--scores`/`--scores-out`.
  The driver never fabricates a manifest.
- **`docs/ops/golden-rerun-rule.md`** — the standing ops rule: golden validation reruns after
  every protocol-affecting deploy, explicitly including REQ-ENG-3 / REQ-SEC-3 fixes. The
  recurring nightly cadence stays declined (GD-R5OPS.1-1) — not resurrected here.
- **`tools/system-pool-boundary.json`** — driver added with reason (audited system-DSN
  provenance/tenant verification only).

## Estimate (committed before any paid dispatch)

`docs/build/reports/2026-10-23_R6GLD.1/cohort-estimate.json` — Review/Standard/Base,
claims ≈ words/60, active manifest phases:

| leg | credits |
|---|---|
| golden-essay | 1 721 |
| golden-academic | 1 721 |
| golden-op-ed | 1 721 |
| golden-memo | 1 358 |
| **total** | **6 572 cr / $46.94 list — withinCap: true (< $100)** |

## Live evidence (2026-10-23, prod @ `80db0d5`)

Workspace `01M5M2C6NC3058T528ZX2D44SG` (`is_test=true`, `test+jrn-gld@rhema.tools`), funded
with an audited 8 000 cr house grant. Exactly one run per protocol, four total:

| leg | run | result |
|---|---|---|
| golden-essay | `01M5M2D06JAFZAY55H2HFP8PF1` | failed — `research_preflight_failed` HTTP 401 |
| golden-academic | `01M5M2EEJ7FPW5YAA9GJZYF9XE` | failed — `research_preflight_failed` HTTP 401 |
| golden-op-ed | `01M5M2EZF2VNF8KJSTJ1869R98` | failed — `research_preflight_failed` HTTP 401 |
| golden-memo | `01M5M2FH04NXN6JXMS4382FQ7P` | failed — `research_preflight_failed` HTTP 401 |

- **Measured spend: $0** — all four holds fully released (credit-ledger evidence).
- `golden-scores.json` committed as honest red evidence; `--execute` not run,
  `evals/fixtures/nightly-manifest.json` not written.
- Platform context: zero real (non-zero-duration) completed runs in the last 3 days — every
  `completed` row is a zero-duration showcase seed. `/v1/models` is 200 on secret v4
  (F-R6CNT.2-1 resolved), but the tool-carrying model call is rejected — likely the per-run
  `proxy_credential_id` upstream path or missing tool entitlement.

## Finding — ⚑ operator

**F-R6GLD.1-1 (OPEN):** research model calls return HTTP 401 on prod. Blocks the green
golden validation, the D-P0.15-4 close, and any organic paid run. Remediation is a
credential/tool-access decision; after the fix the rerun is exactly this committed cohort
per the rerun rule.

## Deferrals

- **D-P0.15-4 — stays OPEN** with a dated note: the bounded validation was executed but is
  red; closes when the cohort reruns green on all four protocols at the launch SHA.

## Verification

- `pnpm exec vitest run packages/protocols/src/eval-fixtures.test.ts` — 12 pass
- `pnpm exec vitest run scripts/live/nightly-golden-driver.test.mjs` — 11 pass
- `pnpm --filter @rhema/protocols build` + lint + typecheck — green
- build-memory + append-only + CI boundary: see run ledger `docs/build/runs/R6GLD.1.md`

## Changed surface

fixtures (2 new files) + registry + floors tests · driver + tests · ops rule · boundary file
· estimate + score evidence · ledgers. No production-code change beyond the live driver.
