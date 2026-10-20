# R6WATCH.1 — Post-launch read at launch + 14 d

- **Sequence:** 200 of 208 · **Phase:** round 6 · **Kind:** skeleton
- **base_branch:** current checkout
- **Depends on:** 199_R6CLK.1 + the launch timestamp (recorded by 198_R6LCH.1) + 14 days

> **Skeleton only** — expands when 198_R6LCH.1 records the launch timestamp. Then the window
> (launch → launch + 14 d) and the per-row sample thresholds are fixed. No run line until expanded
> (BM-TICKET-03).

## Scope (one line)
On the committed queries over the organic non-test cohort, close each cohort-bound row on evidence
or convert it to a standing alert-backed watch with an owner and a re-read date (`GD-WATCH.R6`).

## Spec §§
`docs/round-6-draft-spec.md` §4.9 REQ-WATCH-1; ADR-111 (the first-finding post-launch target);
DEFERRALS **D-R5OPS.1-1**, **D-COST.1-2**, **D-SLO.1-5/-7/-8** (after R6FOR.1's verdicts),
**D-ECON.1-3/-4**, **D-ECON.2-5/-6/-7**, **D-P1.17-2** (funnel metrics).

## REQ coverage
REQ-WATCH-1
