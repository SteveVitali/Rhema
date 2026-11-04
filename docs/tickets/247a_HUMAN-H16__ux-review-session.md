# HUMAN-H16 — UX review session on the R7b preview (optional, recommended)

- **Sequence:** 247a of 254 · **Phase:** round 7 (R7b) · **Kind:** human
- **Blocks:** nothing by default. The session is held inside 250_R7DEP.2's **Part A** preview
  window, before prod. It can pause 250 at the Part A / Part B boundary only if the operator's own
  words say a finding must land before prod.
  - **Changed 2026-11-03 (`GD-PREVIEW.R7`).** This row used to soft-block 248_R7TOUR.2 and run on
    its own orchestrator-raised preview once 243 and 236 landed. The operator ruled "oh yeah that
    would be crazy; let's do rolling preview per phase, I guess, or whatever keeps cost to a
    minimum, ideally under $20 across all tickets" (`GD-PREVIEW.R7`): one owned preview per
    phase, stood up only by 224 and 250. A separate H16 preview would be a second R7b stand-up, so the session moves into 250's
    window and the "before 248" soft block is dropped. Consequence: findings can no longer move
    tour targets before 248 pins them; a finding that does becomes an insert row that re-runs 248's
    pinning test.
- **Depends on:**
  - 249a_R7PUB.1, the last R7b code row, so the preview the operator walks is the finished R7b tip
    (243a, 236, 248 and the landing refresh included);
  - 250_R7DEP.2 Part A: the owned preview at T0 is up, its legs have been walked, and its SHA and
    provenance are recorded.

  Spec §6 and §10 row 247a (timing amended by `GD-PREVIEW.R7`; the spec's post-ratification note
  moves HUMAN-H16 into 250's preview window).
- **Owner:** operator   **Scheduled:**
  - **When:** 250 Part A preview window, before prod. 250 raises it once its T0 walk is recorded,
    and holds the preview for the session within the `GD-PREVIEW.R7` $20 round cap.
  - **Preview:** 250's owned `pr-<n>` at T0. It is not stood up for this row, and it is torn down by
    250 (teardown evidence in 250's run record).
- **Withheld until done:** no claim that "the operator reviewed the R7b UX", and no use of the
  session in R7CAP.1's finding accounting, until the readout records it. If declined, the decline
  is recorded instead.
- **Deferrals so far:** 0
- **Readout:** `docs/build/readouts/HUMAN-H16.md` (from `templates/READOUT.md`)

> **Operator work — NOT an `implement-spec` input.** This is a walk of the real product, and only
> the operator's judgement completes it. An agent must not sign it or treat silence as approval or
> as a decline.
>
> The row is **optional by ratification** (spec §6; Appendix B (i)). It is still never skipped by
> default. The operator either walks it or declines it in words, and the orchestrator records those
> words verbatim. Deferring it again needs the operator's explicit words. If 250's preview window
> closes with neither, the readout records "not dispositioned" with `date -u`, and R7CAP.1 surfaces
> it for GATE-ACCEPT.R7 ("HUMAN-H16 skipped").

## Checklist
- [ ] 250's preview `pr-<n>` is up at T0 (the R7b tip, including 249a). The readout cites the SHA
  and provenance from 250's run record, and the session uses `is_test` / analytics-opt-out
  accounts only (manifest invariant 16).
- [ ] The operator walks the R7b surfaces at 1440, 1280, 1024 and 820, a narrow desktop window, and
  a phone UA:
  - app shell and sidebar;
  - projects list;
  - New project → type;
  - format bubble → Comment → fork toast / Undo;
  - Source toggle;
  - right panel (Chat · Findings · Claims · Timeline · Live feed);
  - dossier layout;
  - settings / billing / usage / voices;
  - run sheet (opened, not launched);
  - export, outline and figures;
  - the `?` cheat sheet and keymap;
  - the demo hub and the re-pinned tour (248);
  - the refreshed landing and signed-in `/pricing` (249a; the hero slot may still show its
    placeholder until 250 captures the recording).
- [ ] Each observation is recorded verbatim in the readout as an **`F-R7UX-<n>`** row with:
  - a severity (P0 / P1 / P2, spec §0);
  - the surface;
  - a screenshot pointer;
  - the operator's disposition words.
- [ ] Each F-R7UX row is mapped (finding → REQ → ticket) in
  `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` and in LEDGER § OPEN FINDINGS:
  - a P0 / P1 becomes an **insert row** (decompose-spec plan extension) or a recorded WONTFIX;
  - a P2 outside the touched surfaces becomes a dated `BACKLOG.csv` row (`GD-UX-SCOPE.R7`; spec
    §7);
  - the operator's words say whether any insert row must land **before** prod. If so, 250 pauses
    at its Part A / Part B boundary for that ruling; any further preview for the insert row needs
    the operator (`GD-PREVIEW.R7` condition).
- [ ] *Or, instead of the three items above:* the operator declines the session. Their words are
  recorded verbatim with `date -u +%F`, and 250 proceeds.

## Exit criterion
The readout records either the walk or the operator's verbatim decline:
- **A walk** records the date, the preview SHA (250's T0), every F-R7UX row with its mapping, and
  a pointer to 250's teardown evidence.
- **A decline** records the date and the operator's exact words.

Every F-R7UX P0 / P1 has an insert row or a recorded WONTFIX before R7CAP.1 runs.

## DEFERRALS rule for tickets that run before this completes
After `GD-PREVIEW.R7`, no code row runs between this session and prod except 250 itself, so no
`D-<TICKET>-<n>` "H16 pending" row is expected. 250 records the session's state (walked /
declined / not dispositioned) in its run record; R7CAP.1 accounts for it and GATE-ACCEPT.R7 lists
it if skipped. Silence is never a fabricated pass and never a claim this row withholds (DEFERRALS
rule 5).
