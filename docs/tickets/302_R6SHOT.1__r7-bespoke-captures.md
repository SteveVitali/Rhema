# 302_R6SHOT.1 — round-7 bespoke-capture burn-down (BL-104)

**Status:** in progress (read-only deployed-tip walk; evidence + dated DEFERRALS discharges on this PR — OPERATOR)
**Class:** run-time insert — BL-104 capture bundle (253_R7REC.1 sweep carrier; post-launch verification closure)
**Base:** `main` @ `cfad721c` (post-#388; deployed prod tip `73902381`, provenance PASS both origins)
**Branch:** `stevevitali/r6shot-1-r7-captures`

## Scope

Discharge the agent-dischargeable arms of the ~32 BL-104 bespoke-capture legs by a **read-only
$0 deployed-tip walk** at prod `73902381` — the row's own unblock clause ("post-round Stage-B
walk (deployed tip) or the HUMAN-H8 browser session") authorizes this mechanism; the HUMAN-H8
alternative stays open to the operator for any leg this walk cannot reach honestly.

Three tranches:

- **A — public demo surfaces** (no auth): `D-R7DEM.4-1`, `D-R7DEM.4b-1`, `D-R7DEM.5-1`,
  `D-R7DEM.5b-1`, `D-R7DEM.6a-1`, `D-R7DEM.6b-1` (the `demo_events` insert-census arm reads the
  DB over the IAP tunnel — a query, not a browser leg).
- **B — signed-in read-only renders** (jrn-a `is_test` workspace `01M7N3N8NTAC1873ZZQWFQWAG6`,
  session via the real magic-link path): `D-R7SHELL.1a/1b/1c/2-1`, `D-R7TALK.1a-1/1a-2/1b-1`,
  `D-R7HOME.1-1/2a-1/2b-1`, `D-R7WRITE.1a-1/1b-1/2-1`, `D-R7KIT.3a/3a2/3b/3c2/3d/3e/3f-1`,
  `D-R7COPY.0-1/1b-1/1c-1`, `D-R7RO.2-1`, `D-R7RELOAD.1-1`, `D-R7KIT.1-1` (dark/light theme
  capture + computed-style probe).
- **C — out of scope this walk (stays OPEN on the row):** legs needing a manufactured app state
  or paid act — mid-run gate card, insufficient-funds arm/paywall, tour-per-step on an
  already-onboarded account — carried back to BL-104 with a dated note.

Also owed here: a dated progress note on `D-R7DEP.2-2` — the 2026-11-17 prod walk shows
N1/N3 no longer hit F-15's `ERR_TOO_MANY_REDIRECTS` (they reach the RH-32 interstitial); the
current red is the confirm-click harness gap `F-R6DEP.5-3`, a different mechanism.

## Non-goals

- BL-105's operator-owned arms (`D-R7DEP.2-1` paid U6 re-dispatch ruling; F-17 unfundable
  journey identity) — no ticket can delegate those.
- Any paid run, write, or app-state mutation; any preview stack (read-only walk, per the row).

## Evidence shape

`docs/build/reports/2026-11-17_302_R6SHOT.1/<leg>/` — screenshots + probe outputs at
`--expect-sha 73902381`; per-row dated discharges on DEFERRALS; run ledger
`docs/build/runs/R6SHOT.1.md`; BL-104 status note appended (not rewritten) in BACKLOG.csv.
