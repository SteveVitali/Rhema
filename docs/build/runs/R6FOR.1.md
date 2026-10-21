# Run ledger — R6FOR.1 (prod forensics: named-red SLOs, `balance_divergence`, weekly-guard live read)

- **Spec:** `docs/tickets/182_R6FOR.1__prod-forensics.md` (manifest row 182; spec `docs/round-6-draft-spec.md` §4.3 REQ-FOR-1/2/3)
- **Base:** `7c9dc5e` (stevevitali/r6mny-1-money-flip-readiness)
- **Branch:** `stevevitali/r6for-1-prod-forensics` · PR base: `stevevitali/r6mny-1-money-flip-readiness` (OPERATOR merge policy)
- **Config:** full rigor — ledger, self-review, gap-analysis, tests, live verification (prod read-only, $0), evidence report
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-10-21T15:02Z

## Deferrals read

- `D-SLO.1-5` OPEN — `run_success_rate` weekly 80% (8/10): `01M3EGS55XHHFBT6CNS7Z3F5N9` research_burst `phase_blocked` + `01M3EW0EQJ3ZSNCW3TQ140NGBE` chat_turn `cap_reached` (2026-09-26 organic). Owed: forensics + cap-death classification proposal.
- `D-SLO.1-7` OPEN — `proxy_vs_sdk_cost_runs_over5pct_1h`: 4 divergent (run,attempt)s 15.5–22.9%: `01M3SK62YZST272B35CG12K6TW` att1/att2, `01M3EVPYKJ9W3KBGDCPBZEXDV7` att1, `01M3EAAZG2AQ289B6ZFEP5XYN2` att7. Owed: `usage.reconcile` attribution (model-call shape vs metering defect).
- `D-SLO.1-8` OPEN — `egress_denied_10m` 9–12: `api.anthropic.com/api/hello` (7) + `api.anthropic.com/v1/messages?beta=true` (5) on the same crashy runs. Owed: canary-source read — intentional probe vs allowlist gap.
- `D-STB.5b-1` PARTIAL — ADR-093 fail-closed landed; **live half owed**: `pg_roles` probe passes on the system DSN + the meter sums (two-role re-read).
- LEDGER OPEN FINDINGS — `balance_divergence` nightly-assertion page 2026-10-15T03:15:33Z: six included-bucket accounts `expectedHeld=-3860`/`actual=0` (BL-24 family). Verdict owed: test-tenant soak or real ledger defect (defect = launch-blocking).
- The weekly-window SLO re-reads stay owed to R6WATCH.1 (not this ticket).
- No skeletons; Gate status: PAUSE only if a verdict proposes an SLO denominator/target semantic change → agent-drafted ADR proposal, no SLO code change.

## Requirements

- REQ-FOR-1: verdicts on evidence for D-SLO.1-5/-7/-8 — defect → fix/insert; by-design → ADR proposal.
- REQ-FOR-2: `balance_divergence` classification — test-tenant soak vs real ledger defect; a real defect is launch-blocking (fix here if small, else insert ticket).
- REQ-FOR-3: weekly paid-guard live re-proof on the system-role DSN ($0): `pg_roles` probe passes + meter sums.
- Committed reports under `docs/build/reports/2026-10-21_R6FOR.1/` — aggregates/run-ids only, no PII; dated verdict notes per deferral row.
- ~350 changed-line budget; $0 spend; no prod writes.

## Acceptance criteria

- Each of the four items carries a verdict with evidence (live-executed).
- Any defect fixed has a regression test; any by-design verdict has an ADR proposal + operator pause.
- Universal phase-gate AC (verification green, tests for new behaviour, ids stamped, DEFERRALS rows for unverifiable, ADRs for owned decisions, BUILD_INDEX + LEDGER advance, operating clauses).

## Plan

1. Open the IAP tunnel to prod AlloyDB (system-role `postgres` DSN), `BEGIN READ ONLY` sessions.
2. D-SLO.1-5: `run_events`/`run_events_internal`/steps reads for the two named runs → classify `phase_blocked` and `cap_reached`; cap-death classification proposal (likely an agent-drafted ADR — denominator semantics are operator-only).
3. D-SLO.1-7: per-attempt `usage_records` per-phase rows for the four (run,attempt)s → model-call shape vs metering defect.
4. D-SLO.1-8: `fetch_log` deny rows (url/status/deny_reason) for the window vs `authorRunAllowlist` (`ANTHROPIC_PROBE_ENDPOINT` exists — is `/api/hello` still denied? when did the F7 fix deploy?) and the `?beta=true` path handling.
5. `balance_divergence`: `assertBalances` re-run on prod + credit_ledger reads for the six accounts → test-tenant soak vs real defect.
6. D-STB.5b-1: `pg_roles` probe + meter sums on the system DSN.
7. Reports under `docs/build/reports/2026-10-21_R6FOR.1/`; dated DEFERRALS verdict notes; ADR(s) if needed.

## Test matrix

- No new runtime behaviour expected except possibly a small defect fix; if a fix lands it gets a colocated `*.test.ts` regression test that fails on the pre-fix code.
- Any ADR → `build-memory adr-index` regeneration.
- Green gate: `pnpm turbo build lint typecheck` + `pnpm test` + `check-build-memory.sh .` + `check-append-only.mjs --base 7c9dc5e`.

## Progress

- 2026-10-21T15:02Z — branch cut at `7c9dc5e`; spec/DEFERRALS/LEDGER/ADR-093/slo-review.md read; anchors re-confirmed (`slo.ts`, `spend-guard.ts`, `allowlist.ts`, `assertion.ts`, `billing-jobs.ts`, egress-proxy `handler.ts`/`server.ts`, run-task `research-preflight.ts`). Anchor notes:
  - `isEndpointAllowed` prefix-matches `req.path` **including the query string** (`server.ts:101`); `/v1/messages?beta=true` startsWith `/v1/` → endpoint check admits it — denials on that URL must carry a non-allowlist `deny_reason`.
  - `ANTHROPIC_PROBE_ENDPOINT {api.anthropic.com,/api/hello}` is already authored into every run allowlist (STB.3 F7) — `api/hello` denies may predate the fix's deploy or be another denial class.
  - `assertBalances` folds `balanceEffect` over `credit_ledger`; `expectedHeld=-3860` means debits+releases exceeded holds by 3860 cr on the `included` bucket while the counter reads 0 — orphan debits with no hold.
  - `run_success_rate` denominator counts completed + failed + system-cancelled, excludes user-side cancel reasons only (`stop/declined/expired/cancel_to_edit`) and drops `unverified` from the numerator; `cap_reached` currently counts as platform failure.

## Gap table

| requirement / AC | verdict | evidence |
|---|---|---|
| REQ-FOR-1 — D-SLO.1-5 verdicts on the two named runs | met | `01M3EGS55…` `phase_blocked` = skill-contract honest block (`skills/research-burst/SKILL.md:63`; hold 765 fully released, $0 charged); `01M3EW0EQJ…` `cap_reached` = requester-set `budget.credits=5` below the §7.1 40-cr ceiling (`chat-routes.ts:476`, `turn.ts:46`), 3 `cap` 402s, settle = release 5 + absorbed 16. Report §D-SLO.1-5. |
| REQ-FOR-1 — cap-death classification proposal | met | **ADR-119** (`docs/adr/ADR-119-cap-death-attribution-slo-denominator.md`) — Proposed, **approved: no**, operator decision owed; `slo.ts` semantics untouched. Denominator/target semantics unchanged per the ticket's pause clause. |
| REQ-FOR-1 — D-SLO.1-7 attribution (model-call shape vs metering defect) | met | per-attempt `usage_records` reads: token parity between `source='proxy'` and `sdk_estimate` on all 4 attempts; >5% gaps trace to search/fetch surcharge granularity (att.2 of `01M3EAA…`: proxy 8 searches vs estimate 1; `01M3SK…` att.2: 28+28 over 123 calls vs 2 fetches). Verdict: model-call/tool-call shape, not a metering defect. Report §D-SLO.1-7. |
| REQ-FOR-1 — D-SLO.1-8 canary source vs denials | met | `api/hello` = intentional SDK connectivity probe (`ANTHROPIC_PROBE_ENDPOINT`, allowlist.ts); 128 allowlist denies 09-22→09-26 09:29Z all pre-date the F7 deploy (~12:38Z, `fafab458`) — zero endpoint denies since. `?beta=true` never failed the endpoint check — 29 `cap` + 4 `model` denies. Report §D-SLO.1-8. |
| REQ-FOR-2 — `balance_divergence` classification | met | REAL defect (was launch-blocking): all six `is_test` accounts carry the SPA.22 `journey-report-seed` `grant+debit` pair with no `hold`; `balanceEffect('debit')` consumes `held` only → fold reads avail=+3860/held=−3860 vs 0/0. Fixed in-branch (small): `seedDeliveredRunReport` grant→hold→debit + fold-invariant regression test (`showcase.test.ts`). Prod rows = test-tenant fixture contamination; no prod write. Report §balance_divergence. |
| REQ-FOR-3 — weekly-guard live re-proof on system DSN, $0 | met | `pg_roles`: `postgres` → `rolsuper=false, rolbypassrls=true` (probe PASSES — pool not RLS-blind); guard-shaped meter (`source='proxy'`, `is_test`, `provider_request_id not like 'req_jrn_%'`, 7d): **0 rows / $0.0000** (all 30 in-window proxy rows carry `req_jrn_` → REQ-ECON-6 excluded). Report §D-STB.5b-1. |
| defect → fix + regression test | met | two defects fixed: (a) seed ledger chain (`showcase.ts` + fold-invariant test); (b) `isModelAllowed` family-prefix vs dated ids (`credential.ts` + 6-case regression test) — live `model … not on run allowlist` denies on 3 base-tier review runs. |
| committed reports, aggregates/run-ids only | met | `docs/build/reports/2026-10-21_R6FOR.1/prod-forensics.md` — no PII, aggregates + run ids. |
| dated verdict notes on touched deferral rows | met | DEFERRALS.md dated notes appended to D-SLO.1-5/-7/-8 + D-STB.5b-1; LEDGER OPEN FINDINGS note on `balance_divergence`. Weekly-window rereads stay owed to R6WATCH.1. |
| read-only prod, tunnel closed, $0 spend, no `--send` | met | IAP tunnel → `postgres` system DSN, SELECT-only session queries, tunnel closed after reads; zero mutations, zero spend. |
| SLO denominator/target unchanged | met | no `slo.ts` or ops-config edit; the only semantics artifact is the proposed-not-adopted ADR. |
| ~350 changed lines | met (over by ~15) | ~365 lines excl. the pre-existing untracked digest file; measured at commit. |
| universal phase-gate AC | met | green gate + checks below; ids stamped; ADR-119 for the owned decision; BUILD_INDEX/LEDGER advance lands in closeout. |

## Evidence log

- `pnpm turbo build lint typecheck` → **135/135 tasks OK** (96 cached).
- `pnpm test` → **507 files, 5,966 tests passed** (4 skipped) — incl. new `credential.test.ts` family-prefix cases + `showcase.test.ts` fold-invariant.
- `pnpm check:licenses` OK (822 pkgs) · `check:protocol-markers` OK · `check:no-cookies` OK · `check:spa-budget` OK · `check:spa-env` OK · `check:dom-contract` OK.
- `adr-index.sh docs/adr` regenerated `docs/adr/README.md` (+1 row, ADR-119).
- Live reads (prod, `postgres` system role, SELECT-only, 2026-10-21): `pg_roles` rolbypassrls=true; guard-shaped 7d meter $0.0000/0 rows; `fetch_log` deny census (128 api/hello endpoint denies ≤09:29Z; 29 `cap` + 4 `model` on `?beta=true`); `credit_ledger` for both named runs + the six divergent accounts; per-attempt `usage_records` token/cost/tool aggregates. Tunnel closed.

## Evidence report

See `docs/build/reports/2026-10-21_R6FOR.1/prod-forensics.md` (committed, aggregates + run ids only).

**Verdicts.** D-SLO.1-5: both named failures are by-design terminal outcomes (honest-block + consented-cap), not platform defects — ADR-119 proposes the denominator re-attribution (Proposed, approved: no). D-SLO.1-7: model-call/tool-call shape, token parity — not a metering defect. D-SLO.1-8: `api/hello` intentional probe; pre-F7 allowlist gap fixed in prod since 09-26 12:38Z; `?beta=true` denials are `cap`/`model` checks, never endpoint. `balance_divergence`: real seed-side ledger defect (was launch-blocking) — fixed + regression-tested; prod rows are test-tenant fixture contamination. D-STB.5b-1: PASS — probe admits the system role, meter reads $0.

**Self-review (two passes).** P1 — each diff hunk re-read: `isModelAllowed` lowercases both sides and requires the `-` boundary (no `claude-haiku-4-5x` admit; a request shorter than the family still denies); the seed hold carries `source='hold'` + run_id matching the live hold shape; the test's SQL fold mirrors `balanceEffect` deltas exactly (grant/release/refund +avail; hold/expire −avail; hold +held; debit/release −held; debit doesn't touch avail). P2 — gap table cross-checked against the ticket's named items; no SLO code touched; ADR-119 flagged proposed/not-adopted in the ADR itself, the report, the deferral notes, and the PR body.

**Deviations.** (1) `isModelAllowed` defect was found inside the D-SLO.1-8 forensic scope and fixed — it widens the model allowlist to family-prefix semantics the allowlists were authored for; strictly more permissive within a priced family, never across families. (2) ADR-119 is an agent proposal carrying `approved: no` — the ticket's mid-run pause is unavailable to a subagent, so the ADR + prominent flagging substitute per the task brief. (3) ~365 changed lines vs ~350 (docs-heavy: report + ADR + notes).

**Spend:** $0 (read-only forensic queries; no `--send`, no paid legs, no inference).
