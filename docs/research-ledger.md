<!--
  Round-5 research & design ledger — synthesize-spec mode=plan output (2026-10-14).
  The round-4 ledger is preserved at docs/research-ledger-frontend-spa.md (frozen, canonical).
  One writer touches CURRENT STATE + change log; every stamp is `date -u` at writing (BM-CLOCK-01).
-->
# post-spa-disposition — research & design ledger

- **Status vocabulary:** `open` → `in-progress` → `done` | `blocked-on-operator` | `dropped(reason)`.
  Every row ends `done` with **evidence** — a path into the spec, a source actually fetched, or
  an explicit decision + rationale.
- **Owner vocabulary:** `R` research · `D` design · `A` architecture · `P` product · `S` synthesis.
- **⚑** marks an operator-fixed constraint (do not relitigate) — see `docs/post-spa-disposition-brief.md`.
- **Nothing cited that was not read.**

## CURRENT STATE

```
projectStatus:   IN_PROGRESS
nextUnit:        HANDED-OFF — orchestrate-build drives the Round-5 chain
lastCompleted:   G1 (all 22 research/design rows done)
blockedOn:       (nothing)
pauseRequested:  false
returnPass:      (none)
brief:           docs/post-spa-disposition-brief.md
specOut:         docs/post-spa-disposition-spec.md
memoryRoot:      docs
autonomy:        interactive (operator answers §Q rows live)
round:           1
updatedAt:       2026-10-14T20:48:58Z
```

## 0. Working theses (to be tested, not assumed)

- **T1 — A delegated same-origin click interceptor is the right nav mechanism.** It covers shared
  SSR components and injected HTML (dossier/report bodies) without an invasive `<Link>` port; a
  component-port hypothesis must show it handles `dangerouslySetInnerHTML` links to be viable.
  (A1, A2, A3)
- **T2 — Nav mechanism is contract-invisible today and needs a new settle hook.** `data-mounted`
  stamps identically on document loads and client navs; the journeys suite cannot see the
  difference — a durable hook (e.g. a nav-type counter or performance-entry probe) is part of the
  fix, not a nice-to-have. (A3, A4)
- **T3 — Most paid-leg spend is model tokens, so test-tenant tier routing is the biggest lever.**
  Fixture-size caps already exist (≤300 words); the spend audit must show where dollars actually
  go before levers are ranked. (B1, B2, B3)
- **T4 — The owed free legs are substrate-only (fixture/ruling/clock), not product defects.** Each
  resolves via a seed, a ruling, or a clock — the census must catch any that are actually code.
  (C1–C5)
- **T5 — The $285.80 → ~$50 prod-cost gap is posture levers, not traffic.** Min-instance floors,
  SQL tier, proxy MIG, Redis sizing — the audit must decompose the bill before naming levers.
  (D1)
- **T6 — Every open backlog row admits a clean disposition (build / operator / defer / drop).**
  Rows that resist all four are synthesis findings in their own right. (G1)

## A. Client-side navigation completion

| id | item | owner | status | evidence |
|---|---|---|---|---|
| A1 | Anchor census: every `<a href>` / injected-HTML link in `spa/` + shared SSR components, classified by destination class (in-tree / SPA_PUBLIC / forced-SSR-family / `reloadDocument` stub / external / `download` / `target` / modifier attrs) → the interception decision table | R | done | r5_a1_anchor-census.md — ~95 in-tree sites; getMatchedRoutes mandatory (spaRouteFor misclaims non-doc GETs); forced-SSR never pre-judged; REQ-NAVC-7..13; 2 pre-existing dead links found |
| A2 | TanStack Router API surface for href→route resolution at runtime (`matchRoute`/`buildLocation`/`flatRoutes`, `reloadDocument` stub behavior under `router.navigate`, `<Link>`'s own skip semantics) — what a delegated handler can reuse | R | done | `docs/research/r5_a2_tanstack-api.md` — `getMatchedRoutes`+`**` predicate; Link guard semantics; hand-rolled origin test; stubs self-doc-nav |
| A3 | Mechanism design: delegated document-level interceptor vs dual-renderer `<NavLink>` vs hybrid — skip-list semantics, `twinForcesSsr`/`SsrHandoff` interplay, scroll/focus/title duties on client navs, history parity (push vs replace) | D | done | r5_a3_nav-mechanism.md — delegated listener confirmed; NEW: SsrHandoff assign→replace Back-loop; stub short-circuit by route-id; no preload; REQ-NAVM-1..10 |
| A4 | Verification design: the settle-contract extension that lets journeys + dom-contract *see* nav mechanism (counter hook / performance entries); a client-nav chain leg (`/app`→`/p/:p`→`/v/working`) asserting zero document loads; REQ-NAV-6 keep-alive proof once navs stay in-router | D | done | r5_a4_nav-verification.md — data-nav-count + mounted-clear + settleClientNav/DocumentNav + R10/R10.keepalive; REQ-NAVT-1..8; NAVC numbering collision flagged |
| A5 | Dormant-machinery audit: what becomes live once navs are client-side (intent prefetch, scrollRestoration, keymap `router.navigate` chords, focus/aria-live, Query-cache reuse, PageSessionRegistry) — what needs verification or fixing | R | done | r5_a5_dormant-machinery.md — 4 hazards: preload fires side-effect loaders; registry phantom-destroy race; data-mounted never clears mid-pending; stale-projectId window; REQ-NAVC-7..15 |

## B. Test economics (funded-window prerequisite ⚑)

| id | item | owner | status | evidence |
|---|---|---|---|---|
| B1 | Spend audit: per-leg USD from `usage_records`/ledger rows for the funded-window set + the $58.08 baseline week — top burners by model-tier × phases × fixture size | R | done | `docs/research/r5_b1_spend-audit.md` — ~$153.60/30d on is_test; cache-read tokens dominate (fixture caps don't bound); `verifier`@balanced ~$6.60/call; editor-family ~85% |
| B2 | Entitlement/model-tier routing surface: how run tiers resolve (is_test tenant path), whether a cheaper test tier preserves REQ-SPEC-32 money-truthfulness | R | done | r5_b2_tier-routing.md — tier label already at floor (all legs pin base); real lever is intra-tier Haiku arm via the is_test cogsLevers seam; debits price served model so REQ-SPEC-32 holds by construction |
| B3 | Lever + guard design: ranked levers (tier routing, fixture sizing, per-leg USD caps, deterministic providers for non-model legs, phase reduction) → the regime the funded window opens under; weekly guard + per-ticket cap + tripwire composition | D | done | r5_b3_lever-guard-design.md — caps re-derived+enforced; Haiku arm shape concrete; NEW DEFECT: seed rows pollute proxy meter (~| B3 | Lever + guard design: ranked levers (tier routing, fixture sizing, per-leg USD caps, deterministic providers for non-model legs, phase reduction) → the regime the funded window opens under; weekly guard + per-ticket cap + tripwire composition | D |2.33/seed); REQ-ECON-6..13 |

## C. Fixture substrate & owed free legs

| id | item | owner | status | evidence |
|---|---|---|---|---|
| C1 | T17 source-view canonical-markdown seeding — what fixture, where it lives, who mints it | R | done | `docs/research/r5_c_fixture-substrate.md` — harness/product timing (Y.Doc hydration), not a fixture |
| C2 | P1.dossier phone bulk-affordance contract (§10.1) — the ruling options framed for §Q | R | done | same — §10.1 already rules bulk+Apply ✗ on phone; live divergence needs a triage leg |
| C3 | T8 expired-token leg — clock-owed vs operator-approved backdated mint; what the mint script touches | R | done | same — operator-approved backdated `account_exports` mint (reseat-script shape) |
| C4 | T12F/T13F suggestion-bearing dossier fixture — what a delivered review + suggestion seed requires | R | done | same — T13F confirmed fixture gap (anchor+suggestion shape); T12F race-vs-POST |
| C5 | BL-22 residuals (citeproc, quiet-hours, Decisions row, stale voice, T7 purge residual) + BL-78 live legs — per-item need and blocker | R | done | `docs/research/r5_c5_bl22-78-residuals.md` — 3 of 5 BL-22 residuals already discharged; true set = T8+T7-dest (clock), T16+T15 (substrate), 3 BL-78 live legs |

## D. Ops & stage residuals

| id | item | owner | status | evidence |
|---|---|---|---|---|
| D1 | Prod-cost lever decomposition: the $285.80 measured bill by service vs the ~$50 target — which levers exist in Pulumi (min-instances, SQL tier, proxy MIG, Redis, LB), posture implications per lever | R | done | `docs/research/r5_d1_cost-levers.md` — biggest lever is a live-vs-IaC cpu-throttling drift on convert-svc (−$44); $50 unreachable under current architecture → Q-7 is target-vs-posture |
| D2 | BL-24 launch-verification remainder: canary-injection pause smoke, alert-channel page, usercontent CDN headers, first-finding ≤4 min — current state per item | R | done | r5_d234_stage-residuals.md — all live-evidence residuals; soak re-query $0; nightly green merge-dependent |
| D3 | BL-25/80 preview legs: nonprod Resend secret → `pr-<n>` session mint → signed-in preview journeys — what MAINT.6's close requires | R | done | r5_d234_stage-residuals.md — all live-evidence residuals; soak re-query $0; nightly green merge-dependent |
| D4 | BL-36 nightly golden + BL-74 soak evidence — current state, what closes each | R | done | r5_d234_stage-residuals.md — all live-evidence residuals; soak re-query $0; nightly green merge-dependent |

## E. Memory & spec hygiene

| id | item | owner | status | evidence |
|---|---|---|---|---|
| E1 | BL-02 validator hygiene: DEFERRALS status-cell normalization, upstream agent-skills patch list, GATE-ACCEPT false-positive fix — enumerate precisely | R | done | r5_e_memory-hygiene.md — checkers disagree (priority vs positional); ~50 never-flip cells; G2/G3/H3 already folded; nav spec gap confirmed; REQ-MEM-1..10 |
| E2 | BL-05 REC.2 reconciliation scope: which GATE-ACCEPT deviations + ADR triggers + the nav deviation fold back into `rhema-design-spec`/`frontend-spa-spec` | R | done | r5_e_memory-hygiene.md — checkers disagree (priority vs positional); ~50 never-flip cells; G2/G3/H3 already folded; nav spec gap confirmed; REQ-MEM-1..10 |
| E3 | BL-73 Later-scope census: confirm the 33 MISSING matrix rows are spec-scheduled Later (not lost work) | R | done | r5_e_memory-hygiene.md — checkers disagree (priority vs positional); ~50 never-flip cells; G2/G3/H3 already folded; nav spec gap confirmed; REQ-MEM-1..10 |

## F. Funded-window leg census

| id | item | owner | status | evidence |
|---|---|---|---|---|
| F1 | Enumerate every ledgered paid leg (BL-16…21, 56, 66–72, 78/79 residuals + D-CAP.2-1's 21 steps): registry id, what it verifies, spend class, blocker → the ticket-able list under the B3 regime | R | done | `docs/research/r5_f1_funded-census.md` — 21 paid steps; caps in STB5B_CAPS; cumulative $145.95/$150 exhausted → Q-6; B19C discharges 3 legs |

## G. Disposition map

| id | item | owner | status | evidence |
|---|---|---|---|---|
| G1 | Open BL-row + open DEFERRALS census → per-row disposition (decompose / operator / defer / drop) — the artifact that lets `projectStatus` close when the round lands | S | done | r5_g1_dispositions.md — 55 open BL + ~203 owed D rows all dispositioned; 17 zombies; 28+13 DROPs; stream-A = 3 tickets; REQ-G1-1..5 |

## O. Spec synthesis & review process

| id | item | owner | status | evidence |
|---|---|---|---|---|
| O1 | Draft the spec from the ledger notes | S | done | docs/post-spa-disposition-spec.md drafted — all streams synthesized; NAVC collision renumbered (A5→16..24) |
| O2 | Fresh-context adversarial review (consistency, coverage of every ledger row, MVP realism, self-contradiction) | S | done | REVISE — 4 blockers + 9 majors; all 22 dispositioned in revised spec; r5_o2_review-dispositions.md |
| O3 | Operator ratification round — §Q answers → canonical | S | done | Ratified 2026-10-15 — all recommendations accepted (Q-ECON.e=server-default, Q-ECON.f=~$60, Q-POSTURE=first, Q-5=confirm+literal) |
| O4 | `docs/decomposition-prompt.md` hand-off to decompose-spec | S | done | 27 rows decomposed + Phase-4 critique applied; validator green |

## Q. Operator decisions register

| id | question (abridged) | decision | unblocks / new rows |
|---|---|---|---|
| Q-1 | P1.dossier: does the phone dossier show §10.1 bulk affordances, or is read-only-phone the contract? | | C2 → fixture or design |
| Q-2 | T8: operator-approved backdated-token mint script, or wait the 7-day clock (ADR-088)? | | C3 |
| Q-3 | Nav mechanism: accept A3's recommendation as spec'd, or is the interceptor-vs-port trade operator-level? | | A3, O1 |
| Q-4 | Spec shape: standalone `post-spa-disposition-spec.md` + §14-style amendments back into `frontend-spa-spec` (vs one merged doc)? | | O1 |
| Q-5 | BL-38 cleanup scope: the enumerated items (test draft v7, stray provenance row, 2026-09-30 review account, two Library-After-Dark projects) — all four confirmed for removal? | | G1 |
| Q-6 | Funded-window envelope: budget cap + timing under the B3 regime (prior ledgered bound ~$150 cumulative) | | F1 |
| Q-7 | Cost-lever authority: which prod-posture changes are pre-authorized vs per-change approval (min-instance floors, SQL tier, proxy/Redis sizing)? | | D1 → tickets |
| Q-8 | BL-13 economics ruling: confirm it stays operator-register-only (no spec rows) this round | | G1 |

## Change log

- 2026-10-14T18:50:14Z — ledger created by synthesize-spec mode=plan; brief `docs/post-spa-disposition-brief.md`; round-4 ledger frozen at `docs/research-ledger-frontend-spa.md`.
- 2026-10-14T19:05:00Z — B1 done (`docs/research/r5_b1_spend-audit.md`): test-tenant spend ~$153.60/30d; cache-read tokens dominate → per-call tier is the lever, not fixture size; `verifier`@balanced ~$6.60/call; editor-family ~85%. Research rows A1/A2/A5/B2/C1–C5/D1–D4/E1–E3/F1 dispatched to fresh contexts.
