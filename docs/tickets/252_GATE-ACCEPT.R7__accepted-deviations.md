# GATE-ACCEPT.R7 — Round-7 accepted-deviations sign-off

- **Sequence:** 252 of 254 · **Phase:** round 7 (R7b — tail) · **Kind:** gate
- **Depends on:** 251_R7CAP.1, which drafts the list for signature in
  `docs/build/CAPSTONE_CLOSURE.md` § R7.
- **Blocks:**
  - 253_R7REC.1 and 254_R7DOC.1, which assume signed deviations;
  - `projectStatus: DONE` (BM-TAIL-03).
- **Readout:** `docs/build/readouts/GATE-ACCEPT.R7.md` (from `templates/READOUT.md`)
- **Gate status:** [ ] the operator's signature. Never pre-answered, never ticked by an agent.
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** the readout only

> **Milestone gate — NOT an `implement-spec` input.** The chain STOPS here until the operator
> dispositions the round-7 list. Never guessed past. An operator or authorized human record supplies
> the decision; an agent must not sign, and must not assume silence is approval.

## Criterion (verbatim from the spec)
- §4.18: "`REQ-CLOSE-2`: GATE-ACCEPT.R7. The operator signs; GD-DEPLOY.R7 expires."
- §3.1, on `GD-DEPLOY.R7`: "Expires at GATE-ACCEPT.R7; merges remain the operator's."

The operator reads R7CAP.1's list for signature:
- (a) proposed accepted deviations;
- (b) scoped-out owed legs;
- (c) waivers requested.

For each row the operator records ACCEPTED, or SEND-BACK plus what would make it acceptable.

**Expected candidates.** R7CAP.1 surfaces these from evidence; none is pre-answered here:
- the S-1 URL-spike fallback, if taken;
- HUMAN-H16 skipped, declined or not dispositioned in 250's preview window;
- REQ-SPEED-5 misses (recorded, not gated);
- a golden re-run classified affecting at 224 or 250 and paused under `GD-GOLDEN.R7`;
- the measured round-7 preview spend against the `GD-PREVIEW.R7` $20 cap;
- any phase-preview Stage-B DEFERRALS row (`GD-PREVIEW.R7`) that 224 / 250 could not close;
- the U6 paid run paused or unrun;
- any D\*/U\* leg owed at the deployed tip;
- the D-P1.17-2 / D-FIX.1-2 interactions;
- any P0/P1 finding carried only by a ruling.

The `GD-UX-P1-BACKLOG.R7` items (R5 G1, the UXC-13 remainder) are already ruled. They are listed for
reference, not for re-signature. So are the Phase-4 rulings `GD-PUBDELTA.R7` (the `/pricing` and
public-copy DACC-6 deltas) and `GD-TOURSIGN.R7` (tour copy approved at 248's merge).

## Requirement IDs
REQ-CLOSE-2 (Phase-4 P4-20: this gate stamps it in its readout and LEDGER row).

## Pre-registered thresholds
- Every row in the § R7 list is either signed ACCEPTED or returned to closure. No proposed row is left
  unsigned.
- Every waiver names an ADR that quotes the operator verbatim and carries a `## Revisit trigger`.
- A scoped acceptance authorizes action. It never raises a verdict: `accepted_scope` set ⇒ the
  verdict is at most MET-ENGINEERED.

## DEFERRALS rule
A round-7-scoped `OPEN` row in `docs/tickets/DEFERRALS.md` blocks this gate if it has no owner and
date, unless the operator signs it here as a deviation (spec §1, "R7b done": "zero round-7-scoped
`OPEN` deferrals that lack an owner and a date"). The GATE-ACCEPT.SPA / R5 precedent applies: rows dispositioned by the
signature stay `OPEN` as tracking items, carrying their unblock conditions.

## Disposition
Recorded only from the operator's own words:
1. **Readout.** The readout (READOUT shape, append-only) carries:
   - the list as presented: agent-drafted, labelled as such, with its sha256;
   - the operator's per-row disposition, verbatim;
   - a `Status:` of PASSED | NOT-PASSABLE (plus what would pass it) | SKIPPED-BY-OPERATOR;
   - the Signature block, appended at signing.
2. **LEDGER.** `orchestrate-build` records the same words, verbatim, in `docs/build/LEDGER.md`
   § GATE DECISIONS `### Round 7` (`kind: decision`), and commits on the chain tip.
3. **Expiry.** At signing, **`GD-DEPLOY.R7`, `GD-UX-PAIDLEG.R7`, `GD-GOLDEN.R7` and
   `GD-PREVIEW.R7` expire** (each row's own "expires: GATE-ACCEPT.R7"). The orchestrator appends a
   dated expiry note for each. From then on, any further round-7 prod deploy, paid run, golden
   re-run or owned preview needs a new ruling.

- [ ] *(live-read)* The readout cites the live state it describes: the CI read of every open PR in
      the stack (`ci-boundary.sh --stack --no-wait` output with its `read_at` — BM-CI-01); and,
      because the build has a production surface, a probe-run record (id, `date -u`, result,
      sha256) no older than 24 h at the commit. A statement about production state with no such
      citation is removed, not written.
