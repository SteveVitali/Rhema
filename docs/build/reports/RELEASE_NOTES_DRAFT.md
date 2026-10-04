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
