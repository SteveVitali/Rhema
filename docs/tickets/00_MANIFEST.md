# Rhema build manifest — the ticket chain

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
| — | `16a_GATE-G1__phase0-exit.md` | 0→B | **GATE** (operator) — Phase-0 exit; **reads only after `16_P0.15k` closes the live criteria** (via 16z_MAINT.1 → 16_P0.15j → 16_P0.15k; the `16_P0.15d` note above is superseded — the live work ran through P0.15e–i and these follow-ups); see § Milestone gates |
| — | `16b_HUMAN-H2__benchmark-corpus.md` | B | **HUMAN** — corpus + editors + provider verification (start during Phase 0); must complete before wave 1 |
| — | `16c_GATE-G2__wave1-lift.md` | B→RB | **GATE** (operator) — wave 1 + LIFT; on failure REQ-EVAL-16 consequences apply **before any UI spend beyond Phase 0** |
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
| — | `28b_GATE-G3__beta-gates.md` | RB→1 | **GATE** (operator) — REQ-BETA-18 gates; full-IDE bodies are written after this reads. **Deferred 2026-09-16** — the ≥90-day / ≥15-active-partner window is not blocking; the gate stays parked in the chain pending real-world data — ledger § GATE DECISIONS |
| 28c | `28c_HUMAN-H6__prod-launch-accounts.md` | LV | **HUMAN** — prod-launch prerequisites (prod-launch round, 2026-09-16, **ADR-008**): prod domains/DNS, the GCP prod footing, Secret Manager entries, the **Stripe live-mode decision**, OAuth consent + Resend domain for prod |
| 28d | `28d_PRB.13__open-selfserve-signup.md` | LV | open self-serve signup + the 0-credit purchase path (REQ-BETA-19 amended): `signup.mode` flip, abuse throttle, no §16.4 claims |
| 28e | `28e_PRB.14__run-resilience-and-cost-fidelity.md` | LV | the stranded-run sweeps (D-P0.08-4/-10-2), ledger call-sites (D-P0.11-1), provisional `usage.tick` (D-P0.08-2), estimator fold (D-P0.15k-1), `PROTOCOLS_VERSION` provenance (D-P0.04-2) — deterministic halves; live legs → PRB.17 |
| 28f | `28f_PRB.15__prod-bringup.md` | LV | the `prod` stage profile + Pulumi prod stack + domains/TLS + image set + seed/migration runbook (Stage A offline); **`pulumi up prod`** + migrations + smoke + the D-P0.13-2 write (Stage B operator-gated) |
| 28g | `28g_PRB.16__prod-golden-path-verification.md` | LV | one real user journey end-to-end on prod — every live surface leg asserted from rows/logs (D-P0.01-3, D-PRB.01…11 live rows, D-P0.08b-1…3, D-P0.09-3, D-P0.15h-5, D-P0.15i legs re-verified) |
| 28g2 | `28g2_PRB.16b__prod-golden-path-continuation.md` | LV | **INSERT 2026-09-18** — PRB.16's un-run legs: LIVE FINDING 12 (revise author seat can't read the dossier — delivery never writes it into `correspondence/`), LIVE FINDING 13 (cap-dead runs orphan/reaper-loop instead of finalizing), then the completing Revise run, Quick Voice build, gate-EDIT, browser sign-in legs + stragglers |
| 28h | `28h_PRB.17__billing-live-and-ops-legs.md` | LV | the real-money channel on prod (D-PRB.08-1: Payment-Link purchase live-or-test per the H6 Stripe answer, Usage & Cost reconcile, >2% alert, admin CLI), PRB.14's live halves, live `beta-report` (D-PRB.12-1) |
| 28i | `28i_PRB.18__prod-auth-billing-finish-legs.md` | LV | **INSERT 2026-09-18** — prod credential-apply + finish legs: real Google OAuth client (the `invalid_client` fix) + sign-in click-through, Resend magic-link, Stripe-originated purchase (live-mode key supplied), browser EventSource/editor legs (D-P0.01-3, D-PRB.17-1, D-PRB.04-2a, D-PRB.07-1a) |
| 28j | `28j_PRB.19__revise-delivery-and-defect-pass.md` | LV | **INSERT 2026-09-18** — F26 Revise `response`-delivery design fix + mount-policy half (D-PRB.16-1), fetch byte-receipts decision, then bounded live verifies (D-PRB.16-2/-4) |
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

## Requirement-ID → ticket index (authoritative for coverage)

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
24→P0.11 (item 7 PRB.08) · 25→P1.22 (halves P0.07/P0.09/PRB.02) · 27→P1.14

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

## Plan extensions (append-only: inserts, splits, rounds)

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
