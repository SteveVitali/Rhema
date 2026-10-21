<!--
  docs/build/readouts/GATE-ACCEPT.R5.md — append-only gate readout for the round-5
  tail marker 170_GATE-ACCEPT.R5__accepted-deviations.md. Operator disposition of
  R5CAP.3's ACCEPTED-deviations list (docs/build/CAPSTONE_CLOSURE.md §R5.3).
-->
# GATE-ACCEPT.R5 — operator signs the round-5 accepted-deviations list — readout

- **Criterion (verbatim, `170_GATE-ACCEPT.R5__accepted-deviations.md`):** "The operator reads
  the proposed deviations (expected candidates: the deferred intent-preload allowlist
  follow-up; the unlevered-vs-levered cap basis; any leg still honestly owed on substrate;
  the REQ-NAVC-18 freshness-policy trade-off on mark-read parity) and records accept/reject
  per item." DEFERRALS rule per convention — no scoped OPEN row blocks this gate that isn't
  itself a signed deviation; the signature dispositions them (OPEN as tracking items, not
  gate-blocking).

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — 2026-10-17: **PASSED — all 14 rows accepted**

The operator reviewed the 14-row signature table (`docs/build/CAPSTONE_CLOSURE.md` §R5.3,
presented with per-row evidence + carrier citations) and ruled **accept-all** — no row sent
back to closure, no per-row amendment.

| # | Deviation | Disposition |
|---|---|---|
| 1 | Intent-preload leg deferred (REQ-NAVM-7 → D-SPA.24-1, domains-bearing stage) | ACCEPTED |
| 2 | Phone contract boundary ratified: dossier stays SPA at phone width (REQ-ED-12 = Page family only) | ACCEPTED |
| 3 | Paid-leg caps computed levered-expected (§5.2 `testCheapRoute` arm; opt-outs carry full-tier caps) | ACCEPTED |
| 4 | NAVC-18 freshness asymmetry by design (mark-read twins keep `staleTime:0` — GET = read receipt) | ACCEPTED |
| 5 | Posture-bound preview residuals honestly re-owed (5/44 legs: N8/R10.keepalive, N9, T8, D-OPS.1-1/D-SPA.6-1) | ACCEPTED |
| 6 | The funded wave stays carried — $0 spent ($80.86 ≥ ~$60 refusal at bind; GD-FUNDED.1-1 CARRY) | ACCEPTED |
| 7 | CDN-signed usercontent configured but nonfunctional (LB→bucket origin-read denied; D-R5OPS.1-2) | ACCEPTED |
| 8 | Golden-run budget ruling stays AWAITING (~$150–300/night; GD-R5OPS.1-1 open, D-P0.15-4) | ACCEPTED |
| 9 | First nightly green + prod layer owe to the merge sweep (`github.sha`=main ≠ chain tip; prod serves `ffbb8ad`) | ACCEPTED |
| 10 | ~$50/mo target unmet — $198.32 stands (class-A $285.80→$198.32; remainder needs paused-lever rulings, D-COST.1-3) | ACCEPTED |
| 11 | H8 operator bundle partial (~12 items operator-owed; Resend seed discharged) | ACCEPTED |
| 12 | Clock-/cohort-/ruling-bound residuals (T7 destruction, BL38 purge verify ~10-30, T16 cron, first-finding ≤4-min, `import_preview_p95_s`, billed actuals, `prod:d5a74cc`, 4 named-red SLOs) | ACCEPTED |
| 13 | Spec fold-back lands after this gate (REQ-MEM-6/7/8 MISSING at signature → R5REC.2, row 172) | ACCEPTED |
| 14 | The whole honestly-owed tail stays OPEN as tracking (§R5.2 census + wider DEFERRALS corpus) | ACCEPTED |

## Round-5-scoped OPEN deferrals — disposition

Every row in the §R5.2 carrier census (21 named carriers) is dispositioned by the
signatures on rows 5–14: **OPEN as tracking items** carrying verbatim verify recipes +
named unblock conditions — not gate-blocking:

- `D-CAP.2-1` — the carried 21-leg funded wave + §5.6 census items; unblock = a fresh
  envelope ruling (re-epoch `FUNDED_ROUND_SINCE`, raise `FUNDED_WINDOW_CAP_USD`, or continue
  carrying; GD-FUNDED.1-1 ruled CARRY).
- `D-SPA.24-1` — N8 + R10.keepalive collab-wire legs; unblock = a domains-bearing stage.
- `D-SPA.16-1` / `D-SPA.20-1` — N9 billing/run-sheet legs; unblock = a Stripe-bearing stage.
- `D-FIX.1-1` — T8's 410 expired-token arm; unblock = operator `mint-t8-export.mjs` +
  `JOURNEY_T8_EXPORT_TOKEN`.
- `D-FIX.1-2` — T15/T16 paid halves; unblock = the carried funded wave.
- `D-FIX.1-3` — BL-78 substrate executions; unblock = operator `--execute` (prod writes) +
  the B19B-riding probe.
- `D-FIX.1-4` — T16 digest-claim half; unblock = the weekly Monday cron (clock-bound).
- `D-OPS.1-1` — signed-in preview legs; unblock = deployed tip or non-prod test-tenant
  sessions.
- `D-SPA.6-1` — prod SSR `--expect-renderer` arm; unblock = merge/deploy of the
  marker-bearing tip.
- `D-COST.1-1` — billed-actuals before/after; unblock = D-OPS.2-1 console flip + ~24 h
  populate.
- `D-COST.1-2` — `import_preview_p95_s` re-probe; unblock = real preview-import samples
  (cohort empty).
- `D-COST.1-3` — six paused lever classes; unblock = explicit ruling per lever/class.
- `D-SLO.1-5..8` — the four named-red SLOs; unblock = real-traffic remediations (targets
  never re-based).
- `D-BL38.1-1` — `prod:d5a74cc` short-sha stamp; unblock = operator fix-shape ruling.
- `D-BL38.1-2` — `01M3SK38…` purge verify; unblock = ~2026-10-30 tombstone+30d
  (clock-bound).
- `D-R5OPS.1-1` — first-finding ≤4-min query; unblock = organic signups (cohort empty).
- `D-R5OPS.1-2` — CDN origin-read repair; unblock = delivery-contract ruling + IAM/deploy
  arm.
- `D-SPA.28-1` — cleanup-wave entry gate; unblock = all flips merged + ≥1 nightly green.
- `D-OBS.1-3` — first scheduled nightly green on the deployed SHA; unblock = the merge
  sweep.
- `D-OPS.2-1` — BigQuery billed-actuals export; unblock = operator console flip + ~24 h.
- `D-P0.15-4` — live nightly golden + manifest; unblock = GD-R5OPS.1-1 ruling + live engine
  + cohort.

## Presented alongside

- **GD-R5OPS.1-1 stays AWAITING** (§R5.4 note): the ~$150–300/night golden-run budget
  ruling (⚑ Q-GOLDEN) is still an open operator item — row 8 accepts it *staying* open;
  the ruling itself was not given and remains owed to the operator's own process.
- **GD-FUNDED.1-1 was ruled CARRY** (2026-10-16): the funded legs' unblock is a future
  envelope ruling, not a defect.
- **`projectStatus` stays IN_PROGRESS** (§R5.4 note): REQ-G1-5 is PARTIAL (H8 bundle
  remainder); DONE requires the operator's own closure pass — every open row has a landed
  disposition (named deferral / named ticket / named owner), which is the weaker-sense
  completeness R5CAP.1 recorded.

## Forward chain

- `nextTicket → R5REC.1` (row 171 — backlog + operational readiness).
- `projectStatus` stays IN_PROGRESS until the manifest's tail rows land and the operator's
  closure pass rules DONE.

## Signature

- **Decision (verbatim):** "Ok nice, looks good to me, let's proceed" — operator,
  Devin session, received 2026-10-17T02:3xZ, in reply to the orchestrator's presentation
  of the full 14-row list with dispositions offered as "sign all 14 / sign all except N /
  per-row amendments". Recorded as **all 14 rows ACCEPTED**; no row sent back.
- **Recorded by:** devin-desktop/swe-2-high (orchestrator) — the operator's own words; no
  proxy signature entered.
