# HUMAN-H15 — Demo copy sign-off on the R7a phase preview

- **Sequence:** 223a of 254 · **Kind:** human · **Phase:** round 7 (R7a)
- **Depends on:** 219_R7DATA.1 (the real corpus the copy is reviewed against), 222_R7DEM.6a (the
  tour script, entry points and the corpus file:line table), 223_R7DEM.6b (the last R7a code row;
  the hub and notices are complete on its stack). These are the spec §10 dependencies; this row
  points backward only (P4-15/P4-28).
- **Blocks:** 224_R7DEP.1's prod half (Part B). The review happens on the R7a phase preview that
  224 stands up in its Part A; the Part A/Part B pause is **internal to 224** (224 holds its
  preview open and pauses before any Part B act until this row is ticked). This row is not a
  dependency of 224's Part A.
- **Owner:** operator   **Scheduled:** trigger = 224_R7DEP.1 Part A green on the R7a phase preview
  (`GD-PREVIEW.R7`: the only R7a preview), at a SHA carrying 219, 221a, 222 and 223.
- **Withheld until done:**
  - that the demo hub, cards, tour script or notices are approved;
  - any prod deploy of the R7a demo surfaces;
  - any public announcement or link to `rhema.tools/demo`.
- **Gate status:** this marker is the gate; never pre-answered, silence is not approval.
- **Live stage:** none (operator review on 224's preview; the preview's spend is 224's, counted
  against the `GD-PREVIEW.R7` round cap of $20) · **Production mutations:** none · **Size
  budget:** n/a (operator review)
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H15.md` (from `templates/READOUT.md`)

> **Operator work — NOT an `implement-spec` input.** These are actions only the operator can
> take (account registration, procurement, outreach, a credential). An operator or authorized
> human record supplies the decision; an agent must not sign or assume silence is approval.
> Code tickets may proceed past this row only by opening D-rows that cite it and name the claims
> they withhold. The row itself is never skipped by default. Deferring it again needs the
> operator's explicit words: keep with a new date, amend the spec, or waive by ADR.

## What is reviewed (spec §6 HUMAN-H15; §4.3 REQ-DWEB-14, REQ-DWEB-15; §4.4 REQ-TOUR-1, REQ-TOUR-2, REQ-TOUR-3, REQ-TOUR-4, REQ-TOUR-5, REQ-TOUR-6, REQ-TOUR-7, REQ-TOUR-8; §3.3 S-6, S-9, S-10, S-11)
The preview URL, SHA and per-step screenshots are given in 224's run record. The preview is held
open for this review; a long hold spends against the round cap, so 224 may destroy and re-stand
it for the re-walk (see 224 Notes).

## Checklist
- [ ] **Hub `/demo`** (REQ-TOUR-1):
  - card order SPD, GM, POV, CoR;
  - titles, subtitles and the retitle note;
  - publish dates;
  - word counts and the counting rule ("N major · N minor · N strengths · N claims checked");
  - the provenance paragraph (agent-discourse, open source; S-10 roles);
  - the byline "S. J. Sebastian";
  - "Read on Substack ↗" and "Open in Rhēma".
- [ ] **"What to look at" cards** for GM, POV and CoR (REQ-TOUR-3): every bullet's wording and its
      deep link.
- [ ] **Guided tour on SPD** (REQ-TOUR-2): all 11 steps' copy (≤ 2 sentences each). Each quoted
      fragment is verified verbatim against the corpus file:line listed in 222's run record. That
      covers:
  - the side card "What a contradicted claim looks like → *The Governable Mind*, III16" (S-6);
  - the final CTA wording, logged out and logged in.
- [ ] **Notices and labels**:
  - the ReadOnlyProject demo notice (REQ-DWEB-14, "A read-only demo of a real essay's editorial
    record. Start your own project to use these tools.");
  - the replayed-run badge and its "inferred from the delivered files" / "approvals not
    recorded" / "not recorded" labels (REQ-DWEB-15, S-9);
  - "Writer-directed edit (not reviewed)" (S-10);
  - "not published" for excluded links (REQ-TOUR-6);
  - the import-rule labels (REQ-CONV-14).
- [ ] **Entry points**: the landing hero secondary CTA "See it on four real essays →", the
      `/showcase` link and the footer link (REQ-TOUR-4).
- [ ] **Role and identity scope** (S-10, S-11):
  - no "author" is used for an agent;
  - no identity material beyond the pen name on the demo surface;
  - the allowlisted credit lines appear verbatim only in Published text.
- [ ] **Disposition recorded in the readout as the operator's verbatim words.** There are two
      outcomes:
  - **approve as is**;
  - **approve with changes**: each change is listed by `COPY` key or step id, and lands as a
    run-time insert row (suffix letter; BM-MANIFEST-03; e.g. `223b_R7DEM.6d` for copy changes —
    distinct from 224's pre-declared real-data tour re-pin row `222b_R7DEM.6c`) before 224
    re-walks the changed steps on the preview. That is followed by re-sign of the changed items
    only.

## Exit criterion
Every checklist item is ticked in this file with `date -u +%F` and an evidence pointer to the
readout. The readout records the operator's approval verbatim. If changes were requested, the
insert row has landed and the re-walked items are re-signed. Only then may 224 begin Part B.

## DEFERRALS rule for tickets that run before this completes
A ticket that depends on this row but runs before it is ticked opens a `D-<TICKET>-<n>` row
(kind `P`) in `DEFERRALS.md`:
- why deferred = "H15 pending · withholds: <claim>";
- unblocked by = "H15 · owner: operator · trigger: 224_R7DEP.1 Part A on the R7a phase preview";
- how to verify.

It reports "gate pending": never a failure, never a fabricated pass, never a claim this row
withholds (DEFERRALS rule 5). 224 opens no such row: it **pauses** internally at its Part A/Part B
boundary instead.
