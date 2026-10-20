# ADR-093: The weekly paid-journey spend guard fails closed on an RLS-blind pool

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-SPEC-32, REQ-SPEC-30
- **Spec:** §14.1, §13.5

## Context

D-STB.5b-1: `checkWeeklySpendCap` sums `usage_records.list_cost_usd` for `is_test` workspaces over
the current ISO week — but `usage_records` is RLS deny-by-default, so bound to the app-serving
role the guard measured **$0 vs the true $58.08** (live, 2026-10-04) and would dispatch any
`--paid` run past the $5 cap.

## Decision

`checkWeeklySpendCap(deps)` accepts an optional `pool`/`execute` DB seam (a system-capable
`pg.Pool`). Before the meter query it probes `pg_roles` for `rolsuper OR rolbypassrls`; a pool
bound to a non-bypassing role — or no pool at all — returns `withinCap:false` with
`weeklyMeteredUsd:null` and a reason naming the system-DSN binding. The meter query is never
issued under an untrusted role, and refusal triggers at `>=` the cap (the boundary is refused).
`packages/journeys/src/cli.ts` binds `JOURNEY_DATABASE_URL` to a `pg.Pool` for paid dispatch.

## Consequences

- An RLS-blind binding can never greenlight a paid leg: the failure mode flips from silent-$0 to
  refusal-with-reason; the operator must provide a system DSN for measured dispatch.
- `weeklyMeteredUsd:null` + `withinCap:false` is the "no measurement" shape — callers attesting
  "fresh week" must pass an explicit `callerAttestsFreshWeek` override, recorded in the result.

## Alternatives considered

- Treat a zero-row read as a refusal unconditionally: a genuinely-fresh week IS zero rows —
  conflates empty with blind; rejected in favour of role inspection.
- Document the DSN requirement only: was the status quo — that's what produced the silent pass.

## Revisit trigger

Reopen if a reporting role gains bounded `usage_records` visibility (the probe changes to
"role can read the table"), or the guard moves into infra (Pulumi-composed DSN).

## Addendum — 2026-10-20 (R6ENG.1 / REQ-ENG-5 — the binding convention, stated at both read points)

The convention this decision produced — **`JOURNEY_DATABASE_URL` is always the system-role
DSN** (an elevated `rolsuper OR rolbypassrls` role reached over the IAP tunnel; never the
app-login `app-database-url`, whose FORCE-RLS bind reads `usage_records` as $0 and would
greenlight an unmeasured week) — is now written where a reader actually looks:

- `packages/journeys/README.md` § "Spend guards — the system-DSN convention" (BL-72) — the
  operational text: both guards probe `pg_roles` before the meter query, a blind pool refuses,
  and the scheduled cron is the one self-bounding exception.
- `infra/PROD-BRINGUP.md` §2 — the runbook's DSN/secrets surface names the operator-local
  `JOURNEY_DATABASE_URL` and points back here (it is operator env, never a `rhema:*` config
  key, so it was never covered by the completeness gate).

The guard behavior was verified live on 2026-10-06 (D-CAP.3-1: a system-role bind measured the
real week; a blind app-role bind refused before the meter query issued). The live two-role
re-proof on the current head remains R6FOR.1's — `D-STB.5b-1` stays PARTIAL until that run
records; this addendum changes no decision, only where the convention is read.
