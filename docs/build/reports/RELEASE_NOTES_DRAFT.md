<!--
  docs/build/RELEASE_NOTES_DRAFT.md — REC.3 deliverable (reconcile-build mode=integration).
  A DRAFT the operator edits, not a published note. Derived from docs/build/BUILD_INDEX.md —
  every landed chain row appears once, grouped for humans. Covers PRs #1–#112 (112 PRs +
  ledger-only rows) as of 2026-10-04; #70+ still open at draft time — verify merge state before
  publishing.
-->
# Rhēma — release notes (draft, 2026-10-04)

*Covers the full stacked build: Phase-0 foundations → beta platform → full IDE → three rounds of
live hardening. 112 pull requests, all authored and verified under the stacked-PR method; prod
has run pre-merge chain code throughout (see INTEGRATION_PLAN §9 for provenance).*

## Highlights

- **The review loop, live on prod.** Import a draft → priced estimate → agent Review with
  metered caps → dossier of findings → dispositions → Revise delivery → "what changed" diff with
  per-move lineage — all verified end-to-end on `rhema.tools`.
- **Money is honest.** Every surface prices through one estimator; the proxy is the meter of
  record; holds, caps, refunds, a §14.4 user refund window, and a trial entitlement all settle
  through a single credit ledger.
- **Security in depth.** Non-BYPASSRLS serving role, two-tenant probes, a distroless run-task
  image under an AppArmor profile, a no-egress sandbox subnet behind a metering egress proxy,
  SSRF-hardened fetching, CSP nonces, never-cookies gates.
- **Operability.** Preview stages (`dev`, `pr-<n>`), IaC-complete prod, structured error logs
  with trace ids, §13.5 SLO probes that read honestly, weekly SLO review, a self-hosted Turbo
  cache, and a measured bill (~$285.80 list/mo vs the ~$50 target — the gap is ledgered, not
  hidden).

## Features

### Platform foundations (PRs #1–#28)

- #1 P0.01 — Monorepo, stages, core infra, CI skeleton
- #2 P0.02 — Contracts package + data model (PGlite-tested)
- #3 P0.03 — Skill port + phase manifests (`@rhema/protocols` committed member)
- #4 P0.04 — Sidecar parsers, gate serializers, `protocols_version`
- #5 P0.05 — Boundary hooks + seat policy
- #6 P0.06 — Engine, `AgentSdkEngine`, two-uid run-task image, event mapper
- #7 cloud-switch — AWS→GCP amendment (ADR-001)
- #8 P0.07 — Egress proxy: meter of record, cap 402, fetch log
- #9 P0.08 — Run orchestration: lifecycle, internal API, locks, reaper, phase loop
- #10 P0.08b — Run events: partitioned store, seq, SSE replay/tail
- #11 P0.09 — Mirror materialize/harvest, delivery transaction, attestation
- #12 P0.10 — Gates, decisions, guidance, write-back overlays
- #13 P0.11 — Credit ledger: holds, cap-clamped debits, refunds
- #14 P0.12 — Revision obligations: spawn, routing, discharge, lineage, stall
- #15 P0.13 — Benchmark enclave, gold tooling, deterministic scorers
- #16 P0.14 — Benchmark arms, normalization, adjudication, wave runner + report
- #17–#25 P0.15b–i — Live bring-up: Pulumi/GCP IaC, SDK adapter, run-spec, pod commit loop,
  deployable worker, per-phase artifacts, green-review construction, proxy-guaranteed web
  research
- #26 MAINT.1 — Build-memory v2: committed `docs/build/` root, ledger + index reconstruction
- #27 P0.15j — Citation-fetch-compliance eval + fact_check discipline
- #28 P0.15k — Stage A of the 3-project live exit (instrumented fold, ADR-005)

### Beta platform (PRs #29–#54)

- #29 PRB.01 — Beta shell + invite gate + sample dossier (ADR-007 React SSR)
- #30 PRB.02 — Import: SSRF-hardened fetcher, no-net converter, `@rhema/markdown` normalizer
- #31 PRB.03 — Estimate service + run sheet + server-authoritative caps
- #32 PRB.04 — Findings core + dossier (anchor ladder, disposition state machine)
- #33 PRB.05 — Triage, dispositions, gate cards, decisions
- #34 PRB.06 — Revise loop: what-changed diffs, move joins, re-review lineage
- #35 PRB.07 — Source editing
- #36 PRB.08 — Beta billing (Stripe Payment Links, house credits)
- #37 PRB.09 — Email notifications (reminders, decisions)
- #38 PRB.10 — Quick Voice
- #39 PRB.11 — Export + AI-use statement
- #40 PRB.12 — Beta analytics + dashboard + pre-registered thresholds
- #41 PRB.13 — Open self-serve signup (ADR-009)
- #42 PRB.14 — Run resilience + cost fidelity
- #43 PRB.15 — **Prod bring-up**: 107-resource Pulumi stack, digest-pinned images, provenance
  rows, sandbox egress proven fail-closed on the wire
- #44–#45 PRB.16/16b — Prod golden-path verification: auth, dispositions, gates, export, SSE,
  caps live
- #46 PRB.17 — Billing live ops legs (webhooks, refunds, sweeps, admin CLI)
- #47 PRB.18 — Auth + billing finish legs (real OAuth client, live Stripe endpoint)
- #48 PRB.19 — Revise delivery defect pass (per-run declared-output grant)
- #49–#51 PRB.20–22 — Live ingestion upload path, run-in-progress 409, verification burn cap
- #52–#54 PRB.23–25 — Context-churn bound, transcript batching, metered-vs-committed coverage
  (the honest-cost chain)

### Full IDE (PRs #55–#76)

- #55 P1.01 — Design system + IDE shell (ADR-012)
- #56 P1.02 — The Page: schema-first ProseMirror editor
- #57 P1.03 — Autosave, collab service, restore points
- #58 P1.04 — Project list + new-project flow
- #59 P1.05 — Timeline, run cards, live feed, walkthrough, run report
- #60 P1.06 — Run sheet (full) + command palette
- #61 P1.07 — Findings surface: Margin, triage mode, Apply
- #62 P1.08 — Versions/diffs, Files pane
- #63 P1.09 — Approvals: all twelve kinds, structured editing, presence UX
- #64 P1.10 — Draft workflow + plan gate
- #65 P1.11 — Assistant chat + Research run
- #66 P1.12 — Outline workflow + structured outline editor
- #67 P1.13 — Figures: visualize workflow + render worker
- #68 P1.14 — Voices: Full Profile, staleness, five-tab detail
- #69 P1.15 — Ingestion: Substack, URL, samples manager, PDF pipeline
- #70 P1.16 — Billing: plans, trial entitlement, usage dashboard
- #71 P1.17 — Landing, pricing, onboarding, Showcase
- #72 P1.18 — Export: full formats + provenance appendix + account zip
- #73 P1.19 — Notifications, Inbox, phone-width web
- #74 P1.20 — Settings, account, data & privacy, integrations
- #75 P1.21 — Protocols 2–4: Academic, Op-ed, Memo
- #76 P1.22 — Security hardening (`@rhema/security-checks`, 102 checks), pen-test scope,
  launch verification

### Stabilization & round 3 (PRs #77–#112)

- #77–#79 DEF.1–3 — Live defect passes: pipeline blockers, ledger/metering integrity
  (reconcile write-order, `held>=0`), live noise + polish
- #80 STB.4 — Real-money external legs held; pen-test vendor package + Usage & Cost wiring
- #81 SEC.1 — Tenant isolation in depth (serving/system DB role split, live probes)
- #82 HOT.1 — Prod hotfix pack (dossier 500, routing, Quiet affordance, false-claims hidden)
- #83 JOURNEY.1 — Browser-journey acceptance harness + step registry + test tenants
- #84 MAINT.2 — Build-memory hygiene
- #85 RES.1 — Review research restore (research floor, model×tool preflight, reservations)
- #86 RES.2 — Unverified delivery label + platform-fault refund class
- #87 BILL.3 — Credit purchase path (CSP fix, request contract, pending-email, closed-mode)
- #88 ECON.1 — Charge what we meter (proxy meter of record; durable calibration store)
- #89 EST.1 — One estimate everywhere + user-selectable tier
- #90 RPT.1 — Live meter that moves + honest run report
- #91 SEC.2 — Signup admission on every path + cross-instance shared throttle
- #92 ACT.1 — Trial entitlement end-to-end (Included runs, kill switch, claim audience)
- #93 ONB.1 — Import ≤20 s service-first conversion + durable held draft + faithful imports
- #94 EDIT.1 — Edit path: `/v/working` editable head, lazy fork on frozen heads
- #95 RUN.1 — Truthful chat proxy, informational gates never park, walkthroughs write
- #96 OBS.1 — api listener-leak root-caused, structured 5xx logs, request/trace ids
- #97 SLO.1 — Honest §13.5 probes + weekly SLO review + run-start levers
- #98 UX.1 — Copy/IA/brand: jargon lint, honest Inbox, page meta, branded sign-in email
- #99 UX.2 — Layout/responsive: styled surfaces, ≥44 px targets, axe WCAG 2.2 AA
- #100 DEF.4 — Ledger integrity closeout + §14.4 user refund window
- #101 SEC.3 — Run-task confinement: distroless image + AppArmor profile live
- #102 OPS.1 — Preview stages: full dev stack + guarded `pr-<n>` lifecycle
- #103 OPS.2 — IaC drift fixes, measured bill, self-hosted Turbo cache live
- #104 CITE.1 — Citation completeness: canonical URL identity, persisted rate, bounded
  backfill
- #105 ECON.2 — COGS reduction: five flag-gated levers + pre-registered protocol
- #106/#107 STB.5a/5b — Permanent headless journey steps + bounded paid-leg harness
  (spend-guarded)
- #108 CAP.1 — 474-REQ independent coverage matrix + gap analysis
- #109 CAP.2 — Composed end-to-end verification, honestly recorded
- #110 CAP.3 — Capstone closure: routed gaps closed, 13 ACCEPTED-deviations signed
- #111 REC.1 — Backlog (77 rows) + operational readiness
- #112 REC.2 — Spec reconciliation (ticked G2/G3 fold-backs, ADR-104/105)

## Breaking changes

- **Database:** 58 forward-only additive migrations — no down-migrations by design; deploys are
  backward-compatible for one release (§13.2 contract).
- **Deploy surface:** prod moved from dev assumptions to a `rhema-507501`/`prod` Pulumi stack
  (ADR-010: `rhema.tools` domain split + `__Host-` cookies; Cloud SQL `db-g1-small` on prod).
- **Pricing semantics:** charges follow the proxy-metered cost (ECON.1, ADR-014 interim terms);
  estimates are server-authoritative — client-supplied prices are never trusted.
- **Auth:** invite mode is retained behind `signup.mode`; open self-serve signup ships with
  admission throttles (SEC.2).

## Known gaps (accepted, tracked on `docs/build/BACKLOG.csv`)

- **Standing CI reds on open PRs** — the `never-cookies` public-safe gate (the `rhema_fp`
  fingerprint construct) and the privsep kernel legs in GitHub CI Docker; both classified in
  INTEGRATION_PLAN §3.
- **Prod SLOs honestly red in named rows** — success rate (D-SLO.1-5), event-delivery tail
  (D-SLO.1-6), proxy-vs-SDK divergence (D-SLO.1-7), egress_denied canary semantics (D-SLO.1-8);
  weekly review is live.
- **Eval program unexercised** — H2 corpus → G2 wave-1 LIFT is deferred (operator decision;
  G2 stays the hard gate before §16.4 claims and public launch; BL-40→45).
- **Operator-paused switches** — purchase re-open (GD-BILL.3-1), trial everyone-flip
  (GD-ACT.1-1), RES.2 retro ruling (GD-RES.2-1), metered-debit flip + paid-account notice.
- **Spend guards:** weekly paid-journey guard ($58.08 ≥ $5) refuses paid legs until the ISO
  reset — honest refusal, not a defect.
- **Real-money legs:** Stripe live-mode re-verify, admin-key reconcile, external pen test —
  operator/external deps (BL-33/34/35).

---

## Addendum — round 7 (draft section, dated 2026-11-09)

*Covers the round-7 chain (PRs #240–#310 plus insert rows, all open and unmerged at this writing —
`mergePolicy: OPERATOR`). Prod served `b8307a40` at the R7DEP.3 provenance check; the section
describes the source tree plus that recorded deployment evidence, not a later state.*

### Highlights

- **A public demo at `/demo`.** Four essays — *The Structure of Political Difference*, *The
  Governable Mind*, *The Constitution of Reason*, *The Politics of Visibility* — served as
  read-only static snapshots behind the reserved `demo~<essay>` slug namespace. No session, no
  tenant, no database reads; the anonymous-metrics beacon is the one sanctioned write. A guided
  tour walks SPD's record (published draft → v1 → verdict → claims → what-changed), and the
  corpus rides a separate licence: CC BY-NC-ND 4.0 by "S. J. Sebastian" (ADR-127).
- **The R7b application shell.** One persistent `AppShell` (sidebar, right panel with
  Chat/Findings/Claims/Timeline/Live feed tabs, in-shell states), a shared Radix/Lucide/cmdk
  primitive kit styled by generated `uiCss()`, `ReadOnlyProject` (`demo`/`showcase`/`run_lock`),
  a browser-safe keymap pinned by committed rule sets, and four recurrence guards (no raw
  controls, no internal keys, no document reloads, no occlusion) wired into required CI jobs.
- **Signed deviations (GATE-ACCEPT.R7, 2026-11-08):** the REQ-KIT-5 entry-size allowance
  (+15.3 kB vs ≤15 kB), the `U3.stopgap` leg's supersession by `U3.occlusion`, the `D2.tour`
  prod asset-parity class (hero mp4 correctly serves 206), and the HUMAN-H16 UX-session waiver.
- **Post-launch watch, early read only.** The 2026-11-09 expedite ruling ran R6WATCH.1's
  committed queries at launch +12.7 d — all 11 named rows `not-yet-elapsed` (the organic cohort
  is still empty end-to-end; machinery corroborated: `slo.review.weekly` firing). The
  contractual launch +14 d read remains owed ≥ 2026-11-11T04:0xZ (`D-R6WATCH-ON-TIME`).
- **Post-launch watch, the on-time read (dated append, 2026-11-11).** The contractual read ran
  at launch +14.6 d (`docs/build/runs/R6WATCH.1.md`): **the organic cohort is still empty
  end-to-end** — 0 organic signups, 0 organic runs, 0 organic admissible observations, 0 organic
  funnel legs. Per `GD-WATCH.R6` all 11 cohort-bound deferrals converted to standing
  alert-backed watches (`owner: operator` · `trigger: slo.review.weekly` ·
  `re-read: 2026-11-25T04:0xZ`) — no row passed on zero rows. Funnel verdict: landing→signup
  **below** (0 organic over 1,313 anonymous views), drop-zone→signup **below** (0/44),
  anchor-≤60 s **unmeasurable**. Machinery green: `slo.review.weekly` firing (ok 6 /
  breach 0), `billing.estimator-refit` weekly, `import_preview_p95_s` 0.717–0.841 s on the
  convert path. Honest carries: `usage.reconcile` now fails daily on a provider-report
  **403** (admin key bound but denied — operator key act still owed); the BigQuery billing
  export still holds zero tables (billed-actuals blocker unchanged).

---

## Addendum — rounds 5 and 6 (draft section, dated 2026-11-11)

*Covers the round-5 stabilization chain (PRs #175–#194) and the round-6 launch chain
(PRs #195–#236 plus the post-launch tail on #310–#321+, several still open at this writing —
`mergePolicy: OPERATOR`). The round-4 SPA conversion (PRs #113–#174) sits between this
addendum and the sections above; its signed record is `readouts/GATE-ACCEPT.SPA.md`.*

### Highlights

- **Public launch, 2026-10-28T04:0xZ.** GATE-LAUNCH signed 2026-10-27 (11/13 thresholds MET,
  two ruled); R6LCH.1 then executed the ruled flips — `purchaseMode → open`,
  `refundWindowMode → open`, trial `audience → everyone` — each live-verified on prod
  `b953c55e` (a real Stripe Checkout minted, a real-workspace refund admitted under
  `auto_allowance`, an unflagged trial claim behind the $50/day kill switch and the
  1-concurrent cap; `GD-R6LCH.1-1`).
- **Metered debit stays parked — disclosed, not hidden.** Flip 1 (`committed → metered`)
  waits on the paid-account notice's `EFFECTIVE_DATE=2026-12-01` (sent 2026-10-22, R6DEP.1)
  and a ruled-accepted calibration gap (`GD-THRESH13.R6`); prod still runs
  `debitMode: "committed"`. Debits therefore remain committed holds clamped at the cap and
  settled against the proxy meter of record; the REQ-SPEC-32 metered-burn wording is not the
  live mode, and the early-evaluation carrier (`256_R6FLIP.1`) owns the flip.
- **The repository is public.** Under the 2026-11-02 operator ruling (ADR-002
  amendment/ADR-125) the repo flipped public 2026-11-03 — `packages/protocols` ships with the
  tree and its full history after a whole-history audit found zero real secrets and no new PII
  class (`docs/ops/open-source-readiness.md`); `@rhema/evals` stays private through
  `RHEMA_EVALS_PATH`/`evals-stub`. Anonymous-clone install + `turbo build lint typecheck`
  verified 138/138 on 2026-11-11.
- **Twelve signed deviations (GATE-ACCEPT.R6, 2026-11-11).** Launch without the G2 LIFT read
  (ADR-111); the §17 amendments; the external pen test post-launch (ADR-112, ≈2026-12-28); the
  refused ~$150 funded wave carried; flip 1 parked; the authored Showcase fixture (ADR-121);
  the ~$210–257/mo floor vs the ~$50 target (`GD-HA.R6`); the four unmet clock reads;
  operator-leg residuals; traffic-bound measurements → standing watches; engineering/spec
  carries → the 204–208 tail; the whole honestly-owed tail OPEN as tracking.
- **Post-launch watch — the organic cohort is still empty.** The contractual launch+14 d read
  (R6WATCH.1, 2026-11-11) found zero organic signups, runs, and admissible observations, so all
  eleven cohort-bound deferrals converted to standing alert-backed watches
  (`owner: operator` · `trigger: slo.review.weekly` · `re-read: 2026-11-25T04:0xZ`, authorized
  to run early → carrier `255_R6WATCH.2`). Two operational findings carry their own tickets:
  `usage.reconcile`'s daily provider-report **403** since 2026-11-05 (`257_R6OPS.1`) and
  `billing_export_prod`'s **zero tables** since launch (`258_R6OPS.2`).

### Round 5 — stabilization and the spend-honesty regime (PRs #175–#194)

- **Navigation acceptance (NAVC.1–5):** the settle contract became mechanism-pinned —
  client navs must tick the live document's `data-nav-count` with zero document loads.
- **Fail-closed spend guards (R5ECON.1–3):** the system-role-DSN metering convention (FORCE-RLS
  makes an app pool read $0 — a blind pool refuses, never measures), per-leg `capUsd` on all
  21 paid registry rows, `--headroom` on every paid dispatch, `cap_overrun` → the
  `funded-pause.json` sentinel, the seeded-`req_jrn_` exclusion scope, and the nine-row
  funded-window checklist with the T9→launchers→riders→B19C ordering.
- **The funded window refused, honestly (FUNDED.1):** the ~$60 re-authorized envelope measured
  $80.86 cumulative — zero legs ran, $0 spent; the wave stays carried under GATE-ACCEPT.R5/R6.
- **Ops maturity (R5OPS.1, COST.1):** the `slo.review.weekly` Monday cron, honest SLO probes,
  on-call + five incident playbooks, and the scale-to-zero cost posture (measured ~$198/mo
  against the ~$50 target — ledgered, not claimed met).
- **Closure:** R5CAP.1/3 + GATE-ACCEPT.R5 (14 deviations signed 2026-10-17), the REC/DOC tail.

### Round 6 — the launch chain (PRs #195–#236, tail #310–#321+)

- **Pre-launch engineering:** R6ENG.1–3/R6CI.1/R6UCD.1 reliability and CI work; R6WRT.1 write
  path; R6SOAK.1 soak; R6POST.1–2 post-launch surfaces (Lighthouse 1.00 + axe clean on prod).
- **Trust surface:** the five legal/trust pages approved verbatim (REQ-LCH-1,
  `packages/contracts/src/legal.ts`), the security notice flow, and the R6SECR.1 adversarial
  review.
- **Money machinery:** the launch-flip order (`GD-LAUNCH-MONEY.R6`), the metered-debit notice
  tooling + 2026-10-22 send (`EFFECTIVE_DATE=2026-12-01`), flip preconditions audited — and
  flip 1 honestly parked when calibration read empty (`GD-THRESH13.R6`).
- **Forensics:** R6FOR.1–2 — ledger/metering defect fixes and the REQ-FOR-4 RLS-exposure
  verdict (YES; every identified party operator/staff-controlled) with the approved notice
  sent to affected workspaces.
- **Showcase content:** the Wells "The Extinction of Man" dossier seeded on every new signup
  (authored fixture, ADR-121) after the contract-ineligible regeneration attempt was honestly
  recorded and not swapped in.
- **Production hardening:** PITR restore drill (RTO 579 s), N−1 rollback, the egress playbook,
  all 14 AlertPolicies wired to the armed notification channel (R6OPS.2), Cloud SQL
  `REGIONAL` HA (R6INF.1), and the proxy ×2 internal-LB cutover with a live failover drill
  (R6INF.2, ADR-122).
- **Validation:** the minimal golden cohort 4/4 PASS at `80db0d5` under the re-calibrated band
  (`GD-GOLDEN-BAND.R6`); the golden rerun rule committed; the nightly journey sweep repaired
  end-to-end (R6SWP.1) and a defect pack fixed (R6FIX.1–5, R6HRD.1).
- **The launch:** `R6LCH.1` executed flips 2–4 live-verified (above); `R6CLK.1` started the
  post-launch clocks; `R6PAIDARM` armed the Monday paid cron.
- **The tail (records land on their PRs):** R6WATCH.1's launch+14 d read → `GD-WATCH.R6`;
  R6CAP.1's 56/56 REQ verdicts; GATE-ACCEPT.R6 signed (12 deviations); R6REC.1's backlog
  reconcile (0 unhomed); R6REC.2's spec fold-back (ADR-111/112/113 banners); R6REC.3's §R6
  integration + merge-sweep plan; insert rows 255–259 carry the early watch re-read, flip-1
  evaluation, the two ops findings, and the nightly `u6-stub-turn.fixture.json` dist-emit
  defect (BL-111).

### Known gaps this addendum does not paper over

- `debitMode` is `committed` on prod — the metered flip is parked, not live (see above).
- The organic cohort is empty; every cohort-bound measurement is a standing watch, not a pass.
- `usage.reconcile` 403s daily on the provider report; `billing_export_prod` holds zero
  tables — billed-actuals reconciliation is blocked on carriers 257/258.
- The funded paid wave remains refused/carried; the external pen test and the U6 paid-leg
  re-proof stay deferred under the 2026-11-11 ruling (≈2026-12-28 and the Monday cron).
