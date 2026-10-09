# Rhēma — consolidated backlog (round 2 → round 3)

> Written 2026-09-30 by `reconcile-build mode=backlog` (the REC.1 procedure, run ahead of a REC.1 chain row —
> ratifying it as a row is itself **BL-04**). The machine-readable form is [`BACKLOG.csv`](BACKLOG.csv). The
> operational view is [`OPERATIONAL_READINESS.md`](OPERATIONAL_READINESS.md). Chain tip at writing:
> `stevevitali/stb-4-real-money-external` @ `cf40f28`. This document changes no deferral row, ledger line or
> manifest line. Where it recommends a change, the owning row does it.

## The contract and how it was checked

Each owed item appears in exactly one row's `sources` cell. The sources gathered were:

| Source | Count | How it appears in `sources` |
|---|---|---|
| `DEFERRALS.md` rows whose status (the first status keyword in the last cell) is OPEN / PARTIAL / ACCEPTED-SKELETON | 58 (27 OPEN · 30 PARTIAL · 1 ACCEPTED-SKELETON) | `D-<TICKET>-<n>` |
| `## Revisit trigger` in `docs/adr/ADR-*.md` | 12 | `ADR-NNN` |
| Entries in LEDGER `## OPEN FINDINGS` | 10 | `OF-<slug>` (mapping below) |
| Owed items that no deferral row tracks | 36 | `X-<slug>` (mapping below) |
| Rows marked DONE that still carry an owed residual | 3 | `D-P0.15k-1`, `D-P1.04-2`, `D-PRB.21-1` |

The result is **49 rows**: 46 open, 2 closed, 1 accepted.

**Checker finding.** `check-backlog.sh` exits 0, but it expects only **38** sources: 26 deferrals plus 12 ADRs.
The cause is its status parser. It uppercases the last cell, strips its spaces, and matches only a leading
`OPEN` or `PARTIAL`, so it misses the 32 rows whose status cell begins with `**` (bold) or with a date. For
example, `**PARTIAL — 2026-09-25 (RCN.1)…` is never counted. A stricter check that applies the file's own rule
(first keyword in the cell) passes **80/80**: 58 deferrals, 12 ADRs and 10 OPEN FINDINGS, with 0 missing and 0
duplicates. There are two ways to close the blind spot:

- In agent-skills: have the parser strip `*` and use the first-keyword regex.
- In this repo: normalize the status cells, which is part of **BL-02**.

## Counts

| Landing | Rows | | Type | Rows |
|---|---|---|---|---|
| `round-3/*` (26 proposed tickets) | 31 | | deferred-feature | 13 |
| `operator` | 8 | | process | 11 |
| `GATE-G2` | 3 | | defect | 9 |
| `HUMAN-H2` / `HUMAN-H4` / `HUMAN-H5` | 1 / 1 / 1 | | operational-prereq | 5 |
| `GATE-ACCEPT` | 1 | | external-dep | 5 |
| `accepted` | 1 | | docs-drift | 3 |
| `closed` | 2 | | rights/legal | 2 |
| | | | schema-refinement | 1 |

Sizes: 21 S · 21 M · 7 L.

## Themes

1. **Integration debt comes first.** 33 stacked PRs (#48–#80) are open. `origin/main` (tip `256f594`) merges only PRs ≤ #47,
   while prod runs images built from the unmerged `def-3` / `stb-4` branch tips. The `dev` stage is a
   23-resource skeleton, and no `pr-<n>` preview has ever been deployed. Everything else inherits this base:
   BL-01 and BL-25.
2. **Items that are live on prod and should block launch.**
   - The api's DB role bypasses RLS, and the dossier tables have no RLS (BL-08).
   - Three Stripe-path fixes are committed but not deployed, while prod holds a live Stripe key and a live
     Payment Link (BL-09).
   - Every §13.5 SLO read red during STB.3 (BL-07).
   - Ledger integrity has loose ends (BL-10).
   - Signup throttling is per-instance (BL-23).
3. **Economics.** A quick review costs about $7–10 metered (720 cr metered / 586 cr committed on the one
   delivered quick review, `01M36663…`). The Writer plan is $20/mo with 2,000 included credits. The estimator
   still under-models context churn. The operator's G3 decision records this as carried product risk, but no
   row owns it (BL-13). Related rows: BL-14 (durable estimator constants), BL-30 (the refund window has no
   caller), and BL-29 (the ~$95/mo infra floor against a ~$50/mo target).
4. **Remaining live verification.** The Stage-B residue is five bounded paid-run rows (BL-16..20), two $0
   headless rows (BL-21/22), the launch-verification remainder (BL-24), and one operator browser session
   (BL-32). Several of these rows predate the DEF.1 reruns and overstate what remains (see *Stale rows*).
5. **External and human dependencies.** Live-mode Stripe (BL-33), the Usage & Cost admin key (BL-34), the pen
   test (BL-35), the H2 corpus (BL-40), H4 venue tables (BL-41), H5 showcase content (BL-42), and the nightly
   golden budget (BL-36).
6. **Gates.**
   - G2 is still a **hard** gate before §16.4 claims or a public launch (BL-43..45).
   - G3 was read early and accepted by the operator (BL-46).
   - H3 is deferred in part (BL-39).
   - GATE-ACCEPT has never been signed (BL-47).
7. **Build-memory process.** The standard v2 tail never ran: CAPSTONE was a single ledger row, with no
   `COVERAGE_MATRIX.csv`, no GATE-ACCEPT, no REC.1–3 and no DOC.1–2. LEDGER CURRENT STATE has drifted, the
   manifest's `## Plan extensions` stops at 2026-09-18, and 13+ deferral status cells are stale. This is
   covered by BL-02..06.

---

## Rows by landing

### round-3 — integration and build-memory tail (do first)

| bl_id | title | sources | gate | size |
|---|---|---|---|---|
| BL-01 | Integration plan + bottom-up merge of PRs #48–#80 + deployed-tree vs merged-main diff | X-prs-48-80-unmerged · X-tail-rec3-integration · X-prod-tree-vs-main-diff | operator merge | L |
| BL-02 | Build-memory hygiene: LEDGER CURRENT STATE, GATE DECISIONS heading, RETURN PASS, manifest Plan extensions, DEFERRALS status normalization, stale run-ledger headers | X-ledger-state-drift · X-manifest-plan-extensions-stale · X-deferrals-status-hygiene · X-run-ledger-stale-headers · ADR-004 | — | M |
| BL-03 | CAP.1 `COVERAGE_MATRIX.csv` from CAPSTONE §3 + reconcile its REQ counts | X-tail-coverage-matrix · X-capstone-req-count-drift | — | M |
| BL-04 | REC.1 — ratify this backlog as a chain row | X-tail-rec1-backlog | — | S |
| BL-05 | REC.2 — spec reconciliation (G2/G3/H3 overrides, ADR deviations, ADR-007↔ADR-012 lineage) | X-tail-rec2-spec · ADR-007 · ADR-012 | operator ratifies | M |
| BL-06 | DOC.1 + DOC.2 docs refresh incl. stale phase readouts | X-tail-doc-refresh · X-phase1-exit-readout-stale | — | M |

### round-3 — launch-blocking defects and economics

| bl_id | title | sources | gate | size |
|---|---|---|---|---|
| BL-07 | Prod SLOs red (STB.3 F8) — diagnose, remediate, fix probe definitions | X-f8-prod-slos-red · X-slo-probe-gaps · OF-stb3-live-findings | bounded live runs | L |
| BL-08 | Tenant isolation root cause — BYPASSRLS api role + no RLS on dossier tables | X-api-db-role-bypassrls | new DB role + secret rotation (provided: no) | M |
| BL-09 | Deploy STB.4 Leg A Stripe fixes + pending-checkout email gap | X-stb4-stripe-fixes-undeployed · X-pending-checkout-email-gap | deploy approval | S |
| BL-10 | Ledger integrity closeout | D-DEF.2-1 · X-held-check-migration-parity · X-f5-settlement-live-proof · X-balance-divergence-recheck | ≤$5 live leg | M |
| BL-11 | Small correctness fixes (estimate `modelTier` 400; second-read guidance) | D-DEF.3-2 · X-second-read-guidance-ignored | — | S |
| BL-12 | `lever-matrix` perf-assertion flake | X-lever-matrix-flake | — | S |
| BL-13 | Unit economics + pricing model | X-unit-economics · OF-prb21-review-cap-uncompletable · D-PRB.21-1 | operator pricing ruling | L |
| BL-14 | Durable estimator fold store | D-P0.15k-1 · ADR-005 | — | S |
| BL-15 | Citation completeness (fetch backfill / fetch-then-cite) | X-citation-completeness · ADR-006 | — | M |
| BL-23 | Signup admission: invite enforcement live + shared throttle store | D-PRB.01-1 · D-PRB.13-1 · ADR-009 | — | M |
| BL-26 | Run-task confinement: distroless + tight AppArmor profile | D-P0.06-3 · X-apparmor-unconfined-runtask | — | M |
| BL-30 | `refundPhases` caller — §14.4 refund window / cancel-with-partials | D-P0.15d-2 | operator product ruling | M |
| BL-31 | Matcher-3 floor tuning + rubric conjunct / Convergence report | D-P0.12-3 | real disposition corpus | M |

### round-3 — live verification (`STB.5-*`)

| bl_id | landing | title | sources | budget |
|---|---|---|---|---|
| BL-16 | STB.5-bounded-live-legs | Skill-input pins (sidecar-absent; mid-phase `phase:"N"`) | D-P0.03-2 · D-P0.03-3 · D-P0.15b-2 · D-P0.15c-2 | ≤$3 |
| BL-17 | STB.5-bounded-live-legs | Engine invariants (`completed_partial` cap; post-commit high-water publish) | D-P0.09-3 · D-P0.08b-2 | ≤$5 |
| BL-18 | STB.5-bounded-live-legs | Fetch-policy legs (Full-board fetcher; memo deny-on-attempt + delivered memo) | D-PRB.02-3 · D-P1.21-2 | ≤$15 |
| BL-19 | STB.5-bounded-live-legs | Gate + finalize legs (structured edits → next-phase file; outline finalize; approve_sample + leak audit) | D-P0.15-3 · D-P0.15c-3 · D-P1.10-1 · D-P1.12-1 · D-P1.14-1 | ≤$30 |
| BL-20 | STB.5-bounded-live-legs | research_burst fetch/distill delivered; chat_turn plan-card/turn-result asserts (a turn completed in DEF.3); thread-local routing ruling | D-P1.11-1 · D-DEF.1-1 | ruling + ≤$5 |
| BL-21 | STB.5-headless-legs | Dossier surfaces on an own-tenant delivered review | D-P1.07-1 · D-PRB.04-1 | $0 |
| BL-22 | STB.5-headless-legs | Export / notifications / ingest / purge legs | D-P1.18-1 · D-P1.19-1 · D-P1.15-1 · D-P1.04-2 | $0 |
| BL-24 | STB.5-launch-verification | Canary pause smoke, alert paging, CDN-signed usercontent headers, first-finding ≤4 min | D-P1.22-2 | CDN key (provided: no) + signups |

### round-3 — ops

| bl_id | title | sources | gate | size |
|---|---|---|---|---|
| BL-25 | Non-prod stages: `dev` skeleton + `pr-<n>` preview never run | D-P0.15b-1 · X-dev-stack-stale | operator budget | M |
| BL-27 | IaC/runbook drift (manual collab secret/role; cosmetic scaling drift; scratch helpers) | X-iac-runbook-drift | — | S |
| BL-28 | Self-hosted Turbo remote cache | D-P0.01-4 | — | S |
| BL-29 | Prod cost + HA posture vs the ~$50/mo target | X-infra-cost-vs-target · ADR-010 | operator budget | S |

### operator

| bl_id | title | sources | gate | size |
|---|---|---|---|---|
| BL-32 | Browser session: EventSource run card, CodeMirror editor, versions/approvals/settings/landing/phone, P1.02 page editor | D-PRB.04-2 · D-PRB.07-1 · D-P1.08-1 · D-P1.09-1 · D-P1.17-2 · D-P1.19-2 · D-P1.20-1 · X-p102-page-editor-live-verify | human browser + throwaway account | M |
| BL-33 | Live-mode Stripe re-verify + credential hygiene | D-P1.16-1 · X-stripe-credential-hygiene | real money ≤$50; test-mode key provided: no | M |
| BL-34 | Usage & Cost reconcile — real admin/org key | D-PRB.08-1 | admin key provided: no | S |
| BL-35 | External pen test — procure + triage | D-P1.22-3 | procurement | L |
| BL-36 | Nightly golden run + score-floor gate + phase-0 readout refresh | D-P0.15-4 · D-P0.15b-4 · D-P0.15c-5 | ~$150–300/night | M |
| BL-37 | Cross-tenant dossier exposure-window review + disclosure decision | X-dossier-leak-exposure-review | human review | S |
| BL-38 | Prod test-data residue cleanup | X-prod-test-data-residue | — | S |
| BL-39 | H3 partner program (deferred in part) + ADR-008 revisit triggers | X-h3-partner-program-deferred · ADR-008 | operator decision | M |

### HUMAN-H2 / HUMAN-H4 / HUMAN-H5

| bl_id | landing | title | sources | gate |
|---|---|---|---|---|
| BL-40 | HUMAN-H2 | Corpus commissioning + editors + six real PDFs + written provider no-training verification | D-P0.13-3 · D-PRB.02-2 | ≈$100k (Q-23) |
| BL-41 | HUMAN-H4 | Venue-table `verified_at` stamps | D-P1.21-1 | operator |
| BL-42 | HUMAN-H5 | Showcase essay + sample-dossier sign-off (REQ-POS-3) | D-P1.17-1 · D-PRB.01-2 | licensing decision |

### GATE-G2 (hard gate before §16.4 claims and public launch)

| bl_id | title | sources | gate |
|---|---|---|---|
| BL-43 | Eval live bindings (enclave bucket, real `@rhema/evals`, arm executors, judge, workshop UI) | D-P0.13-1 · D-P0.13-5 · D-P0.14-1 · D-P0.14-2 · D-P0.14-3 | H2 corpus |
| BL-44 | Pilot wave — real σ_d + fixed n | D-P0.13-4 · D-P0.15c-4 · D-P0.15b-3 | pilot spend + provider verification |
| BL-45 | G2 wave-1 LIFT read | OF-g2-deferred | operator |

### GATE-ACCEPT · accepted · closed

| bl_id | landing | title | sources | status |
|---|---|---|---|---|
| BL-47 | GATE-ACCEPT | Operator-signed accepted-deviations list. ADR revisit triggers become watch items: ADR-001 (Vertex / pricing / multi-provider), ADR-002 (open-source stub swap), ADR-003 (Cloud Run once `CAP_SYS_ADMIN` is relaxed), ADR-011 (per-phase write grant) | X-tail-gate-accept · ADR-001 · ADR-002 · ADR-003 · ADR-011 | open |
| BL-46 | accepted | G3 read early with zero partner data (operator PROCEED, 2026-09-23) | X-g3-early-read | accepted |
| BL-48 | closed | Resolved OPEN FINDINGS (record only) | OF-g1-core-met · OF-g1-passed-accepted-exceptions · OF-req-coverage-info · OF-stb2-cross-tenant-dossier · OF-def1-stage-b · OF-def2-landed · OF-def3-stage-a | closed |
| BL-49 | closed | Deferral rows whose status cell already records DONE (the flip happens in BL-02) | D-PRB.03-1 · D-PRB.16-4 | closed |

---

## OF- id mapping (LEDGER `## OPEN FINDINGS`, in file order)

| id | Ledger entry (opening words) | Ledger state | Row |
|---|---|---|---|
| OF-g1-core-met | "G1 CORE criterion MET live (2026-09-11, P0.15k Stage B, PR #28)" | resolved | BL-48 (closed) |
| OF-g1-passed-accepted-exceptions | "GATE G1 dispositioned PASSED (2026-09-15, with accepted exceptions)" | resolved. The ±2% exception was ruled by D-PRB.16-5, the gate-edit exception sits in BL-19, and the fold-durability caveat sits in BL-14 | BL-48 (closed) |
| OF-g2-deferred | "G2 DEFERRED (operator decision 2026-09-15)" | open — hard gate | BL-45 |
| OF-req-coverage-info | "REQ coverage (informational)" | informational; the validator reports 0 warnings today | BL-48 (closed) |
| OF-stb2-cross-tenant-dossier | "STB.2 finding (RESOLVED — DEPLOYED + VERIFIED 2026-09-25 ~22:14Z)" | resolved. The root cause is **not** fixed and is tracked as X-api-db-role-bypassrls in BL-08. The exposure review is BL-37 | BL-48 (closed) |
| OF-prb21-review-cap-uncompletable | "D-PRB.21-1 (OPEN) — the review workflow is uncompletable at derived caps" | the entry still says OPEN, but the row has been DONE since 2026-09-23. The pricing residual is open | BL-13 |
| OF-stb3-live-findings | "STB.3 live findings (2026-09-26 …) F1–F10" | F1–F7, F9 and F10 are fixed (DEF.1–3); **F8 has no owner** | BL-07 |
| OF-def1-stage-b | "DEF.1 Stage B executed on prod (2026-09-26 …)" | resolved; residual is D-DEF.1-1 (BL-20) | BL-48 (closed) |
| OF-def2-landed | "DEF.2 landed … STB.3 findings F4/F5/F6 repaired" | resolved. Its operator legs ran in DEF.2 Stage B. Residuals are in BL-10 | BL-48 (closed) |
| OF-def3-stage-a | "DEF.3 Stage A landed … F7/F9/F10" | resolved (D-DEF.3-1 DONE); the probe sub-leg gap is in X-slo-probe-gaps | BL-48 (closed) |

## X- id mapping (owed items that no deferral row tracks)

| id | What is owed | Evidence | Row |
|---|---|---|---|
| X-f8-prod-slos-red | Prod SLOs red. Run-start p95 was 3080 s (target ≤45 s), success 66.7% (≥97% weekly), gate-resume p95 443 s (≤60 s), event-delivery p95 105.9 s (≤2 s). DEF.1–3 fixed F1–F7/F9/F10; nothing owns F8. RCN.1 measured a first-start p95 of ≈57 s on n=15, so the 3080 s probe value probably mixes resume and retry transitions. Diagnose that before remediating. **2026-10-03 (SLO.1):** diagnosis confirmed on prod — the 3080 s was the `started_at` overwrite mixing gate waits into "start"; corrected per-episode probes shipped + run-start levers (LISTEN/NOTIFY, `IfNotPresent`, prewarm DaemonSet, stage samples); prod re-read under the corrected probes is D-SLO.1-2 | `runs/STB.3.md` §4 F8 and evidence table; `packages/orchestrator/src/slo.ts` targets; D-P0.15-5; `runs/SLO.1.md`; D-SLO.1-2 | BL-07 |
| X-slo-probe-gaps | Four probe problems: `mirror_errors_10m`=1 is unexplained; the event-delivery p95 is dominated by quiet-period batch gaps; the `proxy_vs_sdk` ±2% target predates the D-PRB.16-5 by-design divergence ruling; the D-DEF.3-1 `egress_denied_10m` sub-leg is missing from its DONE evidence. Paging was never asserted (that part is D-P1.22-2). **2026-10-03 (SLO.1):** all four resolved in the probe layer — `mirror_errors_10m` = a retried-phase `engine.error`, now scoped to delivery-validation + `boundary.violation`; delivery p95 is live-tail-only (`detail='tail'`, replay excluded at the streamer); `proxy_vs_sdk` compares per (run,attempt) usd↔usd with the D-PRB.16-5 ruling untouched (the ±2% target unchanged — real divergence still flags); the `egress_denied_10m` sub-leg evidence is recorded in `runs/SLO.1.md` §0 | `runs/STB.3.md` F8; `runs/DEF.3.md` §5–§6; `runs/SLO.1.md` §0 + ADR-056 | BL-07 |
| X-unit-economics | About $7–10 metered per quick review against the $20/mo Writer plan (2,000 included credits, `pricing.json`). This appears only as a caveat in the 2026-09-23 G3 decision; "pricing-model question … carried as product risk into P1" | LEDGER GATE DECISIONS 2026-09-23; D-PRB.21-1 residual; STB.3 figure run estimated 7, metered 58 | BL-13 |
| X-tail-coverage-matrix | No `COVERAGE_MATRIX.csv`; CAPSTONE was a single ledger row | `docs/build/` listing; manifest chain row "CAPSTONE (ledger)" | BL-03 |
| X-capstone-req-count-drift | CAPSTONE §3 summary (115/301/44/9) does not match its own table (118/298/41/12); REQ-BETA-16/17/18 are classified inconsistently | `readouts/CAPSTONE.md` §3 | BL-03 |
| X-tail-gate-accept | No signed GATE-ACCEPT accepted-deviations list, which `projectStatus: DONE` requires | layout BM-TAIL-01; manifest has no GATE-ACCEPT row | BL-47 |
| X-tail-rec1-backlog | REC.1 has no chain row; this run writes its artifacts ahead of it | manifest chain ends at STB.4 (58) | BL-04 |
| X-tail-rec2-spec | No TICKET_VS_SPEC / SPEC_RECONCILIATION_PLAN; the G2/G3/H3 overrides never folded back into the spec | manifest `## Spec amendments applied` | BL-05 |
| X-tail-rec3-integration | No INTEGRATION_PLAN / release notes / next-round memo | `docs/build/` listing | BL-01 |
| X-tail-doc-refresh | DOC.1/DOC.2 (refresh-repo-docs / agent-docs) never ran | manifest chain | BL-06 |
| X-prs-48-80-unmerged | 33 stacked PRs (#48 PRB.19 → #80 STB.4) are open; `origin/main` tip `256f594` merges only PRs ≤ #47; HEAD is 133 commits ahead | `BUILD_INDEX.md`; `git rev-list origin/main..HEAD` | BL-01 |
| X-prod-tree-vs-main-diff | STB.1 deployed `4fcf03e` and STB.2 deployed `f3c7e13` under a pre-merge authorization, with a follow-up to diff the deployed tree against the post-merge tree | `runs/STB.1.md` header; `runs/STB.2.md` §9 | BL-01 |
| X-ledger-state-drift | CURRENT STATE drift: `nextTicket: DONE` while `projectStatus: IN_PROGRESS`; `lastCompleted: P1.22` (should be STB.4); `returnPass: PRB.18` (mostly landed); state lines carry whole histories (LEDGER.md ≈ 209 KB); the `## GATE DECISIONS` heading is missing (the table sits under OPEN FINDINGS) | `LEDGER.md` lines 16–40 and 150–176 | BL-02 |
| X-manifest-plan-extensions-stale | `## Plan extensions` stops at 2026-09-18, but PRB.20–25 (09-22/23), the P1 body writes, RCN.1, STB.1–4 and DEF.1–3 (09-25/26) were inserted since | `00_MANIFEST.md` §Plan extensions vs chain table | BL-02 |
| X-deferrals-status-hygiene | Status cells whose first keyword contradicts the cell (see *Stale rows*); P1 rows not amended with DEF.1 evidence; the bold/date-prefixed status cells that `check-backlog.sh` cannot parse | this analysis; CAPSTONE §7 MINOR (2) | BL-02 |
| X-run-ledger-stale-headers | DEF.2 and DEF.3 run-ledger headers still say "operator-gated" / "Stage B OWED" although their §7/§6 record the work done. Correct this with a dated note, not a rewrite | `runs/DEF.2.md` header and §5; `runs/DEF.3.md` header and §5 | BL-02 |
| X-g3-early-read | G3 was read with zero partner data. The REQ-BETA-18 thresholds were never evaluated; the operator accepted proceeding | LEDGER GATE DECISIONS 2026-09-23 | BL-46 |
| X-h3-partner-program-deferred | Partner recruitment, the REQ-BETA-17 deal and house-credit grants are deferred (not cancelled); the invite machinery is retained | LEDGER GATE DECISIONS 2026-09-16 (H3); ADR-008 | BL-39 |
| X-api-db-role-bypassrls | The prod api connects as `postgres` (`rolbypassrls=true`), so `withTenant`/RLS filter nothing. `correspondence_items`/`findings`/`claims`/`revision_obligations` are not RLS tables. Only the dossier route was patched | `runs/STB.2.md` §3 root cause and §8.1; LEDGER OPEN FINDINGS (STB.2) | BL-08 |
| X-dossier-leak-exposure-review | No access-log review or disclosure decision for the exposure window (route deploy → 2026-09-25 ~22:14Z) | `runs/STB.2.md` §3 and §9.3 | BL-37 |
| X-stb4-stripe-fixes-undeployed | The double-`included` grant, the `/billing/return` 404 and the client-trusted `rateTableVersion` fixes (`cf40f28`) were committed after the only STB.4 deploy (worker at `86441d6`). Prod carries a live Stripe key | `runs/STB.4.md` C.6 and Leg A "Bugs found"; git log | BL-09 |
| X-pending-checkout-email-gap | The pending-checkout copy promises "we'll email you", but no pending-mail job exists | `runs/STB.4.md` Leg A (f) | BL-09 |
| X-stripe-credential-hygiene | No usable test-mode Stripe key (test key provided: no). The `dev` Stripe secret payload is empty. A live-mode key sits in a local developer env file (value not recorded). Needed for the D-P1.16-1 test-clock and redelivery legs | `runs/STB.4.md` Leg A preamble | BL-33 |
| X-f5-settlement-live-proof | F5 (commitStep incremental debits; cancel = release-only; fail = refund) is deployed with `def3` but was never live-proved on a multi-phase run. DEF.2 §7 has no F5 leg | `runs/DEF.2.md` §2 and §7; `runs/DEF.3.md` §6 | BL-10 |
| X-held-check-migration-parity | Prod's `held>=0` check was validated via a manual drop/re-add. Migration 0044 still adds it `NOT VALID`, and no migration validates it, so fresh environments diverge from prod | `runs/DEF.2.md` §7; `packages/db/migrations/0044_ledger_integrity.sql` | BL-10 |
| X-balance-divergence-recheck | The nightly assertion's "1 balance divergence" was not re-read after the DEF.2 `--apply` repair | `runs/STB.4.md` C.3 | BL-10 |
| X-apparmor-unconfined-runtask | The run-task pod runs AppArmor `Unconfined` with `SYS_ADMIN`, the DEF.1 fix that let `unshare` work. There is no plan for a mount-only profile | `runs/DEF.1.md` §7.1 (def1f); `packages/live-clients/src/k8s-launcher.ts` | BL-26 |
| X-second-read-guidance-ignored | Guided-retry `opts.guidance` is dropped on the scoped second-read path ("acceptable, noted") | `runs/DEF.1.md` §6 | BL-11 |
| X-lever-matrix-flake | The `packages/run-sheet` `lever-matrix.test.ts` <100 ms assertion fails under full-suite load (133/159 ms against 16/23 ms in isolation). It recurs in ~9 run/PR records since PRB.15 | `runs/STB.4.md` §G; CAPSTONE §1; LEDGER PHASE LOG | BL-12 |
| X-iac-runbook-drift | The `rhema:collabDatabaseUrl` secret and `rhema_collab` LOGIN were applied by hand and are not in `infra/PROD-BRINGUP.md` or a migration. Also: the persistent cosmetic Cloud Run scaling drift, the `alloydbCluster` output warning, and uncommitted scratch helpers (`q.ts`, `cloudbuild-stb2.yaml`) | `runs/STB.1.md` §3/§7/§9; `runs/STB.2.md` §9.1; `runs/STB.4.md` C.6 | BL-27 |
| X-dev-stack-stale | The `dev` stack holds only the 23-resource skeleton, and its pins differ from prod; every Stage-B leg ran on prod | D-P1.22-2 STB.1 note; `infra/pulumi/Pulumi.dev.yaml` | BL-25 |
| X-prod-test-data-residue | STB.2 test draft `01M3D7E1…` v7 on `my-first-project`, and a stray `deployments` row `prod:82179e1` (`0.4.0+test`) | `runs/STB.2.md` §6; `runs/DEF.1.md` §7.1 | BL-38 |
| X-citation-completeness | G1 recorded "§16.4 marketing claims await the citation-completeness follow-up (ADR-006)"; no row owns it | `readouts/GATE-G1.md`; LEDGER GATE DECISIONS 2026-09-15 | BL-15 |
| X-infra-cost-vs-target | A ~$50/mo target was authorized against a documented ~$95/mo always-on floor, to be closed by GKE free-tier and idle levers. Actual spend was never measured against the target | LEDGER GATE DECISIONS 2026-09-17; `infra/PROD-BRINGUP.md` §0 | BL-29 |
| X-p102-page-editor-live-verify | The 8 REQs owned by P1.02 are marked "gate-pending" with no D-row. The P1.02 ledger folded them into D-P1.01-1, which is now DONE but never mentions P1.02. **2026-10-01 (JOURNEY.1):** the automatable half is journey step **N8** (owner EDIT.1, expected-red) — the edit→fork→sync-pill browser leg runs nightly once green | CAPSTONE §3 | BL-32 |
| X-phase1-exit-readout-stale | The phase-1 exit readout's "instrumented costs" row still reads PARTIAL and cites D-P0.08-2/D-P0.15-2, both of which are now DONE | CAPSTONE §2 | BL-06 |

## Rows marked DONE that still owe something (added as sources)

| id | Residual | Row |
|---|---|---|
| D-P0.15k-1 | `INSTRUMENTED_OVERRIDES` is process-local, so folded constants do not survive restarts (ADR-005's trigger) | BL-14 |
| D-P1.04-2 | Live `project.purge` evidence fires only at a real tombstone+30d (or a hand-dated row) | BL-22 |
| D-PRB.21-1 | "Residual pricing-model question stays OPEN for G3" | BL-13 |

## Stale rows — recommendations only (nothing flipped here)

These rows' remaining scope appears to be superseded by later live evidence. **BL-02** is where the flips
belong, each with a dated amendment note.

| Row | Status | Evidence that supersedes it | Recommendation |
|---|---|---|---|
| D-P0.03-3 | OPEN (first keyword) | Same cell: "**DONE (2026-09-26, STB.3 — prod):** figure run `01M3DK07CYZZXM4Y6CDBHKK0C7` … `inputs.phase="0"` committed only phase-0 artifacts, wrote `.rhema/phase-result.json`" | Flip to DONE. Carry the mid-phase pin (`phase:"2"`) as a note (BL-16) |
| D-PRB.03-1 | PARTIAL | Same cell: "**DONE — 2026-09-26 (DEF.2 Stage B, prod)**: non-provisional `estimate_cache` row … repeat call 80 ms, zero new `est_*` usage rows" | Flip to DONE (BL-49) |
| D-PRB.16-4 | PARTIAL | Same cell: "**DONE (2026-09-26, STB.3 — prod):** `confirm_cost` gate `01M3DQ59…` … `gate.expiry` consumed → `cancelled`" | Flip to DONE (BL-49) |
| D-P0.15b-2 · D-P0.15c-2 | PARTIAL | RCN.1: every bring-up leg is live on prod (`fetch_log` inference ×3,089, cap-402 run `01M364236…`, credential deny rows); the sole residual is the pin legs, already owned by D-P0.03-2/-3 | Flip to DONE with a pointer to D-P0.03-2 |
| D-P0.15b-3 · D-P0.15c-3 | PARTIAL | RCN.1: the run legs landed on prod (3 reviews + revise + fact-check + quick-voice + folds). Residuals are already owned by D-P0.13-4/D-P0.14-1/D-P0.15c-4 (pilot), D-P0.15-3 (gate edit) and D-P0.15d-2 (refund) | Flip to DONE with pointers. Double-tracking inflates the PARTIAL count |
| D-P0.15b-4 · D-P0.15c-5 | PARTIAL | The "operator's G1-ready flag" is superseded because **G1 PASSED 2026-09-15** (LEDGER GATE DECISIONS; `readouts/GATE-G1.md`). Start-latency p95 was measured (D-P0.15-5 DONE, ≈57 s). The nightly golden is owned by D-P0.15-4 | Flip to DONE. Keep the readout rewrite as a DOC item (BL-06/BL-36) |
| D-P0.15b-1 | PARTIAL | The dev/pr-test bring-up premise is superseded by the prod bring-up (PRB.15: `pulumi up prod`, 24/24 migrations; PRB.19 sign-in). The residual is **not** stale: `pr-<n>` full-stack up/destroy has never been exercised | Re-scope under BL-25; keep open |
| D-P1.11-1 | PARTIAL | Last amended at STB.3 (chat_turn `cap_reached`). **DEF.3 Stage B** then completed chat_turn `01M3EVPYKJ9W3KBGDCPBZEXDV7` at 27 cr under cap 40 (D-DEF.3-1 DONE; `runs/DEF.3.md` §6) | Re-assess: the delivered-turn leg may be met (confirm the plan-card event + `turn-result.json` sidecar). The research_burst half stays open with D-DEF.1-1 (BL-20) |
| D-P1.10-1 · D-P1.12-1 · D-P1.14-1 · D-P1.07-1 · D-P1.21-2 | PARTIAL | Last amended at STB.3 (defect-killed). **DEF.1 Stage B** then completed: draft `01M3E8F8…` (8/8 predicates, delivered `drafts/v8.md` + `correspondence/drafting_note/1/`), outline `01M3E2EC…` (4/4), profile_voice `01M3E8CX…` (6/6), and review `01M3EAAZ…` (delivered `correspondence/review/1/`) — `runs/DEF.1.md` §7.2 | Re-assess each against DEF.1. D-P1.10-1's delivery legs look met (only the approve_plan structured edit remains). D-P1.07-1 may now have its own-tenant dossier |
| LEDGER OPEN FINDINGS "D-PRB.21-1 (OPEN)" | OPEN in ledger | D-PRB.21-1 DONE 2026-09-23 (`01M36663…` delivered) | Annotate RESOLVED; the residual is BL-13 |
| LEDGER RETURN PASS `PRB.18` / `returnPass: PRB.18` | open | Google + magic-link + Stripe-originated purchase landed 2026-09-22 (D-P0.01-3, D-PRB.17-1, D-PRB.13-2 DONE); gate expiry done (D-PRB.16-4). Only the browser SSE/editor legs remain (BL-32) | Prune to those two legs or clear |

## Sources that could not be placed

None. All 58 status-owed deferral rows, all 12 ADR revisit triggers and all 10 OPEN FINDINGS entries sit in
exactly one row, as do the 36 X- items and 3 DONE-with-residual ids. No spec-mandated register with deferred
rows and no `COVERAGE_MATRIX.csv` exists to gather from. The missing matrix is itself X-tail-coverage-matrix
(BL-03).

## Added 2026-09-30 — the prod design review (`reports/2026-09-30_prod-design-review.md`)

Sixteen rows (BL-50…BL-65) carry the review's `PR-*` finding ids. Three review findings folded into existing
rows: PR-S1 → **BL-08** (live `/voices` proof of the BYPASSRLS root cause), PR-R2 → **BL-07** (SLOs still red
after DEF.1–3), PR-E5 → **BL-13** (632 cr charged vs ≈1,625 cr metered on one Quick/Base review). The review
also extends **BL-38** (its own test account + two test projects on prod).

### round-3 — prod hotfix (P0, $0, deploy-first)

| bl | title | sources |
|---|---|---|
| BL-52 | Dossier 500 on `evidence.urls` absent (incl. the Showcase) + walkthrough job failing | PR-J3 |
| BL-53 | No edit path: `page.js` never routed; Edit source → `/v/working` 404 on fresh imports; `my-first-project` unopenable | PR-J4 |
| BL-65 | Ops: digest query on non-existent `runs.finished_at`; api listener leak; LB 5xx untraced | PR-O1 PR-O2 PR-O3 |

### round-3 — core journey (P0)

| bl | title | sources |
|---|---|---|
| BL-50 | Trial entitlement not honored (REQ-SPEC-8) | PR-J1 |
| BL-51 | Credit purchase broken (CSP blocks the Stripe redirect; checkout returns no URL) | PR-J2 |
| BL-55 | Chat turn 502 + Send occluded by the status bar | PR-J6 |
| BL-56 | Review did no web research (16/16 Unverifiable) yet completed and charged | PR-Q1 |

### round-3 — honesty and correctness (P1)

| bl | title | sources |
|---|---|---|
| BL-54 | Project list looks empty (Quiet group collapsed, no affordance) | PR-J5 |
| BL-57 | One estimate everywhere + honest run report + live meter | PR-E1 PR-E3 PR-E4 PR-R3 |
| BL-58 | Model tier not user-controllable; Free gets Balanced | PR-E2 |
| BL-59 | "Informational" Approve-scope gate blocks indefinitely | PR-R1 |
| BL-60 | Import latency (3.5–5.6 min) + held draft lost (REQ-GROWTH-1) | PR-R4 |

### round-3 — polish (P2)

| bl | title | sources |
|---|---|---|
| BL-61 | Copy + IA: "private beta", build jargon, unbuilt workflows exposed, inbox count | PR-U1 PR-U2 PR-U3 PR-U4 |
| BL-62 | Layout/responsive: `/app/new` unstyled, pricing phone overflow, phone action row | PR-U5 PR-U6 PR-U7 |
| BL-63 | Brand/meta/email: titles, meta, OG, favicon, `/showcase`, magic-link email | PR-U8 PR-U9 |
| BL-64 | Import fidelity: H1 demotion, relative figure paths | PR-R5 |
