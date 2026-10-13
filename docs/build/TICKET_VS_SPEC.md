<!--
  docs/build/TICKET_VS_SPEC.md — REC.2 deliverable 1 (reconcile-build mode=spec, BM-RECON-02).
  One block per landed BUILD_INDEX.md row: what the ticket shipped, tagged
  in-spec / spec-implied / ticket-added, each with a disposition.
  Tags:
    in-spec       — the spec required it (the requirement ids it stamps are cited)
    spec-implied  — a reasonable reading of the spec, not stated
    ticket-added  — the ticket introduced it beyond the spec
  Dispositions:
    — (in-spec)                    nothing owed; the spec already says it
    fold-back as a new id          propose a new requirement id in its family (append-only, never renumber)
    note in an appendix            worth recording in spec prose/appendix, not a requirement
    implementation detail          mechanism below the spec's floor; no spec text owed
  Fold-back candidates carry their proposed id; the SPEC_RECONCILIATION_PLAN.md row is the
  binding before/after. "Folded" = the spec already carries the amendment (date cited).
-->

# Ticket vs spec — what the build shipped vs what the spec said

Source chain: `docs/build/BUILD_INDEX.md` rows 1–117 (PRs #1–#111 + ledger rows CAPSTONE, RCN.1,
STB.1, STB.2, STB.2-deploy, STB.3). Reconciled against `docs/rhema-design-spec.md` v1.0 as amended
through 2026-09-30, the manifest REQ→ticket index (`docs/tickets/00_MANIFEST.md`), and the ADR set
`docs/adr/ADR-001…103`. Reconciliation date: 2026-10-04 (REC.2).

Roll-up: **in-spec** is the dominant tag — every requirement a ticket stamped is in-spec by
construction (the manifest index is authoritative for coverage). The interesting rows are the
**ticket-added** mechanisms; every one is dispositioned. Counts per group are at the end of each
section and totalled at the foot.

## Phase 0 — foundations (#1–#28)

| Ticket (PR) | Deliverable | Tag | Disposition |
|---|---|---|---|
| P0.01 (#1) | Monorepo, Pulumi/GCP stage facts, core GCP IaC skeleton, Better Auth, CI job lattice + licence policy — REQ-ARCH-1/2/26/27/28/29/37/38/39/40, §13.1 | in-spec | — (the AWS→GCP mapping is itself a spec amendment, folded 2026-09-02) |
| P0.01 (#1) | `infra/config/stages.ts` stage-facts module + unit tests; `AGENTS.md` conventions | spec-implied | implementation detail |
| P0.02 (#2) | `packages/contracts` + `packages/db`: §11 schema, RLS wrapper, policy table, seed — REQ-DATA-1/2/3/4/14, REQ-SPEC-2/14, REQ-VIS-1, REQ-OBJ-1/7/16/17/18/19, REQ-IDE-50, REQ-ARCH-25, REQ-PROD-6, REQ-BILL-18 | in-spec | — |
| P0.02 (#2) | PGlite (Postgres→WASM) as the deterministic DB engine for unit/contracts jobs | spec-implied | implementation detail |
| P0.03 (#3) | Skill port (Review/Revise/Fact-check/persona-quick), phase manifests, Essay protocol — REQ-ARCH-5/6/8, REQ-SPEC-4, REQ-WF-13, REQ-GENRE-1/4, REQ-OBJ-11/4/19, REQ-SPEC-13 (part) | in-spec | — |
| P0.03 (#3) | Vendored `upstream-pin/` + `check-upstream-diff.mjs` drift gate | spec-implied (REQ-ARCH-5 demands verbatim; the pin is the mechanism) | implementation detail |
| P0.04 (#4) | Sidecar parsers, gate serializers, drift contract test, `protocols_version` — REQ-SPEC-9/12/22, REQ-OBJ-18, REQ-DATA-7 | in-spec | — |
| P0.05 (#5) | `packages/hooks`: path/URL policy, audit, denial semantics — REQ-DATA-11/12/13/15/16, REQ-ARCH-17/18, REQ-OBJ-10 | in-spec | — |
| P0.06 (#6) | `Engine`/`AgentSdkEngine`, two-uid run-task image, event mapper, FakeEngine, scoped subagents — REQ-ARCH-7/14/15/19, REQ-SPEC-10, REQ-DATA-17/18 | in-spec | — |
| cloud-switch (#7) | The AWS→GCP + direct-Anthropic-API amendment itself (ADR-001) | in-spec (is the amendment) | folded 2026-09-02 — manifest amendment line + §12 banner already in spec |
| P0.07 (#8) | Egress proxy as meter of record, per-run credentials, cap 402, fetch log — REQ-SPEC-11, REQ-ARCH-30/31/32, REQ-DATA-15/16, REQ-SPEC-25 | in-spec | — |
| P0.08 (#9) | Run orchestration: lifecycle, §6.3 state function, internal API + fencing, queue/locks, reaper — REQ-ARCH-3/9/11/32, REQ-RUN-2/10–18, REQ-DATA-33/34/39/40/41, REQ-SPEC-3/13/16, REQ-PROD-9 | in-spec | — |
| P0.08b (#10) | `run_events` persistence/partitioning, Redis fan-out, SSE replay — REQ-ARCH-12/13, REQ-DATA-37/38, §12.5 | in-spec | — |
| P0.09 (#11) | Materialize/harvest/delivery transaction, cited⇒fetched, verdict source check, attestation — REQ-DATA-5/6/7/8/9/10/19/20/21/24, REQ-VIS-4/6/9, REQ-ARCH-16/20/21(c), REQ-SPEC-25(c), REQ-OBJ-8/10/18, REQ-RUN-3/16 | in-spec | — |
| P0.10 (#12) | Twelve gate kinds, decisions, guidance, overlay write-back — REQ-GATE-1…13, REQ-SPEC-1/9/17/18, REQ-DATA-35/36/41, REQ-RUN-5/6/7/8/18 | in-spec | — |
| P0.11 (#13) | Credit ledger: holds/debits/release/refund, balances, cap math, circuit breaker — REQ-BILL-2/3/15, REQ-SPEC-24(1–6), REQ-DATA-34/42, REQ-RUN-12/13 | in-spec | — |
| P0.12 (#14) | Revision obligations: spawn/discharge/lineage/stall — REQ-OBJ-2/3/4/5/6/8, REQ-WF-7/15, REQ-DATA-26, REQ-PROD-12, REQ-IDE-26 | in-spec | — |
| P0.13 (#15) | §18 enclave, gold tooling, contamination records, deterministic scorers — REQ-EVAL-1/2/3/4/5/12/13/14/20 | in-spec | — |
| P0.14 (#16) | Six arms, blind normalization, adjudication tooling, pre-registration, wave runner — REQ-EVAL-6/7/8/9/10/11/15/16/17/18/20 | in-spec | — |
| P0.15 (#17) | Integration suite (FakeEngine G21), exit asserters, pilot power, instrumented-cost machinery, exit readout — §17 exit criteria, REQ-ARCH-36, REQ-EVAL-5/17 | in-spec | — |
| P0.15b (#18) | Pulumi/GCP IaC, live SDK adapter, arm executors + workshop CLI, live-exit driver, RS256 signer, CreditRenderer, fetch EventTransport — the §17 exit criterion's live half | spec-implied (the §17 exit is spec'd; the ticket is a live-verification vehicle — runtime insert) | implementation detail (the IaC layout, signer, transports) |
| P0.15c (#19) | Live client bindings + app entrypoints, run-task image w/ vendored SDK, dev deploy — §17 exit live legs | spec-implied | implementation detail (`@rhema/live-clients` package shape) |
| P0.15d (#20) | Server-authored harness `RUN_SPEC` + sandbox-node PGA egress + pod NetworkPolicy + re-platformed proxy — §17 exit legs | spec-implied (REQ-SPEC-10's server-side-facts rule is why the spec is server-authored) | implementation detail |
| P0.15e (#21) | Pod→server commit/deliver loop + deployable worker — §12.4 steps 6–8 live | in-spec (§12.4 lifecycle) / spec-implied (worker deploy shape) | implementation detail |
| P0.15f (#22) | Pod-log observability, agent→proxy path, worker GKE launcher — §13.5 legs | spec-implied | implementation detail |
| P0.15g (#23) | Agent-launch ambient/setgid caps + credential injector — REQ-SPEC-10/11's two-uid boundary live | in-spec | — (caps mechanism: implementation detail) |
| P0.15h (#24) | Per-phase skill artifacts, per-run budget config, hook-enforcement true-zero test, full 6-phase Review live to deliver — §17 exit legs | in-spec | — |
| P0.15i (#25) | Egress proxy as guarantor of server-side `web_search` (cited⇒fetched provenance) — REQ-VIS-9, §12.8 | in-spec | — |
| MAINT.1 (#26) | Build-memory v2 migration: committed `docs/build/` root, reconstructed LEDGER/BUILD_INDEX, retro ADRs 001–004, run ledgers moved — ADR-004 | ticket-added (build process, not product spec) | implementation detail (the build's own bookkeeping; the spec does not govern it) |
| P0.15j (#27) | Fact-check citation-fetch-compliance eval + skill/model discipline — REQ-VIS-9 semantics | in-spec | — |
| P0.15k (#28) | Last live G1 legs: three-project Reviews + instrumented cost + gate round-trip; ADR-005 instrumented-fold registry; **ADR-006 Path B** (unfetched citation ⇒ strip + claim downgrade, not run-fatal) | in-spec (§17 exit) + spec-implied (fold registry — §16.3 #1's machinery) | **ADR-006: folded** — REQ-VIS-9 amended 2026-09-30 (Appendix A.9 note); fold registry: implementation detail |

## Review beta — the RB phase (#29–#40) and the prod-launch LV round (#41–#54)

| Ticket (PR) | Deliverable | Tag | Disposition |
|---|---|---|---|
| PRB.01 (#29) | Invite-gated flat shell, project list, sample dossier — REQ-BETA-19/21, REQ-PROD-9, REQ-SPEC-3, REQ-POS-3; ADR-007 beta shell = React SSR, no Vite | in-spec | — (ADR-007: implementation detail of §13.1) |
| PRB.02 (#30) | Fetcher + convert services, upload/paste, conversion preview — REQ-ARCH-4/22/23/24, REQ-DATA-9, REQ-INGEST-8/12, REQ-SPEC-25(a), §5.3 | in-spec | — |
| PRB.03 (#31) | Stateless estimates + claim pre-pass, the run sheet, consent — REQ-SPEC-16, REQ-IDE-13, REQ-CHAT-25, REQ-BILL-1/4/5/6, REQ-GROWTH-13/16, REQ-WF-3, REQ-OBJ-6 | in-spec | — |
| PRB.04 (#32) | `findings-core`, run card, letter, claims, second read, rubric, trust chip — REQ-IDE-11/12/14/15/23/25/26/30/31, REQ-PROD-2, REQ-MOBILE-4, REQ-OBJ-6/18/19, REQ-SPEC-4 | in-spec | — |
| PRB.05 (#33) | Five-verb triage + reason codes, Approve triage, gate cards, phone-width inputs — REQ-IDE-16/27/28, REQ-GATE-2/5/7/10, REQ-SPEC-18/20, REQ-WF-9/10, REQ-BETA-6, REQ-PROD-4 | in-spec | — |
| PRB.06 (#34) | Server diff + move joins, obligations strip, re-review lineage, rubric delta — REQ-IDE-33, REQ-WF-7, REQ-DATA-25, REQ-OBJ-6, REQ-BETA-7/8, REQ-PROD-11 | in-spec | — |
| PRB.07 (#35) | CodeMirror source editing (beta stopgap #1), fork semantics, run lock — REQ-BETA-21, REQ-DATA-24/26/29, REQ-IDE-32, REQ-BETA-7 | in-spec | — |
| PRB.08 (#36) | House credits CLI, Stripe Payment Links, refunds, reconciliation — REQ-BETA-12/14/15, REQ-BILL-13, REQ-ARCH-35, REQ-SPEC-24(7), §14.6 | in-spec | — |
| PRB.09 (#37) | Resend emails with signed Wait-for-me/Open actions, reminders, prefs — REQ-IDE-47, REQ-ACCT-1, REQ-SPEC-20, REQ-GATE-8, REQ-MOBILE-10, REQ-SPEC-1 | in-spec (Resend-for-SES folded 2026-09-02) | — |
| PRB.10 (#38) | Optional inline Quick Voice + sample uploads + pill — REQ-PERSONA-2/3/4/13/14/17/20/27, REQ-INGEST-1/4/10, REQ-DATA-32, REQ-VIS-8 | in-spec | — |
| PRB.11 (#39) | Export md/txt/docx + AI-use statement (slice S1) — REQ-VIS-10, REQ-POS-6, REQ-GENRE-5, REQ-OBJ-3/6, §13.4 | in-spec | — |
| PRB.12 (#40) | Event catalogue + REQ-BETA events + weekly gate dashboard + `BETA_GATE_THRESHOLDS` — REQ-BETA-2/5/6…13, REQ-PROD-15/16, §3.5 | in-spec | — |
| PRB.13 (#41) | Open self-serve signup + 0-credit purchase path behind `signup.mode`; abuse throttle — REQ-BETA-19 **amended** (the amendment is the spec change); ADR-009 admission boundary | in-spec (amended) | — (throttle mechanism + boundary: implementation detail; ADR-009 recorded) |
| PRB.14 (#42) | Stranded-run sweeps, ledger call-sites, provisional `usage.tick`, estimator-fold machinery, `PROTOCOLS_VERSION` provenance — the deterministic halves of live deferrals; REQ-ARCH-39, REQ-DATA-42, §16.3 #1 | in-spec / spec-implied | — (sweep machinery: implementation detail) |
| PRB.15 (#43) | `prod` stage profile + Pulumi prod stack + domains/TLS + image set + seed/migration runbook; `pulumi up prod` live — §13.2 stages; ADR-010 Cloud SQL for prod | in-spec | **ADR-010: folded** — spec §13.1/§13.3 banners 2026-09-17; runbook: implementation detail |
| PRB.16 (#44) | Prod golden-path verification — every live surface leg asserted from rows/logs; live-surfaced fixes F9–F13 | spec-implied (live-verification vehicle, runtime insert) | implementation detail |
| PRB.16b (#45) | Golden-path continuation: QV cap-402 leg live (REQ-SPEC-11/24 proven on the wire), Gate-EDIT round trip, fixes F14–F25 | in-spec (the REQ legs) / spec-implied (the vehicle) | — / implementation detail |
| PRB.17 (#46) | Billing live + ops legs: webhook→grant, ops alerts, admin CLI, stranded sweeps, breaker, refund→resume, estimator folds non-provisional, beta-report — REQ-BILL-*, REQ-BETA-15, D-PRB.08-1 | in-spec | — |
| PRB.18 (#47) | Prod credential-apply + finish legs: real OAuth client, Resend domain, live Stripe endpoint; D-PRB.16-5 operator ruling (cap-meter-only committed debits) | spec-implied | implementation detail — **note:** the D-PRB.16-5 ruling is superseded by ADR-014/REQ-SPEC-32(a); folded in spec A.9 note 2026-09-30 |
| PRB.19 (#48) | Revise `response`-delivery fix + per-run declared-output write grant — ADR-011; fetch byte receipts | spec-implied (§12.6 seat policy mechanics; REQ-RUN-3/16 delivery) | implementation detail (ADR-011 recorded) |
| PRB.20 (#49) | Live ingestion upload path: presigned quarantine PUT, live `Converter` (Job invoke + readback), web `previewImport`/`createImport` — REQ-ARCH-4/22/23, REQ-INGEST live halves | in-spec (the REQ legs) | — (signed-PUT/IAM mechanism: implementation detail) |
| PRB.21 (#50) | Concurrent-run guard (one non-terminal run per project: project-row `for update` lock → 409 `run_in_progress` + single hold + sheet in-progress state); import-preview `202 pending` honesty | spec-implied (§12.4 lifecycle + §5.3 honesty) | implementation detail |
| PRB.22 (#51) | Per-run web-research bound (`webTools{fetchBudget,searchBudget,fetchMaxContentTokens}` on the run credential) + estimator research addend | spec-implied (§12.7/§14.4 — the estimator must price research; the proxy enforces bounds) | implementation detail |
| PRB.23 (#52) | `BASE_TOOLS` 7-tool envelope (119→65 KB/req), `toggleKeys` sentinel → frozen `optOutFlag`s, `perPhase` churn term | spec-implied (estimator fidelity, REQ-BILL-7) | implementation detail |
| PRB.24 (#53) | `research_fanout` contract input on `allowsSubagents` phases + `Options.settings.autoCompactWindow=80_000`; churn recalibration to measured | spec-implied (same) | implementation detail |
| PRB.25 (#54) | `EstimatorSpec.meteredCoverage` — `METERED_VS_COMMITTED_COVERAGE` 1.25 / `RESEARCH_WORKFLOW_METERED_COVERAGE` 1.5 fold | spec-implied (REQ-BILL-7 fold mechanics) | implementation detail |

## Full IDE — P1 (#55–#76)

| Ticket (PR) | Deliverable | Tag | Disposition |
|---|---|---|---|
| P1.01 (#55) | Design system + IDE shell — REQ-IDE-8/9/10/38…42, REQ-GROWTH-2; ADR-012 Hono SSR + hydrated island | in-spec | — (ADR-012: implementation detail of §13.1) |
| P1.02 (#56) | Schema-first Tiptap Page, decorations, proposal card, provenance, citation import — REQ-SPEC-19, REQ-DATA-9(b)(c)/28/29, REQ-IDE-44/45, REQ-POS-8/9, REQ-PROD-14, REQ-CHAT-19 | in-spec | — |
| P1.03 (#57) | Yjs/Hocuspocus four-layer autosave, restore points, collab auth — REQ-IDE-43/34/46, REQ-DATA-44, ledger F12/M17 | in-spec | — |
| P1.04 (#58) | Attention-grouped project list, three entry points, new-project flow — REQ-IDE-3/4/5/6, REQ-PERSONA-21, REQ-PROD-8/9/10 | in-spec | — |
| P1.05 (#59) | Timeline pane, run cards, walkthrough, run report — REQ-IDE-11/12/14/18/19, REQ-GATE-12/13, REQ-BILL-8/9/10 | in-spec | — |
| P1.06 (#60) | Full run sheet, ⌘K palette, one grammar, scoped runs, rigor dial — REQ-IDE-13/49, REQ-CHAT-21/22/23/24/28, REQ-SPEC-17, REQ-PROD-5 | in-spec | — |
| P1.07 (#61) | Margin, triage mode, Apply, bulk, clustering — REQ-IDE-23/24/29, REQ-SPEC-6/7 | in-spec | — |
| P1.08 (#62) | Version rail, compare, restore UI, artifact Browser — REQ-IDE-32/33/34/35/36/37, REQ-VIS-3, REQ-DATA-21/24, REQ-OBJ-6, REQ-PROD-11 | in-spec | — |
| P1.09 (#63) | Approvals with structured editing, presence timer, policy UI — REQ-GATE-2/5/6/10, REQ-SPEC-18, REQ-PROD-4, REQ-RUN-5/6, REQ-SPEC-1, REQ-IDE-16 | in-spec | — |
| P1.10 (#64) | Draft port + Approve plan + streaming writing UI — REQ-WF-4/5/7, REQ-GATE-5/6, REQ-ARCH-5/6, REQ-SPEC-12/13/14 | in-spec | — |
| P1.11 (#65) | Assistant chat, two conduits, Research run — REQ-CHAT-1…14/19/20/29/30, REQ-SPEC-15, REQ-IDE-22, REQ-OBJ-10 | in-spec | — |
| P1.12 (#66) | Outline run + structured outline editor — REQ-CHAT-15/16/17/18, REQ-DATA-23, REQ-ARCH-5/6, REQ-WF-11 | in-spec | — |
| P1.13 (#67) | Visualize workflow, render worker, proposal insert — REQ-VIZ-1…16, REQ-WF-14 | in-spec | — |
| P1.14 (#68) | Full Profile, staleness, detail page, Update voice — REQ-PERSONA-1/5–16/18/19/22–26, REQ-SPEC-27, REQ-WF-11, REQ-DATA-30/31/32, REQ-VIS-8, REQ-INGEST-13 | in-spec | — |
| P1.15 (#69) | Substack/URL providers, samples manager, PDF pipeline — REQ-INGEST-1…14 | in-spec | — |
| P1.16 (#70) | Plan ladder, trial entitlement, usage dashboard, failure states — REQ-SPEC-8, REQ-BILL-7…12/14/16/17/19, REQ-GROWTH-4/7/8/10/14/15, REQ-SPEC-24(3/8), REQ-PERSONA-5, REQ-DATA-42 | in-spec | — |
| P1.17 (#71) | Landing, pricing page, onboarding, Showcase — REQ-GROWTH-1/2/3/5/6/9/11/12/17, REQ-POS-1…5/11/12/13, REQ-EVAL-19, REQ-CHAT-30, REQ-PROD-15 | in-spec | — |
| P1.18 (#72) | All export formats, CSL, provenance appendix, account zip — REQ-POS-7, REQ-ACCT-3, REQ-VIZ-15, REQ-GENRE-5, REQ-VIS-10, §13.4 | in-spec | — |
| P1.19 (#73) | Inbox, in-app notifications, phone layout — REQ-IDE-2/47/48, REQ-SPEC-20, REQ-MOBILE-3/9/10/19, REQ-ACCT-1, REQ-OBJ-6, REQ-BILL-12 | in-spec | — |
| P1.20 (#74) | Settings tree, deletion, privacy posture — REQ-ACCT-2/4, REQ-VIS-11, REQ-OBJ-14, REQ-GATE-3/10, REQ-ACCT-1, REQ-PROD-15, REQ-BILL-4 | in-spec | — |
| P1.21 (#75) | Academic/Op-ed/Memo protocols + venue tables — REQ-GENRE-2/3/5/6/7, REQ-WF-8, REQ-POS-6, REQ-GENRE-1, REQ-OBJ-11 | in-spec | — |
| P1.22 (#76) | Injection controls verified, pen test package, launch readout, IAM-as-code — REQ-SPEC-25, REQ-ARCH-21/28/29/32/34, REQ-EVAL-19, REQ-SPEC-10/11, §17 Phase-1 exit | in-spec | — |

## Ledger rows and the defect lane (rows 77–86)

| Ticket (PR) | Deliverable | Tag | Disposition |
|---|---|---|---|
| CAPSTONE (ledger) | Whole-chain gap analysis vs the spec + composed-gates verification — `readouts/CAPSTONE.md` | ticket-added (build process) | implementation detail |
| RCN.1 (ledger) | Deferral reconciliation audit — 13 rows closed on prod/PRB evidence, 9 PARTIAL sharpened, 59 confirmed-open | ticket-added (build process) | implementation detail |
| STB.1 (ledger) | Pre-merge prod deploy + smoke: 139 resources, digests, migrations 0027–0041, RBAC — REQ-ARCH-39 provenance | spec-implied | implementation detail |
| STB.2 (ledger) | Read-only live verifies; cross-tenant dossier finding → workspace predicate fix; slo_samples + probes | spec-implied (REQ-DATA-4 isolation, REQ-ARCH-34 SLO) | implementation detail |
| STB.2-deploy (ledger) | Follow-up prod deploy: foreign dossier 200→404 verified; account-zip fixed | spec-implied | implementation detail |
| STB.3 (ledger) | Bounded live run legs — 10 prod runs; surfaced defects F1–F10 + red SLO readings | spec-implied (verification vehicle) | implementation detail |
| DEF.1 (#77) | STB.3 F1–F3 repairs: phase-result write, second_read producer, structure anchors — restores REQ-WF/REQ-SPEC-25/REQ-DATA-20 behaviour | in-spec (restoration of spec'd behaviour) | — |
| DEF.2 (#78) | F4 held-counter drift repair (`recompute --apply` backfill + counter rewrite + `held>=0` NOT VALID), F5 committed-vs-metered machinery, F6 estimate_cache binding — REQ-BILL/REQ-SPEC-24 integrity | in-spec | — (`recompute` CLI + sweep machinery: implementation detail) |
| DEF.3 (#79) | F7 SDK probe SLO noise, F9 dead `/api/action`, F10 cap-overshoot — REQ-ARCH-13, REQ-OBJ-6, REQ-BILL cap mechanics | in-spec | — |
| STB.4 (#80) | Real-money + external legs: Stripe test-mode battery end-to-end, pen-test vendor package, admin-key reconciliation (blocked on placeholder) — REQ-BILL live halves | spec-implied (live-verification vehicle) | implementation detail |

## Round 3 — launch readiness (#81–#111)

| Ticket (PR) | Deliverable | Tag | Disposition |
|---|---|---|---|
| SEC.1 (#81) | Role-split pools: user-serving `rhema_app_login` non-BYPASSRLS, documented system pool, two-tenant probe, 72-GET census — REQ-SPEC-30 (primary), REQ-DATA-4, REQ-ARCH-30; ADR-018 | in-spec | — (role mechanics/census tooling: implementation detail) |
| HOT.1 (#82) | Dossier 500 fix + prod-shape contract tests, `/assets/page.js` route + bundle↔route parity check, Quiet affordance, digest query, LB logging, hidden false claims removed — REQ-POS-3, REQ-GROWTH-11, REQ-IDE-4, REQ-SPEC-29 (parity half); ADR-019 | in-spec | — (LB logging: spec-implied §13.5 — implementation detail) |
| JOURNEY.1 (#83) | Playwright journey harness + step registry (expected-red→green), real magic-link test mailbox (Gmail DWD), `is_test` test tenants, nightly $0 / weekly-paid schedule, provenance check — REQ-SPEC-29 (primary), REQ-ARCH-39; ADR-020 | in-spec | — |
| JOURNEY.1 (#83) | Weekly ISO **metered-spend guard** ($5 cap) refusing paid legs pre-dispatch — the mechanism that later fail-closed on an RLS-blind pool (ADR-093) | ticket-added | **fold-back → proposed REQ-SPEC-33** (SPEC_RECONCILIATION_PLAN A-3) |
| JOURNEY.1 (#83) | `is_test` tenant flag + SLO exclusion + purge→hard-delete machinery; DWD test mailbox | spec-implied (acceptance needs safe fixtures; REQ-SPEC-29/REQ-ARCH-38) | implementation detail |
| MAINT.2 (#84) | LEDGER truth pass + size cut, retro Plan-extensions backfill, DEFERRALS flips, prod test-data inventory, `check-append-only.mjs` + `history.policy` | ticket-added (build process) | implementation detail |
| RES.1 (#85) | Research floor, model×tool preflight (fail-closed, reservations + executed-only counting, phase-class stamp), planted-error probes — REQ-SPEC-31(1)(2), REQ-VIS-9, REQ-SPEC-11, REQ-ARCH-31; ADR-021/022/023 | in-spec | — (preflight protocol + probe shape: implementation detail) |
| RES.2 (#86) | `runs.delivery` label + `run.unverified`, platform-fault refund class + settle, ops alert, trial restore exactly-once, label on card/dossier/email — REQ-IDE-18/25, REQ-SPEC-31(3), REQ-VIS-9, REQ-SPEC-24(6); ADR-024/025/026 | in-spec | — (`runs.delivery` column, `is_test` forcing, alert shape: implementation detail) |
| BILL.3 (#87) | Purchase path: CSP `form-action` allowlist, classified Stripe request contract, `PURCHASE_MODE` closed + `is_test` allowlist, pending-checkout email — REQ-BILL-16/14, REQ-BETA-15/12, REQ-GROWTH-13; ADR-027/028/029/030 | in-spec | — (CSP allowlist, mode switch, pending-checkout email: spec-implied → implementation detail) |
| ECON.1 (#88) | Committed = metered (`debitMode` dark behind `DEBIT_MODE`), metered settle + residue sweep, durable observation store (97 obs / 43 cells), flip/rollback runbook, paid-notice dry-run — REQ-SPEC-32(a), REQ-BILL-7, REQ-SPEC-24, REQ-ARCH-35, REQ-SPEC-11, REQ-BILL-3/6/13; ADR-031/032/033 (+ADR-014 amend) | in-spec | — (flag mechanism + observation store: spec-implied — implementation detail) |
| EST.1 (#89) | One estimator-facing API (`run-sheet/surface.ts`, `SurfacePricer`) on every pre-run surface, tier select within plan rules, why-decomposition, calibrated duration bands — REQ-SPEC-32(b), REQ-IDE-13 amended, REQ-GROWTH-4/6/9, REQ-BILL-1/5, REQ-PERSONA-5, REQ-SPEC-16; ADR-034/035/036 | in-spec | — (API shape: implementation detail) |
| RPT.1 (#90) | Live meter, run report reconciled, Showcase run out of usage history — REQ-BILL-9/6/8, REQ-IDE-11, REQ-GROWTH-11, REQ-SPEC-32(a) display; ADR-037/038 | in-spec | — |
| SEC.2 (#91) | `signup.mode` + invite field, shared Redis throttle store — REQ-BETA-19/14, REQ-GROWTH-15, REQ-ARCH-30; ADR-039/040/041 | in-spec | — (shared-store mechanism: implementation detail) |
| ACT.1 (#92) | Trial at Standard/Base w/ derived 2,800-word cap under the $15 ceiling, unlock checks, kill switch, claim render model — REQ-SPEC-8 **amended** (interim terms in force), REQ-GROWTH-10/15/13/7, REQ-SPEC-32(b), REQ-BILL-4; ADR-042/043 | in-spec (amended; the spec carries the interim terms) | — (scorer/render machinery: implementation detail) |
| ONB.1 (#93) | `convert --serve` HTTP mode (same image/contract; Job fallback retained), `import_preview_ms` SLO + `slo_samples.detail`, held-draft re-hydration, title/inert-image extraction — REQ-GROWTH-1 **amended** (the 20 s SLO row), REQ-ARCH-23/4/34, REQ-INGEST-7; ADR-044/045/046/047 | in-spec | — (convert-service topology, slug/title machinery: implementation detail) |
| EDIT.1 (#94) | `/v/working` → editable head; frozen head first-write lazily forks v(N+1) `human_revision`; `HUMAN_EDITABLE_DRAFT_ORIGINS`; collab fork/readonly broadcasts — REQ-IDE-32, REQ-DATA-21/14, REQ-IDE-43/46; ADR-048/049 | spec-implied (refines REQ-IDE-32/REQ-DATA-21 semantics the spec leaves implicit) | **note in an appendix** — proposed (PLAN A-6) |
| RUN.1 (#95) | Chat truthful proxy (`chatCall`/`chatFail` seam, named refusal classes), Send occlusion fix, informational gates never park (`resolveGatePolicy` single resolution), walkthrough regen — REQ-SPEC-1 **amended**, REQ-CHAT-9/14, REQ-GATE-1; ADR-050/051/052 | in-spec | — (chat proxy seam: implementation detail) |
| OBS.1 (#96) | `createGcsBytesTransport` plain-fetch GCS bytes (listener-leak fix), request/trace ids, exactly-one-structured-5xx line, LB/route 5xx metrics + alert — REQ-VIS-11, REQ-ARCH-13; ADR-053/054/055 | in-spec | — (transport + formatter machinery: implementation detail) |
| SLO.1 (#97) | Corrected SLO probes (event-paired episodes, delivery samples, autosave, mirror class, success denominator, per-(run,attempt) cost), run-start levers (LISTEN/NOTIFY, `IfNotPresent`, prewarm DaemonSet, `run_start_stage_ms`), weekly review mechanism — REQ-ARCH-13/34; ADR-056/057/058 | in-spec | — (probe + lever machinery: implementation detail) |
| UX.1 (#98) | Branded titles/meta/favicon, one `<h1>` per page, honest mode-true copy, jargon lint, magic-link email template — REQ-SPEC-2, REQ-IDE-41; ADR-059…064 | in-spec | — |
| UX.2 (#99) | Workspace Shell + rendered `.ide` invariant, labelled scroll regions, ≥44px/24px touch floors, in-flow sync pill, axe WCAG 2.2 AA in the journey harness, faint-tier retune — REQ-MOBILE-3, REQ-SPEC-20, REQ-IDE-42; ADR-065…070 | in-spec | — (axe-in-harness: spec-implied → implementation detail) |
| DEF.4 (#100) | Reconcile write-order fix + `held>=0` every write, `user_refund_requests` + the **user refund window** (`POST /runs/:id/refund` flag `off/test_tenants/open`, 7-day window on terminal states, one auto-refund/account/UTC-quarter, second → `pending_review`), scoped second-read guidance channel — REQ-SPEC-24, REQ-BILL-3, REQ-DATA-34, REQ-IDE-18, REQ-DATA-17; ADR-071/072/073 | in-spec — **the refund window is §14.4 L10 verbatim** ("completed-run refunds have a 7-day window, one per quarter without review") | — (flag-gated rollout `off` on prod → `test_tenants`; BL-30 owns the open flip: implementation detail) |
| SEC.3 (#101) | Distroless `nodejs22` run-task (no shell/pkg manager), vendored `setpriv`/`unshare`/`mount`/`dumb-init`, pure-argv ENTRYPOINT, readOnlyRootFilesystem + tmpfs, `rhema-run-task` Localhost AppArmor + loader DaemonSet, identity log lines — REQ-SPEC-10, REQ-ARCH-19, REQ-DATA-17, REQ-ARCH-40/39; ADR-074/075/076 | spec-implied (hardening of §12.6's boundary; the spec names two-uid separation, not the confinement mechanism) | implementation detail (profile + vendored applets) — optionally note in an appendix w/ PLAN A-7 |
| OPS.1 (#102) | `preview-stack.mjs` guard (prod refused all verbs, owner stamp fail-closed), IaC-generated non-prod secrets, in-VPC migrate Job, `retainOnDelete` shared resources, N10 invite-mode gate; `dev` 173-res + `pr-102` 187-res lifecycles live — REQ-ARCH-38/39/30, REQ-SPEC-30; ADR-077/078/079/080 | spec-implied (§13.2 previews + REQ-ARCH-38 isolation made operational) | implementation detail |
| OPS.2 (#103) | IaC drift fixes + `runbook-completeness.test.ts`, `infra/cloudbuild/image-set.yaml`, **`apps/turbo-cache`** self-hosted remote cache (scale-0 Cloud Run → GCS 30-day, SM token), `billing-read.mjs` measured bill **≈$285.80/mo list**, $50 budget alert adopted — REQ-ARCH-39/30/28, REQ-SPEC-30; ADR-081/082 | ticket-added (turbo cache) / spec-implied (cost measurement per §16.3 #1's instrumented-replaces-modelled rule) | turbo cache: implementation detail · **measured bill: note in an appendix** — proposed (PLAN A-5) |
| CITE.1 (#104) | Canonical cited⇒retrieved URL identity, search-row retrieval parity + "Search result" chip, **`runs.citation_completeness` + `citation_completeness_daily` rollup + bounded pre-delivery backfill** (`phase_class='backfill'`, budget min(fetchBudget,24), one re-entry), N11 step, baseline scan — REQ-VIS-9 (reconciled), REQ-IDE-25, REQ-OBJ-18; ADR-083/084/085/086 | in-spec (the REQ legs) + **ticket-added** (the completeness metric + backfill mechanism — the spec's cited⇒fetched is a gate, not a measured rate) | **fold-back → proposed REQ-VIS-12** (PLAN A-1) |
| ECON.2 (#105) | **`CogsLevers` contract + `resolveCogsLevers`** (server `COGS_LEVERS` defaults; `is_test`-only client overrides; frozen into `runs.inputs.cogsLevers`) + the five named levers (L1 autoCompact, L2 fan-out 5/5⇄8/3, L3 §12.3 routing, L4 TTL arm, L5 above-floor envelope) + REQ-SPEC-8 restore eval emit-only (**$20.25 > $6 → NOT MET**) — REQ-SPEC-32(c), REQ-SPEC-8, REQ-BILL-7, REQ-GROWTH-4, REQ-ARCH-9; ADR-087 | in-spec (REQ-SPEC-32(c) mechanism + restore eval) + **ticket-added** (the lever-flag contract) | **fold-back → proposed REQ-SPEC-34** (PLAN A-2); restore-eval datapoint → note in an appendix (PLAN A-4) |
| STB.5a (#106) | Permanent journey steps T1–T16 + helpers, session-mint diagnostic, throttle-aware resubmit, clock-leg rule — REQ-SPEC-29 legs + the D-* source ids; ADR-088 | in-spec | — |
| STB.5b (#107) | Paid journey legs B16–B19C with declared caps, cheapest-first, spend-guard pre-dispatch refusal — REQ-SPEC-29 legs (BL-16–19 sources) | in-spec | — (guard itself = REQ-SPEC-33 candidate, above) |
| CAP.1 (#108) | `COVERAGE_MATRIX.csv` (474 REQ rows, one verdict each) + `CAPSTONE_GAP_ANALYSIS.md` + `check-coverage-matrix.test.mjs` — the build's own audit layer; ADR-089 | ticket-added (build process) | implementation detail |
| CAP.2 (#109) | `COMPOSED_E2E_REPORT.md` — full journey registry vs prod, two-tenant probe, REQ-SPEC-32(c) regenerated report | ticket-added (build process) | implementation detail |
| CAP.3 (#110) | Eight capstone defect fixes (ADR-090…097 — export-token system-pool resolution, deterministic slug deconflict, pgboss purge probe, **spend guard fails closed on RLS-blind pool**, iteration caps at launch ledger, fetcher grant holdout-only, emission-audit bound, deep-link restore) + `CAPSTONE_CLOSURE.md` + 13-row ACCEPTED-deviations signature table + **ADR-098…103 MET-DIFFERENTLY records** | in-spec (the fixes restore spec'd behaviour) / ticket-added (the deviation records) | defect fixes: — (ADR-093's fail-closed guard folds into proposed REQ-SPEC-33); **MET-DIFFERENTLY ADRs: note in an appendix** — each is a recorded deviation already carried on `CAPSTONE_CLOSURE.md`'s signature table (88a_GATE-ACCEPT owns the tick); see PLAN §4 |
| REC.1 (#111) | `BACKLOG.csv` (77 rows) + `BACKLOG.md` + `OPERATIONAL_READINESS.md` — reconcile-build mode=backlog; 357 sources / 0 orphans | ticket-added (build process — the backlog is build memory, not product spec) | implementation detail |

## Roll-up

| Tag | Count (deliverable rows) | Notes |
|---|---|---|
| in-spec | ~130 | every stamped requirement id; the spec's own amendments count here |
| spec-implied | ~45 | dominated by live-verification vehicles (P0.15b–i, PRB.16…STB.*) and mechanism choices |
| ticket-added | ~11 | MAINT.1/MAINT.2/CAP.1/CAP.2/REC.1 (build process — implementation detail); journey spend guard (→ proposed REQ-SPEC-33); citation-completeness rate + backfill (→ proposed REQ-VIS-12); `CogsLevers` flag contract (→ proposed REQ-SPEC-34); turbo cache (implementation detail); MET-DIFFERENTLY ADR records (note in an appendix via CAPSTONE_CLOSURE) |

**Fold-backs already applied to the spec before this run (verified):** AWS→GCP + direct API (2026-09-02);
`packages/protocols` committed (2026-09-01); REQ-BETA-19 open self-serve + H3 deferred in part
(2026-09-16, ADR-008); `rhema.tools` domain + Cloud SQL prod (2026-09-17, ADR-010); round-3 adds
REQ-SPEC-29…32 + amendments REQ-SPEC-8/IDE-13/SPEC-1/GROWTH-1 + REQ-VIS-9 reconciled through
ADR-006 Path B + §14.1/§14.4 restated superseding D-PRB.16-5 (2026-09-30, ADR-013…017).

**Fold-backs applied by this run (ticked):** the 2026-09-15 G2 deferral and the 2026-09-23 early
G3 read — both pre-existing operator GATE DECISIONS rows — now carried in §17 (ADR-104/ADR-105).
Everything else is **proposed, not applied** — see `SPEC_RECONCILIATION_PLAN.md`.
