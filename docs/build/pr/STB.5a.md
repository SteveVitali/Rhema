# STB.5a — Headless live legs: the owed BL-21/BL-22 browser legs on test tenants

Ticket: `docs/tickets/84_STB.5a__headless-live-legs.md` · run ledger: `docs/build/runs/STB.5a.md`
Stacks on `stevevitali/econ-2-cogs-reduction` (PR #105, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> A **$0-inference evidence ticket**: every browser/live obligation six older
> deferral rows were waiting on is now a **permanent journey step**
> (`packages/journeys`, owner `STB.5a`), and the $0 legs ran for real in
> headless browsers against production test tenants — provenance-matched to
> the deployed `b909fe9a` build, `usage_records` metered $0. Two of those
> legs **exposed real production defects**; per the ticket's defect rule
> they are filed as `D-STB.5a-n` rows, **not fixed**. No inference run was
> launched and no product code changed.

## What landed (journey harness only)

- **`packages/journeys/src/stb5a.ts`** — T1–T16 step implementations.
  Nightly $0 legs: **T1** seeded-Showcase dossier (7 D-PRB.04-1 parts),
  **T2** Inbox badge + notification matrix, **T3** account-zip round trip
  (in-app download + emailed token link + fresh-account import + dedupe +
  REQ-ARCH-33 scan), **T4** CSL-JSON → citeproc export, **T5** Substack
  export ingestion + AC-I-A re-sync, **T6** soft-delete → restore window,
  **T7** `project.purge` job row, **T8** export-token gate. Weekly paid
  riders (registered, not run here): **T9–T16** (quiet-hours arming,
  own-tenant delivered Review surfaces, deferred-inbox asserts).
- **`stb5a-helpers.ts`** — committed Substack export-zip fixture, CSL
  bibliography fixture, marker scan, quiet-window arithmetic.
- **`impls.ts`** — merged dispatch (`STEP_IMPLS` + `STB5A_IMPLS`).
- **`registry.ts` / `registry.test.ts`** — T1–T16 rows ordered inside the
  weekly sequence; T3 flipped expected-red on the live defects it exposed.
- **`session.ts`** — the mint diagnostic (page `[role="alert"]` on a refused
  signup) + a bounded throttle-aware resubmit: prod's per-IP magic-link
  limiter is a token bucket (refusal → acceptance ~60 s later, observed
  live), so the mint waits ~75 s and retries instead of dying mid-run.
- **`docs/adr/ADR-088-…`** — nightly-$0 vs weekly-paid cadence; the rule for
  clock legs a 26-h test-tenant lifecycle can never reach (7-day token
  expiry, 30-day purge fire): record **owed**, never fabricate.

## Live results — canonical run nonce `8c74704271d7` (2026-10-04)

`docs/build/reports/STB.5a/` — `report.json` (`passed: true`), T1–T8 PNGs,
provenance match api+web `b909fe9a`, `weeklyMeteredUsd: 0` ≤ $5.

| leg | outcome |
|---|---|
| T1, T2, T4, T5, T6 | **PASS** |
| T3 | owed — collects **both** live defects in one run |
| T7 | owed — `42501` on `pgboss.job` (read-path gap) |
| T8 | owed — gate verified (bogus token 404); 410 half clock-unreachable |

## Defects the live legs exposed (filed, not fixed)

- **D-STB.5a-1** — the emailed account-export token link 404s for every
  valid token: the anonymous `/export/download` lookup runs on the raw
  `rhema_app_login` pool with no tenant GUC against FORCE-RLS
  `account_exports`. Proven both directions live (scoped row exists,
  unscoped sees zero) + the real Gmail leg fetched the link → 404.
- **D-STB.5a-2** — `POST /account/import` 500s for every real import: the
  seeded `showcase` slug collides, `on conflict do nothing` skips the row,
  its mapped `prj_imp_*` id orphans the showcase's artifacts →
  `artifacts_project_id_fkey`. Reproduced live + in a rolled-back tenant tx.
- **D-STB.5a-3** — `pgboss.job` is unreachable by the user-serving role →
  T7's queued-job read needs a system-scoped DSN or a bounded grant.

## DEFERRALS

Six source rows appended (dated, append-only): `D-P1.07-1`, `D-PRB.04-1`
(T10–T13 registered — owed on the weekly paid rider's delivered Review),
`D-P1.18-1` (T4 DONE; T3 ran → the two defects; 7-day expiry clock-owed),
`D-P1.19-1` (T9/T14 registered; gate legs unchanged), `D-P1.15-1` (**T5
PASS — AC-I-A discharged live**), `D-P1.04-2` (T6 live-verified; T7 owed on
D-STB.5a-3). New rows: `D-STB.5a-1..3` (all OPEN).

## Evidence (deterministic)

- `pnpm test` — 446 files / 4,512 pass / 4 skip / 0 fail.
- `pnpm turbo lint typecheck` (journeys) green; `check:protocol-markers`
  clean; `check-build-memory.sh` clean.
- No product code touched: the diff is `packages/journeys` + docs +
  `scripts`-adjacent evidence runners only.

## Spend

**$0 inference.** No run launched; journey legs are reads/forms/syncs.
Round-3 cumulative unchanged.
