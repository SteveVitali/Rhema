# CAPSTONE GAP ANALYSIS — Round 6 (R6CAP.1, manifest row 201)

**Ticket:** `docs/tickets/201_R6CAP.1__capstone-gap-analysis.md` · **Branch:**
`stevevitali/r6cap-1-gap-analysis` · **Base:** `main` @ `ee466fa0` (flat — the stack is
merged; PR #314 `R6WATCH.1` open at analysis time) · **Date:** 2026-11-11 · **Harness:**
devin-desktop/swe-2-high/subagent · **Mode:** `implement-spec` records + analysis only —
Stage-A, zero production mutations, **$0**. Live stage: none (no prod reads; every datum is
committed evidence or an in-repo/in-CI read).
**Normative loads:** `docs/round-6-draft-spec.md` v0.3 (ratified `GD-RATIFY.R6`) — §7 is the
census of record; `docs/research/r6_open_work_census.md` §8; ADR-111/112/113;
`docs/build/COVERAGE_MATRIX.csv` + `scripts/check-coverage-matrix.test.mjs`;
`docs/build/BACKLOG.csv`; `docs/tickets/DEFERRALS.md`; `docs/tickets/00_MANIFEST.md`;
`docs/build/readouts/{GATE-R6B,GATE-LAUNCH}.md`.
**Independence (BM-VERDICT-01):** every verdict below was formed from the spec text, the
composed tree (code/tests/committed evidence), the DEFERRALS dated cells, and the gate
readouts BEFORE any `docs/build/runs/R6*.md` ledger was opened; run-ledger claims were
reconciled afterwards (R6SOAK.1/R6SECR.1 spot-checks consistent). This ordering is recorded
here per the contract's explicit statement requirement.
**R6WATCH.1 posture:** the contractual REQ-WATCH-1 read is committed on
`origin/stevevitali/r6watch-ontime` (PR #314, open — operator merges): organic cohort empty
end-to-end at window-age ≈14.58 d; all 11 named rows → standing alert-backed watches
(`owner: operator` · `trigger: slo.review.weekly` · `re-read: 2026-11-25T04:0xZ`);
`D-R6WATCH-ON-TIME` + `D-R7DOC.1-1` → DONE on that branch; `GD-WATCH.R6` written. Those 11
watches are **deferral-carried, not gaps** — they are the spec-designed conversion for a
zero-traffic window.

## Verdict grammar

`MET` — the requirement's own layer reached with cited evidence · `MET-DIFFERENTLY(ADR)` —
satisfied by a different-but-ratified mechanism (ruling named) · `MET-ENGINEERED(D-id)` —
engineering landed and verified at its required level; a live/bespoke leg is owed on a named
OPEN D-row · `PARTIAL` — substance landed, remainder owed · `MISSING` — not landed, routed ·
`N/A-RATIONALE` — the spec itself removes the requirement · judged **at the layer §7 assigns**
(`LB` = launch-blocking, needed closure by GATE-LAUNCH; `PL` = an owned post-launch
obligation is the correct shape).

## Coverage roll-up (56 round-6 requirement ids)

| verdict | count | ids |
|---|---|---|
| MET | 37 | ENG-1, 2, 4, 5, 6, 7, 8; LCH-1, 2, 5; FOR-1…4; WRT-1…3; DEP-1…3; POST-1, 3, 4, 5, 6, 7; DISC-3; SEC-1, 2, 3; GO-1, 2, 3, 5; CLK-3, 6; WATCH-1 |
| MET-DIFFERENTLY | 2 | LCH-3 (ADR-121 authored-fixture), DISC-1 (the REQ's own refusal arm — GD-R6B) |
| MET-ENGINEERED | 3 | ENG-3 (D-RES.3-1), POST-2 (D-OPS.1-1), POST-8 (D-SLO.1-6) |
| PARTIAL | 8 | LCH-4, POST-9, GO-4, CLK-1, CLK-2, CLK-4, CLK-5, TAIL-1 |
| MISSING | 4 | TAIL-2 → 204, TAIL-3 → 205, TAIL-4 → 206, TAIL-5 → 207/208 |
| N/A-RATIONALE | 2 | DISC-2, DISC-4 (v0.1 ids retired by the spec itself, §4.7 — never reused) |

Every `MET`/`MET-DIFFERENTLY` row cites path/test/deployed evidence; every `MET-ENGINEERED`
row's D-row is OPEN and named; `check-coverage-matrix` extended to the round-6 corpus this
ticket (R6_SPEC + the 56 rows below).

## The verdict table

| REQ | verdict | evidence / disposition |
|---|---|---|
| REQ-ENG-1 | **MET** | `apps/web/src/spa/{outline,figures}.dom.test.tsx` settled `waitFor` mounts; sibling audit `reports/2026-10-20_R6ENG.1/dom-settle-audit.md` (15 router-mount files gated, 6 substrates cleared); two consecutive green `typecheck/lint/unit` runs `39465573137`/`39472603332`. D-R5REC.1-1 DONE. |
| REQ-ENG-2 | **MET** | post-commit republish of the committed high-water on every run-end path: `packages/orchestrator/src/event-store.ts:45-53` (REQ-ENG-2 stamped), `cancel.ts:133`, `delivery.ts:224`; ADR-116; `finalize-wakeup.test.ts` pins the race + wakeup-vs-poll attribution. Live window re-read is REQ-POST-8. |
| REQ-ENG-3 | **MET-ENGINEERED(D-RES.3-1)** | `phase<N>` checkpoints + late-arrival contract + retry-gate consult + budget isolation landed: `packages/orchestrator/src/internal-api.ts:917-961` (fenced, accumulating, `phase.checkpointed`), `apps/run-task/src/harness-loop.ts`; ADR-117; tests green; no paid leg ran before it landed. Live retry-verification leg rides the refused funded wave → D-RES.3-1 OPEN. |
| REQ-ENG-4 | **MET** | all five missing composite references landed: `integration`→`@rhema/ledger`+`@rhema/live-clients`, `packages/benchmark`→`@rhema/findings-core`+`@rhema/mirror`, `apps/egress-proxy`→`@rhema/db` (verified in `tsconfig.json` project references). CIREP.1 finding closed at source. |
| REQ-ENG-5 | **MET** | the system-role `JOURNEY_DATABASE_URL` binding convention is documented where the harness is read (`packages/journeys/AGENTS.md` — "Only the scheduled self-bounding cron may attest no DB" + the system-role binding rule); the $0 live read is REQ-FOR-3 (MET). Residual contrast leg folded to D-CAP.3-1 on the refused wave. |
| REQ-ENG-6 | **MET** | BL-02 cell-shape sweep verified clean at this census (every cell leads with a canonical token; three validator-stuck rows normalized this run — see census); census §5 flags dispositioned (BL-06 resolved R6ENG.1; BL-24 injection half discharged by R5OPS.1 REQ-OPS-1; BL-80/BL-82/BL-74 dated); `REQ-FIX-BL22-T7DEST` routing re-pointed `D-FIX.1-4`→`D-P1.04-2` (COVERAGE_MATRIX row, verbatim note). |
| REQ-ENG-7 | **MET** | the soak executed as designed — pre-registered contract, N=6 on `pr-206` at 0.5 vCPU/512Mi, **RED 6/6** (F-R6SOAK.1-1 platform-constraint amendment recorded: instance-billing is impossible <1 vCPU, request-billed + `startupCpuBoost` is the only realizable shape). Per the REQ's own rule a red keeps the worker at 1 vCPU/1Gi with the soak as evidence; preview torn down + orphan-swept. |
| REQ-ENG-8 | **MET** | deploy-neutral drift arm in `.github/workflows/journeys.yml` (`fetch-depth:0` + `git merge-base`/`git diff` allowlist — docs/build-memory only); unit-pinned both arms; the 2026-10-30 `--ref main` 5-red read honestly classified the unmerged env-wiring delta as NON-neutral. |
| REQ-LCH-1 | **MET** | five legal/trust SSR pages `approved: true` (`packages/contracts/src/legal.ts` `LEGAL_PAGES`/`LEGAL_DETAILS` filled, `legalApprovalViolations()` empty, `data-legal-nav` on every public page); live render verified on prod (GATE-LAUNCH threshold 3). |
| REQ-LCH-2 | **MET** | H4 evidence (`reports/2026-10-21_R6CNT.1/h4-venue-evidence.md`), H5 public-domain shortlist (five candidates + PD basis + contradicted claims), dossier proposal — H11 approved (a)/(c) verbatim, picked Wells "The Extinction of Man" for (b). |
| REQ-LCH-3 | **MET-DIFFERENTLY(ADR-121)** | the prescribed run-produced fixture path was ruled and executed: paid Full-board run `01M5NGSTDRVN42JHTAA9C2SDDW` completed on `80db0d5` ($10.68 ≤ $40) but produced a **contract-ineligible** bundle (0/14 claims checked → fails `assertShowcaseFixture`) — the operator-approved authored Wells fixture serves instead (`seedShowcaseProject`, REQ-POS-3 invariants + fresh-account leg green 1.7 s). Run-produced regeneration carried OPEN → `D-R6CNT.2-1` (BL-106). |
| REQ-LCH-4 | **PARTIAL** | `venue_table_verified_at` stamped for the evidence-backed rows (PLOS ONE verbatim; NYT/LAT/Globe corrected to fetch-confirmed values); WaPo/WSJ/USA Today stay `as_of`-stale (403/401/402 — browser re-fetch is a HUMAN arm); op-ed table NULL. `D-P1.21-1` PARTIAL. |
| REQ-LCH-5 | **MET** | notice copy verified + public explanation + dry-run recipient count recorded; calibration preconditions read (0 adopted → recorded gap → GATE-LAUNCH threshold-13 ruling); claims pinned to `pricing.json`; refund copy matches §14.4; `$50/day` kill switch + 1-concurrent cap proven under `everyone`; `docs/ops/launch-flips.md` ordered diffs; lint extended. |
| REQ-FOR-1 | **MET** | per-run verdicts committed in `reports/2026-10-21_R6FOR.1/prod-forensics.md`: D-SLO.1-5 two named failures classified; D-SLO.1-7 attributed (search/fetch-granularity — ADR-119 adopted denominator change, placement → D-R6FOR.1-1); D-SLO.1-8 canary-source read → family-prefix defect fixed on branch. Window re-reads: WATCH-1. |
| REQ-FOR-2 | **MET** | `balance_divergence` = a real defect — found, fixed, regression-tested; prod residue = test-tenant fixture contamination, no write owed. |
| REQ-FOR-3 | **MET** | the paid-guard $0 re-proof ran on the system-role DSN: `pg_roles` probe passes, meter sums read ($0 on the filtered shape — fail-closed). |
| REQ-FOR-4 | **MET** | verdict **YES** recorded (252 confirmed cross-tenant reads; every identified party operator/staff-controlled; zero post-boundary events); notice approved `GD-EXPOSURE-NOTICE.R6` and **sent** 4 emails + 4 inbox rows (counts-only log committed). D-SEC.1-2 DONE. |
| REQ-WRT-1 | **MET** | refund `01M3EAAZG2…` (56 cr) + `01M3SK62…` (340 cr) + `unverified` relabel executed under `GD-PREAUTH-ACTS.R6` (dry-run matched itemized scope, pre-state captured); D-RES.2-2 DONE. |
| REQ-WRT-2 | **MET** | `prod:d5a74cc` deployments id rewritten to the 40-char SHA; cleanup observation gone; D-BL38.1-1 DONE. |
| REQ-WRT-3 | **MET** | hand-dated tombstone armed; destruction verified live (CLK-3 — purge `357a8ba1` fired `objectsDeleted:0` honestly recorded); D-P1.04-2 DONE. |
| REQ-DEP-1 | **MET** | tip deploys executed under `GD-DEPLOY.R6` at `dc7fb15`/`ba66c4b`/`e04a8c8`/`dc3a8f6`/`b04fc1b`/`b953c55e`/`4938b8e` — every one preview-classified additive-only, provenance all-PASS, `deployments` row recorded; rollback recipe written. |
| REQ-DEP-2 | **MET** | drills all PASS — PITR restore RTO 579 s; rollback N−1 PASS; egress playbook PASS; on-call runbook names responder + paging path; alerts armed end-to-end (`webhook_tokenauth` channel on all 14 AlertPolicies, sink-proven 488+ receipts; first natural incident owed-by-nature). |
| REQ-DEP-3 | **MET** | HA live + drill-proven — Cloud SQL `REGIONAL`, proxy MIG×2 behind the ADR-122 internal passthrough NLB (VIP `10.8.16.7`, failover drill green); worker right-size correctly NOT flipped (REQ-ENG-7 soak RED); `billing-read.mjs` recomputed off live `availabilityType`. |
| REQ-POST-1 | **MET** | prod SSR arm re-proven — `N2.invite`/`N10`/`P1.public` under `--expect-renderer ssr` + `--expect-sha` on the deployed tip, zero violations; 30+ ssr-pinned signed-in legs PASS. D-SPA.6-1 DONE. |
| REQ-POST-2 | **MET-ENGINEERED(D-OPS.1-1)** | mailto, invite-accept (real operator-minted invite consumed live, `used_count` 0→1), `/r/:token` expiry, OAuth initiation all proven on the deployed tip; N9 green on the authorized Stripe posture stage; `R10.keepalive` green on the domains stage. Row stays OPEN only on its literal "prod full-list-green" condition — the N9 funded-tenant substrate rides the refused wave (threshold-11 class). |
| REQ-POST-3 | **MET** | deep-link `…/v/<version>#f-<finding>` lands the dossier host with the anchor in-viewport, `consoleErrors:[]`. D-CAP.1-1 DONE. |
| REQ-POST-4 | **MET** | REQ-GO-2's own arm — scheduled `journeys.yml` nightly `41472916874` (`schedule`, `main` @ `79aca4af`) green on deployed `4938b8e`: 44 PASS / 21 paid-skip / 0 FAIL, provenance `match:true`. D-OBS.1-3/D-SPA.28-1 DONE. |
| REQ-POST-5 | **MET** | T8 410 arm (`mint-t8-export.mjs --execute` → live 410 `export_link_expired`, bogus→404); `--entitlement` N5 render probes green (matched `data-included` vs mismatched suppression); account-zip round-trip + organic expiry arm (CLK-6). |
| REQ-POST-6 | **MET** | both posture stages authorized + executed: domains-bearing `pr-211`/`pr-219` (N8 + `R10.keepalive` green on a real `wss://` collab wire — F-R6POST.2-2 fixed); Stripe test-mode `pr-230` (`sk_test` via `stripe-pull`, N9 PASS). Teardown + orphan-sweep verified. |
| REQ-POST-7 | **MET** | API-minted GCS V4 signed URLs (tenant check before mint, `response-content-disposition=attachment` for non-allowlisted types, short TTL — `apps/api/src/usercontent-routes.ts`, ADR-113) + live verify: unsigned→denied, signed→200, tampered→403, expired→denied, no `Set-Cookie`, attachment/octet-stream headers. D-R5OPS.1-2 DONE. |
| REQ-POST-8 | **MET-ENGINEERED(D-SLO.1-6)** | the ADR-116 fix is deployed; the p95 measurement window is physically organic-traffic-bound (0 tail samples post-deploy — no honest window exists; journey cohort cannot mint one). Carried PL at GATE-LAUNCH signature (`GD-THRESH1.R6`). |
| REQ-POST-9 | **PARTIAL** | Showcase-seeding leg green (signup→finding 11.97 s ≤ 60 s, 12 Wells finding rows); drop-zone→signup→ingest ≤20 s round-trip + funnel-rate arms stayed owed → `D-P1.17-2` PARTIAL (funnel metrics discharged to WATCH-1: organic legs all zero — below/below/unmeasurable); Lighthouse/axe arm relates to REQ-DACC-4's `P1.demo` axe leg (recorded interaction, never a substitute claim). |
| REQ-DISC-1 | **MET-DIFFERENTLY** | the requirement's own arm executed — **"a refusal at bind is the finding — reported, never spent past"**: GATE-R6B operator-dispositioned STAYS-CLOSED (verbatim recorded; ~$69 headroom vs $54.50+Showcase, stale-evidence argument); GATE-LAUNCH threshold-11 read MET-as-disposition; the 23 carrier rows stay OPEN un-waived (deviation list §draft-3). $0 spent. |
| REQ-DISC-2 | **N/A-RATIONALE** | retired v0.1 id — spec §4.7: superseded by REQ-WRT-*/REQ-DEP-3; id never reused. |
| REQ-DISC-3 | **MET** | minimal 4-protocol cohort executed @ `80db0d5`: 4/4 legs completed, schema-valid, $33.89 list ≤ $100 hard cap; `Promotion OK` after `GD-GOLDEN-BAND.R6` re-calibrated the a-priori `major` band (operator verbatim acceptance); fixture projects + floors committed; standing re-run rule in `docs/ops/golden-rerun-rule.md` (deploys since are non-protocol-affecting per its class list). D-P0.15-4 DONE. |
| REQ-DISC-4 | **N/A-RATIONALE** | retired v0.1 id (with DISC-2). |
| REQ-SEC-3 | **MET** | pre-launch adversarial review on the deployed tip — code-against-controls + **178 live tenancy/authz legs** on every user-serving route + planted foreign ids: exactly one finding, **CRITICAL** `F-R6SECR.1-1` (cross-tenant diff/what-changed read+write) — fixed in-ticket, deployed, live re-verified; `F-R6SECR.1-2` (low, HSTS) → fixed and deployed. Exit: **0 open criticals/highs**; not-independent statement committed. §12.8 live-exercise residual → `D-R6SECR.1-1` (BL-106). |
| REQ-SEC-1 | **MET (PL layer)** | external pen test is a post-launch obligation by spec design (ADR-112): procurement package committed (`pen-test-scope.md` + `pen-test-vendor-package.md`); obligation carried `D-P1.22-3` OPEN — `owner: operator` · `trigger: launch + 60 d` (~2026-12-28). |
| REQ-SEC-2 | **MET (PL layer)** | findings-triage path committed (`pen-test-findings-triage.md` severity scale + dispositions); the PL carrier is the same `D-P1.22-3` obligation; hotfix authority = `GD-DEPLOY.R6`-equivalent terms on report arrival. |
| REQ-GO-1 | **MET** | MERGE-1 executed by the operator 2026-10-27: PRs #219–#224 merged bottom-up, ancestors auto-merged — zero open PRs, `main` @ `0039850` (contained chain tip `7413b17`). |
| REQ-GO-2 | **MET** | post-merge `main` deployed (`4938b8e`, additive, provenance all-PASS) + the literal arm closed: scheduled nightly `41472916874` green on `main` HEAD with provenance match (44/21/0). Dispatch-equivalent evidence recorded earlier under `GD-THRESH6.R6`. |
| REQ-GO-3 | **MET** | GATE-LAUNCH **SIGNED** 2026-10-27 — 11/13 MET, thresholds 6 + 13 signed under recorded rulings (`GD-THRESH6.R6`, `GD-THRESH13.R6`), threshold-1 dispositions recorded (`GD-THRESH1.R6`); operator's go verbatim in the readout. |
| REQ-GO-4 | **PARTIAL** | launch executed 2026-10-28T04:0xZ: flips 2→3→4 each live-verified before the next (`PURCHASE_MODE=open` real `cs_live_…`; `REFUND_WINDOW_MODE=open` real 1,797-cr refund; `trial.audience=everyone` claimed by a fresh unflagged account) + post-flip smoke green on a fresh non-test account. **Flip 1 (`debitMode→metered`) parked ≥2026-12-01** under `GD-THRESH13.R6` (calibration precondition unmet + 30-day notice) — the ruled gap rides the calendar; deviation §draft-2. |
| REQ-GO-5 | **MET** | MERGE-2 — the launch-flip PR sequence merged to `main` (chain landed; post-launch nightlies read the flipped SHA). |
| REQ-CLK-1 | **PARTIAL** | the `project.purge` job was verified **armed** `start_after=2026-10-30T21:41:10.952Z` (tombstone+30d exactly); the post-fire absence re-read (`projects` row gone) is **not recorded** — owed, one read-only SELECT. `D-BL38.1-2` OPEN. |
| REQ-CLK-2 | **PARTIAL** | `notify.sweep.weekly` fired + claimed zero — honestly (no `T16VOICE` substrate exists; the seeded stale-voice persona needs the funded wave's paid T16 leg, refused at GATE-R6B). The claim can only be observed after a paid arm seeds T16 — conditioned, dated, carried OPEN (`D-FIX.1-4`). |
| REQ-CLK-3 | **MET** | hand-dated tombstone destruction verified (WRT-3's verify arm). `D-P1.04-2` DONE. |
| REQ-CLK-4 | **PARTIAL** | `billing_export_prod` still **zero tables** at launch+14.6 d — the export never populated; the console-flip re-check stays operator-owed. Observed-side proxy appended (`billing-read.mjs` $256.65/mo recomputation). Carried on `D-COST.1-1`/`D-OPS.1-3` (watch-dated tails by R6WATCH.1). |
| REQ-CLK-5 | **PARTIAL** | `usage.reconcile` runs daily — but since **2026-11-05 it fails 7× consecutively** `provider report fetch failed: 403` in `AnthropicAdminReportSource.fetchAll` (a bound-but-denied key — new honest datum vs the earlier placeholder-skip). Green-read criterion unmet; operator key re-seed owed (`D-ECON.1-1`/`D-PRB.08-1`, watch-dated). |
| REQ-CLK-6 | **MET** | the T8 organic 7-day expiry 410 arm verified live (organic export row, `export_link_expired`). `D-P1.18-1` DONE. |
| REQ-WATCH-1 | **MET** | the contractual launch+14 d read executed at window-age ≈14.58 d (PR #314, on `origin/stevevitali/r6watch-ontime`): organic cohort **empty end-to-end** — the contract §4 conversion applied: all 11 rows → standing alert-backed watches (owner `operator`, trigger `slo.review.weekly` proven firing, re-read `2026-11-25T04:0xZ`); `GD-WATCH.R6` written; funnel verdict below/below/unmeasurable; zero rows called green on zero data. |
| REQ-TAIL-1 | **PARTIAL** | this document is the R6CAP.1 half (verdicts + §7 completeness + census + drafted deviations); the R6CAP.3 closure + deviations-draft row is manifest 202, next. |
| REQ-TAIL-2 | **MISSING → 204** | backlog reconcile (G2/H2 re-home, roadmap reclassify, owned obligations, `OPERATIONAL_READINESS.md` rewrite) routed to `204_R6REC.1` (BL-106 + §7 (h)). |
| REQ-TAIL-3 | **MISSING → 205** | spec reconcile (§13.3/ADR-113 fold, §17/ADR-111 check, BL-05 fold-backs) routed to `205_R6REC.2`. |
| REQ-TAIL-4 | **MISSING → 206** | integration plan + final merge-sweep runbook routed to `206_R6REC.3`. |
| REQ-TAIL-5 | **MISSING → 207/208** | repo-docs + agent-docs refreshes + the closing ledger write routed to `207_R6DOC.1`/`208_R6DOC.2`. |

## §7 row-accounting completeness

The spec's own check, re-run against the live DEFERRALS positional parse
(first canonical token per status cell — the census §8.6 rule):

- **`LB` rows: every one is DONE, WONTFIX-by-ruling, or carries a GATE-LAUNCH disposition.**
  - DONE (28): D-R5REC.1-1 · D-SPA.6-1 · D-CAP.1-1 · D-OBS.1-3 · D-SPA.28-1 · D-SPA.24-1 ·
    D-SPA.16-1 · D-SPA.20-1 · D-P0.15-4 · D-R5OPS.1-2 · D-RES.2-2 · D-BL38.1-1 · D-FIX.1-1 ·
    D-FIX.1-3 · D-STB.5b-4 · D-MAINT.3-1 · D-SEC.2-1 · D-PRB.01-1 · D-SEC.1-2 · D-PRB.01-2 ·
    D-P1.17-1 · D-P1.18-1 · D-DEF.4-3 · D-ACT.1-3 · D-PRB.04-2 · D-MAINT.4-1 · D-P1.04-2 ·
    D-R6INF.1-1 (the last three via this run's normalization tails — leading-token repair,
    discharge evidence already on the row).
  - WONTFIX-by-ruling (2): D-ECON.1-2 · D-ACT.1-1 (closed 2026-10-20).
  - GATE-LAUNCH dispositions, recorded: D-SLO.1-6 (`GD-THRESH1.R6` carried PL) ·
    D-EDIT.1-2/D-P1.19-2 (operator verbatim "skip safari and mobile", PL) ·
    D-OBS.1-3/D-SPA.28-1 (`GD-THRESH6.R6`, since discharged) · the money rows
    D-P1.16-1/D-BILL.3-1/D-BILL.3-2 (sequenced-inside-launch; executed — residual arms
    below) · the **23 (b)-class funded rows** (refusal disposition — GATE-R6B +
    threshold-11; OPEN by design, un-waived) · D-RES.3-1's live leg and D-STB.5b-1's
    contrast leg (same refused-wave class) · D-OPS.1-1's N9-substrate arm (same class).
  - Still OPEN/PARTIAL with named residual owners — **none unhomed**: D-P1.22-2
    (first-incident receipt, owed-by-nature) · D-P1.21-1 (3 stale venue rows → HUMAN
    browser re-fetch) · D-P1.17-2 (funnel→WATCH-1 + drop-zone residual) · D-P1.20-1
    ((e) clock + (f) paid arm) · D-OPS.2-1 (console flip — export never populated;
    re-check owed, rides the CLK-4 watch) · D-OPS.2-2/D-COST.1-3 ((a) conditional —
    soak RED, stays 1 vCPU; (b)/(d) → REQ-TAIL-2 roadmap) · D-EDIT.1-2/D-P1.19-2
    (operator-skipped — PL) · D-PRB.07-1/D-P1.08-1/D-P1.09-1 (HUMAN-runnable residual
    halves) · D-FIX.1-2/-1-4 (T15/T16 substrate — conditioned on a paid arm).
- **`PL` rows: every one carries owner + trigger.** The 11 `GD-WATCH.R6` standing watches
  (D-R5OPS.1-1, D-COST.1-2, D-SLO.1-5/-7/-8, D-ECON.1-3/-4, D-ECON.2-5/-6/-7, D-P1.17-2's
  funnel arm) all carry `owner: operator` · `trigger: slo.review.weekly` · `re-read:
  2026-11-25T04:0xZ`. The clock-bound PL carriers (D-BL38.1-2, D-FIX.1-4, D-COST.1-1,
  D-OPS.1-3, D-ECON.1-1, D-PRB.08-1) carry dated re-read conditions; D-P1.22-3 carries
  `launch + 60 d`; the (h)-strategic rows (D-P0.12-3, the ten G2/H2 rows, D-RES.2-3) carry
  the REQ-TAIL-2 re-home to 204.
- **Zero unhomed OPEN/PARTIAL ids** — the census §8.6 coverage check re-run: 130 unique
  OPEN/PARTIAL ids in DEFERRALS today; every one resolves to a §7 row, a BL row, a
  `GD-WATCH.R6` watch, a `GD-THRESH*.R6` disposition, a BL-106 carry, or the R7 sweep homes
  (BL-104/105/100). **0 unhomed.**
- **The 9 BL-106 carriers** (D-R6CI.1-1, D-R6FOR.1-1, D-R6INF.1-1, D-R6CNT.2-1,
  D-R6SECR.1-1, D-R6FIX.4-1, D-R6FIX.5-1, D-R6PAIDARM-1, D-R6OSS.1-1): in scope here per
  contract — verdicts recorded; one discharged this run (D-R6INF.1-1 normalized to DONE —
  its discharge evidence has been on the row since R6INF.2); D-R6CI.1-1's after-sample read
  attempted below; the rest carry to 204/205 with owner notes.

## Finding accounting (P0/P1 closed or ruled)

Every round-6-era `F-R6*` finding is closed at source, dispositioned, or carried OPEN on a
named row — **zero unmapped**:

- **Fixed + deployed + live-proven:** F-R6SECR.1-1 (CRITICAL tenancy) · F-R6SECR.1-2 (HSTS)
  · F-R6CNT.2-1 (dead upstream Anthropic key — operator rotated v4, proxy cycled) ·
  F-R6LCH.1-1 (subscription-convergence) · F-R6POST.2-2 (session-owned UndoManager) ·
  F-R6SWP.1-1/-2 (nightly workflow timeout + WIF auth) · F-R6SWP.1-5 (signup/magic-link
  limiter — ADR-124 `rl:testidentity` bounded bucket, discharged live) · F-R6DEP4-1
  (workflow env-wiring — secrets + IAP+SSH tunnel + WIF IAM) · F-R6DEP4-2 (plaintext proxy
  DSN → SM name + boot fetch, R6HRD.1) · F-R6DEP.2-1 (CI WIF/vars/binvocation — 3 layers) ·
  F-R6DEP.2-2 residue (revoked+reminted).
- **Resolved-in-code, deploy-verified:** F-R6H11-1/-2 (R6FIX.2 — `y_epoch` restore
  convergence + vendored-SDK image fix, deployed `e04a8c8`+) · F-R6H11B-1/-2 (R6FIX.5 —
  nanoid user ids + webhook `enabled_events`; live-proven in the launch deploy) ·
  F-R6CNT.3-1 (phase done-gate `claim_ledger_closed` — R6FIX.4, deployed at launch) ·
  F-R6INF.1-1 (recorded → ADR-122 design → R6INF.2 executed).
- **Operator-ruled:** F-R6GLD.1-2 (golden band — `GD-GOLDEN-BAND.R6` "I accept the band") ·
  F-R6OPS.1-1 (14 policies → armed channel, R6OPS.2).
- **Carried OPEN on named rows:** F-R6FIX.5-1's change-plan half (`D-R6FIX.5-1`) ·
  F-R6LCH.PAID-1..4 re-proof (`D-R6PAIDARM-1`, Monday paid cron) · F-R6SWP.1-4's
  T8-half (operator mint acts) — JOURNEY_DATABASE_URL since wired (R6DEP.4) ·
  `balance_divergence` → REQ-FOR-2 defect-fixed · CIREP.1 → REQ-ENG-4 landed ·
  matrix routing → REQ-ENG-6 landed.
- **Soak/platform:** F-R6SOAK.1-1 — instance-billing incompatible <1 vCPU; the
  request-billed amendment is the recorded outcome, not a defect.

## Deferral census (round-6 scope)

`## R6CAP.1` section appended in DEFERRALS — effective statuses after this run's dated
tails. **Four validator-stuck normalizations** (leading stale token, discharge already
evidenced on the row — the REQ-MEM-1 convention, cells preserved verbatim):
D-SPA.24-1 → DONE (R6DEP.2 posture legs) · D-PRB.04-2 → DONE (R6FIX.3 obligation chips) ·
D-R6INF.1-1 → DONE (R6INF.2 HA executed) · D-MAINT.4-1 → DONE (both halves proven; 409-merge
+ revoked-grant sub-legs ride as carried HUMAN arms under `GD-THRESH1.R6`).

**D-R6CI.1-1 after-sample attempt (this run, $0):** the named after-sample read
("billed minutes per head class, docs-only share, full-run wall-clock") was attempted via
`gh` — the repo is **public** since R6OSS.1 (2026-11-03), so Actions minutes are unmetered
and "billed minutes" reads degenerately; the measurable residue is wall-clock + selection
share. Sampled 50 `ci.yml` `main`-push runs 2026-11-05→11-10: 49 success / 1 failure
(external-class), wall-clock ≈ 25–38 min/run — full-suite durations, no docs-only runs in
the window (the chain is code-heavy; the docs-only fast path is exercised on docs PRs).
The baseline-vs-after delta therefore stays honestly **unmeasured on this axis** — recorded
on the row; the fast path remains fail-closed (a misclassification costs minutes, never
coverage). Row stays OPEN to 204/205 with this dated note.

## Draft — the R6 deviations list (for `203_GATE-ACCEPT.R6` to sign — NOT signed here)

1. **Launched state:** prod serves the launched tree (`4938b8e`+ lineage, provenance
   all-PASS at every deploy); GATE-LAUNCH SIGNED 2026-10-27 (11/13 MET + 2 ruled);
   launch executed 2026-10-28T04:0xZ with flips 2–4 live-verified.
2. **Coverage:** 56/56 round-6 ids verdicted (37 MET · 2 MET-DIFFERENTLY ·
   3 MET-ENGINEERED · 8 PARTIAL · 4 MISSING-routed · 2 N/A-retired); §7 accounting
   complete; 0 unhomed OPEN/PARTIAL rows; finding map 0 unmapped.
3. **The refused funded wave (`REQ-DISC-1`)** — GATE-R6B STAYS-CLOSED + threshold-11
   refusal disposition: the ~$150 envelope stands unexecuted; the 23 (b)-class carrier rows
   stay OPEN, un-waived, without a new home — accept as the signature-level deviation (a
   narrower envelope can always be re-ruled later).
4. **Flip 1 parked** — `debitMode→metered` cannot fire before `EFFECTIVE_DATE 2026-12-01`
   (`GD-THRESH13.R6`; calibration precondition unmet + 30-day notice). `DEBIT_MODE=committed`
   meanwhile — REQ-SPEC-32's activation discrepancy stays disclosed, not weakened.
5. **Authored Showcase fixture** — ADR-121: the prescribed run-produced bundle path failed
   honestly (contract-ineligible delivery); the operator-approved authored Wells fixture
   serves; regen carried `D-R6CNT.2-1`.
6. **Clock reads not closed:** CLK-1 (purge-fire verify owed — one SELECT), CLK-2 (T16
   substrate precondition dead with the wave), CLK-4 (billing export zero tables — operator
   console re-check), CLK-5 (admin key bound-but-403 since 11-05 — operator re-seed).
7. **Operator-leg residuals carried:** Safari/WebKit + real-phone interactive legs
   (operator verbatim "skip safari and mobile for now" — PL); HUMAN-runnable residual
   halves (D-PRB.07-1, D-P1.08-1, D-P1.09-1's structured-edit arm → funded class,
   D-P1.20-1(e)/(f)); Stripe residual arms (D-P1.16-1 legs e–g/i, D-BILL.3-1 hosted-UX/Tax,
   D-BILL.3-2 leg-c); H4's three fetch-blocked venue rows (D-P1.21-1).
8. **Traffic-bound measurements → standing watches** — the 11 `GD-WATCH.R6` rows incl.
   first-finding p50, cap calibration, ECON cells, SLO windows, funnel legs: organic cohort
   empty → `owner: operator`/`slo.review.weekly`/re-read 2026-11-25. `D-ECON.2-5`
   conditionally parked. POST-8's SSE-p95 window is organic-bound (`D-SLO.1-6`).
9. **Engineering carries to 204/205 (BL-106 + §7 (h)):** ADR-119 placement (D-R6FOR.1-1),
   §12.8 hostile-fixture legs (D-R6SECR.1-1), discourse-outcome contract (D-R6FIX.4-1),
   plan-change Stripe propagation (D-R6FIX.5-1), paid-arm re-proof (D-R6PAIDARM-1 — Monday
   cron), OSS flip residuals (D-R6OSS.1-1 — operator), CI-cost delta (D-R6CI.1-1), showcase
   regen (D-R6CNT.2-1); the ten G2/H2/eval rows + D-P0.12-3 + D-RES.2-3 → REQ-TAIL-2.
10. **External pen test** — ADR-112 PL obligation (`D-P1.22-3`, launch+60 d).
11. **Verdict-edge notes for signature:** REQ-DISC-1 reads MET-DIFFERENTLY only through its
    own refusal arm (a signature either accepts the carry or re-opens the wave);
    REQ-POST-2/POST-8/ENG-3 read MET-ENGINEERED on named OPEN rows; the 4 validator-stuck
    normalizations are parse-hygiene, not new evidence; R6WATCH.1's evidence sits on an
    open PR at analysis time (#314 — merge ordering is the operator's).

## Operating-clause compliance

Verification: `check-coverage-matrix` extended + green; `check-build-memory`,
`check-append-only --base origin/main`, `ci-boundary.sh --pr` recorded in the PR. No new
behaviour → no new tests owed (the matrix test IS the deterministic artifact). REQ id
stamped in the PR: `REQ-TAIL-1`. AC layers: deterministic (coverage check) + agentic
(this document). Dates from `date -u`; append-only (dated appends, zero rewrites); harness
in the run-ledger header; spend **$0**; prod untouched (Live stage: none).
