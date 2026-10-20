# Decomposition prompt — round 6 (post-merge discharge + residual engineering)

*DRAFT invocation record for `decompose-spec` — to run in `mode=extend` against the committed
build memory **only after the operator signs off** `docs/round-6-draft-spec.md`. Written
2026-10-20 on branch `stevevitali/r6-planning-corpus` (off chain tip `d8bfebc`) beside the census
`docs/research/r6_open_work_census.md`. **Nothing below is ratified** — the manifest is untouched
and `nextTicket` remains `(chain exhausted)` until the ratifying session.*

## Invocation (proposed — run only post-sign-off)

```
decompose-spec spec=docs/round-6-draft-spec.md mode=extend \
  ledger=true dispatch_target=subagent granularity=balanced \
  tickets_dir=docs/tickets
```

## Binding constraints (from the spec + the 2026-10-19/20 operator rulings)

- **mode=extend**: open a `### Round 6` banner in `docs/tickets/00_MANIFEST.md`'s chain table; fork
  tickets from the then-current `chainTip` (the deployable tip — `d8bfebc` at prompt-freeze,
  re-confirm at SETUP). Never rename existing ticket files; append under `## Plan extensions`.
  Manifest numbering would resume at **row 176**.
- **The census is the contract source.** Tickets cite `r6_open_work_census.md` row ids +
  `round-6-draft-spec.md` REQ families (`REQ-ENG-*`, `REQ-POST-*`, `REQ-DISC-*`, `REQ-CLK-*`,
  `REQ-TAIL-*`). Nothing restates design already landed.
- **Deploy posture (operator ruling, ledgered 2026-10-20):** merge later; deploys operate from the
  latest chain tip; prod stays `ffbb8ad` until the operator acts. No ticket performs a merge or a
  `pulumi up` on prod — both stay `mergePolicy: OPERATOR` / Stage-B operator acts.
- **Operator-owned (HUMAN/GATE rows, never implement-spec inputs):** the merge sweep (BL-01/BL-81),
  deploy authorization, the fresh funded envelope (⚑ amount operator-owned — **never invent**),
  `GD-R5OPS.1-1` golden ruling, the CDN delivery-contract ruling (D-R5OPS.1-2), out-of-class lever
  rulings (D-OPS.2-2/D-COST.1-3), `GD-RES.2-1` retro ruling, the H8 session remainder (BL-86),
  billing-export console flip (D-OPS.2-1), guarded `--execute` prod writes (D-FIX.1-1/-3),
  posture-stage rulings (class c), product rulings (D-ECON.1-2, D-RES.2-3, D-DEF.4-3, D-ACT.1-3,
  D-BL38.1-1, D-ECON.2-7).
- **Hard ordering:**
  - REQ-ENG tickets are offline and land first.
  - REQ-POST legs all gate on the deployed tip + provenance match.
  - The funded re-attempt gates on fresh envelope + deployed tip + `JOURNEY_FUNDED_STABLE_TAG`
    tenant + system-role DSN; `funded-window.mjs --dry-run` must print 9/9; ordering
    T9 → launchers → riders → B19C last-and-conditional; a second refusal is a finding, never spend.
  - Clock items fire at their dates (~2026-10-30 purge verify; first-Monday digest claim; +30d
    destruction; ≥24h post-flip billing read) wherever the chain happens to be.
  - The cleanup wave (D-SPA.28-1) gates on ≥1 green scheduled nightly on `main` HEAD.
  - REQ-RES.3's protocol fix (`REQ-ENG-3`) must land **before** any paid verification leg that would
    re-drain a claim-scaled research budget.
- **Honest accounting:** the funded wave is *carried* (bind refused 2026-10-16, $0 spent); no ticket
  may describe it as run. No secrets in any artifact. Deferral cells flip only with evidence.
- **Out of scope (hard):** G2/H2 eval program (BL-40/43/44/45 + D-P0.13-*/14-*), partner program
  (BL-39), §16.4 marketing claims, 1.x spec-scheduled scope (BL-73), new feature work, standing
  watches (BL-47/76/77/84 stay open as tracking).
- **Tail**: `tail=full` — real reconciliation surface (backlog dispositions incl. the §5-flagged
  near-dischargeable rows, spec fold-back BL-05, capstone append, ledger state by the closing run).

## Candidate ticket table (dependency-ordered; decomposer may revise)

| # | id | name | kind | deps | gate? | live? | size |
|---|---|---|---|---|---|---|---|
| 176 | `R6ENG.1` | in-tree repairs: mount-settle flake + sibling audit (D-R5REC.1-1/BL-87), SSE head-fix (D-SLO.1-6), RES.3 checkpointing contract (D-RES.3-1/BL-79), tsconfig dep-drift (CIREP.1), guard-binding convention doc (D-STB.5b-1/BL-72), BL-02 cell-shape sweep, **cold-import soak reproducing D-P0.15h-3 at 0.5vCPU/512Mi (D-COST.1-3 (a) precondition — REQ-ENG-7)** | implement | — | no | no (offline; 2 green CI runs) | L |
| — | `176a_GATE-R6A` | **GATE** — round-6 authorization bundle: spec sign-off already landed at decomposition time; this pause collects deploy authorization + the remaining ruling pack (**envelope, golden, CDN, levers, and session-scheduling were ruled 2026-10-20** — remaining: posture stages (domains-bearing, Stripe-bearing), misc product rulings, the operator's go) | GATE (operator) | R6ENG.1 (or parallel) | yes | no | — |
| — | `176b_HUMAN-R6H-ACTS` | **HUMAN** — operator session 1 (anytime, **scheduling RULED 2026-10-20 "split sessions"**): billing-export console flip (D-OPS.2-1), guarded `--execute`s (D-FIX.1-1 mint-t8, D-FIX.1-3 seed-bl78), D-BL38.1-1 stamp-shape ruling, product rulings (refund go-live D-DEF.4-3, unit-econ BL-13, levers A+B D-ECON.2-7, GD-RES.2-1, D-ECON.1-2, D-RES.2-3, D-ACT.1-3), invite mint+consume (D-SEC.2-1), exposure review (D-SEC.1-2), pen-test procurement (D-P1.22-3), admin key (D-ECON.1-1) | HUMAN | 176a | — | operator acts | — |
| — | `176c_HUMAN-R6H-BROWSER` | **HUMAN** — operator session 2 (post-deploy): browser/live legs — Google sign-in round-trip (D-MAINT.4-1), Stripe live-mode ruling/legs (D-P1.16-1, D-BILL.3-1/-2), Safari editor leg (D-EDIT.1-2), source-editor leg (D-PRB.07-1), versions-rail/put-override/settings legs (D-P1.08-1/-09-1/-20-1), phone-width legs (D-P1.19-2), showcase/funnel legs (D-P1.17-1/-2, D-P1.21-1, D-PRB.01-2), leg-cap reconcile | HUMAN | deploy + 176a | — | operator browser legs | — |
| 177 | `R6POST.1` | post-deploy prod arms: `--expect-renderer ssr` re-proof (D-SPA.6-1), signed-in session legs (D-OPS.1-1), deep-link restore (D-CAP.1-1), two-tenant/read probes as needed, `balance_divergence` forensic classification (system-DSN read), T8 410 leg after the mint, **worker right-size flip (REQ-DISC-4 — authorized 2026-10-20 conditional on R6ENG.1 soak-green; one stage-fact `pulumi up` field, −$26/mo, report the recomputation)** | implement | deploy of tip (operator) + 176a | after deploy | yes — prod reads/journeys, $0 legs + one authorized pulumi change | M |
| 178 | `R6POST.2` | posture stages: domains-bearing stage legs (D-SPA.24-1 — N8/R10.keepalive collab) + Stripe-bearing stage legs (D-SPA.16-1/-20-1 — N9 billing walk) | implement | operator stage/stripe posture ruling (176a) | ruling-gated | yes — `pr-<n>`/posture stage | M |
| 179 | `R6POST.3` | usercontent delivery leg (**contract RULED 2026-10-20 — API-minted signed URLs**): GCS V4 signed-URL mint in the api, `usercontent-cdn-verify.mjs` probes re-pointed at the minted path, usercontent header leg (D-R5OPS.1-2; D-P1.22-2 residual half) — edge-signing repair not pursued | implement | deploy | no (ruled) | yes — prod | S |
| 179a | `R6GLD.1` | golden validation (**RULED 2026-10-20, GD-R5OPS.1-1 in part**): one-time ≤$300 post-deploy run of `nightly-golden-driver.mjs` (`GOLDEN_BUDGET_RULING=approved` one-shot + measured `--scores` + score-floor flip); recurring-cadence half stays owed on D-P0.15-4 | implement | deploy | no (ruled) | yes — prod, ≤$300 | S |
| — | `179b_GATE-R6B` | **GATE** — funded-window re-open: envelope already RULED 2026-10-20 (**~$150 pinned-scope, GD-ENV.R6**) — this pause collects deployed-tip provenance + tenant provisioning + dry-run 9/9 + the operator's go signal | GATE (operator) | deploy + 176a | yes | no | — |
| 180 | `R6FND.1` | funded wave re-attempt: the 21 paid registry steps + paid new-visitor journey + carried legs (D-CAP.2-1, D-FIX.1-2 T15/T16, D-P0.15-3, D-PRB.02-3, D-PRB.04-2, D-P1.10-1/-11-1/-12-1/-14-1/-19-1/-21-2, D-DEF.1-1, D-RES.1-1/-2/-3, D-CITE.1-2/-3/-5, D-ECON.2-2/-3/-4, D-STB.5b-3/-5) — ordering T9→launchers→riders→B19C; refusal=report | implement | 179b GATE + REQ-ENG-3 landed | yes | yes — prod, funded (~$150 ruled) | XL |
| 181 | `R6CLK.1` | clock-bound verifies: ~10-30 purge fire (D-BL38.1-2), Monday digest claim-once (D-FIX.1-4), +30d destruction (D-P1.04-2 — or operator hand-date), post-flip billed actuals (D-COST.1-1 after D-OPS.2-1), SLO window re-reads (D-SLO.1-5/-7/-8) | implement | dates; flip for -4 | no | yes — prod reads | S |
| 182 | `R6SWP.1` | cleanup wave: SPA.28 flag-machinery deletion verification + entry-gate evidence (D-SPA.28-1), post-cleanup nightly green, residual doc cleanup | implement | REQ-POST-4 nightly green on main HEAD | no | yes — nightly evidence | M |
| 183 | `R6TAIL.1` | reconcile + capstone tail: backlog dispositions (flagged BL-06/74/80/82 + BL-24/22 partial flags), BL-05 spec fold-back, coverage-matrix refresh, CLOSURE entry, PHASE LOG + state fields by this closing run | implement | all above | no | no | M |

## Operator decisions that must land before decomposition is ratified

1. **Spec sign-off** — this draft ratified or revised.
2. **Deploy authorization** — merge sweep posture + `pulumi up` of the tip (ordered activation).
3. ~~**Fresh funded envelope**~~ **RULED 2026-10-20 (GD-ENV.R6): ~$150 pinned-scope** —
   measured $80.86 + declared caps $54.50 + ~$15 margin.
4. ~~**Golden ruling**~~ **RULED IN PART 2026-10-20 (GD-R5OPS.1-1): one-time ≤$300
   post-deploy validation;** nightly cadence declined, recurring deferred to evidence.
5. ~~**CDN delivery-contract ruling**~~ **RULED 2026-10-20: API-minted signed URLs** —
   edge-signing repair not pursued; D-R5OPS.1-2 becomes an engineering leg.
6. ~~**Lever classes**~~ **RULED 2026-10-20 (on projections, verbatim UI selections):** (a) worker
   right-size conditional-authorized on soak-green (REQ-ENG-7 → REQ-DISC-4); (c) SQL f1-micro +
   (e) proxy MIG **REJECTED**; (b) GKE spot + (d) Redis **PARKED** pending designs; (f) HA set
   unruled/parked. Honest floor ~$172/mo — ~$50 target not reachable under this ruling.
7. **Posture stages** — domains-bearing and Stripe-bearing stages authorized or deferred.
8. ~~**Session scheduling**~~ **RULED 2026-10-20 — "Split sessions":** session-1 acts anytime
   (`176b_HUMAN-R6H-ACTS`), session-2 browser/live legs post-deploy (`176c_HUMAN-R6H-BROWSER`).
9. **Remaining product rulings** — `GD-RES.2-1`, D-ECON.1-2, D-RES.2-3, D-DEF.4-3, D-ACT.1-3,
   D-BL38.1-1, D-ECON.2-7 (session-1 content — could be answered there rather than here).

## Partition guidance

- **176 is the only zero-gate ticket** — land it first; it also removes the recurring flake that has
  already cost three CI reruns.
- **177/178/179 are disjoint live-leg tickets** — schedule in any order post-deploy; only 179 waits
  on its ruling.
- **180 is the spend ticket** — its dry-run + ordering + pause-sentinel machinery is already landed
  (`funded-window.mjs`); the ticket is execution + per-leg evidence, not new machinery.
- **181 can run opportunistically** — its verifies are reads at dates; keep it one ticket so clock
  work has a single home.
- **182 must not open early** — SPA.28's own entry gate requires the green nightly.
- **183 is the only ticket that writes `projectStatus`/`lastCompleted`** — per ledger rules.
- Traffic-bound residuals (class g) that outlive the round stay open with dated re-read notes —
  closing them early would fabricate evidence.
