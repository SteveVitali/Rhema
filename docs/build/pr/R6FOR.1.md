# R6FOR.1 — Prod forensics: named-red SLOs, `balance_divergence`, weekly-guard live read (REQ-FOR-1/2/3)

Stacked on `stevevitali/r6mny-1-money-flip-readiness` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Spec:
`docs/tickets/182_R6FOR.1__prod-forensics.md` (manifest row 182, round 6;
`docs/round-6-draft-spec.md` §4.3 REQ-FOR-1/2/3). All production access was
**read-only** — `postgres` (system role) over the IAP tunnel, SELECT-only, tunnel
closed after; **$0 spend, no `--send`, no mutations.** Committed report:
`docs/build/reports/2026-10-21_R6FOR.1/prod-forensics.md` (aggregates + run ids
only, no PII).

**Requirement ids stamped:** REQ-FOR-1, REQ-FOR-2, REQ-FOR-3

## Verdicts

- **D-SLO.1-5** — both named failures are **by-design terminal outcomes, not
  platform defects**: `01M3EGS55…` `phase_blocked` is the research-burst skill's
  contract honest-block (question undecomposable → `{"status":"blocked"}`, never
  silently proceeds; hold 765 fully released — user charged $0);
  `01M3EW0EQJ…` `cap_reached` tripped a **requester-set 5-credit cap** below the
  §7.1 40-cr ceiling (3 `cap` 402s; settle = release 5 + absorbed 16 — user
  charged $0). Cap-death/honest-block classification drafted as **ADR-119
  (Proposed, `approved: no` — operator decision owed)**; `slo.ts` semantics
  untouched.
- **D-SLO.1-7** — all four >5% divergent attempts show **token parity** between
  `proxy` rows and `sdk_estimate` roll-ups; the gap is search/fetch surcharge
  granularity (e.g. proxy 8 searches vs estimate 1; 28+28 tool calls over 123
  rows vs 2 fetches). **Model-call shape, not a metering defect.**
- **D-SLO.1-8** — `api/hello` is the **intentional SDK connectivity probe**;
  its 128 allowlist denies all pre-date the F7 deploy (~2026-09-26 12:38Z,
  `fafab458`) — zero endpoint denies since. `?beta=true` was never an endpoint
  denial — its denials are `cap` (29) + `model` (4).
- **`balance_divergence`** — **REAL defect (was launch-blocking)**: all six
  `is_test` accounts carry the SPA.22 seed's `grant+debit` pair with no `hold`;
  `balanceEffect('debit')` consumes `held` only → fold avail=+3860/held=−3860 vs
  0/0. **Fixed in-branch** + fold-invariant regression test; the six prod rows
  are test-tenant fixture contamination (no user funds, no prod write).
- **D-STB.5b-1 / REQ-FOR-3** — **PASS**: `pg_roles` → `rolbypassrls=true` (the
  guard's bound-role probe admits the system DSN); the guard-shaped weekly meter
  reads **$0.0000 / 0 rows** (all in-window proxy rows carry `req_jrn_` →
  REQ-ECON-6 excluded).

## Changes

- `packages/db/src/seed/showcase.ts` — `seedDeliveredRunReport` writes
  grant→**hold**→debit (the fold-valid chain); `showcase.test.ts` asserts the
  three rows + the `Σ ledger` fold invariant (avail=0, held=0).
- `apps/egress-proxy/src/credential.ts` — `isModelAllowed` family-prefix match
  (allowlists carry `MODELS_BY_TIER` family names; seats send dated ids —
  the live `model … not on run allowlist` denies on 3 review runs);
  `credential.test.ts` +6 cases incl. dash-boundary spoofing.
- `docs/adr/ADR-119-*` + regenerated `docs/adr/README.md`.
- `docs/build/reports/2026-10-21_R6FOR.1/prod-forensics.md`.
- `docs/tickets/DEFERRALS.md` — dated verdict notes on D-SLO.1-5/-7/-8 +
  D-STB.5b-1 (rows stay OPEN; weekly-window rereads ride R6WATCH.1).
- `docs/build/LEDGER.md` — `balance_divergence` finding annotated with the
  classification.

## ⚠ Operator decision owed — ADR-119 (SLO denominator semantics)

ADR-119 proposes excluding **consented-cap** `cap_reached` deaths and
contract-correct `phase_blocked` verdicts from the `run_success_rate` failure
numerator (system-derived caps + provider aborts stay platform failures). It is
**Proposed, `approved: no`** — no SLO code/config semantic changed under this
ticket; adoption + implementation belong to a follow-up after the ruling.

## Verification

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` 5,966 passed
(507 files) · `check:licenses` / `check:protocol-markers` / `check:no-cookies` /
`check:spa-budget` / `check:spa-env` / `check:dom-contract` all OK · focused
regressions green (credential 8, showcase 7, handler 41).

Spend: **$0**. ~365 changed lines vs ~350 (docs-heavy: report + ADR + notes).
