<!--
  docs/build/planning/2026-09-30_decision-memo.md — round-3 planning seed (build-memory layout: planning/).
  Status: DRAFT for operator review. Nothing here amends the spec or adds chain rows yet; that happens after the
  operator answers § Decisions and adds § Operator feedback, via the amendment protocol (spec → manifest
  § Spec amendments applied + ADR) and `decompose-spec mode=extend` (round 3).
-->
# Round 3 — decision memo (draft, 2026-09-30)

## Where the build stands

- **The chain is fully executed** through STB.4 (58 rows + CAPSTONE/RCN.1/STB.1–4/DEF.1–3).
  - PRs #1–#47 are merged; **#48–#80 (33 stacked PRs) are open**.
  - **Prod runs code from those unmerged branches.**
  - LEDGER `round: 2`, `nextTicket: DONE`, `projectStatus: IN_PROGRESS`.
- **The standard v2 tail never ran** (CAPSTONE was a single ledger row): no COVERAGE_MATRIX, no GATE-ACCEPT,
  no REC.*, no DOC.*.
- **Inputs to this round:**
  1. `docs/build/BACKLOG.csv` / `.md`: **65 rows**, each owed item in exactly one row. It covers every OPEN/PARTIAL
     deferral, ADR revisit trigger, ledger OPEN FINDING, untracked owed item (`X-*`) and review finding (`PR-*`).
  2. `docs/build/reports/2026-09-30_prod-design-review.md`: a browser-driven review of rhema.tools as a new user
     and as the operator, with one live paid review. The headline is that **the stranger's journey is broken at
     almost every load-bearing step**, and the paid review's fact-check did no web research.
  3. **Operator feedback**: § below, still to come.

## Recommended shape of round 3

Round 3 is not a feature round. It makes the product that already exists **true, reachable and sellable**,
then closes the build properly. The proposed lanes are listed in order. The ticket cut itself is
`decompose-spec mode=extend`'s job; this is the input it partitions.

| lane | candidate tickets (proposed ids) | absorbs | spend | gate |
|---|---|---|---|---|
| **0 — Hotfix now** (out-of-band or first row) | `HOT.1` prod hotfix: `evidence?.urls?.length` (dossier 500), route `/assets/page.js`, Quiet-group affordance, `runs.finished_at` digest query, deploy the STB.4 Stripe fixes (`cf40f28`), then a browser smoke | BL-52, BL-53(a), BL-54, BL-65(O1), BL-09 | $0 | deploy approval |
| **1 — Safety** | `SEC.1` tenant isolation: a non-BYPASSRLS api role (or `SET ROLE` per tx), an audit of every RLS-only query, integration suite run *as the prod role*; access-log review of the exposure windows (operator) | BL-08, BL-37 | $0 | secret rotation (operator) |
| **2 — Verification harness** | `JOURNEY.1` scripted browser journeys (Playwright): new-user signup → import → estimate → run → dossier → edit → buy, plus operator journeys. Runs as every Stage B's acceptance and nightly against prod, with screenshots committed. Also an asset-manifest parity test and a deploy-provenance ↔ chain-tip check at close | new invariant (A1) | ≈$0 + one Quick run/night | — |
| **3 — Core value works** | `RES.1` review web research regression: diagnose why `web_search` never reached the model on a Quick/Base review; fail closed per A3 | BL-56, BL-15 | ≤$25 | — |
| **4 — The funnel** | `ACT.1` trial entitlement per D3 · `BILL.3` purchase path (CSP + checkout URL) · `ONB.1` import latency ≤ 20 s + held-draft survival + fidelity · `CHAT.1` chat 502 | BL-50, BL-51, BL-60, BL-64, BL-55 | ≤$10 | real-money leg (operator) |
| **5 — Edit** | `EDIT.1` the working-copy fork from a frozen head (REQ-IDE-44/REQ-DATA-27), the Page editor mounted, `my-first-project` recoverable | BL-53(b,c) | $0 | — |
| **6 — Honest money** | `ECON.1` pricing re-base per D3 · `EST.1` one estimator for every surface, tier control per A7, honest run report + live meter · `ECON.2` durable fold store | BL-13, BL-57, BL-58, BL-14 | ≤$20 (instrumented runs) | operator pricing ruling |
| **7 — Run experience** | `GATE.1` gate defaults = copy (A8) · `SLO.1` start/resume/delivery latency | BL-59, BL-07 | ≤$10 | — |
| **8 — Polish** | `UX.1` copy + IA + brand/meta/email · `UX.2` layout/responsive | BL-61, BL-62, BL-63 | $0 | — |
| **9 — Engineering debt** | `DEF.4` ledger integrity closeout · `DEF.5` small fixes · `CI.1` flake · `OBS.1` · `SEC.2` signup admission · `SEC.3` run-task confinement · `OPS.1–4` | BL-10–12, BL-23, BL-25–29, BL-65(O2,O3) | ≤$10 | — |
| **10 — Remaining live legs** | `STB.5` re-scoped onto `JOURNEY.1` | BL-16–22, BL-24, BL-30, BL-31 | per backlog | — |
| **Tail** | `CAP.1` `CAP.2` `CAP.3` · `GATE-ACCEPT` · `REC.1` `REC.2` `REC.3` · `DOC.1` `DOC.2` (the standard v2 tail, run properly this time) | BL-01–06, BL-47 | $0 | operator signs GATE-ACCEPT |
| **Operator/human lanes** (not chain tickets) | live-mode Stripe re-verify · admin key · pen test · H2 → G2 · H4 · H5 · H3 revisit · browser session | BL-32–36, BL-39–46 | per item | — |

**Ordering rationale:**
- **Lanes 0–1 are about harm:** a live cross-tenant read, and a dossier that 500s for every new user.
- **Lane 2 comes before the feature fixes** so that every later ticket is accepted by walking the product, not by
  unit tests. That is the gap that let lanes 0 and 3–5 ship broken.
- **Lane 3 precedes the funnel:** there is little point selling a review whose fact-check does not fetch.

## Decisions the operator owns

- **D1 — Merge before round 3?** Recommended: merge #48–#80 bottom-up first (`reconcile-build merge-dryrun.sh`
  reports feasibility), so round 3 forks from `main` and prod provenance can point at `main`. The alternative is to
  keep stacking on #80 (`stevevitali/stb-4-real-money-external`).
- **D2 — Hotfix now, out-of-band?** Recommended yes: lane 0 is small and $0. Consider also flipping
  `signup.mode` to invite until `SEC.1` lands, because signup is open and `/voices` leaks.
- **D3 — Trial and pricing.**
  - **The trial:** keep the free first review promised on every surface (REQ-SPEC-8; COGS ≈ $6–12 per signup
    at measured rates), or retract the copy.
  - **The price basis:** measured, a Quick/Base review charged 632 cr ($6.32) against ≈ 1,625 cr metered
    (≈ $11.60). STB.3 was $4.51 charged vs $13.04 metered.
  - **The ruling itself:** re-base credit prices and plan allowances to measured COGS, cut COGS (default tier,
    rigor presets, research bounds), or both. This amends §14 and §16.4.
- **D4 — A review with zero successful fetches:** deliver as "completed" and charge (today, under ADR-006 Path B),
  or fail closed and refund, or deliver labelled *Unverified* at a reduced charge? This amends REQ-VIS-9 / ADR-006.
- **D5 — G2/H2:** still deferred? The standing rule is a HARD gate before public launch and §16.4 claims.
  Round 3 excludes it unless H2 is funded.
- **D6 — Round-3 live spend envelope:** the backlog's proposed legs sum to about $63, plus JOURNEY.1's nightly
  Quick run (≈ $6–12/night at today's COGS; consider weekly).
- **D7 — Merge-time hygiene:** allow `MAINT.2` (ledger reset: CURRENT STATE, RETURN PASS, the stale OPEN FINDINGS,
  Plan-extensions backfill, stale deferral flips per BACKLOG.md § Stale rows) as the round's first row?

## Proposed spec amendments (to ratify before decomposition)

Each lands via the protocol: amend `docs/rhema-design-spec.md` (append-only notes), add a manifest
§ Spec amendments applied line and an ADR.

| id | amendment | touches |
|---|---|---|
| **A1** | **User-journey acceptance invariant:** every Stage B, and nightly prod, runs scripted browser journeys as a new user and as an existing user; evidence is screenshots and assertions on visible text, never HTTP 200s alone. A built client bundle without a route fails CI. | new REQ-SPEC-29; manifest cross-cutting invariant 12 |
| **A2** | **Tenant isolation in depth:** the api's DB role must not bypass RLS; any query on a tenant table either runs under RLS or carries an explicit workspace predicate, and CI proves it as the prod role. | REQ-DATA-4 (amended); REQ-ARCH-30 note |
| **A3** | **Research integrity:** a Review whose verification performed zero successful fetches is not a normal delivery (per D4); the run card and dossier state it before the verdict. | REQ-VIS-9, ADR-006 successor |
| **A4** | **Pricing re-base** per D3: §14 plan table, credit price, trial entitlement, and the §16.4 economics restated from measured runs. | §14.2–14.4, REQ-SPEC-8, §16.4 |
| **A5** | **One estimate:** every surface that prints a price or duration calls the estimator service for the current draft; no static or modelled figure reaches a user. The pricing page's own claim ("derived from the published rate card") becomes a tested property. | REQ-IDE-13, REQ-BILL-1, REQ-GROWTH-5 |
| **A6** | **Copy is config:** trial/plan/limit claims in marketing and app copy are rendered from the entitlement config the ledger enforces. "Private beta" copy is removed while `signup.mode = open`. | REQ-POS-4/5, REQ-BETA-19 note |
| **A7** | **Model tier choice:** the run sheet exposes tier within plan rules; account and project defaults are honoured; Free is Base-only. | §5.6, REQ-IDE-13, REQ-GROWTH-15 |
| **A8** | **Gate defaults are data:** a gate labelled informational never blocks; §6.4's R3/R15 defaults and card copy derive from one table. | REQ-SPEC-1, §6.4 |
| **A9** | **Onboarding SLO:** text-format import (md/txt/html/docx) previews within 20 s p95 (REQ-GROWTH-1 made measurable); the held draft survives until consumed. | REQ-GROWTH-1, §13.5 |

## Operator feedback

_(to be added — the operator's own critical review of the live product. Each item becomes a `PR-H*` id in
BACKLOG.csv and folds into the lanes above or a new one.)_

## Next steps once D1–D7 and the feedback are in

1. Apply the ratified amendments (spec notes + manifest § Spec amendments applied + ADR-013…).
2. `decompose-spec mode=extend` (round 3): cut the lanes into tickets `59_…` onward, forked from the D1 base, with the
   standard tail appended. Add manifest chain rows and a § Plan extensions round line; set LEDGER `round: 3`,
   `nextTicket`, `chainTip`.
3. Run `check-build-memory.sh .` and `check-backlog.sh` green, then commit on a planning branch. A fresh
   `orchestrate-build` session drives round 3 from the ledger.

## Outcome (appended 2026-09-30)

The operator answered on 2026-09-30:
- **D1:** no merge; build off the chain tip.
- **D2:** security and hotfixes become chain tickets, not out-of-band.
- **D3:** keep the free trial review; pricing delegated.
- **D4, D5, D6:** delegated.
- **D7:** yes.
- **Operator feedback:** skipped for this round; the agentic review stands in.

The decisions, the standing authorization and the partition are recorded in
`docs/build/planning/2026-09-30_planning-ledger.md`, ADR-013…017, LEDGER GATE DECISIONS and the manifest
(§ Spec amendments applied, § Plan extensions). This memo's "Recommended shape" was refined there. Changes against
the lanes above:
- BILL.3 moves up, right after RES.1 (revenue).
- MAINT.2 follows HOT.1.
- The lane-1/lane-0 order is SEC.1 → HOT.1.
- OBJ.1 (BL-31) is excluded to round 4.
