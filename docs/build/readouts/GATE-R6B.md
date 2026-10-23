<!--
  docs/build/readouts/GATE-R6B.md (BM-INDEX-03) — append-only gate readout for the round-6
  marker 190b_GATE-R6B__funded-window-reopen.md. Operator disposition of the funded-window
  re-open criterion (spec §6 verbatim).
-->
# GATE-R6B — Funded window re-open (round 6) — readout

Status: SKIPPED-BY-OPERATOR   <!-- the ONLY line that may change: → SIGNED | PASSED | SKIPPED-BY-OPERATOR | NOT-PASSABLE -->

- **Criterion (verbatim, `190b_GATE-R6B__funded-window-reopen.md`, from `docs/round-6-draft-spec.md` §6):**
  "Funded window open — envelope ~$150 pinned-scope (ruled) with the cumulative measured < cap and ≥
  the declared remaining caps + the Showcase run estimate; dry-run 9/9; deployed-tip provenance;
  tenant + DSN; REQ-ENG-3 landed."

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — 2026-10-23: **STAYS CLOSED — the wave parks**

The operator's verbatim words (Devin session, received ≤ 2026-10-23T03:01Z):

> **"okay, sounds good, let's do what you recommend, and then please proceed"**

…in reply to the presented recommendation: *"disposition GATE-R6B as 'stays closed' — the wave
parks, REQ-DISC-1 rides to GATE-LAUNCH under threshold-11's refusal arm, and if you want the
coverage you can always re-rule a narrower envelope at the launch candidate SHA."* The
recommendation was presented with the full cost picture: headroom ≈ $69 (measured $80.86 of the
~$150 envelope) vs declared caps $54.50 + the Showcase estimate; a narrow re-open (~$10–20) and
the full wave (~$69 headroom) as the two alternatives; and the stale-evidence argument (MERGE-1 +
the launch-flip deploy land later, so paid evidence gathered at `dc7fb15` now partially rots).

Recorded as the operator electing **option A — decline the re-open now**; the ~$150 envelope
ruling (`GD-ENV.R6`) stands unexecuted and unchanged — it authorizes, it does not obligate.

## Mechanical checklist state at disposition (orchestrator read)

| row | state | note |
|---|---|---|
| envelope | ruled | `GD-ENV.R6` ~$150 pinned-scope lifetime; $80.86 measured 2026-10-16 → ~$69 headroom |
| REQ-ENG-3 | landed + deployed | prod serves `dc7fb15` (R6DEP.1 provenance all-PASS) |
| cumulative < cap | measurable-pass | $80.86 < ~$150 on the last system-role read |
| headroom ≥ caps | pass vs $54.50 + Showcase est | ~$69 available |
| dry-run 9/9 | **not run** | no `--dry-run` executed — the window is not being opened; the nine-row check runs at any future re-open |
| deployed-tip provenance | PASS at `dc7fb15` | (R6DEP.1) |
| tenant + DSN | unbound | `JOURNEY_FUNDED_STABLE_TAG`/`funded-tenant.mjs` + system-role `JOURNEY_DATABASE_URL` bind inside a funded ticket, if one ever dispatches |

## Consequences (recorded, not guessed)

- `191_R6FND.1`, `192_R6FND.2`, `193_R6FND.3` — **cannot dispatch**: their `Depends on:` is
  "190b_GATE-R6B (PASSED)". REQ-DISC-1 is carried as a **refused-wave disposition** to
  GATE-LAUNCH's pre-registered threshold (11): "REQ-DISC-1 is complete or its refusal is
  dispositioned." The operator's words above are the refusal disposition on record.
- `D-CAP.2-1` and every carrier row of the wave stay **OPEN** with a dated note — nothing flips
  to waived; the wave remains owed unless the operator rules otherwise at or before GATE-LAUNCH.
- The standing fail-closed machinery stays proven-but-dormant: the bind refusal at $80.86 ≥ ~$60
  (2026-10-16) is the last live exercise; `$0` spent in this disposition.
- Re-open path preserved: a fresh operator ruling at the launch-candidate SHA can re-present this
  gate (narrow or full envelope); the dry-run + env bindings execute then, not now.
- `194_R6CNT.2`'s paid Full-board Showcase run "spends the headroom GATE-R6B reserved for it" —
  with the window closed, that funding source is absent; R6CNT.2's own gate cell makes it PAUSE
  if its estimate exceeds remaining headroom ($0). Its funding question is the operator's when
  the ticket dispatches (H11's picks unblock it first).
- `nextTicket → R6CNT.2` (row 194) — held on HUMAN-H11 content: the marker withholds every
  deliverable until the operator's session-2 approvals land.

## Signature

- **Decision (verbatim):** "okay, sounds good, let's do what you recommend, and then please
  proceed" — operator, Devin session, received ≤ 2026-10-23T03:01Z, approving the presented
  "stays closed" disposition (option A).
- **Recorded by:** devin-desktop/swe-2-high (orchestrator) — the operator's own words; no proxy
  signature entered.
