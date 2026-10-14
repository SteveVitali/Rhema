# RES.3 — Leg-1a zero-coverage: diagnosed + the fabricated `resultCount: 0` removed

Manifest row 96 (maintenance/defect-investigation) · stacks on
`stevevitali/maint-4-oauth-signin-throttle` @ `b7c7d95` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes — every prod
read was SELECT-only through `funded-query.mjs` (`BEGIN READ ONLY`) over the IAP tunnel.

Implements `docs/tickets/96_RES.3__leg1a-zero-coverage-diagnosis.md`.

## The incident

Leg-1a (`fact_check` `01M48VNKY6F263TCQRVBJ8JRQA`, $8.45) delivered 9/9 `unverifiable`, 0
`claim_sources`, null completeness, auto-refunded 165 cr `platform_fault:zero_coverage`.
FUNDED §B.4's signature evidence was "6 search events returned 0 results." Same-window Leg-3
(`01M48YYS50Z6CNX517RJQXRCJ2`) researched fine — 7/7 covered.

## The mechanism — proven, not guessed

**Not an infra failure.** All six candidate mechanisms are ruled out by surviving telemetry
(run-scoped tables were reaped; `usage_records`/`credit_ledger`/`proxy_allowlists`/`slo_samples`
+ pod logs carry the whole story):

- Credentials minted cleanly ×3 (admit_mint 33–61 ms); allowlists clean (no domain blocks).
- The searches **executed and billed**: attempt 1 metered 12+5 = **17 searches** — exactly the
  run's claim-scaled `searchBudget = 8 + 1×9` — and fetched to exactly `fetchBudget = 48`
  (`12 + 4×9`). The proxy's `ensureServerWebTools` correctly dropped `web_search` once
  `remaining ≤ 0`, then `web_fetch` at 48 — so attempts 2–3 were search-less by design and the
  final exec was fully tool-less (the seat's "no tool reachable" note is literally true there).
- Content flowed: a 313,753-input-token seat call and 25K-token researcher contexts are not
  error stubs.
- The real failure: **the seat never issued a Write for `01-claim-ledger` in four consecutive
  verification execs** (hook log: zero Write calls; each ended `subtype=success`,
  `claimRowCount:0`). Every retry re-researched with a fresh session against the same shrinking
  per-run budget. The fifth exec wrote the honest all-unverifiable ledger per protocol §6.
- The refund is **truthful and correctly scoped**: `settleUnverifiedDelivery` refunded only the
  research-phase debit (97 trial + 10 daily + 58 promo = 165 cr); inventory's 53 cr correctly
  stayed (the funded walk's "Get 53 cr back" residual); the metered burn was absorbed as COGS.
  ADR-021/022/023 hold.

## The contained defect that lands here

`search.performed.resultCount` was **structurally always 0**: the only search path post-P0.15i
is the proxy-injected server `web_search`, whose results ride inline `web_search_tool_result`
blocks and never arrive as `tool_result` — so the mapper's pending-search flush fabricated
`resultCount: 0` for every server search. The whole retained corpus proves it: 5/5 events at `0`
while their runs billed 27–28 searches each (incl. the RES.1 incident's own "test search" row).
Leg-1a's "6 empty search events" were this artifact — six calls that *happened*, misread as six
empty result sets.

- `resultCount` is now **`z.number().int().nullable()`** — `null` means "ran, count unobserved";
  a real empty set still reports `0`.
- `extractSearchResultCount` returns `number | null` (a count-less envelope is unknown, not 0).
- `flush()` emits `resultCount: null` for pending server-side searches — the query stays as
  evidence; the false count is gone.
- 4 regression tests in `mapper.test.ts`; consumers checked (`{query}`-only copy template,
  REQ-IDE-11 exclusion from cards, occurrence-counting in `assistant`).

## Deferred — `D-RES.3-1` + `BL-79`

The architectural half doesn't fit one PR: checkpoint the claim ledger (write the skeleton before
research, update per claim) and add a budget-aware research-retry gate /
`research_budget_exhausted` terminal reason so a run stops burning money once the bound is spent.
Full sketch in `docs/tickets/DEFERRALS.md`.

## Verify

- `vitest packages/engine/src/mapper` — **40/40** · contracts+engine+sse+event-stream — **407/407**
- `pnpm turbo build lint typecheck` — **135/135**
- `check-build-memory.sh .` clean · `check-append-only.mjs --base b7c7d95` clean
- CI (run `37664984330`): `typecheck/lint/unit` ✓ 29m · `contracts` ✓ · `public-safe` ✓ · `images` ✓ —
  `integration` ✗ at `two-uid privsep PRODUCTION-image kernel legs`, **identical to the base
  `b7c7d95` failure** (run `37657627798`, same step, same `setpriv: setresgid failed` /
  bind-mount error) — the GD-MAINT.4-1 runner-environment flake, not this diff.
- Evidence + query list: `docs/build/runs/RES.3.md`
