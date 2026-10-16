<!--
  docs/build/readouts/GATE-R5F.md (BM-INDEX-03) — append-only gate readout for the round-5
  marker 166_GATE-R5F__funded-window.md. Operator disposition of the funded-window-open
  checklist (spec §5.5 verbatim).
-->
# GATE-R5F — Funded-window open (post-regime) — readout

- **Criterion (verbatim, `166_GATE-R5F__funded-window.md`, from spec §5.5):** "System-role DSN
  + `pg_roles` probe → cumulative < re-authorized round cap (⚑ Q-ECON.f) → `--headroom`
  required → per-leg enforcement → ordering T9 → launchers → riders → B19C
  last-and-conditional → `JOURNEY_FUNDED_STABLE_TAG` tenant + purge exemption → REQ-ECON-6
  exclusions live first. Estimated window cost with levers: ~$20–40" — and the
  consumed-against figure: $145.95 measured against the stale $150 bound on the OLD
  unfiltered query; the gate re-measures on the pinned scope.

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — 2026-10-16: **PASSED — open the window**

The operator's verbatim disposition (UI selection, Devin session, 2026-10-16T18:5xZ):

> **"PASSED — open the window"**

Presented at the pause with the state below; the operator ruled to open.

## Mechanical checklist state at disposition (orchestrator dry-run)

`node scripts/live/funded-window.mjs --stage prod --dry-run --headroom 20` — 5/9 rows pass:

| row | state | note |
|---|---|---|
| `dsn` | FAIL | `JOURNEY_DATABASE_URL` unset — the system-role DSN binds over the IAP tunnel inside the ticket |
| `cumulative` | FAIL | unmeasured until `dsn` passes (pinned scope since 2026-10-01) |
| `headroom` | FAIL | $20 declared vs **$54.50** required by the summed `capUsd` of all 21 selected paid legs |
| `tenant` | FAIL | `JOURNEY_FUNDED_STABLE_TAG` unset — seeded + purge-exempt inside the ticket (`funded-tenant.mjs`) |
| `caps` | PASS | every selected paid leg declares `capUsd`; the `CapOverrunError` probe fires |
| `ordering` | PASS | T9 → launchers → riders → B19C last-and-conditional (full 67-step order emitted) |
| `exclusions` | PASS | REQ-ECON-6 `req_jrn_` seed exclusions live in `FLAGGED_PROXY_SPEND_SCOPE` |
| `optouts` | PASS | `testCheapRoute` live; B19C/N6/R4 pinned OFF |
| `unpaused` | PASS | no `funded-pause.json` sentinel |

**Reading (orchestrator, labelled):** the four FAIL rows are environment bindings + the
measured cumulative — the driver re-evaluates every row at *each* dispatch and fails closed,
so a PASSED disposition authorizes the window but never overrides the mechanical guard: if
the pinned-scope cumulative measures ≥ ~$60 (the Q-ECON.f re-authorized cap) when the
system-role DSN binds, every dispatch refuses and the finding is reported, not spent past.

## DEFERRALS rule — disposition

The contract refuses the gate while any `OPEN` row in `DEFERRALS.md` scoped to this phase
remains. Per the GATE-ACCEPT.SPA precedent (2026-10-10: "they stay OPEN as tracking items
carrying unblock conditions, not gate-blocking"), the PASSED disposition dispositions the
round-5-scoped OPEN rows:

- The funded legs' own carrier rows (`D-STB.5b-*`, `D-ECON.*`, `D-CITE.1-*`, the paid-journey
  suite rows) are the window's **content** — they close inside it or stay honestly owed.
- Posture/ops rows with named carriers stay OPEN as tracking items: `D-FIX.1-1..4`,
  `D-R5OPS.1-1/-2`, `D-BL38.1-1/-2`, `D-COST.1-1..3`, `D-OPS.1-1/-3`, `D-OPS.2-1`,
  `D-SLO.1-5..8`, the `D-SPA.*-1` preview/live residuals (VERIF.2's owed legs — N8/
  R10.keepalive → `D-SPA.24-1` domains-bearing stage, N9 → `D-SPA.16-1`/`D-SPA.20-1`
  stripe-bearing stage, T8 → `D-FIX.1-1`, `D-OPS.1-1`/`D-SPA.6-1` residuals).

## Consequences

- `nextTicket → FUNDED.1` (row 167) — the skeleton expands at run time
  (`decompose-spec mode=extend`) on this disposition: the 21 `paid:true` registry legs in
  checklist order + the §5.6 census items, against the ~$60 envelope (~$20–40 estimated with
  levers; $54.50 summed `capUsd` headroom needed for the full wave — per-dispatch
  `--headroom` must cover each selected subset's summed caps).
- The window's env prerequisites bind inside the ticket: the system-role
  `JOURNEY_DATABASE_URL` over the IAP tunnel (every measured row fails closed without it)
  and `JOURNEY_FUNDED_STABLE_TAG` via `funded-tenant.mjs` (tenant provisioning is named in
  FUNDED.1's `Production mutations:` line).
- `projectStatus` stays IN_PROGRESS; `mergePolicy: OPERATOR` unchanged.

## Signature

- **Decision (verbatim):** "PASSED — open the window" — operator UI selection,
  Devin session, received 2026-10-16T18:5xZ (orchestrate-build gate question).
- **Recorded by:** devin-desktop/swe-2-high/subagent (orchestrator) — the operator's own
  words; no proxy signature entered.
