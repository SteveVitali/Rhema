# CAP.2 — Capstone composed verification: the whole build run as one unit, honestly recorded

Ticket: `docs/tickets/87_CAP.2__capstone-composed-verification.md` · run ledger: `docs/build/runs/CAP.2.md` · primary artifact: `docs/build/COMPOSED_E2E_REPORT.md`
Stacks on `stevevitali/cap-1-capstone-gap-analysis` (PR #108, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> The composed build was run as one unit and the result recorded truthfully.
> The **deterministic** composed path is fully green — `pnpm test` 448 files /
> **4,552 tests pass / 0 fail**, `turbo build lint typecheck` 135/135. The
> **live** composed suite ran against current production `b909fe9a…` (five
> tickets behind the chain tip — deploy blocked on a Pulumi 401): **18 green /
> 3 owed-with-D-id / 3 fail / 21 paid-skips**, spend $0. Every non-green
> outcome is classified to a `D-*` row — including a **new live defect this
> suite surfaced** (D-CAP.2-3: the phone ≥44 px action-row rule is dead CSS;
> measured 105×25 px). The paid new-visitor journey incl. trial Review was
> refused pre-dispatch by the weekly spend guard ($58.08 ≥ $5 → exit 3, $0
> spent; resume 2026-10-05). The SEC.1 live two-tenant probe passed. The
> calibration report regenerated honestly at **0 admissible** samples.
> Nothing is claimed green that wasn't observed.

## Evidence legs

| leg | command shape | observed signal |
|---|---|---|
| deterministic tree | `pnpm test` | 448 files / 4,552 tests pass · 4 skip · **0 fail** |
| deterministic tree | `pnpm turbo build lint typecheck` | 135/135 green |
| JOURNEY.1 suite vs prod | `rhema-journeys --stage prod --expect-sha b909fe9a… --out docs/build/reports/2026-10-04_CAP.2-journeys` | nonce `1218d1acdedd`; 18 pass / 3 owed / 3 fail / 21 paid-skip; provenance match; $0 |
| SEC.1 probe ($0) | `two-tenant-probe.ts --base-url api.rhema.tools --web-url rhema.tools` | `passed:true`, `findings:[]` — 8 routes × 2 tenants + 2 write probes |
| paid journey | `rhema-journeys --stage prod --paid --steps N5` (system DSN) | `spend guard refused: weekly metered spend $58.08 has reached the $5 cap` → exit 3 pre-browser |
| REQ-SPEC-32(c) | `econ1-harvest.mts` over the IAP tunnel | 198 obs / **0 admissible** (116 no_proxy / 64 not_completed / 18 pre_preset_fix) / 0 reports / 46 cells — defaults stand |

## Step classification (45 registry results)

- **Green:** N1 N2 N2.invite N3 N7 N8 N10 R1 R5 R7 R8 C1 X1 T1 T2 T4 T5 T6
- **Fail → D-id:** N4 + N9 → `D-OBS.1-3` (pre-existing substrate drift — EST.1/ACT.1 sheet-selector reconciliation + BILL.3 stale fixture account; re-confirmed) · P1 → `D-CAP.2-3` (**new defect**, filed not fixed)
- **Owed (expected-red):** T3 → `D-STB.5a-1/-2` · T7 → `D-STB.5a-3` · T8 → `D-P1.18-1`
- **Skipped (paid):** 21 steps → `D-CAP.2-1` (weekly guard; each also carries its own owed row)

## New deferral rows

- **D-CAP.2-1** — all `paid:true` steps + the paid new-visitor journey: weekly guard $58.08 ≥ $5; closes at the ISO reset **Mon 2026-10-05 00:00 UTC** or operator override; system-DSN resume command recorded.
- **D-CAP.2-2** — chain-tip suite: prod still `b909fe9a`; Pulumi Cloud token 401s (operator `pulumi login` → `pulumi up` ×2 → provenance → re-run). Image pins already committed.
- **D-CAP.2-3** — prod defect: `.ide-actions a` `min-height:24px` declared *after* the `<768px` 44 px override at equal specificity → the override is dead at every width; "Edit source" 105×25 px at 390 px. Routed to CAP.3.

Dated re-confirmations appended to `D-OBS.1-3`, `D-ECON.1-3`, `D-CAP.1-1`, `D-CAP.1-2`.

## Honest non-claims

- Not the chain tip — every live signal is `b909fe9a`; "works as a whole at the tip" is unproven until `D-CAP.2-2` closes.
- The paid half (21 steps) never executed; no fabricated green.
- Calibration adoption still zero-admissible (mechanism green, adoption owed).
- A real defect was found in shipped code (D-CAP.2-3) — reported, not fixed per the defect rule.

## Spend

CAP.2 metered: **$0**. Weekly guard untouched ($58.08 unchanged). IAP tunnel closed; sessions/DSNs never committed (`.scratch` gitignored); only flagged throwaway test tenants written.
