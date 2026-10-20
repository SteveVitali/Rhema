# Rhema build manifest — the ticket chain
| REQ family | ticket(s) |
|---|---|

This directory is the **execution runbook** for building Rhema per the canonical, ratified spec
`docs/rhema-design-spec.md` (v1.0, 2026-09-01), as a chain of **50 tickets** (28 full
`implement-spec` contracts + 22 full-IDE skeletons) following the **ratified validation-first
sequence** (spec §17, Q-22): Phase 0a → Phase 0 → §18 benchmark → Review beta → full IDE → public
launch. **Filenames carry a global sequence prefix (`01_`…`50_`), so plain lexicographic order in
a file browser IS the chain order** — you can work through this directory top to bottom. HUMAN and
GATE rows have their own marker docs slotted into the sequence (`00a_`, `06a_`, `16a–16c`,
`28a–28b`, `44a`, `48a`); they are operator work / decision points, **never `implement-spec`
inputs**. The phase labels inside names: `P0` = Phase 0 foundations, `PRB` = the **R**eview
**B**eta, `P1` = the full IDE (the spec's "Phase 1"). This chain table remains authoritative if it
and a filename ever disagree.

> **These ticket docs are a derived build artifact.** They *cite* canonical §§ and `REQ-*` ids;
> they do not copy the design. To change a requirement: amend `docs/rhema-design-spec.md` first,
> then update the affected ticket's Load/AC lines and append a row to § Spec amendments applied —
> never fork the design into a ticket file. The requirement-ID index below is **authoritative for
> coverage**; a ticket's own stamped list is indicative.

> **These docs are committed and tracked.** They are a *derived* build artifact — generated from the
> canonical spec (`docs/rhema-design-spec.md`) and regenerable via `docs/6_ticket-decomposition-prompt.md`
> — so to change a requirement, amend the spec first, then regenerate/update the affected ticket. But
> they are versioned in git, not local-only scratch. `implement-spec` reads them from the working tree.
> The machine ledger `orchestrate-build` parses lives at **`docs/build/LEDGER.md`** (committed under the
> build-memory v2 layout since MAINT.1 / ADR-004; the per-ticket run ledgers are **`docs/build/runs/<ID>.md`**
> and PR bodies **`docs/build/pr/<ID>.md`** — `.agents/scratch/` is retired).

> **Deferrals ledger:** acceptance criteria/deliverables a ticket cannot finish at implementation
> time (live AWS deploys, HUMAN prerequisites) are tracked in **`DEFERRALS.md` in this directory** — a
> hand-maintained companion (not a generated ticket; preserved across regeneration). Every
> `implement-spec` run reads it (via `AGENTS.md`) and closes any row this ticket or its prerequisites
> unblock; phase-exit GATE rows must not pass while an `OPEN` row scoped to that phase remains.

companions: `DEFERRALS.md`, `16_P0.15g__preflight-audit.md`

req_id_pattern: `REQ-[A-Z]+-[0-9]+`

Stack: **TypeScript everywhere, no Python** (Q-3); pnpm + Turborepo; Pulumi (TypeScript) stacks;
**GCP-first** (§13; amended 2026-09-02 from AWS-first — see § Spec amendments applied), inference from
the **direct Anthropic API** (platform-billed); closed-source but open-source-ready (Q-19).

## How to build (stacked PR chain)

Each ticket forks from **whatever branch is currently checked out** and opens a PR based on it, so
the PRs **stack** — you do NOT need to merge one before starting the next.

```
# --- first ticket only: start from main ---
git checkout main
implement-spec  spec=docs/tickets/01_P0.01__monorepo-and-infra.md      # branch p0-01, PR base = main

# --- every subsequent ticket, in a fresh session ---
# stay on the branch the previous ticket left checked out (do NOT switch back to main),
# then run the next file — its PR stacks on the previous ticket's branch:
implement-spec  spec=docs/tickets/02_P0.02__contracts-and-data-model.md
# … straight down the chain table, in order.
```

Rules: (1) go in table order; (2) between tickets, stay on the previous ticket's branch; (3) STOP
at every GATE row until the operator has read it out — a gate is never guessed past; (4) HUMAN rows
are operator work — start them when the table reaches them (or earlier where noted) and never let a
code ticket silently block on one. Merge the stack bottom-up at the end (or progressively, rebasing
the rest).

**Full-IDE tickets (P1.01–P1.22) are skeletons**: titles, dependencies, and REQ coverage only.
Their bodies are written **after the REQ-BETA-18 gates are evaluated at G3** (spec §17; REQ-BETA-3:
deferred, not cancelled; REQ-BETA-21: `beta`/`post-beta` tags — during the beta window, work may
continue only on post-beta tickets no gate could plausibly cancel, e.g. P1.01/P1.02 foundations —
the failure mode to refuse is "beta as marketing preview while the full build barrels on").

## Human prerequisites (HUMAN rows — operator work, not code tickets)

- **H0 — Phase 0a accounts and registrations** (spec §17 Phase 0a; before/alongside P0.01; **amended
  2026-09-02: AWS→GCP**): Stripe account + Stripe Tax registrations (L13); a **GCP project + billing
  account** (C8); an **Anthropic API account + key** (platform-billed — replaces the former AWS
  Marketplace subscription to Claude Platform; no cloud marketplace needed); Apple + Google developer
  accounts; Expo/EAS org; Google OAuth consent screen (`drive.file` review can start now for 1.x);
  `rhema.app` + `rhemausercontent.com` domains; a **Resend** account (transactional email — replaces
  SES). *Exit: every account exists under the operator's ownership; secrets in Secret Manager.*
- **H1 — RESOLVED BY DESIGN (2026-09-02).** The AWS Marketplace / SigV4-vs-key spike is moot:
  inference now comes from the **direct Anthropic API** (platform-billed, a direct key). The first-party
  API returns the `usage` block (incl. `server_tool_use`) and a request-id-matchable cost report, so
  the metering + reconciliation design holds. No spike is needed before P0.07 (§16.3 #5 closed).
- **H2 — §18 corpus commissioning** (start during Phase 0; must be complete before G2's wave 1):
  ≥24 (target 30) commissioned drafts per REQ-EVAL-1 with REQ-EVAL-2 evidence; two annotating
  editors + senior adjudicator contracted (REQ-EVAL-4); A6 human-editor arm engaged; A1 steelman
  owner contracted; **provider no-training/retention terms verified in writing before any corpus
  draft is transmitted** (REQ-EVAL-3). Budget per Q-23 (ratified): ≈$100k across two quarters.
- **H3 — Beta partner recruitment + deal + gate pre-registration** (start during PRB build; before
  the beta opens): 20–25 partners in three cohorts per REQ-BETA-16; the REQ-BETA-17 deal signed per
  partner; the REQ-BETA-18 proceed/pivot/stop thresholds **pre-registered before the beta opens**
  (REQ-BETA-20); operator sign-off on the invite page's sample dossier content (REQ-POS-3).
- **H4 — Venue-table verification** (before P1.21): every Op-ed outlet row and seeded venue row
  re-verified with `verified_at` (§16.3 #14; REQ-GENRE-3).
- **H5 — Showcase content decision** (before P1.17): which essay, licensed, Essay-protocol, with
  ≥1 contradicted Tier-1 claim (§16.3 #21; REQ-POS-3).
- **H6 — Prod-launch accounts + the Stripe live-mode decision** (prod-launch round, 2026-09-16;
  before `28f_PRB.15` Stage B): prod domain + DNS access; the GCP prod footing (a dedicated project
  or `rhema-507501` with a `prod` stack); the prod Secret Manager entries (Anthropic key, RS256
  run-token key, Stripe secret + webhook signing secret, Resend key, Google OAuth client,
  `ANTHROPIC_ADMIN_KEY_SECRET`, `OPS_ALERT_WEBHOOK_URL`); the **Stripe live-mode activation
  decision** (answers the one open unknown — if not activated, `28h_PRB.17`'s real-money leg is a
  DEFERRALS row); the Google OAuth consent screen published for the prod domain; the Resend
  sending-domain verification; a stated prod budget.

- **H7 — Round-3 operator legs** (round 3, 2026-09-30; `85a_HUMAN-H7` — start now): the exposure-window access review +
  disclosure decision, prod test-data cleanup, live-mode Stripe re-verify, the Anthropic admin key, the external
  pen test, the nightly-golden budget, the H3/ADR-008 revisit, real-device checks. None is covered by round 3's
  standing authorization (ADR-013); tickets that reach a gated remainder first defer it (H7 pending).

- **H10–H13 — Round-6 operator rows** (round 6, 2026-10-20; every judgment call ruled the same day —
  LEDGER § GATE DECISIONS ### Round 6): `185a_HUMAN-H10` session 1 (acts only — start at
  ratification: billing-export flip, alert sink, Stripe test key, Anthropic admin key, invite mint);
  `190a_HUMAN-H11` session 2 (post-deploy browser/money legs + content/legal approvals);
  `196a_HUMAN-H12` merge sweep 1 (pre-launch); `198a_HUMAN-H13` merge the launch-flip PR.

## The chain

| # | Ticket file | Phase | Scope (one line) |
|---|---|---|---|
| — | `00a_HUMAN-H0__phase0a-accounts.md` | 0a | **HUMAN** — Phase 0a accounts; blocks P0.01 secrets and P0.07/PRB.08/PRB.09 integrations |
| 1 | `01_P0.01__monorepo-and-infra.md` | 0 | monorepo, Pulumi stages, core GCP, Better Auth, CI + licence policy |
| 2 | `02_P0.02__contracts-and-data-model.md` | 0 | `packages/contracts` + `packages/db`: §11 schema, RLS, policy table, seed |
| 3 | `03_P0.03__protocols-port-and-manifests.md` | 0 | skill port (Review/Revise/Fact-check/persona-quick), phase manifests, Essay protocol |
| 4 | `04_P0.04__parsers-serializers-protocols-version.md` | 0 | sidecar parsers + gate serializers + drift contract test + `protocols_version` |
| 5 | `05_P0.05__boundary-hooks.md` | 0 | `packages/hooks`: path/URL policy, audit, denial semantics |
| 6 | `06_P0.06__engine-and-run-task.md` | 0 | `Engine`/`AgentSdkEngine`, two-uid image, event mapper, FakeEngine, scoped subagents |
| — | `06a_HUMAN-H1__claude-platform-auth-spike.md` | 0 | **HUMAN** — H1 resolved by design (direct Anthropic API); no spike |
| 7 | `07_P0.07__egress-proxy.md` | 0 | meter of record, per-run credentials, cap 402, fetch log, outbound limits |
| 8 | `08_P0.08__run-orchestration.md` | 0 | lifecycle, state function, internal API + fencing, queue/locks, reaper |
| 9 | `09_P0.08b__run-events-and-streaming.md` | 0 | run_events persistence/partitioning, Redis fan-out, SSE replay |
| 10 | `10_P0.09__mirror-harvest-delivery.md` | 0 | materialize/harvest/delivery transaction, cited⇒fetched, verdict source check, attestation |
| 11 | `11_P0.10__gates-decisions-writeback.md` | 0 | twelve gate kinds, decisions, guidance, overlay write-back |
| 12 | `12_P0.11__credit-ledger.md` | 0 | holds/debits/release/refund, balances, cap math, circuit breaker |
| 13 | `13_P0.12__revision-obligations.md` | 0 | obligation spawn/discharge/lineage/stall (hand-run rounds included) |
| 14 | `14_P0.13__benchmark-enclave-and-scorers.md` | 0 | §18 enclave, gold tooling, contamination records, deterministic scorers |
| 15 | `15_P0.14__benchmark-arms-and-wave-runner.md` | 0 | six arms, blind normalization, adjudication tooling, pre-registration, wave runner |
| 16 | `16_P0.15__phase0-integration-and-exit.md` | 0 | integration suite (FakeEngine G21), exit asserters, pilot power, instrumented-cost machinery, exit readout — the **deterministic** half |
| 16* | `16_P0.15b__phase0-live-bringup-and-g1.md` | 0 | **live bring-up Stage A** (sorts right after 16): the Pulumi/GCP IaC (typechecked + network proven live), the live SDK adapter, arm executors + workshop CLI, the live-exit driver, RS256 signer, CreditRenderer, fetch EventTransport, real `protocols_version` provenance — the offline, PR-able deploy artifacts (operator-gated Stage B deferred to 16**) |
| 16** | `16_P0.15c__phase0-live-bindings-and-engine-e2e.md` | 0 | **live bindings + engine E2E** (sorts right after 16_P0.15b): write the deferred live client bindings + app entrypoints, build/push the run-task image with the vendored SDK, deploy the full `dev` stack, run the live 3-project Reviews + instrumented cost + gate round-trip + cap-402 + start-latency, close every G1-scoped deferral, flag G1 — the **live execution** (operator-gated: real infra + paid inference; the live pilot wave rides the D-P0.13-2 human verification) |
| 16*** | `16_P0.15d__live-runspec-infra-and-green-review.md` | 0 | **the live run-spec + the infra a run needs + the first green Review** (sorts right after 16_P0.15c): P0.15c deployed `dev` + drove the pipeline to the agent boundary but hit 3 real gaps — this builds the server-authored harness `RUN_SPEC` (the load-bearing blocker), bakes the sandbox-node PGA egress + pod NetworkPolicy + the re-platformed proxy into the IaC, then re-runs the §17 exit criterion (the 3 live Reviews + instrumented + cross-check + cap-402 + latency) and flags G1. **Stage A offline (one session); Stage B operator-gated (may iterate)** |
| 16e | `16_P0.15e__pod-commit-loop-worker-deploy-and-green-review.md` | 0 | **live Stage A** (sorts after 16_P0.15d): the pod→server commit/deliver loop + a deployable worker (run-time insert synthesized from P0.15d's live blockers; see § Plan extensions, ADR-003) |
| 16f | `16_P0.15f__green-review-agent-proxy-and-pod-logs.md` | 0 | **live Stage A** (sorts after 16_P0.15e): pod-log observability + the agent→proxy path + the worker GKE launcher (run-time insert) |
| 16g | `16_P0.15g__agent-launch-caps-credential-path-green-review.md` | 0 | **live Stage A** (sorts after 16_P0.15f): agent-launch ambient/setgid caps + the credential injector + the green-review construction half (run-time insert; audit companion `16_P0.15g__preflight-audit.md`) |
| 16h | `16_P0.15h__per-phase-review-execution-and-green-exit.md` | 0 | **live Stage A/B** (sorts after 16_P0.15g): per-phase skill artifacts + per-run budget config + hook-enforcement true-zero test + IaC; the full 6-phase Review proven live to the deliver path (run-time insert) |
| 16i | `16_P0.15i__agent-web-research-in-sandbox.md` | 0 | **live Stage A/B** (sorts after 16_P0.15h): the egress-proxy as GUARANTOR of server-side `web_search` (cited⇒fetched provenance); AC3 proven live, AC4 → 16_P0.15j (run-time insert) |
| 16+ | `16z_MAINT.1__build-memory-v2-migration.md` | 0 | **(post-P0.15i follow-up, RUN 1 of 3)** MAINT.1 / RH.1 — migrate Rhēma onto build memory v2 (committed `docs/build/` root, moved run ledgers, reconstructed LEDGER/BUILD_INDEX, retro-fit ADRs, chain-table + docs reconciliation). Offline, no code, no spend. Also reconciles the chain-table rows for the hand-inserted `16_P0.15e…i` + these three follow-ups. |
| 16+ | `16_P0.15j__fact-check-citation-discipline.md` | 0→B | **(post-P0.15i follow-up, RUN 2 of 3)** the fact-check must cite only tool-retrieved URLs so a Review DELIVERS (`cited⇒fetched` green) — a citation-fetch-compliance eval + skill/model discipline (or, on an operator spec-ruling, a harness citation-backfill). Closes D-P0.15i-2. **Stage A offline; Stage B operator-gated (live).** |
| 16+ | `16_P0.15k__live-three-project-reviews-and-instrumented-cost.md` | 0→B | **(post-P0.15i follow-up, RUN 3 of 3)** the last live G1 legs — the three-project Reviews (D-P0.15-1) + instrumented cost runs (D-P0.15-2) + gate round-trip + rewrite `docs/phase0-exit-readout.md` with measured values, flag G1 ready. **Operator-gated (real infra + paid inference).** Depends on 16_P0.15j. |
| — | `16a_GATE-G1__phase0-exit.md` | 0→B | **GATE** (operator) superseded-by(readouts/GATE-G1.md — read + PASSED 2026-09-15) — Phase-0 exit; **reads only after `16_P0.15k` closes the live criteria** (via 16z_MAINT.1 → 16_P0.15j → 16_P0.15k; the `16_P0.15d` note above is superseded — the live work ran through P0.15e–i and these follow-ups); see § Milestone gates |
| — | `16b_HUMAN-H2__benchmark-corpus.md` | B | **HUMAN** — corpus + editors + provider verification (start during Phase 0); must complete before wave 1 |
| — | `16c_GATE-G2__wave1-lift.md` | B→RB | **GATE** (operator) deferred(HUMAN-H2 — corpus track, eval deferred this round) — wave 1 + LIFT; on failure REQ-EVAL-16 consequences apply **before any UI spend beyond Phase 0** |
| 17 | `17_PRB.01__beta-shell-and-invites.md` | RB | invite-gated flat shell, project list, sample dossier |
| 18 | `18_PRB.02__import-fetcher-convert.md` | RB | fetcher + convert services, upload/paste, conversion preview |
| 19 | `19_PRB.03__estimator-and-run-sheet.md` | RB | stateless estimates + claim pre-pass, the run sheet, consent |
| 20 | `20_PRB.04__findings-core-and-dossier.md` | RB | `findings-core`, run card, letter, claims, second read, rubric, trust chip |
| 21 | `21_PRB.05__triage-dispositions-gate-cards.md` | RB | five verbs + reason codes, Approve triage, gate cards, phone-width inputs |
| 22 | `22_PRB.06__revise-whatchanged-rereview.md` | RB | server diff + move joins, obligations strip, re-review lineage, rubric delta |
| 23 | `23_PRB.07__source-editing.md` | RB | CodeMirror source editing (stopgap #1), fork semantics, run lock |
| 24 | `24_PRB.08__beta-billing.md` | RB | house credits CLI, Stripe Payment Links, refunds, reconciliation |
| 25 | `25_PRB.09__email-notifications.md` | RB | SES emails with signed Wait-for-me/Open actions, reminders, prefs |
| 26 | `26_PRB.10__quick-voice.md` | RB | optional inline Quick Voice + sample uploads + pill |
| 27 | `27_PRB.11__export-and-ai-use.md` | RB | export md/txt/docx + AI-use statement (slice S1) |
| 28 | `28_PRB.12__beta-analytics-and-dashboard.md` | RB | event catalogue + REQ-BETA events + weekly gate dashboard |
| — | `28a_HUMAN-H3__beta-partners-and-gate-registration.md` | RB | **HUMAN** — partners + deal + gate pre-registration; **beta opens**, ≥90 days, ≥15 active partners. **Deferred in part 2026-09-16** (partner recruitment / REQ-BETA-17 deal / house credits — users pay their own way; the sample-dossier sign-off D-PRB.01-2 stays operator-owed; the REQ-BETA-18 thresholds are already pre-registered in code) — ledger § GATE DECISIONS |
| — | `28b_GATE-G3__beta-gates.md` | RB→1 | **GATE** (operator) — REQ-BETA-18 gates; full-IDE bodies are written after this reads. **READ EARLY 2026-09-23 — PROCEED (operator override):** the ≥90-day / ≥15-partner beta window was skipped entirely; the gate was read on operator evidence (live platform + measured cost structure, zero partner data — caveat recorded). Bodies for 29–50 may now be written — ledger § GATE DECISIONS |
| 28c | `28c_HUMAN-H6__prod-launch-accounts.md` | LV | **HUMAN** — prod-launch prerequisites (prod-launch round, 2026-09-16, **ADR-008**): prod domains/DNS, the GCP prod footing, Secret Manager entries, the **Stripe live-mode decision**, OAuth consent + Resend domain for prod |
| 28d | `28d_PRB.13__open-selfserve-signup.md` | LV | open self-serve signup + the 0-credit purchase path (REQ-BETA-19 amended): `signup.mode` flip, abuse throttle, no §16.4 claims |
| 28e | `28e_PRB.14__run-resilience-and-cost-fidelity.md` | LV | the stranded-run sweeps (D-P0.08-4/-10-2), ledger call-sites (D-P0.11-1), provisional `usage.tick` (D-P0.08-2), estimator fold (D-P0.15k-1), `PROTOCOLS_VERSION` provenance (D-P0.04-2) — deterministic halves; live legs → PRB.17 |
| 28f | `28f_PRB.15__prod-bringup.md` | LV | the `prod` stage profile + Pulumi prod stack + domains/TLS + image set + seed/migration runbook (Stage A offline); **`pulumi up prod`** + migrations + smoke + the D-P0.13-2 write (Stage B operator-gated) |
| 28g | `28g_PRB.16__prod-golden-path-verification.md` | LV | one real user journey end-to-end on prod — every live surface leg asserted from rows/logs (D-P0.01-3, D-PRB.01…11 live rows, D-P0.08b-1…3, D-P0.09-3, D-P0.15h-5, D-P0.15i legs re-verified) |
| 28g2 | `28g2_PRB.16b__prod-golden-path-continuation.md` | LV | **INSERT 2026-09-18** — PRB.16's un-run legs: LIVE FINDING 12 (revise author seat can't read the dossier — delivery never writes it into `correspondence/`), LIVE FINDING 13 (cap-dead runs orphan/reaper-loop instead of finalizing), then the completing Revise run, Quick Voice build, gate-EDIT, browser sign-in legs + stragglers |
| 28h | `28h_PRB.17__billing-live-and-ops-legs.md` | LV | the real-money channel on prod (D-PRB.08-1: Payment-Link purchase live-or-test per the H6 Stripe answer, Usage & Cost reconcile, >2% alert, admin CLI), PRB.14's live halves, live `beta-report` (D-PRB.12-1) |
| 28i | `28i_PRB.18__prod-auth-billing-finish-legs.md` | LV | **INSERT 2026-09-18** — prod credential-apply + finish legs: real Google OAuth client (the `invalid_client` fix) + sign-in click-through, Resend magic-link, Stripe-originated purchase (live-mode key supplied), browser EventSource/editor legs (D-P0.01-3, D-PRB.17-1, D-PRB.04-2a, D-PRB.07-1a) |
| 28j | `28j_PRB.19__revise-delivery-and-defect-pass.md` | LV | **INSERT 2026-09-18** — F26 Revise `response`-delivery design fix + mount-policy half (D-PRB.16-1), fetch byte-receipts decision, then bounded live verifies (D-PRB.16-2/-4) |
| 28k | `28k_PRB.20__live-ingestion-upload-path.md` | LV | **INSERT 2026-09-22** — D-PRB.02-1's live bindings: presigned quarantine PUT + presign route, live `Converter` (convert Job invoke + result readback), the web `previewImport`/`createImport` wiring, then the bounded prod verify (no inference spend) |
| 28l | `28l_PRB.21__live-use-defect-pass.md` | LV | **INSERT 2026-09-22** — operator live-use defects (NOT P1 scope; G3 stays parked): D-PRB.20-1 concurrent-run guard (one non-terminal run per project, 409 + single hold, sheet in-progress state) + the import-preview cold-start latency made honest (pending state, not a multi-minute hang) |
| 28m | `28m_PRB.22__review-verification-burn-cap-model.md` | LV | **INSERT 2026-09-22** — day-one live finding (NOT P1 scope; G3 stays parked): D-PRB.21-1 — five consecutive `cap_reached` deaths; verification's web-research burn is unmodeled by the estimator, so no derived cap completes a claim-bearing doc. Fix = bound the research + model the residual, then one ≤$5 live delivered-review proof |
| 28n | `28n_PRB.23__context-churn-estimate-model.md` | LV | **INSERT 2026-09-22** — PRB.22's sharpened residual (NOT P1 scope; G3 stays parked): the burn is baseline context churn (~66K–1M cache-read/request, ~5M/run) independent of doc or research — diagnose the driver, shrink the floor or price it honestly, one ≤$5 live verify |
| 28o | `28o_PRB.24__intra-phase-transcript-accumulation.md` | LV | **INSERT 2026-09-23** — PRB.23's sharpened residual (NOT P1 scope; G3 stays parked): phases are already fresh sessions, the growth is INTRA-phase — verification's editor loop accumulates ~60K cache-read/request over ~40 requests (~347cr). Bound the transcript (per-claim isolated sessions / reset) or calibrate the churn term to measured reality. Stage A only at dispatch; Stage B live verify operator-gated |
| 28p | `28p_PRB.25__synthesis-phase-churn-term.md` | LV | **INSERT 2026-09-23** — PRB.24's residual (NOT P1 scope; G3 stays parked): review DELIVERED but needed an operator cap raise — synthesis-phase (`letter`) churn + committed-vs-metered delta still under-modeled (~241 metered vs 120 committed). Model the term or bound the phase so a derived cap covers a full run. Stage A only at dispatch; Stage B operator-gated |
| 29 | `29_P1.01__design-system-and-ide-shell.md` | 1 | [skeleton] tokens, panes, a11y, state catalogue |
| 30 | `30_P1.02__page-editor.md` | 1 | [skeleton] schema-first Tiptap Page, decorations, proposal card, provenance |
| 31 | `31_P1.03__autosave-collab-restore.md` | 1 | [skeleton] Yjs/Hocuspocus four-layer autosave, restore points |
| 32 | `32_P1.04__project-list-and-new-project.md` | 1 | [skeleton] attention-grouped list, three entry points |
| 33 | `33_P1.05__timeline-run-cards-reports.md` | 1 | [skeleton] Timeline pane, steering, walkthrough, run report |
| 34 | `34_P1.06__run-sheet-palette-commands.md` | 1 | [skeleton] full sheet, ⌘K palette, one grammar, scoped runs |
| 35 | `35_P1.07__findings-surface-full.md` | 1 | [skeleton] Margin, triage mode, Apply, bulk, clustering |
| 36 | `36_P1.08__versions-and-diffs-full.md` | 1 | [skeleton] version rail, compare, restore UI, artifact Browser |
| 37 | `37_P1.09__approvals-full.md` | 1 | [skeleton] all cards with structured editing, presence timer, policy UI |
| 38 | `38_P1.10__draft-workflow.md` | 1 | [skeleton] Draft port + Approve plan + streaming writing UI |
| 39 | `39_P1.11__assistant-and-research.md` | 1 | [skeleton] Assistant chat, two conduits, Research run |
| 40 | `40_P1.12__outline-workflow-and-editor.md` | 1 | [skeleton] Outline run + structured outline editor |
| 41 | `41_P1.13__figures.md` | 1 | [skeleton] visualize workflow, render worker, proposal insert |
| 42 | `42_P1.14__voices-full.md` | 1 | [skeleton] Full Profile, staleness, detail page, Update voice |
| 43 | `43_P1.15__ingestion-full.md` | 1 | [skeleton] Substack/URL providers, samples manager, PDF pipeline |
| 44 | `44_P1.16__billing-full.md` | 1 | [skeleton] plan ladder, trial entitlement, usage dashboard, failure states |
| — | `44a_HUMAN-H5__showcase-content.md` | 1 | **HUMAN** — Showcase content decision, before #45 |
| 45 | `45_P1.17__landing-onboarding-showcase.md` | 1 | [skeleton] landing, pricing page, onboarding, Showcase |
| 46 | `46_P1.18__export-full.md` | 1 | [skeleton] all formats, CSL, provenance appendix, account zip |
| 47 | `47_P1.19__notifications-inbox-phone-width.md` | 1 | [skeleton] Inbox, in-app notifications, phone layout |
| 48 | `48_P1.20__settings-account-data.md` | 1 | [skeleton] settings tree, deletion, privacy posture |
| — | `48a_HUMAN-H4__venue-table-verification.md` | 1 | **HUMAN** — venue tables verified with `verified_at`, before #49 |
| 49 | `49_P1.21__protocols-2-4.md` | 1 | [skeleton] Academic/Op-ed/Memo protocols + venue tables (HUMAN H4 first) |
| 50 | `50_P1.22__security-hardening-and-launch-checks.md` | 1 | [skeleton] injection controls verified, pen test, launch readout |
| — | **CAPSTONE** (ledger) | — | whole-chain gap analysis vs the entire spec + composed end-to-end verification |
| 51 | `51_RCN.1__deferral-reconciliation.md` | post-P1 | audit all OPEN deferral rows vs existing evidence; close the provable; sharpen the rest |
| 52 | `52_STB.1__merge-deploy-smoke.md` | post-P1 | **gated on operator merge** — full-chain `dev` deploy + migrations 0029–0041 + smoke |
| 53 | `53_STB.2__read-only-live-verifies.md` | post-P1 | all $0 read-only Stage-B legs + small live-binding fixes |
| 54 | `54_STB.3__bounded-live-run-legs.md` | post-P1 | the inference-capped live legs, cheapest-first, combined ≤$120 |
| 55 | `55_DEF.1__run-pipeline-blockers.md` | post-P1 fix | F1 phase-result, F2 second_read producer, F3 structure anchors — the delivery-blocking defects from STB.3 |
| 56 | `56_DEF.2__ledger-metering-integrity.md` | post-P1 fix | F4 held-counter drift, F5 committed-vs-metered divergence, F6 estimate_cache unbound |
| 57 | `57_DEF.3__live-noise-and-polish.md` | post-P1 fix | F7 SDK probe SLO noise, F9 dead /api/action, F10 chat_turn cap overshoot |
| 58 | `58_STB.4__real-money-and-external-legs.md` | post-P1 | live Stripe ≤$50 + pen-test facilitation + admin-key reconciliation — operator hard gates; **depends on DEF.1–3** (don't spend real money over live defects) |
| 59 | `59_SEC.1__tenant-isolation-in-depth.md` | R3 | **ROUND 3 (2026-09-30, ADR-013)** — split DB roles: user-serving pool non-BYPASSRLS, system pool only for sweeps; suite as the user role; two-tenant probe; exposure list for H7 (PR-S1, BL-08) |
| 60 | `60_HOT.1__prod-hotfix-pack.md` | R3 | dossier 500 + prod-shape contract tests; `/assets/page.js` route + bundle↔route parity; Quiet affordance; digest query; LB logging; hide false claims; deploy incl. STB.4 Stripe fixes |
| 61 | `61_JOURNEY.1__browser-journey-acceptance.md` | R3 | Playwright journeys + step registry (expected-red → owners turn green), real magic-link test mailbox, test tenants, nightly $0 / weekly paid, provenance check (REQ-SPEC-29) |
| 62 | `62_MAINT.2__build-memory-hygiene.md` | R3 | LEDGER cleanup + size cut, Plan-extensions backfill, stale DEFERRALS flips, prod test-data inventory |
| 63 | `63_RES.1__review-research-restore.md` | R3 | why `web_search` never reached the model (PR-Q1); research floor; preflight of every model × tool pair (REQ-SPEC-31 1–2) |
| 64 | `64_RES.2__unverified-delivery-and-refund.md` | R3 | zero-coverage → *Unverified* delivery, platform-fault refund class, alert, vocabulary, trial-restore hook (REQ-SPEC-31 3) |
| 65 | `65_BILL.3__credit-purchase-path.md` | R3 | Add credits vs CSP, checkout URL, pending-checkout email, billing failure-state tests; re-opening purchase operator-paused (PR-J2) |
| 66 | `66_ECON.1__charge-what-we-meter.md` | R3 | committed = metered (flagged, calibrated caps shipped together, flip operator-paused + notice); §6.5 presets; cost cards → estimator → caps; durable store (ADR-014) |
| 67 | `67_EST.1__one-estimate-everywhere.md` | R3 | one estimator on every pre-run surface; tier control (REQ-IDE-13 amended); estimate route 400; lever-matrix flake |
| 68 | `68_RPT.1__live-meter-and-run-report.md` | R3 | live meter; run report reconciled; Showcase run out of usage history |
| 69 | `69_SEC.2__signup-admission-and-throttle.md` | R3 | `signup.mode` + invite field; shared Redis throttle store |
| 70 | `70_ACT.1__trial-entitlement.md` | R3 | trial at Standard/Base with a measured word cap under the $15 ceiling; unlock checks; kill switch; claim render model; go-live operator-paused (PR-J1) |
| 71 | `71_ONB.1__import-latency-and-held-draft.md` | R3 | text import ≤ 20 s p95; held draft persists; import fidelity (REQ-GROWTH-1 amended) |
| 72 | `72_EDIT.1__edit-path.md` | R3 | editing a locked version forks v(N+1); `/v/working` → head; Page editor saves in a browser (PR-J4) |
| 73 | `73_RUN.1__run-and-chat-defects.md` | R3 | chat 502 + Send occlusion; gate labels from the defaults table; walkthrough failure |
| 74 | `74_OBS.1__observability.md` | R3 | api listener leak; structured error logs; 5xx reporting |
| 75 | `75_SLO.1__prod-slo-remediation.md` | R3 | run-start / gate-resume / event-delivery / success SLOs on prod (PR-R2) |
| 76 | `76_UX.1__copy-ia-brand.md` | R3 | copy + IA + brand/meta/email (PR-U1–U4, U8, U9) |
| 77 | `77_UX.2__layout-responsive.md` | R3 | layout + responsive + WCAG on touched surfaces (PR-U5–U7) |
| 78 | `78_DEF.4__ledger-integrity-refund-window.md` | R3 | ledger integrity closeout + scoped second-read guidance + the user refund window (BILL.2 merged) |
| 79 | `79_SEC.3__run-task-confinement.md` | R3 | distroless run-task + tight AppArmor + live privsep check |
| 80 | `80_OPS.1__preview-stages.md` | R3 | full `dev` + one `pr-<n>` preview up/destroy (never prod) |
| 81 | `81_OPS.2__iac-drift-cost-cache.md` | R3 | IaC/runbook drift, measured prod bill + HA pre-plan, Turbo cache |
| 82 | `82_CITE.1__citation-completeness.md` | R3 | fetch-then-cite / backfill + measured citation completeness (before ECON.2) |
| 83 | `83_ECON.2__cogs-reduction.md` | R3 | named COGS levers with non-regression ACs; the REQ-SPEC-8 restore flip (operator-paused) |
| 84 | `84_STB.5a__headless-live-legs.md` | R3 | the $0 live legs on the journey harness |
| 85 | `85_STB.5b__bounded-paid-live-legs.md` | R3 | the paid bounded live legs (≤ $40) |
| — | `85a_HUMAN-H7__round3-operator-legs.md` | R3 | **HUMAN** — round-3 operator legs (start now): test mailbox, notice timing, exposure review, test-data cleanup, live Stripe, admin key, pen test, golden budget, H3 revisit, BL-20 ruling, BL-24, real devices |
| 86 | `86_CAP.1__capstone-gap-analysis.md` | tail | **capstone** — whole-build gap analysis + `COVERAGE_MATRIX.csv` (first standard CAP.1) |
| 87 | `87_CAP.2__capstone-composed-verification.md` | tail | **capstone** — composed verification: full journey suite + two-tenant probe + one paid new-visitor journey |
| 88 | `88_CAP.3__capstone-closure.md` | tail | **capstone** — close routed gaps; the ACCEPTED-deviations list |
| — | `88a_GATE-ACCEPT__accepted-deviations.md` | tail | **GATE** (operator) — sign the accepted-deviations list; never guessed past |
| 89 | `89_REC.1__backlog-and-readiness.md` | tail | **reconcile** — backlog + operational readiness (reconcile-build mode=backlog) |
| 90 | `90_REC.2__spec-reconciliation.md` | tail | **reconcile** — spec reconciliation (mode=spec) |
| 91 | `91_REC.3__integration-plan.md` | tail | **reconcile** — integration/merge plan for #48 → round-3 tip (mode=integration; never merges) |
| 92 | `92_DOC.1__repo-docs-refresh.md` | tail | **docs** — refresh-repo-docs |
| 93 | `93_DOC.2__agent-docs-refresh.md` | tail | **docs** — agent-docs |
| 94 | `94_MAINT.3__funded-window-repairs.md` | maint | funded-window defect repairs (D-STB.5b-4/-5, entitlement interception, N4/N9 substrate) — $0 |
| 95 | `95_MAINT.4__oauth-signin-throttle.md` | maint | better-auth's default `/sign-in/*` limiter keys a global shared bucket under ADR-040 → "Continue with Google" 429s; disable + app-channel throttle — $0 |
| 96 | `96_RES.3__leg1a-zero-coverage-diagnosis.md` | maint | Leg-1a zero-coverage diagnosis (read-only prod reads; fix if contained) — $0 |
| 97 | `97_MAINT.5__oauth-form-action-csp.md` | maint | CSP `form-action` blocks the POST /login → accounts.google.com 302 (Chromium checks redirect targets) — admit `GOOGLE_OAUTH_ORIGINS` + validate target — $0 |

### Round 4 — frontend SPA migration (spec: `docs/frontend-spa-spec.md`, ratified 2026-10-08)

| 98 | `98_SPA.1__vite-toolchain-adr106.md` | R4 foundations | ADR-106 + Vite toolchain scoped to src/spa→public/spa, pins, tsconfig.spa, bundle-budget gate, licenses |
| 99 | `99_SPA.2__flag-plumbing.md` | R4 foundations | SPA_SURFACES parse → WebDeps → deps.spa consult (fixed order + overrides + ide-chrome AND-gate) → StageConfig/Pulumi wiring |
| 100 | `100_SPA.3__shell-document-markers.md` | R4 foundations | SPA shell document (head contract + data-spa-boot + manifest tags) + dual-renderer data-renderer/data-route/data-mounted markers + catch-all split |
| 101 | `101_SPA.4__spa-skeleton.md` | R4 foundations | SPA skeleton: router tree (all routes day one), beforeLoad auth gate, bffFetch, GET /session + boot, SsrHandoff, head manager, settle markers |
| 102 | `102_SPA.5__bff-conventions.md` | R4 foundations | BFF machinery: /bff/* twins, wantsJson envelope {ok,redirect,flash,data,pending,url}, {url} validators, slug memo, telemetry, typed-seam promotion |
| 103 | `103_SPA.6__journey-harness.md` | R4 foundations | Journey harness: --expect-renderer/--surface, SURFACE_GATES, settle helpers, renderer-agnostic probe re-spec, x-rhema-renderer injection |
| 104 | `104_SPA.7__dom-contract-rtl.md` | R4 foundations | dom-contract.ts manifest keyed by surface + check:dom-contract lint + Vitest/happy-dom/RTL/axe component-test stack |
| 105 | `105_SPA.8__safety-gates.md` | R4 foundations | Safety-gate repair: marker scan over public/spa + planted sentinels + sourcemap provenance; SPA import lint; no-cookies + env-leak + SPDX on SPA output |
| 106 | `106_SPA.9__ide-chrome-layout.md` | R4 foundations | ide-chrome React layout: panes, palette, scoped keymap, SSE feed binding — dark until export flip |
| 107 | `107_SPA.10__surface-usage.md` | R4 surfaces | Surface flip: usage (/usage, /p/:p/usage) — BFF twins + components + tests + journey legs + dev flag |
| 108 | `108_SPAF.1__prod-flip-usage.md` | R4 prod flips | **flip** — STAGES.prod.spaSurfaces += usage; minimal PR + deploy + nightly-green gate |
| 109 | `109_SPA.11__surface-inbox.md` | R4 surfaces | Surface flip: inbox (/app/inbox) — twin + 2 mutations |
| 149 | `149_MAINT.6__nonprod-session-plumbing.md` | maint (insert) | preview signed-in sessions: non-prod `rhema:resendApiKey` real-key path + `resend-pull`/`seed-invite` verbs + journeys `--invite-code` — unblocks every surface's live legs; closes D-OPS.1-1 + D-SPA.6-1 |
| 110 | `110_SPAF.2__prod-flip-inbox.md` | R4 prod flips | **flip** — prod += inbox |
| 111 | `111_SPA.12__surface-settings.md` | R4 surfaces | Surface flip: settings (/app/settings* + /p/:p/settings, one flip across 6+1 sub-pages) + confirm-email POST |
| 112 | `112_SPAF.3__prod-flip-settings.md` | R4 prod flips | **flip** — prod += settings |
| 113 | `113_SPA.13__surface-voices.md` | R4 surfaces | Surface flip: voices (/voices*, reseed) — 15+ writes, multipart/presign; **lands the connect-src+GCS-CORS upload prereq dark** |
| 114 | `114_SPAF.4__prod-flip-voices.md` | R4 prod flips | **flip** — prod += voices |
| 115 | `115_SPA.14__surface-onboarding.md` | R4 surfaces | Surface flip: onboarding (/app/new*, /p/:p/import* — import legs await ide-chrome via AND-gate) |
| 116 | `116_SPAF.5__prod-flip-onboarding.md` | R4 prod flips | **flip** — prod += onboarding |
| 117 | `117_SPA.15__surface-project-home.md` | R4 surfaces | Surface flip: project-home (/app) — server precedence redirects stay ahead of flag |
| 118 | `118_SPAF.6__prod-flip-project-home.md` | R4 prod flips | **flip** — prod += project-home |
| 119 | `119_SPA.16__surface-billing.md` | R4 surfaces | Surface flip: billing — Stripe {url} hand-offs via validated envelope |
| 120 | `120_SPAF.7__prod-flip-billing.md` | R4 prod flips | **flip** — prod += billing |
| 121 | `121_SPA.17__surface-export-ide-chrome.md` | R4 surfaces | Surface flip: export + ide-chrome — first IDE-framed flip; flips both flags together |
| 122 | `122_SPAF.8__prod-flip-export.md` | R4 prod flips | **flip** — prod += export + ide-chrome |
| 123 | `123_SPA.18__surface-outline.md` | R4 surfaces | Surface flip: outline — island→Query mutations + refetchInterval; ed.* → structured JSON |
| 124 | `124_SPAF.9__prod-flip-outline.md` | R4 prod flips | **flip** — prod += outline |
| 125 | `125_SPA.19__surface-figures.md` | R4 surfaces | Surface flip: figures (/p/:p/figures*, /visualize) |
| 126 | `126_SPAF.10__prod-flip-figures.md` | R4 prod flips | **flip** — prod += figures |
| 127 | `127_SPA.20__surface-run-sheet.md` | R4 surfaces | Surface flip: run-sheet (/p/:p/run) — var R= → typed estimate DTO; rhema_fp mint preserved |
| 128 | `128_SPAF.11__prod-flip-run-sheet.md` | R4 prod flips | **flip** — prod += run-sheet |
| 129 | `129_SPA.21__surface-dossier.md` | R4 surfaces | Surface flip: dossier (/p/:p/review/:runId, /obligations/new) — client-ported filters; **owes the seeded-dossier mutation journey steps first** |
| 130 | `130_SPAF.12__prod-flip-dossier.md` | R4 prod flips | **flip** — prod += dossier |
| 131 | `131_SPA.22__surface-run-report.md` | R4 surfaces | Surface flip: run-report (/p/:p/r/:runId) — SSE live meter preserved; **owes the delivered-run-report render step first** |
| 132 | `132_SPAF.13__prod-flip-run-report.md` | R4 prod flips | **flip** — prod += run-report |
| 133 | `133_SPA.23__editor-mount.md` | R4 surfaces | Surface flip: editor part 1 — Page mount, PageSessionRegistry, DOM parity part 1, forced-SSR posture |
| 134 | `134_SPA.24__editor-collab-binding.md` | R4 surfaces | Surface flip: editor part 2 — collab wire verbatim, 4-layer autosave, provenance/undo separation, lock poll, 29-row parity; dead-code drops land here |
| 135 | `135_SPAF.14__prod-flip-editor.md` | R4 prod flips | **flip** — prod += editor (last surface; REQ-ED-13) |
| 136 | `136_SPA.25__source-mode-revival.md` | R4 cleanup | REQ-ED-17: Source-mode revival — designed CodeMirror-class rebuild on the SPA mount (R20) |
| 137 | `137_SPA.26__island-retirement.md` | R4 cleanup | Island-bundle retirement: page.js/ide.js/outline.js/editor.js + CLIENT_ENTRIES shrink + parity retarget + stale manifest cleanup |
| 138 | `138_SPA.27__ssr-deletion-wave.md` | R4 cleanup | SSR deletion wave: migrated surfaces' render paths + HTML-string test retirement (REQ-TST-1, all-flags-baked gate) |
| 139 | `139_SPA.28__override-machinery-removal.md` | R4 cleanup | Override removal: ?ssr=1/x-rhema-renderer/SPA_OVERRIDES gone; deps.spa collapses to forced-SSR checks |
| 140 | `140_SPACAP.1__capstone-gap-analysis.md` | tail | **capstone** — whole-build gap analysis + COVERAGE_MATRIX.csv over the SPA REQ ids |
| 141 | `141_SPACAP.2__capstone-composed-verification.md` | tail | **capstone** — composed verification: full journey suite --expect-renderer spa on prod + two-tenant BFF probe + public SSR regression |
| 142 | `142_SPACAP.3__capstone-closure.md` | tail | **capstone** — close routed gaps; the ACCEPTED-deviations list |
| 143 | `143_GATE-ACCEPT.SPA__spa-accepted-deviations.md` | tail | **gate** — operator signs the SPA accepted-deviations list |
| 144 | `144_SPAREC.1__backlog-and-readiness.md` | tail | **reconcile** — backlog + operational readiness (mode=backlog) |
| 145 | `145_SPAREC.2__spec-reconciliation.md` | tail | **reconcile** — spec reconciliation (mode=spec) |
| 146 | `146_SPAREC.3__integration-plan.md` | tail | **reconcile** — integration/merge plan for the SPA stack (mode=integration; never merges) |
| 147 | `147_SPADOC.1__repo-docs-refresh.md` | tail | **docs** — refresh-repo-docs (SPA era) |
| 148 | `148_SPADOC.2__agent-docs-refresh.md` | tail | **docs** — agent-docs (SPA era) |


### Round 5 — post-SPA disposition (spec: `docs/post-spa-disposition-spec.md`, ratified 2026-10-15)

| # | file | phase | scope | gate |
|---|---|---|---|---|
| 150 | `150_HUMAN-H8__operator-session-bundle.md` | R5 marker | **human** — the REQ-G1-5 single-session bundle (merges, Resend seed, rulings) | — |
| 151 | `151_HYGIENE.1__memory-hygiene.md` | R5 hygiene | parser alignment + status-cell normalization + literal DROP closes + INDEX/anchor fixes | — |
| 152 | `152_FIX.1__journey-fixture-repairs.md` | R5 fixtures | owed-leg substrate: P1.dossier UA, T17/T12F/T13F/T15/T16, T8 mint script (gated) | — |
| 153 | `153_VERIF.1__composed-verification-ffbb8ad.md` | R5 stream-V | $0 SHA-exact composed pass on ffbb8ad (BL-82, D-SPA.28-1, D-SPACAP.2-*, D-CAP.1-2) | — |
| 153a | `153a_CIREP.1__ancestor-ci-repairs.md` | R5 repair | **run-time insert** — green the two inherited ancestor reds (#173 contracts / #174 unit) + re-fork navc-1 | — |
| 154 | `154_NAVC.1__delegated-interceptor.md` | R5 nav | delegated click interceptor + stub ids + data-spa-native + SsrHandoff replace + spy migration | — |
| 154a | `154a_NAVC.5__ssrhandoff-replace-seam.md` | R5 nav | SsrHandoff replace-mode seam + ~12-suite assign→replace spy migration | — |
| 155 | `155_NAVC.2__settle-contract.md` | R5 nav | data-nav-count (all docs) + mounted-pending + settleClientNav/settleDocumentNav + documentLoads | — |
| 156 | `156_NAVC.3__session-invariants.md` | R5 nav | registry destroy-identity fix + Query freshness policy + data-page-session + transition tests | — |
| 157 | `157_NAVC.4__nav-acceptance-legs.md` | R5 nav | R10 + R10.keepalive (paid:false) + scroll/keymap/head + server-boundary acceptance | — |
| 158 | `158_R5ECON.1__spend-guard-repairs.md` | R5 econ | seed-pollution exclusion + cumulative-scope pin + cap enforcement + fail-closed paid | — |
| 159 | `159_R5ECON.2__testcheaproute-arm.md` | R5 econ | intra-tier Haiku arm via cogsLevers + COGS_LEVERS_TEST default + truthful metering | — |
| 160 | `160_R5ECON.3__funded-window-regime.md` | R5 econ | cap table in registry + funded tenant + REQ-FND-7 driver prereqs + window-runner | — |
| 161 | `161_R5OPS.1__ops-residuals.md` | R5 ops | canary smoke + alert/CDN legs + nightly-golden driver + BL-07 classification | — |
| 162 | `162_BL38.1__prod-residue-cleanup.md` | R5 ops | BL-38 guarded cleanup script — dry-run → operator confirm → apply | operator confirm |
| 163 | `163_HUMAN-H9__cost-posture-ruling.md` | R5 marker | **human** — ~$50-target-vs-architecture posture ruling | — |
| 164 | `164_COST.1__prod-cost-posture.md` | R5 ops | **skeleton** — REQ-COST-1..6 levers; expands on H9 + billing export | H9 |
| 165 | `165_VERIF.2__preview-legs.md` | R5 stream-V | 15 preview legs on owned pr-<n> behind the Resend seed | H8 |
| 166 | `166_GATE-R5F__funded-window.md` | R5 marker | **gate** — funded-window open; §5.5 thresholds verbatim; ~$60 envelope | operator |
| 167 | `167_FUNDED.1__funded-window-wave.md` | R5 funded | **skeleton** — the paid-leg wave; expands at GATE-R5F | R5F |
| 168 | `168_R5CAP.1__capstone-gap-analysis.md` | tail | **capstone** — round-5 REQ coverage + disposition completeness | — |
| 169 | `169_R5CAP.3__capstone-closure.md` | tail | **capstone** — routed gaps + accepted-deviations draft | — |
| 170 | `170_GATE-ACCEPT.R5__accepted-deviations.md` | tail | **gate** — operator signs the R5 deviations list | operator |
| 171 | `171_R5REC.1__backlog-and-readiness.md` | tail | **reconcile** — backlog + readiness (mode=backlog) | — |
| 172 | `172_R5REC.2__spec-reconciliation.md` | tail | **reconcile** — spec fold-back: nav mechanism + settle contract + defect block (REQ-MEM-6/7/8) | — |
| 173 | `173_R5REC.3__integration-plan.md` | tail | **reconcile** — §R5 merge/deploy plan (never merges) | — |
| 174 | `174_R5DOC.1__repo-docs-refresh.md` | tail | **docs** — refresh-repo-docs | — |
| 175 | `175_R5DOC.2__agent-docs-refresh.md` | tail | **docs** — agent-docs | — |


### Round 6 — public launch readiness (spec: `docs/round-6-draft-spec.md` v0.3, ratified 2026-10-20)

| # | file | phase | scope | gate |
|---|---|---|---|---|
| 176 | `176_R6ENG.1__ci-provenance-hygiene.md` | R6 pre-deploy | mount-settle flake + sibling audit, tsconfig refs, BL-02/§5 flags, **nightly provenance tolerance** (REQ-ENG-1/4/5/6/8) | — |
| 176a | `176a_R6CI.1__ci-cost-phase-1.md` | R6 pre-deploy | CI cost phase 1: fail-closed docs-only/same-tree fast path + `workflow_dispatch` + push concurrency + journeys pause (operator run-time insert; ADR-115) | — |
| 177 | `177_R6ENG.2__sse-finalize-wakeup.md` | R6 pre-deploy | SSE finalize-path post-commit wakeup (REQ-ENG-2) | — |
| 178 | `178_R6ENG.3__res3-verification-checkpointing.md` | R6 pre-deploy | RES.3 verification checkpointing + budget-aware retry gate (REQ-ENG-3) | — |
| 179 | `179_R6UCD.1__api-minted-usercontent-urls.md` | R6 pre-deploy | API-minted signed usercontent URLs + ADR-113 (REQ-POST-7 code) | — |
| 180 | `180_R6LGL.1__legal-trust-pages.md` | R6 pre-deploy | legal/trust public pages, placeholders + `approved:false` (REQ-LCH-1) | — |
| 181 | `181_R6MNY.1__money-flip-readiness.md` | R6 pre-deploy | money-flip readiness: notice dry-run, calibration read, claims, `launch-flips.md` (REQ-LCH-5) | — |
| 182 | `182_R6FOR.1__prod-forensics.md` | R6 forensics | named-red SLO verdicts + balance_divergence + guard live read, $0 (REQ-FOR-1/2/3) | semantics → operator |
| 182a | `182a_R6FOR.2__rls-exposure-forensics.md` | R6 forensics | RLS-exposure forensics over preserved logs → disclosure verdict (REQ-FOR-4) | notice → H11 |
| 183 | `183_R6CNT.1__launch-content-prep.md` | R6 content | H4 venue evidence, public-domain Showcase shortlist, sample dossier (REQ-LCH-2) | — |
| 184 | `184_R6WRT.1__guarded-one-off-writes.md` | R6 writes | GD-RES.2-1 refund+relabel, BL38 stamp, tombstone hand-date (REQ-WRT-1/2/3) | pre-auth (GD-PREAUTH-ACTS.R6) |
| 185 | `185_R6SOAK.1__worker-rightsize-soak.md` | R6 preview | worker 0.5/512Mi cold-import soak on `pr-<n>` (REQ-ENG-7) | — |
| 185a | `185a_HUMAN-H10__operator-session-1.md` | R6 marker | **human** — session 1, acts only | — |
| 186 | `186_R6DEP.1__tip-deploy.md` | R6 deploy | tip deploy to prod: preview suite → classified preview → `pulumi up` → provenance (REQ-DEP-1) | pre-auth (GD-DEPLOY.R6) |
| 187 | `187_R6OPS.1__readiness-drills.md` | R6 deploy | restore / rollback / playbook drills + alert delivery + on-call (REQ-DEP-2) | pre-auth (restore) |
| 188 | `188_R6INF.1__infra-posture.md` | R6 deploy | SQL REGIONAL + proxy MIG×2 + worker flip iff soak green (REQ-DEP-3) | pre-auth (GD-HA.R6) |
| 189 | `189_R6POST.1__prod-arms.md` | R6 live | prod arms: SSR, signed-in, deep-link, fixtures, usercontent, SSE, Lighthouse (REQ-POST-1/2/3/5/7/8/9) | pre-auth (mint/seed) |
| 190 | `190_R6POST.2__posture-stages.md` | R6 live | domains-bearing + Stripe test-mode posture stages (REQ-POST-6) | pre-auth (preview DNS) |
| 190a | `190a_HUMAN-H11__operator-session-2.md` | R6 marker | **human** — session 2: browser/money legs + approvals | — |
| 190b | `190b_GATE-R6B__funded-window-reopen.md` | R6 marker | **gate** — funded window re-open (~$150 pinned-scope) | operator |
| 191 | `191_R6FND.1__funded-wave-launchers.md` | R6 funded | bind + T9 + launchers (REQ-DISC-1 part 1) | R6B |
| 192 | `192_R6FND.2__funded-wave-riders.md` | R6 funded | gate launchers + riders + resume + census pairs incl. RES.3 verify (REQ-DISC-1 part 2) | R6B |
| 193 | `193_R6FND.3__funded-wave-b19c-census.md` | R6 funded | B19C conditional + paid new-visitor + (b)-row disposition (REQ-DISC-1 part 3) | R6B |
| 194 | `194_R6CNT.2__showcase-build.md` | R6 content | apply H11 approvals: Showcase build, H4 stamps, legal flags, exposure notice (REQ-LCH-3/4) | H11 |
| 195 | `195_R6SECR.1__adversarial-security-review.md` | R6 security | pre-launch adversarial security review — zero open criticals/highs (REQ-SEC-3) | — |
| 196 | `196_R6GLD.1__golden-validation.md` | R6 golden | $100 minimal four-protocol golden validation at the launch-candidate SHA (REQ-DISC-3) | pause > $100 |
| 196a | `196a_HUMAN-H12__merge-sweep-1.md` | R6 marker | **human** — merge sweep 1 (pre-launch) | — |
| 197 | `197_R6SWP.1__post-merge-nightly.md` | R6 launch | redeploy `main` HEAD + first scheduled nightly green (REQ-GO-2, REQ-POST-4) | pre-auth (GD-DEPLOY.R6) |
| 197a | `197a_GATE-LAUNCH__public-launch.md` | R6 marker | **gate** — public launch (13 pre-registered thresholds) | operator |
| 198 | `198_R6LCH.1__launch-flips.md` | R6 launch | metered → purchase → refund → trial everyone (REQ-GO-4) | LAUNCH |
| 198a | `198a_HUMAN-H13__merge-launch-pr.md` | R6 marker | **human** — merge the launch-flip PR | — |
| 199 | `199_R6CLK.1__clock-reads.md` | R6 clock | dated reads: purge, digest, destruction, billed actuals, reconcile, T8 expiry (REQ-CLK-1..6) | — |
| 200 | `200_R6WATCH.1__post-launch-read.md` | R6 watch | **skeleton** — launch + 14 d cohort read → close or owned watch (REQ-WATCH-1) | launch + 14 d |
| 201 | `201_R6CAP.1__capstone-gap-analysis.md` | tail | **capstone** — round-6 REQ coverage + §7 accounting completeness | — |
| 202 | `202_R6CAP.3__capstone-closure.md` | tail | **capstone** — routed gaps + accepted-deviations draft | — |
| 203 | `203_GATE-ACCEPT.R6__accepted-deviations.md` | tail | **gate** — operator signs the R6 deviations list | operator |
| 204 | `204_R6REC.1__backlog-and-readiness.md` | tail | **reconcile** — backlog + readiness; G2/H2 re-home; roadmap; owned obligations | — |
| 205 | `205_R6REC.2__spec-reconciliation.md` | tail | **reconcile** — spec fold-back (ADR-111/112/113) | — |
| 206 | `206_R6REC.3__integration-plan.md` | tail | **reconcile** — §R6 merge plan (never merges) | — |
| 207 | `207_R6DOC.1__repo-docs-refresh.md` | tail | **docs** — refresh-repo-docs (launched state) | — |
| 208 | `208_R6DOC.2__agent-docs-refresh.md` | tail | **docs** — agent-docs + the closing ledger write | — |

## Milestone gates (thresholds quoted verbatim from the spec; pre-registered — never guessed past)

**G1 — Phase-0 exit (spec §17 Phase-0 row, exit criterion):** "a Review of each of the three real
projects runs end-to-end in `dev` with `boundary.attested violations = 0`, the attestation derived
from the hydration manifest and proxy log, cited ⇒ fetched passing against the proxy log, **every
sidecar validating (`parseStatus = ok`) on all three projects**, a gate edit round-tripping through
the serializer into the next phase's file, **proxy-metered cost = SDK-reported cost ± 2%**, and
(v0.3) the **evaluation pilot wave** run end-to-end on the dev set — all six arms executable,
normalization and matching protocols exercised with trained matchers, all deterministic scorers
green, σ_d estimated and benchmark n fixed (REQ-EVAL-5)". Also read here: §16.3 #24's re-estimate
and the marketing block of §16.4 ("the marketing claims of §1.4 and §15.1 do not ship until the
Phase-0 exit criterion holds").

**G2 — Benchmark wave 1 + the LIFT criterion (REQ-EVAL-15, numbers operator-confirmed
2026-09-01):** "Rhema Full board over A1 on major-or-blocking material-issue recall by **≥ 15
percentage points absolute**, at an invalid-finding rate no worse than A1, **sustained across two
consecutive pre-registered waves** …; and, as guard rails, blinded editors prefer the
Rhema-revised manuscript over the A1-revised manuscript in **≥ 60%** of pairwise judgments with
voice band-conformance not worse than A1's." Wave 1 must be complete and **dispositioned by the
operator**; "the lift gate read before any UI spend beyond Phase 0" (§17 benchmark row). On a
criterion failure, REQ-EVAL-16's pre-committed consequences apply **before either the beta or the
IDE proceeds** ("if the lift criterion fails, stop before building *any* UI — beta or IDE"). Note:
*sustained-across-two-waves* is the marketing/publication bar; the G2 build gate reads wave 1 per
§17.

**G3 — Review-beta gates (REQ-BETA-18; spec §17 beta row, exit criterion):** "≥ 90 days with ≥ 15
active partners against pre-registered gates: **proceed to the full IDE** if ≥ 50% take ≥ 1
important manuscript through ≥ 2 full rounds unprompted, accept+adapt ≥ 55%, ≥ 60% import a second
manuscript, and ≥ 40% convert to real payment; **pivot/iterate in place** if repeat-cycle behavior
exists but conversion fails, or dispositions skew rebut/`wrong`; **stop-and-rethink** if round-2
rate < 20%, partners visibly prefer exporting to chat, or median stated WTP < $20/mo". Thresholds
are registered before the beta opens (REQ-BETA-20/22). Full-IDE ticket bodies are written after
this gate reads.


**GATE-R5F — Funded-window open (round 5):** the spec §5.5 checklist verbatim — system-role DSN
+ pg_roles probe → cumulative < the re-authorized ~$60 round cap on the pinned-scope query →
per-leg cap enforcement → ordering T9 → launchers → riders → B19C last → JOURNEY_FUNDED_STABLE_TAG
tenant + purge exemption → REQ-ECON-6 seed exclusions live. Estimated ~$20–40 with levers.

**GATE-ACCEPT.R5 — Round-5 accepted deviations:** the operator signs R5CAP.3's deviations list
(expected: deferred intent-preload allowlist, levered-vs-unlevered cap basis, honestly-owed
substrate legs, NAVC-18 freshness parity trade-off).

**GATE-R6B — Funded window re-open (round 6):** `docs/round-6-draft-spec.md` §6 verbatim —
"Funded window open — envelope ~$150 pinned-scope (ruled) with the cumulative measured < cap and ≥
the declared remaining caps + the Showcase run estimate; dry-run 9/9; deployed-tip provenance;
tenant + DSN; REQ-ENG-3 landed."

**GATE-LAUNCH — Public launch (round 6):** the 13 pre-registered thresholds of
`docs/round-6-draft-spec.md` §6, verbatim in `197a_GATE-LAUNCH__public-launch.md`. ADR-111
permits the launch; this gate decides it.

**GATE-ACCEPT.R6 — Round-6 accepted deviations:** the operator signs R6CAP.3's list (expected:
launch without G2, the external pen test post-launch, first-finding as a post-launch target, the
minimal golden cohort, the cost floor vs the ~$50 target).

## Phase gates & special points

- **Every P0/PRB ticket ends CI-green** with its stamped requirement IDs in the PR and its
  deterministic ACs as tests; agentic ACs run within a stated dev budget.
- **P0.15 is the Phase-0 barrier:** its exit readout must be written and G1 read before PRB work.
- **Benchmark tooling (P0.13/P0.14) is Phase-0 work** because the pilot wave is a Phase-0 exit
  criterion; wave 1 itself is an operation at G2, not a ticket.
- **Ownership notes (logic several tickets consume — never re-implement):** sidecar schemas
  (P0.02); parsers/serializers (P0.04); path/URL policy (P0.05); event mapper (P0.06); rate
  tables + fetch log (P0.07); hydration/commit interfaces (P0.08); materialize/harvest/delivery
  (P0.09); gate resolution + overlays (P0.10); ledger mutations (P0.11); obligation transitions
  (P0.12); `findings-core` (PRB.04); diff/move-join service (PRB.06); export container (PRB.11).
- **Beta-only stopgaps, exactly two (REQ-BETA-21):** PRB.01's flat shell (→ §5 shells at P1.01)
  and PRB.07's CodeMirror edit mode (→ 1.x Source mode).
- **External dependencies that must never block the chain:** H2 (corpus) blocks only G2, not
  PRB-phase prep the operator may authorize post-G1; H1 blocks only P0.07's start.
- **Deferred ports:** Draft (P1.10), Outline (P1.12), Research (P1.11) — a deliberate Phase-0
  narrowing per §17's beta reconciliation ("Draft's port defers"); the port machinery (P0.03/P0.04)
  is built to receive them.

## Cross-cutting invariants (every ticket re-checks; the capstone re-checks all)

1. **Canonical vocabularies** (REQ-SPEC-2; REQ-PROD-6; Appendix D.2): plans / model tiers / rigor /
   seats / approvals are disjoint, verbatim, lint-enforced; banned strings never appear.
2. **TypeScript everywhere; no Python** (Q-3; the Docling sidecar exception is deferred, not used).
   Licence allowlist + checked-in exception list (REQ-ARCH-40).
3. **Closed-source, open-source-ready** (Q-19): `packages/protocols` is a **committed member** of this
   private repo (amended 2026-09-01); `evals/` stays private + path-resolved. No protocol/eval text in
   client bundles, OpenAPI, or events (REQ-ARCH-33; SS §8.4); a public export drops `packages/protocols`
   and swaps in `@rhema/protocols-stub`, and the `public-safe` job builds that stub.
4. **Five contracts adopted by reference** (§0.1): design/3 §3.2 + §3.3, design/4 §6.3, design/7
   §8, design/9 §7.2 — tickets implementing them open the named sections and apply Appendix A's
   renames (REQ-IDE-50).
5. **Independence is enforced, never advised:** Editor never mounts the Drafter's notebook,
   voice-print/lexicon/exemplars, `preferences.md`, or obligations in independence contexts
   (REQ-OBJ-8/10/11); attestation derives only from server-side facts (REQ-SPEC-10).
6. **Immutability:** delivered artifacts write-once; freeze one-way; state computed, never stored
   (REQ-SPEC-3) — the sole mutable exception is the obligation row, cached by trigger.
7. **Money:** the proxy is the meter of record; Σ debits ≤ cap always; spend gates never
   auto-proceed; never silent billing (REQ-SPEC-11/24; REQ-BILL-3; REQ-SPEC-1).
8. **Skills verbatim:** ports differ from upstream only by the sanctioned inputs/outputs
   (REQ-ARCH-5); drift is a fork (REQ-SPEC-22); sidecar parse failure = `failed(validation)`,
   never a silent partial (REQ-SPEC-12).
9. **No superiority claim on any surface without a criterion-meeting pre-registered wave**
   (REQ-EVAL-19 extends REQ-GROWTH-5); copy rules REQ-POS-4/5/13 bind all user-facing text.
10. **Events/telemetry never carry prompt text, reasoning, private memory, or raw page text**
    (REQ-DATA-37; REQ-VIS-11; REQ-ARCH-14).
11. **The run sheet is the only run creator and the only paywall** (REQ-CHAT-25; REQ-GROWTH-13).
12. **A user surface is verified by walking it** (round 3; REQ-SPEC-29, ADR-016): every Stage B touching a user
    surface is accepted by the JOURNEY.1 browser journeys (visible text + actionable controls + screenshots), a
    built client bundle without a served route fails CI, and a ticket's close records deployed provenance = its
    chain-tip SHA. (Tickets landing before JOURNEY.1 use HTTP-level + test evidence.)
13. **Tenant isolation in depth** (round 3; REQ-SPEC-30, ADR-017): user-serving code connects with a role that
    cannot bypass RLS; only the documented system pool may bypass — never for a user request, with explicit
    workspace predicates on its queries; any ticket adding a tenant read extends the two-tenant probe.
14. **Money and research are truthful** (round 3; REQ-SPEC-32, REQ-SPEC-31, ADR-014/015): debits equal metered burn
    clamped at the cap; every price/duration/trial claim a user sees comes from the one estimator/entitlement
    config; a Review that could not research says so and refunds the research phases.

15. **Scoped authority** (round 6): prod deploys only under `GD-DEPLOY.R6`'s conditions; one-off prod acts
    only under `GD-PREAUTH-ACTS.R6` (dry-run equals the itemized scope) or the operator's go; spend only
    through the fail-closed guards. A failed condition pauses — it is never reasoned around.
16. **Cohort hygiene** (round 6): every agent- or operator-created account is `is_test` or
    analytics-opt-out, so no synthetic activity enters an organic cohort read.
17. **Context budget + preview hygiene** (round 6): each ticket fits one fresh SWE-2 (256k,
    non-compacting) run — a worker that finds its ticket overflowing stops and requests a split; every
    `pr-<n>` stack a ticket creates is destroyed and its teardown verified in the same ticket.

## Operating rules

Every round-6 ticket's *Operating clauses* section cites these (the gap table carries one row each):
1. Dates and stamps come from `date -u` at the moment of writing (BM-CLOCK-01) — never estimated.
2. CI is read at the exact head claimed (`ci-boundary --pr <n> --stack`) and recorded; a docs delta on
   a green head gets its own read.
3. Every AC states the layer it reached (engineered / fixture-verified / staging-verified /
   live-executed / human-completed); no leg claims green without committed evidence + provenance.
4. Protected records (contracts, history, LEDGER PHASE LOG, DEFERRALS cells) are only appended; a
   correction is a dated note.
5. Gate and ruling words are recorded verbatim; a pre-authorization is honored only within its
   items, conditions and expiry.
6. No secret value in any artifact (`provided: yes/no`); no PII committed (aggregates only).
7. The run ledger header names the harness/model/tier (BM-HARNESS-01).
8. No living-record pins in tests (BM-TEST-01).
9. No ledger-only push to an open-PR branch after a boundary confirm (operator ruling D8,
   2026-10-20 — each push is a ~55-min CI run): orchestrator ledger notes commit locally on the
   tip and carry into the next ticket's first push on its own branch.
10. Full-CI cadence (operator rulings D4/D5, 2026-10-20; ADR-115 + `docs/development.md`): a
    green **full** run is owed per round-6 gate and per deploy SHA — never per ticket; a
    per-ticket boundary read accepts a fast-path pass; `main` never reuses a PR pass, and
    `workflow_dispatch` (`gh workflow run ci.yml --ref <branch>`) is the forcing function
    for a full run between pushes.

## Out of scope (no ticket does this; the capstone verifies none crept in)

Publishing integrations (Q-9 — export-only); persona ethics gating (Q-11); plagiarism detection;
leaderboards/contribution metrics; browser/computer-use pane; safety classifiers on actions;
user-configured MCP/tools or per-seat corpora (Later, maybe never); folders/manual ordering
(never); scheduling; training on user content; the argument graph in any MVP/1.x form (REQ-OBJ-15
— the v2 spike is gated on the §18 corpus with binding kill criteria); fiction/marketing protocols;
the mobile app and everything 1.x (BYO keys, variants, working copies, suggestion marks, Source
mode as such, span provenance *rendering*, sharing roles, Team tier, Run rounds, Cut/Line
edit/Titles/Abstract/Reverse outline/Interview/Steelman/Map the field, additional ingestion
providers, seat profile pages, preference-profile aggregation); non-Anthropic providers (1.x, only
via `packages/harness` — REQ-ARCH-10); Temporal (stage 3 trigger not reached in MVP).


**Round 3 (2026-09-30) — additionally out of scope:** merging the stacked PRs (D1 — REC.3 writes the plan, the
operator merges); H2/G2 and any §16.4 efficacy claim (D5); BL-31 matcher-3 tuning (round 4, needs adjudication
data); working copies / suggestion reconciliation (still 1.x — EDIT.1 forks to v(N+1)); new 1.x features of any kind.

**Round 6 (2026-10-20) — additionally out of scope:** executing the G2/H2 research program (re-homed
post-launch by ADR-111); any §16.4 efficacy/superiority claim; the external pen-test engagement + its
triage (post-launch, ADR-112 — R6REC.1 records the ≤ 60-day obligation); new features beyond the legal
pages and the notice surfacing; BL-73 1.x roadmap + standing watches (roadmap per `GD-ROADMAP.R6`);
Redis HA (declined); cost levers (c)/(e) (rejected) and (b)/(d) (parked → post-launch roadmap); the
public announcement itself (the operator's act); merging (operator).

## Requirement-ID → ticket index (authoritative for coverage)

**Round-4 SPA families** (`docs/frontend-spa-spec.md` — `REQ-[A-Z]+-[0-9]+`; derived from the ticket stamp lists):

**REQ-INV** (route inventory): 1,6,7→SPA.3 · 2→SPA.4 · 3,4,5→SPA.5 · 8→SPA.26 · per-surface legs→SPA.10–24
**REQ-ISL** (island contracts): 1–8,16→SPA.24 · 9,10,14,15→SPA.9 · 11,12→SPA.3 · 13→SPA.14 · ISL-1 retirement leg→SPA.26
**REQ-DAT** (data layer): 1–6,8,9–14→SPA.5 + per-surface twins · 7,13 (checkSession leg)→SPA.4 · 9→SPA.13 · 13 (transports)→SPA.22
**REQ-TST** (test surfaces): 1,6,9→SPA.27 + per-surface · 2→SPA.7 · 3,4→SPA.8 · 5→SPA.3 · 7→SPA.6 · 8→SPA.26
**REQ-FW** (framework): 1–11→SPA.4 · 3→SPA.2 (flag leg) · 9→SPA.8 · 12→SPA.1
**REQ-TL** (toolchain): 1,2,3,6,8,10,11,12→SPA.1 · 4,5,7→SPA.3 · 9→SPA.4 · 13→SPA.6/13/26 · 14→SPA.8
**REQ-BFF** (BFF): conventions 1–30→SPA.5 · 13 (WSS)→SPA.24 · 16→SPA.13/14 · 18,20→SPA.4 · 22→SPA.23 · 24→SPA.9 · per-surface endpoints→SPA.10–24
**REQ-ED** (editor): 1,2,4,6,12,13,14→SPA.23 · 3,5,7–11,15,16→SPA.24 · 17→SPA.25 · 12 (forever-SSR leg)→SPA.27/28
**REQ-UX**: 1,2,6,7,9,11,12→SPA.4 · 8,16 (chrome leg)→SPA.9 · 3,4,5,10,13,14,15,16→per-surface tickets (polish budget)
**REQ-NAV**: 1–5,7,9–11→SPA.4 · 6→SPA.23 · 8→SPA.9
**REQ-BND** (boundary): 1–5,12→SPA.3 · 6–10→SPA.4 · 11→SPA.2/SPA.3
**REQ-VFY**: 1,2,6→SPA.7 · 3→SPA.4 · 4,7,8,10→SPA.6 + per-surface legs · 5→SPA.23 · 9→every surface ticket
**REQ-SAFE**: 1–5,8,9,10→SPA.8 · 6→SPA.5 · 7→SPA.1 · 9 (CI-order leg)→SPA.1
**REQ-SEQ**: 1–4→SPA.2 · 5→SPA.10 (entry gate) · 6→SPAF rows + SPA.17 (paired flip) · 7→SPA.6+surfaces · 8→SPA.3 · 9→surface tickets · 10→SPAF rows + SPA.26 entry gate · 11,12→all + SPA.26–28


MVP-binding IDs map to exactly one owner ticket (annotations name partial implementations
elsewhere). Families:

**REQ-IDE:** 1→P1.01 · 2→P1.19 · 3–6→P1.04 · 7→P1.14 · 8–10→P1.01 · 11,12→P1.05 (beta subset
PRB.04) · 13→P1.06 (beta PRB.03) · 14→P1.05 (beta PRB.04) · 15→PRB.04 · 16→PRB.05 · 17→P0.10 ·
18,19→P1.05 · 20,21→**deferred 1.x** · 22→P1.11 · 23→P1.07 (beta PRB.04) · 24→P1.07 · 25,26→PRB.04
· 27,28→PRB.05 · 29→P1.07 · 30,31→PRB.04 · 32→P1.08 (fork rule PRB.07) · 33→P1.08 (beta PRB.06) ·
34→P1.08 (storage P1.03) · 35–37→P1.08 · 38–42→P1.01 · 43→P1.03 · 44,45→P1.02 · 46→P1.03 ·
47→P1.19 (email PRB.09) · 48→P1.19 · 49→P1.06 · 50→P0.02

**REQ-VIS:** 1,2→P0.02 · 3→P1.08 · 4–6→P0.09 · 7→P0.09 (hook half P0.05) · 8→P1.14 (beta PRB.10) ·
9→P0.09 · 10→PRB.11 · 11→P0.06 (support-access surface P1.20)

**REQ-DATA:** 1–4→P0.02 · 5–8→P0.09 · 9→P0.09 (b/d halves P1.02, PRB.02) · 10→P0.09 · 11–13→P0.05
· 14→P0.02 · 15→P0.05 (proxy half P0.07) · 16→P0.07 · 17,18→P0.06 · 19–21→P0.09 · 22→P0.09 (UI
PRB.05) · 23→P1.12 · 24→PRB.07 · 25→PRB.06 · 26→PRB.07 · 27→**deferred 1.x** · 28→P1.02 · 29→P1.02
(block capture PRB.07) · 30,31→P1.14 · 32→PRB.10 (full sheet P1.14) · 33→P0.08 · 34→P0.11 ·
35,36→P0.10 · 37→P0.02 (write-boundary P0.08b, mapper P0.06) · 38→P0.08b · 39–41→P0.08 (guidance
leg P0.10) · 42→P0.11 · 43→**deferred 1.x** · 44→P1.03 (roles 1.x)

**REQ-GROWTH:** 1–3→P1.17 · 4→P1.16 · 5,6→P1.17 · 7,8→P1.16 · 9→P1.17 · 10→P1.16 · 11,12→P1.17 ·
13→PRB.03 · 14,15→P1.16 · 16→PRB.03 · 17→P1.17

**REQ-BILL:** 1→PRB.03 · 2,3→P0.11 · 4–6→PRB.03 · 7→P1.16 · 8→P1.16 (levels 3–4 P1.05) ·
9,10→P1.16 · 11,12→P1.16 · 13→PRB.08 · 14→P1.16 · 15→P0.11 · 16,17→P1.16 · 18→P0.02 · 19→P1.16

**REQ-ACCT:** 1→PRB.09 · 2→P1.20 · 3→P1.18 · 4→P1.20

**REQ-ARCH:** 1,2→P0.01 · 3→P0.08 · 4→PRB.02 · 5,6→P0.03 · 7→P0.06 · 8→P0.03 · 9→P0.08 ·
10→**deferred 1.x** (constraint binds now) · 11→P0.08 · 12,13→P0.08b · 14,15→P0.06 · 16→P0.09 ·
17,18→P0.05 · 19→P0.06 · 20→P0.09 · 21→P1.22 (halves: (a)(b) PRB.02/P0.05, (c) P0.09 delivery
checks, (d) P0.07) · 22–24→PRB.02 · 25→P0.02 · 26,27→P0.01 · 28,29→P0.01 (audited P1.22) ·
30→P0.07 · 31→P0.07 · 32→P0.08 (emission P0.07) · 33→P0.01 (packaging P0.03) · 34→P1.22 ·
35→PRB.08 · 36→P0.15 · 37–40→P0.01

**REQ-RUN:** 1→P0.08 · 2→P0.08 · 3,4→P0.09 · 5–8→P0.10 · 9–17→P0.08 · 18→P0.10

**REQ-CHAT:** 1–14→P1.11 · 15–18→P1.12 · 19,20→P1.11 · 21–24→P1.06 · 25→PRB.03 ·
26,27→**deferred 1.x** · 28→P1.06 · 29,30→P1.11

**REQ-GATE:** 1→P0.10 · 2→PRB.05 · 3,4→P0.10 · 5→P1.09 (triage half PRB.05) · 6→P0.10 · 7→PRB.05 ·
8→PRB.09 · 9→P0.10 · 10→P0.10 (management UI P1.09/P1.20) · 11→P0.10 · 12,13→P0.10 (UI P1.05) ·
14–16→**deferred 1.x**

**REQ-VIZ:** 1–16→P1.13

**REQ-MOBILE:** 1 (scope rule — constraint), 3→P1.19 (amended web half), 4→PRB.04, 10→PRB.09 (rule
applied to email); 2, 5–9, 11–22→**deferred 1.x** (the app; their phone-width-web aspects land via
REQ-SPEC-20 in PRB.05/P1.19)

**REQ-PERSONA:** 1→P1.14 · 2–4→PRB.10 · 5→P1.16 · 6–16→P1.14 (13/14 beta subset PRB.10) ·
17→PRB.10 · 18→P1.14 · 19→**deferred 1.x** (house styles) · 20→PRB.10 · 21→P1.04 · 22–26→P1.14 ·
27→PRB.10

**REQ-INGEST:** 1→PRB.10 · 2,3→P1.15 · 4→PRB.10 · 5,6→P1.15 · 7→P1.15 (plumbing PRB.02) ·
8→PRB.02 · 9→P1.15 · 10→PRB.10 · 11→P1.15 · 12→PRB.02 · 13→P1.14 · 14→P1.15

**REQ-PROD:** 1→P0.02 · 2→PRB.04 · 3→P1.06 · 4→PRB.05 · 5→P1.06 · 6→P0.02 · 7→P1.14 · 8→P1.04 ·
9→P0.08 (surfaces P1.04/PRB.01) · 10→P1.04 · 11→PRB.06 · 12→**deferred 1.x** (stall half P0.12) ·
13→this manifest (rows = epics) · 14→P1.02 · 15,16→PRB.12

**REQ-WF:** 1→P0.03 · 2→P0.09 · 3→PRB.03 · 4,5→P1.10 · 6→P0.02 · 7→P0.12 · 8→P1.21 · 9,10→PRB.05 ·
11→P1.14 · 12→P0.02 (UI 1.x) · 13→P0.03 · 14→P1.13 · 15→P0.12 (loop 1.x) · 16→**deferred 1.x** ·
17→P0.02

**REQ-GENRE:** 1→P0.03 · 2,3→P1.21 · 4→P1.04 (data P0.03) · 5→PRB.11 (Academic half P1.21) ·
6,7→P1.21

**REQ-SPEC:** 1→P0.10 · 2→P0.02 · 3→P0.08 · 4→P0.03 · 5→superseded · 6,7→P1.07 · 8→P1.16 · 9→P0.10
(serializers P0.04) · 10→P0.06 · 11→P0.07 · 12→P0.04 (delivery P0.09) · 13→P0.08 (data P0.03) ·
14→P0.02 · 15→P1.11 · 16→PRB.03 (API P0.08) · 17→P0.10 · 18→PRB.05 (state P0.10) · 19→P1.02 ·
20→P1.19 (beta halves PRB.05/PRB.09) · 21→P0.02 · 22→P0.04 · 23/26/28→reserved (merged) ·
24→P0.11 (item 7 PRB.08) · 25→P1.22 (halves P0.07/P0.09/PRB.02) · 27→P1.14 · **round 3 (2026-09-30):**
29→JOURNEY.1 (asset-route parity half HOT.1) · 30→SEC.1 · 31→RES.1 (delivery/refund half RES.2) · 32→EST.1
for (b) ((a)→ECON.1; claims half ACT.1; (c)→ECON.2) · 8 (amended interim terms)→ACT.1 (restore flip ECON.2) ·
REQ-VIS-9 (reconciled)→CITE.1 (Unverified half RES.2)

**REQ-OBJ:** 1→P0.02 · 2–5→P0.12 · 6→P0.12 (surfaces PRB.03/04/06, PRB.11, P1.08/P1.19) ·
7→P0.02 · 8→P0.09 · 9→**deferred 1.x** (kind pre-registered P0.02) · 10→P0.09 (hook half P0.05) ·
11→P0.03 (CI input-source test) · 12–14→**deferred 1.x** (posture copy P1.20) · 15→out-of-scope
constraint · 16,17→P0.02 · 18→P0.04 (delivery P0.09, DDL P0.02) · 19→P0.03 (field P0.02)

**REQ-EVAL:** 1–5→P0.13 (human halves H2) · 6–11→P0.14 · 12–14→P0.13 · 15,16→gate G2 (computation/
log P0.14) · 17→P0.14 · 18→P0.14 · 19→P1.17 · 20→P0.14

**REQ-POS:** 1,2→P1.17 · 3→P1.17 (beta sample PRB.01) · 4,5→P1.17 · 6→PRB.11 · 7→P1.18 ·
8,9→P1.02 · 10→**deferred 1.x** · 11–13→P1.17

**REQ-BETA:** 1→this manifest (chain trace) · 2→PRB.12 · 3→this manifest (tags) · 4→ledger budget
row · 5→PRB.12 · 6→PRB.05 · 7,8→PRB.06 · 9–13→PRB.12 (11's emission PRB.02) · 14,15→PRB.08
(15's self-serve purchase path PRB.13) · 16,17→HUMAN H3 (**deferred 2026-09-16** — users pay their
own way) · 18→gate G3 (**deferred** — parked pending real-world data; thresholds already
pre-registered in PRB.12's `BETA_GATE_THRESHOLDS`) · 19→PRB.01 (invite machinery; **amended
2026-09-16** — the open-signup surface → PRB.13) · 20→gates G1–G3 (this manifest) · 21→this manifest +
PRB.01/PRB.07 · 22→spec §17 decision record (quoted at G3)

**Deferred (1.x / Later / constraint-only) — target phase named:** REQ-IDE-20/21 (1.x seat pages);
REQ-DATA-27 (1.x working copy), 43 (1.x share links); REQ-CHAT-26/27 (1.x variants);
REQ-GATE-14/15/16 (1.x steering); REQ-MOBILE app family (1.x app); REQ-PERSONA-19 (1.x house
styles); REQ-PROD-12 (1.x Run rounds); REQ-WF-15 loop half, REQ-WF-16 (1.x); REQ-ARCH-10 (1.x
providers); REQ-OBJ-9/12/13/14 (1.x learning), 15 (v2 spike, gated); REQ-POS-10 (1.x span
rendering); REQ-SPEC-5/23/26/28 (superseded/reserved). MVP-phase coverage: every other ID above
has exactly one owner.


| REQ id(s) | owner ticket(s) |
|---|---|
| REQ-NAVM-1..4/6..8 | NAVC.1 · REQ-NAVM-5 → NAVC.5 · REQ-NAVM-9/10 → NAVC.4 |
| REQ-NAVT-1..8 | NAVC.2 (1/2/3/6/7-nav-count) · NAVC.1 (8) · NAVC.3 (5-emit + 7-page-session) · NAVC.4 (4/5-legs) |
| REQ-NAVC-13 | NAVC.1 · REQ-NAVC-16/19/21/23 → NAVC.4 · REQ-NAVC-17/18/20/22 → NAVC.3 |
| REQ-ECON-1..5/10/11/12 | R5ECON.2 · REQ-ECON-6/7/8/13 → R5ECON.1 · REQ-ECON-9 → R5ECON.1+R5ECON.3 |
| REQ-FND-6/7/8 | R5ECON.3 (FUNDED.1 executes under GATE-R5F) |
| REQ-FIX-* | FIX.1 · REQ-OPS-1..7 → R5OPS.1 (+VERIF.2 for OPS-5) · REQ-COST-1..6 → COST.1 |
| REQ-MEM-1..5/9/10 | HYGIENE.1 · REQ-MEM-6/7/8 → R5REC.2 |
| REQ-G1-1..5 | R5CAP.1/R5CAP.3 (1/4/5) · VERIF.1+VERIF.2 (3: V-1/V-2) · HYGIENE.1 (2 + 3: V-3) · HUMAN-H8 (5: bundle) |

**Round-6 families** (`docs/round-6-draft-spec.md` v0.3 — `REQ-[A-Z]+-[0-9]+`; one primary owner each):

| REQ family | ticket(s) |
|---|---|
| REQ-ENG-1/4/5/6/8 | R6ENG.1 · REQ-ENG-2 → R6ENG.2 · REQ-ENG-3 → R6ENG.3 · REQ-ENG-7 → R6SOAK.1 |
| REQ-LCH-1 | R6LGL.1 (approval flags: R6CNT.2) · REQ-LCH-2 → R6CNT.1 · REQ-LCH-3/4 → R6CNT.2 · REQ-LCH-5 → R6MNY.1 |
| REQ-FOR-1/2/3 | R6FOR.1 · REQ-FOR-4 → R6FOR.2 (notice send: R6CNT.2) |
| REQ-WRT-1/2/3 | R6WRT.1 |
| REQ-DEP-1 | R6DEP.1 · REQ-DEP-2 → R6OPS.1 · REQ-DEP-3 → R6INF.1 |
| REQ-POST-1/2/3/5/7/8/9 | R6POST.1 (REQ-POST-7 code half: R6UCD.1) · REQ-POST-6 → R6POST.2 · REQ-POST-4 → R6SWP.1 |
| REQ-DISC-1 | R6FND.1 → R6FND.2 → R6FND.3 · REQ-DISC-3 → R6GLD.1 · (REQ-DISC-2/4 retired, v0.1) |
| REQ-SEC-3 | R6SECR.1 · REQ-SEC-1/2 → post-launch obligation (ADR-112; recorded by R6REC.1) |
| REQ-GO-1 | HUMAN-H12 · REQ-GO-2 → R6SWP.1 · REQ-GO-3 → GATE-LAUNCH · REQ-GO-4 → R6LCH.1 · REQ-GO-5 → HUMAN-H13 |
| REQ-CLK-1..6 | R6CLK.1 · REQ-WATCH-1 → R6WATCH.1 |
| REQ-TAIL-1 | R6CAP.1/R6CAP.3 · REQ-TAIL-2 → R6REC.1 · REQ-TAIL-3 → R6REC.2 · REQ-TAIL-4 → R6REC.3 · REQ-TAIL-5 → R6DOC.1/R6DOC.2 |

## Spec amendments applied

- **2026-09-02 (cloud provider + inference channel; Q-3 / §12 / §13 / REQ-ARCH-1/2/30/31):** the ratified
  "AWS-first" decision is superseded — **compute moves to GCP** and **inference moves to the direct
  Anthropic API** (platform-billed, key in Secret Manager, proxy-injected). Rationale: the operator could
  not create an AWS account, and the load-bearing AWS tie was the inference channel ("Claude Platform on
  AWS" = Anthropic's first-party API + Marketplace billing + server web tools), which GCP's Vertex Claude
  (like Bedrock) lacks — so sourcing inference from the direct Anthropic API is cloud-independent and also
  **collapses the M15 auth spike (H1)**. Service mapping (Fargate→Cloud Run; run-task→GKE Standard for
  `CAP_SYS_ADMIN`; Aurora→AlloyDB; S3→GCS; CloudFront/ALB→Cloud CDN/HTTPS-LB; Secrets Manager→Secret
  Manager; SigV4/task-role→Workload Identity; SES→Resend; SST→Pulumi; CloudWatch→Cloud Operations;
  Bedrock→Vertex AI; us-east-1→us-central1) is in the §12 amendment banner. Affects §12.1/12.3/12.4/12.7/12.9,
  §13.1–13.5, H0/H1, and P0.01/P0.06/P0.07/P0.08/P0.15/PRB.09. The **SST→Pulumi IaC rewrite** lands on a
  P0.01 re-run once the GCP project exists (DEFERRALS D-P0.01-7; **ADR-003**); the committed `infra/` SST skeleton is
  marked superseded meanwhile. pg-boss, Expo Push, Stripe, Better Auth, and the boundary/uid model are
  unchanged. **(ADR-001)**
- **2026-09-01 (REQ-ARCH-37 / §13.2 / cross-cutting invariant 3):** `packages/protocols` moved from a
  gitignored path-resolved private checkout to a **committed workspace member** (operator decision — the
  repo is private). Open-source-readiness is now an export-time swap to `@rhema/protocols-stub` (renamed
  from `@rhema/protocols`), not a live resolution; `.pnpmfile.cjs` path-resolution now covers `@rhema/evals`
  only; the ported skills are drift-checked against the vendored pin `packages/protocols/upstream-pin/`.
  Affects P0.01 (private-package wiring) and P0.03 (the protocols package now lands in-tree, tracked). **(ADR-002)**
- **2026-09-16 (REQ-BETA-19 / §17 beta row — open self-serve paid launch):** the beta is no longer
  private/invite-only — a **public self-serve signup** and **self-serve credit purchase via Stripe
  Payment Links** are permitted ahead of the full-IDE launch, so the platform hosts paying users
  while the H3 partner program (recruitment, the REQ-BETA-17 deal, house-credit grants) is
  deferred. **Kept verbatim:** no PR / marketing site / launch moment (reserved for the full IDE),
  no public pricing page beyond the purchase flow's needs, **no §16.4 efficacy/marketing claims on
  any surface until GATE G2's LIFT criterion is met** (REQ-EVAL-19), Payment Links the one
  real-money channel (REQ-BETA-15); the invite machinery stays for partner cohorts; REQ-BETA-18's
  ≥90-day/≥15-active-partner gate still reads before the full-IDE bodies (G3 deferred, reads on
  real-world usage). Annotated in the spec at the §17 banner + the Appendix A.13 note (original
  text preserved — append-only). Affects PRB.01 (the invite gate becomes a mode flag — PRB.13 owns
  the open-signup surface) and the whole `28c`–`28h` round. **(ADR-008)**

- **2026-09-30 (round 3 — launch readiness; REQ-SPEC-29…32 added; REQ-SPEC-8 / REQ-IDE-13 / REQ-SPEC-1 /
  REQ-GROWTH-1 amended; §11.4, §12.8, §13.5, §14.1, §14.3 banners; §13.5 SLO row added):** a browser-driven review of
  prod (`docs/build/reports/2026-09-30_prod-design-review.md`) found the new-user journey broken at load-bearing
  steps, a live cross-tenant read, a paid Review with no web research, and prices modelled far below metered cost.
  Added: user-journey acceptance (REQ-SPEC-29, ADR-016), tenant isolation in depth (REQ-SPEC-30, ADR-017), research
  integrity (REQ-SPEC-31, ADR-015), cost truthfulness — charge what we meter + one calibrated estimator
  (REQ-SPEC-32, ADR-014). Amended: interim trial terms (REQ-SPEC-8), tier choice on the sheet (REQ-IDE-13), gate
  labels from the defaults table (REQ-SPEC-1), the 20 s import as an SLO (REQ-GROWTH-1). Original texts preserved
  (Appendix A.9 note). Approver: operator (2026-09-30; D3 pricing, D4, D5, D6 delegated to Claude's judgment —
  recorded in `docs/build/planning/2026-09-30_planning-ledger.md` and LEDGER GATE DECISIONS). **(ADR-013…017)**

- **2026-09-17 (production domain + prod database engine; §13.1 / §13.3 banners):** *(retro: applied
  2026-09-17 — the spec banners already carried it; this line backfills the log at REC.2,
  2026-10-04.)* The production domain is **`rhema.tools`** (one zone): `rhema.app` and
  `rhemausercontent.com` superseded; web at the apex, api at `api.rhema.tools`, the cookieless
  user-content origin at `usercontent.rhema.tools` (+ `*.usercontent.rhema.tools`); cookie
  isolation → host-only `__Host-` cookies. Same date: the prod database engine is **Cloud SQL for
  PostgreSQL** (`db-g1-small`) for the ~$50/mo prod budget — AlloyDB stays on dev/previews;
  Memorystore Redis drops to BASIC. Affects §13.1, §13.3, H6, PRB.15. **(ADR-010)**
- **2026-09-15 → applied 2026-10-04 (GATE G2 deferred — Phase-B UI before the wave-1 LIFT eval;
  §17 banner):** the §17 benchmark row's "the lift gate read before any UI spend beyond Phase 0"
  is suspended by operator decision (ledger § GATE DECISIONS 2026-09-15): Phase-B implementation
  proceeded without the eval. Unchanged: G2 + H2 stay a HARD gate before public launch; no §16.4
  efficacy/marketing claim ships until LIFT is met (REQ-EVAL-19); REQ-EVAL-16's consequences apply
  retroactively to UI built meanwhile — UI spend past the deferral is at risk. Annotated in the
  spec at the §17 banner + the status line. **(ADR-104)**
- **2026-09-23 → applied 2026-10-04 (GATE G3 read early → PROCEED; §17 addendum + Appendix A.13
  REQ-BETA-18 note):** the REQ-BETA-18 ≥90-day / ≥15-active-partner window was skipped entirely —
  G3 read early on operator evidence (the platform live end-to-end on prod, a Review delivered
  within a derived cap, the measured cost structure) → PROCEED to the full IDE (ledger § GATE
  DECISIONS 2026-09-23). Caveat recorded: zero partner behavioral data; the thresholds were never
  evaluated, and the ~$7–10/review cost finding vs the $20/mo WTP stop-threshold would itself have
  been a pivot signal. Annotated at the §17 addendum banner, the REQ-BETA-18 row marker, the A.13
  addendum, and the status line. **(ADR-105)**
- **2026-10-10 (round-4 fold-back, SPAREC.2 — `docs/frontend-spa-spec.md` v1.0 → v1.1 + supersession
  pointers on `docs/rhema-design-spec.md`):** the frontend-SPA spec is amended to its as-built
  shape — **§14 Spec amendments** records every landed deviation: the flag machinery's sunset
  executed per REQ-SEQ-4's own clause (override signals inert; stage fact removed, vocabulary
  retained), REQ-VFY-8's single-leg flip recipe, REQ-SEQ-9's flag-off parity retired-by-design,
  REQ-SEQ-7's revert-by-construction rollback, REQ-SEQ-10's pacing-as-activation-cadence,
  REQ-VFY-10's owed steps folded into the composed suite, REQ-VFY-6's component-axe interim,
  ADR-108's twin-flagged showcase handoff, ADR-107's forever-SSR island set (`page`/`ide` stay;
  `outline` retired alone), and REQ-ED-17's plain-text CodeMirror source mode. The six
  verification-procedure rows stay PARTIAL (GATE-ACCEPT.SPA signed all eight rows ACCEPTED
  2026-10-10). The product spec gains supersession notes only — §12 `web` row + §13.1 stack line
  read through the SPA spec; the REQ-BETA-21 CodeMirror stopgap shipped as designed REQ-ED-17.
  **(ADR-106/107/108; GATE-ACCEPT.SPA)**
- **2026-10-17 (round-5 fold-back, R5REC.2 — `docs/frontend-spa-spec.md` v1.1 → v1.2 + supersession
  addenda on `docs/rhema-design-spec.md`):** the settled client-navigation mechanism is folded
  into the canonical specs — `frontend-spa-spec` **§14.18** records the dated defect (the
  round-4 chain shipped zero interception — the "MPA-mode" gap, ruled a defect at Q-scope-1)
  and **§14.19** the mechanism amendment (one delegated `document` click interceptor, the
  ordered guard pipeline + skip-list, `RELOAD_STUB_IDS` doc-nav arm, `SsrHandoff`
  replace-mode, unconditional renderer handling, push-only history, no intent-preload, the
  `hashchange` compensation, and the extended settle contract — `data-nav-count`,
  mounted-pending `data-mounted`, `data-page-session`, `settleClientNav`/`documentLoads`).
  The product spec gains dated banner addenda (§12 table + §13.1) pointing at the settled
  mechanism; the REQ-NAVC/NAVM/NAVT families and GATE-ACCEPT.R5's signed rows 1/2/4 are
  cross-referenced; COVERAGE_MATRIX REQ-MEM-6/7/8 → MET. **(ADR-110; GATE-ACCEPT.R5)**

- **2026-10-20 — round-6 launch posture (operator rulings; `docs/rhema-design-spec.md` §17 dated
  banner):** the public launch is decoupled from G2 (ADR-104's launch clause and ADR-008's "no
  launch moment" superseded in part — claims stay lint-blocked); §17's Phase-1 exit row amended
  (golden validation green on all four protocols at the launch SHA + re-run on protocol-affecting
  deploys; first-finding ≤ 4 min → a post-launch organic target). **(ADR-111; GD-LAUNCH-G2.R6,
  GD-S17.R6)**
- **2026-10-20 — external pen test moves post-launch (operator ruling `GD-PEN.R6b`):** P1.22's
  "criticals are launch-blocking" rule now binds the in-round adversarial review (REQ-SEC-3); the
  external engagement completes ≤ 60 days after launch. **(ADR-112)** — and, owed in-round, the
  §13.3 usercontent delivery amendment lands with R6UCD.1 **(ADR-113)**.

## Decomposition decisions (operator may veto; see the session report)

1. Phase-0 port scope = Review/Revise/Fact-check/persona-Quick; Draft/Outline/Research ports
   deferred to P1.10–P1.12 (§17: "Draft's port defers"; REQ-BETA-1 scope).
2. Benchmark tooling numbered inside Phase 0 (P0.13/P0.14) because the pilot wave is a Phase-0
   exit criterion; wave 1 is the G2 operation, not a ticket.
3. Phase 0a is HUMAN rows only; the estimator service is beta-phase (PRB.03) per the §17 rows.
4. Essay protocol seeded in Phase 0; Academic/Op-ed/Memo at P1.21 (Q-22 Essay-only beta; Q-15
   scope untouched).
5. `fetcher`/`convert` land at PRB.02 (Phase-0 runs use Anthropic server tools at Quick/Standard);
   Full-board fetcher routing is available from PRB.02 onward.
6. G2 reads wave 1 (per §17); the two-wave "sustained" clause of REQ-EVAL-15 is the
   marketing/publication bar, not the build gate.
7. The artifact Browser (§5.13) is owned by P1.08.
8. **Phase-4 adversarial review applied (2026-09-01; fresh-context; 0 blocker / 6 major / 6
   minor, all fixed):** P0.08 split (events → P0.08b); the §6.3 state function, REQ-ARCH-9, and
   the hold-interface stub added to P0.08; backups/retention/deletion pipeline added to P0.01;
   REQ-OBJ-11 CI test added to P0.03; the §12.8(c) verdict source check added to P0.09's delivery
   transaction; `gate:<id>` job ownership split stated (P0.08 registers, P0.10 owns semantics);
   analytics event schemas moved to P0.02; P1.14's forward dependency on P1.15 removed; matrix
   row 37 citation import named in P1.02; duplicate coverage claims annotated as halves.

9. **Round 3 (2026-09-30; `decompose-spec mode=extend`; ADR-013).** Inputs: `docs/build/BACKLOG.csv` (65 rows),
   the prod design review (`docs/build/reports/2026-09-30_prod-design-review.md`), operator decisions D1–D7 (D3
   pricing / D4 / D5 / D6 delegated). Partition + briefs: `docs/build/planning/2026-09-30_planning-ledger.md`.
   Sized for `subagent` dispatch. **Phase-4 adversarial review (fresh context): "not sound as written; sound with
   revisions" — 17 findings, 16 accepted (#1 was a read race):** metered-debit flip flagged + calibrated caps in the
   same deploy + operator-paused with notice; trial at Standard/Base with a measured word cap (not Quick); SEC.1
   re-scoped to the role split (+ rollback + exposure list); RES.1/RES.2, EST.1/RPT.1, STB.5a/STB.5b splits;
   BILL.2 → DEF.4; research floor owned by RES.1, CITE.1 before ECON.2, ECON.2 named levers + non-regression ACs;
   EDIT.1 re-cited (no working copies); LB logging → HOT.1; HOT.1 hides false claims; MAINT.2 after JOURNEY.1;
   H7 before the tail; journey step owners + expected-red + real magic-link mailbox; one primary owner per REQ;
   D4 sharpened (coverage-based, new refund class, D.2 vocabulary, REQ-VIS-9 reconciled); standing authorization
   tightened (metered-cost caps, mechanical "additive" check, more pauses).

10. **Round 6 (2026-10-20; `decompose-spec mode=extend`; ADR-111/112).** Inputs:
    `docs/round-6-draft-spec.md` v0.3 (operator sign-off "Okay, I sign off v0.3."),
    `docs/decomposition-prompt-r6.md` v0.3 (the frozen invocation record),
    `docs/research/r6_open_work_census.md` (+ §8 corrections). Sized for **subagent** dispatch on SWE-2
    High (256k, non-compacting). 33 implement/skeleton/tail rows + 4 HUMAN + 3 GATE = 40 rows (176–208).
    Tail = full (CAP.2 omitted — R6POST.1/R6SWP.1 + GATE-LAUNCH are the composed verification).
    **Phase-4 review** (the explicit re-read-from-disk discipline — no fresh-context subagent this
    session): 0 blocker · 3 major · 3 minor, all folded in.
    - MAJOR: orphan seam — nobody owned setting the legal `approved: true` flags or sending an
      approved exposure notice → assigned to R6CNT.2 (renamed "apply H11's approvals").
    - MAJOR: orphan seam — D-RES.3-1's paid live half (launch-blocking) had no funded leg →
      R6FND.2 census.
    - MAJOR: the CI chain-descent flag (digest) traced to 8 `.gitleaks.toml` allowlist lines on
      `main` absent from the chain (round-3 merge artifact) → R6ENG.1's deploy-neutral allowlist
      covers CI-only config; HUMAN-H12 records it.
    - MINOR: overflow clauses added to R6POST.1 and R6OPS.1; the "(as in 176)" AC shorthand was
      expanded in every file, since a worker loads one file; T8 mint + BL-78 seed moved post-deploy
      (R6POST.1).

    Shared decisions owned by the first ticket: the provenance allowlist (R6ENG.1), the mint helper
    (R6UCD.1), the `approved` flag shape (R6LGL.1), `launch-flips.md` (R6MNY.1), the funded cap
    default (R6FND.1), the golden minimal-cohort mode (R6GLD.1). **The plan is revisable at run
    time** — orchestrate-build may split an overflowing ticket or merge trivial ones and writes the
    change back here.

## Plan extensions (append-only: inserts, splits, rounds)

- **2026-10-20 — ROUND 6 (public launch readiness; `docs/round-6-draft-spec.md` v0.3, operator-ratified
  2026-10-20).** 40 rows appended under the `### Round 6` banner (176–208, suffix-letter markers):
  - 4 HUMAN markers (H10–H13);
  - 3 gates (GATE-R6B, GATE-LAUNCH, GATE-ACCEPT.R6);
  - 24 implement-spec tickets + 1 skeleton (R6WATCH.1);
  - the full tail (R6CAP.1/.3, R6REC.1–3, R6DOC.1–2).

  Stacks on `stevevitali/r6-planning-corpus`; R6ENG.1's PR carries the planning commits (the
  `r5-synthesis` → #172 precedent). `mergePolicy: OPERATOR`. Decomposition prompt:
  `docs/decomposition-prompt-r6.md`.

- **2026-10-15 — ROUND 5 (post-SPA disposition; `docs/post-spa-disposition-spec.md` canonical, operator-ratified
  2026-10-15).** 27 rows appended under the `### Round 5` banner: 2 HUMAN markers (H8 operator
  bundle, H9 cost-posture ruling), 11 implement-spec tickets (HYGIENE.1, FIX.1, VERIF.1/2,
  NAVC.1–4, ECON.1–3, OPS.1, BL38.1), 1 skeleton (COST.1), 1 gate (GATE-R5F) + 1 funded skeleton
  (FUNDED.1), and the tail (CAP.1, CAP.3, GATE-ACCEPT.R5, REC.1–3, DOC.1–2 — CAP.2 omitted: V-1/V-2
  are the composed verification). Stacks on the round-5 synthesis branch; `mergePolicy: OPERATOR`.
  Decomposition prompt: `docs/decomposition-prompt.md`.

- **2026-10-07 — ROUND 4 (frontend SPA migration; `docs/frontend-spa-spec.md` canonical v1.0, operator-ratified 2026-10-08).** 51 rows appended under the `### Round 4` banner: 9 foundations (SPA.1–9), 13 surface tickets + editor split in two (SPA.10–24), 14 prod-flip PRs (SPAF.1–14 — one line each, ≥1 nightly green between flips), 4 cleanup tickets (SPA.25–28 — Source-mode revival per operator ruling Q-8, island retirement, SSR deletion wave, override removal), and the full v2 tail (SPACAP.1–3, GATE-ACCEPT.SPA, SPAREC.1–3, SPADOC.1–2). Stacks on the round-3 chain tip; `mergePolicy: OPERATOR`; the declared rebase checkpoint sits at the foundations↔surfaces boundary (spec R24). Decomposition prompt: `docs/decomposition-prompt.md`.

Run-time inserts and splits, recorded here and reflected in the chain table + `docs/build/LEDGER.md` PHASE LOG.
The Phase-0 `P0.15*` sub-tickets were each **synthesized from the previous ticket's live blockers** — the
validation-first live bring-up (spec §17) surfaced work the offline decomposition could not foresee. They keep
the `16_` prefix (ID-suffixed inserts, not `16a/b/c` which the G1/H2/G2 markers hold); the chain table carries the
sequence (BM-COMPAT-05 — historical filenames are not renamed).

- **2026-09-01 — SPLIT** P0.08 → P0.08b (run events / SSE) per the Phase-4 adversarial review (decomposition-decision #8); both files kept.
- **2026-09-02 — INSERT** `cloud-switch` (PR #7): AWS→GCP + inference via the direct Anthropic API (ADR-001); collapsed the H1 auth spike. Recorded as an amendment (see § Spec amendments applied).
- **2026-09-03 — INSERT** `16_P0.15b` (PR #18): live Stage A bring-up artifacts (Pulumi/GCP IaC, SDK adapter, arm executors, live-exit driver; ADR-003).
- **2026-09-03 — INSERT** `16_P0.15c` (PR #19): live client bindings + Stage B dev execution (live Review blocked on the unbuilt RUN_SPEC).
- **2026-09-04 — INSERT** `16_P0.15d` (PR #20): the server-authored harness RUN_SPEC + node-egress/proxy IaC.
- **2026-09-04 — INSERT** `16_P0.15e` (PR #21): pod→server commit/deliver loop + deployable worker.
- **2026-09-04 — INSERT** `16_P0.15f` (PR #22): pod-log observability + agent→proxy path + worker GKE launcher.
- **2026-09-08 — INSERT** `16_P0.15g` (PR #23): agent-launch caps + credential injector + green-review construction (+ audit companion `16_P0.15g__preflight-audit.md`).
- **2026-09-09 — INSERT** `16_P0.15h` (PR #24): per-phase artifacts + budget config + hook enforcement + IaC; full 6-phase Review proven live to the deliver path.
- **2026-09-09 — INSERT** `16_P0.15i` (PR #25): proxy-guaranteed server-side web research (cited⇒fetched provenance; AC3 live).
- **2026-09-10 — INSERT** `16z_MAINT.1` (this PR): build-memory v2 migration (RUN 1 of 3 post-P0.15i follow-ups; ADR-004).
- **2026-09-10 — INSERT** `16_P0.15j`, `16_P0.15k` (RUN 2 & 3 of the follow-ups): the fact-check citation-discipline eval, then the last live G1 legs. G1 now reads after `16_P0.15k`.
- **2026-09-16 — INSERT round (prod launch — open self-serve signup + live legs).** Six rows slotted after `28b_GATE-G3` and before `29_P1.01`, synthesized from the open DEFERRALS rows + the operator's prod-launch decisions (**ADR-008**; REQ-BETA-19 amended — see § Spec amendments applied): `28c_HUMAN-H6` (prod accounts + the Stripe live-mode decision), `28d_PRB.13` (open self-serve signup + the 0-credit purchase path), `28e_PRB.14` (run resilience + cost fidelity — the stranded-run sweeps, ledger call-sites, provisional `usage.tick`, estimator fold, `PROTOCOLS_VERSION`), `28f_PRB.15` (prod bring-up, Stage A offline / Stage B operator-gated), `28g_PRB.16` (prod golden-path verification), `28h_PRB.17` (billing live + ops legs). H3 is **deferred in part** (partners/deal/house credits — users pay their own way; the sample-dossier sign-off stays operator-owed; thresholds already pre-registered in code) and **G3 is deferred** (parked pending real-world data) — ledger § GATE DECISIONS; H2/G2 stay deferred as before (HARD gate before marketing claims).
- **2026-09-18 — INSERT** `28g2_PRB.16b` (authorized continuation per the 28g spec's own split clause):
  PRB.16 proved the golden path's read/write surfaces on prod but three live findings block the rest —
  FINDING 12 (revise author seat can't read the delivered dossier; only `access-report.md` lands in
  `correspondence/`), FINDING 13 (cap-402'd runs orphan/reaper-loop instead of finalizing), plus the
  operator browser legs + Resend placeholder. Slots between `28g` and `28h`.
- **2026-09-18 — INSERT round (prod finish — credentials supplied + defect closeout).** Two rows
  slotted after `28h_PRB.17` and before `29_P1.01`, synthesized from the operator's credential
  hand-off (real Google OAuth client ID — the `401 invalid_client` root cause was the
  `pending-h6-…` placeholder in `Pulumi.prod.yaml`; real Resend key; a **live-mode** Stripe key,
  amending the earlier test-mode answer; the operator's own Anthropic key) + the PRB.16b/PRB.17 open
  findings: `28i_PRB.18` (deploy the OAuth config, Google + magic-link sign-in legs, the
  Stripe-originated purchase D-PRB.17-1, browser EventSource/editor legs) and `28j_PRB.19` (the F26
  Revise `response`-delivery design fix + mount-policy half, fetch byte-receipts decision, bounded
  live verifies for D-PRB.16-2/-4). `anthropic-admin-key` stays a placeholder → usage.reconcile
  stays deferred; D-PRB.16-5 stays an operator ruling. G3 remains parked; P1.* skeletons unchanged.
- **2026-09-30 — ROUND 3 (launch readiness; ADR-013).** 37 rows appended after `58_STB.4`: 27 implement-spec
  tickets `59_SEC.1` … `85_STB.5b`, the HUMAN marker `85a_HUMAN-H7`, and the standard v2 tail `86_CAP.1` …
  `93_DOC.2` (with `88a_GATE-ACCEPT`) — the first time this build runs the standard tail. Synthesized from the
  65-row backlog + the 2026-09-30 browser review of prod; spec amended (REQ-SPEC-29…32 added; REQ-SPEC-8 /
  IDE-13 / SPEC-1 / GROWTH-1 / VIS-9 amended; Appendix D.2 *Unverified*); ADR-013…017. Builds on the unmerged chain
  tip (D1). **Not yet recorded here (MAINT.2 backfills):** the 2026-09-22…09-26 inserts (28k–28p, the P1 bodies,
  CAPSTONE, RCN.1, STB.1–4, DEF.1–3) whose chain-table rows exist but whose Plan-extensions lines were never written.
- **2026-09-22 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28k_PRB.20` (PR #49): live ingestion upload path — the prod import surface 500'd
  (browser upload → quarantine → convert Job → §5.3 preview → frozen `human_upload` draft). Trigger: live
  finding.
- **2026-09-22 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28l_PRB.21` (PR #50): day-one live-use defect pass (concurrent-run guard,
  import-preview latency). Trigger: operator Option-C ruling — defect-repair work proceeds while G3 stays
  parked.
- **2026-09-22 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28m_PRB.22` (PR #51): review-verification burn cap model. Trigger: the evening's
  run data — five consecutive live reviews died `cap_reached`; D-PRB.21-1 opened (defect lane, G3 parked).
- **2026-09-22 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28n_PRB.23` (PR #52): context-churn estimate model — post-mortem on the PRB.22
  verify run plus the zero-spend context-driver analysis. Trigger: live finding.
- **2026-09-23 — GATE READ EARLY** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* G3 read on operator evidence → **PROCEED** (GATE DECISIONS; deliberate
  REQ-BETA-18 override, caveat recorded — zero partner data). Context: unblocks the 29–50 skeletons.
- **2026-09-23 — BODIES WRITTEN** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* rows 29–50 (`29_P1.01` … `50_P1.22`) — all 22 skeletons expanded to
  `implement-spec`-ready bodies (PRs #55–#76 land them in order).
- **2026-09-23 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28o_PRB.24` (PR #53): intra-phase transcript accumulation — post-mortem on the
  PRB.23 Stage-B verify run (defect lane, G3 parked). Trigger: live finding.
- **2026-09-23 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `28p_PRB.25` (PR #54): synthesis-phase churn term — post-delivery residual (the
  first delivered review needed its synthesis term priced). Trigger: live finding.
- **2026-09-26 — LEDGER ROW** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* CAPSTONE (no PR — manifest ledger row on `stevevitali/p1-22-launch-checks`):
  whole-chain gap analysis vs the ratified spec.
- **2026-09-25 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `51_RCN.1` (ledger row, no PR; audit/docs-only): post-CAPSTONE deferral
  reconciliation — 13 rows flipped DONE live.
- **2026-09-25 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `52_STB.1` (ledger row, no PR; deploy-only ops): pre-merge prod deploy + smoke.
- **2026-09-25 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `53_STB.2` (ledger row, no PR; read-only live verifies; the committed follow-up
  deploy is tracked as the `STB.2-deploy` index row): twelve deferral rows verified live → DONE; the
  cross-tenant dossier finding surfaced (→ P1.22 fix, deploy 78).
- **2026-09-26 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `54_STB.3` (ledger row, no PR; bounded live run legs on prod `f3c7e13`): ten live
  findings F1–F10 → split into DEF.1/DEF.2/DEF.3. Trigger: live findings.
- **2026-09-26 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `55_DEF.1` (PR #77): run-pipeline blockers — the STB.3 F1–F3 repairs
  (defect-lane split from the live findings).
- **2026-09-26 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `56_DEF.2` (PR #78): ledger + metering integrity — the STB.3 F4–F6 repairs
  (same split).
- **2026-09-26 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `57_DEF.3` (PR #79): live noise + polish — the STB.3 F7/F9/F10 repairs
  (same split).
- **2026-09-26 — INSERT** *(retro: PHASE LOG same-date entry; backfilled 2026-10-01 by MAINT.2)* `58_STB.4` (PR #80): real-money + external legs (live Stripe, pen-test
  facilitation, admin-key reconciliation — operator hard gates).
- **2026-10-06 — INSERT** `94_MAINT.3` (stacked PR; $0 maintenance, no funded legs — the operator's
  spend constraint): deterministic repairs of the funded window's four recorded defects —
  D-STB.5b-4 (defer on `mooted` → 409, not 500), D-STB.5b-5 (scoped empty-text `sdk=success` → one
  guided re-issue before `blocked`), the §B.3 entitlement interception (the sheet posts the trial
  `entitlementId` only at the entitlement's configured shape), and the D-OBS.1-3 N4/N9 substrate
  (N4 reads the Included variant's embedded recompute cell; `scripts/live/reseat-n9-fixture.mjs`
  reseats the BILL.3 fixture sub). Trigger: the funded window's run ledgers; live re-verification of
  each fix stays ledgered on its D-row.
- **2026-10-07 — INSERT** `95_MAINT.4` + `96_RES.3` (stacked PRs; $0 — the operator's no-more-credits
  constraint): MAINT.4 repairs the OAuth sign-in defect the operator surfaced ("Continue with Google"
  loops back to /login) — better-auth v1.7.2's default `/sign-in/*` limiter (3/10s) keys
  `NO_TRUSTED_IP_KEY` because ADR-040's stamped channel carries no resolvable XFF → one global bucket;
  prod log evidence 26×200/8×429 on `sign-in/social`. RES.3 is the read-only Leg-1a zero-coverage
  diagnosis (`01M48VNKY6F263TCQRVBJ8JRQA` — 9/9 unverifiable, 0 `claim_sources`). Trigger: operator
  report + the funded window's §B.4 finding; live legs owed, ledgered.
- **2026-10-07 — INSERT** `97_MAINT.5` (stacked PR; $0): MAINT.4's deploy exposed the second stacked
  OAuth defect — Chromium enforces CSP `form-action` on a form POST's redirect TARGET, so the healthy
  302 to `accounts.google.com` was silently blocked (same class as BILL.3's Stripe hand-off, ADR-027).
  Trigger: operator report post-deploy + headless-browser reproduction.

- **2026-10-08 — INSERT** `149_MAINT.6` (seq 149; stacked; positioned after row 109 `SPA.11`, before row
  110 `SPAF.2`): non-prod test-session plumbing — `rhema:resendApiKey` real-key path (non-prod only, prod
  refuses) + `preview-stack.mjs resend-pull`/`seed-invite` verbs + journeys `--invite-code`, so `pr-<n>`
  previews mint real `test*@rhema.tools` sessions through the magic-link path. Operator prerequisite:
  `rhema-nonprod-resend-api-key` seeded in Secret Manager (scoped send-only key, prod-account domain).
  Closes D-OPS.1-1 + D-SPA.6-1; unblocks every remaining surface's legs A/B/C. Trigger: SPA.11 found
  D-OPS.1-1 as the operative blocker for all signed-in preview legs; operator ruled "real Resend key on
  non-prod" (2026-10-08 ledger phase log).
- **2026-10-15 — INSERT** `153a_CIREP.1` (run-time insert, BM-MANIFEST-03 — no new PR; repairs on the #173/#174
  heads): green the two inherited ancestor reds surfaced by the NAVC.1 boundary CI read — FIX.1's
  `@rhema/findings-core` dev-dep lacks the `packages/db` composite project reference (contracts leg) and
  VERIF.1's seven registry green-flips weren't synced to the pinned baseline at `registry.test.ts:53`
  (typecheck/lint/unit). Additive commits on the ancestor branches (`fd5ade2`/`0623042` SHAs preserved —
  REQ-SPEC-29), then a re-fork of the NAVC.1 branch onto the repaired head preserving the crashed worker's
  WIP. Slots between `153` and `154`; nextTicket → CIREP.1; `blockedOn` stays until the pass read.
  Trigger: operator election (dispatch question) + orchestrate-build §2.3 step 4 exit-3.
- **2026-10-20 — INSERT** `176a_R6CI.1` (run-time insert, BM-MANIFEST-03; slots between rows 176 and 177,
  before R6ENG.2 is dispatched): CI cost phase 1 — fail-closed docs-only/same-tree fast path
  (`scripts/ci/fast-path-paths.txt` = deploy-neutral minus `.gitleaks.toml`/`docs/build/tools/**`/
  `docs/build/record_policy/**`; gitleaks + `check:no-cookies` always run), `ci-pass-<hash>` anchor
  artifacts, `workflow_dispatch`, per-SHA `push` concurrency, `contracts` duplicate-vitest removal,
  `--maxWorkers=2` measurement, journeys `schedule:` pause until R6SWP.1 (D7), full-run cadence per
  gate + per deploy SHA (D4), no main reuse (D5), phase-2 deferred (D6), no self-hosted runner (D9).
  Trigger: `/Users/stevenvitali/rhema-ci-handoff/handoff-prompt.md` + the 2026-10-20 CI spend
  measurement (18,023 billed min/month pace; 44 % docs-only heads). Operator rulings D1–D9 verbatim
  in LEDGER § GATE DECISIONS; ADR-115. Ledger notes ride this ticket's branch (rule 9).
