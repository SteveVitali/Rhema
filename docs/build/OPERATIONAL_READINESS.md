# Rhēma — operational readiness

> Written 2026-09-30 by `reconcile-build mode=backlog`, alongside [`BACKLOG.md`](BACKLOG.md) /
> [`BACKLOG.csv`](BACKLOG.csv). Every "owner" below is a backlog row (`BL-nn`) and names its landing. Evidence
> comes from the committed build memory: `docs/tickets/DEFERRALS.md`, `docs/build/LEDGER.md`,
> `docs/build/runs/*`, `docs/build/readouts/*`.

## Verdict

**Prod is live, but not ready for a public launch.** `rhema.tools` is live on prod and serves real
self-serve paid traffic. Signup, ingest, review, delivery, dossier and the Stripe top-up have all run on prod
with real rows, and DEF.1 completed review, draft, outline and profile_voice runs live.

It is **not launch-ready**, and one hard gate plus four live-risk items stand in the way:

- **G2 (wave-1 LIFT).** A hard gate before §16.4 claims or a public launch. It is deferred, and its H2 corpus
  does not exist.
- **Undeployed Stripe fixes.** Fixes for the payment path, including a double `included` grant, are committed
  but not deployed, while prod holds a live Stripe key (BL-09).
- **RLS bypass.** The api's DB role bypasses row-level security (BL-08).
- **Red SLOs.** Every §13.5 SLO read red during STB.3 (BL-07).
- **Unmerged code.** Prod runs code from 33 unmerged PRs (BL-01).

## Capability matrix

| # | Capability | Code state | Infra needed | Human gate | Owner |
|---|---|---|---|---|---|
| 1 | Sign-up, sign-in, admission | Live: Better Auth (Google + magic link), open self-serve signup. The invite gate is built but never run against a real invite; the throttle is per-instance | Redis-backed shared counter (Redis is already bound in api) | none | BL-23 → `round-3/SEC.2-signup-admission` |
| 2 | Tenant isolation + data security | The dossier route is patched (workspace predicate). **The api role is BYPASSRLS**; dossier tables have no RLS. The run-task keeps the two-uid split and egress-only access, but runs AppArmor `Unconfined` | A non-BYPASSRLS api DB role + secret | operator: DB role + secret rotation (provided: no); pen-test procurement; exposure review | BL-08, BL-26, BL-35, BL-37 |
| 3 | Import + ingestion | Live: paste, upload, Substack export, discovered items, priced visual-PDF reconstruct (STB.3). The AC-I-A re-sync dedup is unexercised | deployed (fetcher, convert Job) | none | BL-22 → `round-3/STB.5-headless-legs` |
| 4 | Review (core workflow) | Delivers on prod (DEF.1 `01M3EAAZ…`, 447/1,083 cr, scoped second-read live, `boundary.attested` violations 0). Citations use Path B (strip + downgrade). Neither the Full-board fetcher nor the memo deny-on-attempt has run live | deployed (GKE `runs` ns, egress proxy) | none (cost → row 9) | BL-15, BL-18 |
| 5 | Other workflows (draft, outline, profile_voice, chat, research_burst, revise, figures) | draft, outline and profile_voice completed live (DEF.1), and a chat_turn completed at 27/40 cr (DEF.3). Revise and figures were proven earlier. research_burst ends `blocked` at `plan` on thread-local questions, so fetch/distill has never run. The gate-edit → next-phase file and finalize legs are unproven | deployed | operator product ruling (thread-local research routing) | BL-19, BL-20 → `round-3/STB.5-bounded-live-legs` |
| 6 | IDE surfaces (editor, versions, findings, approvals, inbox, settings, landing, phone) | All P1.01–P1.20 surfaces are landed and return 200 headless on prod. The browser-interactive legs are unobserved | deployed | human browser session + throwaway account | BL-21, BL-32 |
| 7 | Payments (Stripe) | The top-up Payment Link runs in live mode, and two real purchases landed on 2026-09-22. Subscriptions, portal, auto-reload and trial were verified only against a local test-mode edge (STB.4). **Three fixes on that path are not deployed** | api/web/worker redeploy | operator: real money (≤$50 ceiling), test-mode key (provided: no) | BL-09, BL-33 |
| 8 | Metering, ledger, reconciliation | The proxy is the meter of record, with cap-402 and clamped debits; F4/F5/F6 are fixed and deployed. The `held>=0` check is validated on prod only by hand. There is no live F5 settle proof, the provider reconcile is blocked on a placeholder admin key, and `refundPhases` has no caller | none new | operator: admin/org key (provided: no) | BL-10, BL-30, BL-34 |
| 9 | Estimation + pricing | `estimate_cache` + Haiku pre-pass are live (DEF.2). The estimator folds are process-local. **Unit economics are open**: a quick review costs ~$7–10 metered | none | operator pricing ruling | BL-13, BL-14 → `round-3/ECON.*` |
| 10 | Export + data rights | Export formats and the account-zip download are live (STB.2). The citeproc, import round-trip and 7-day-expiry legs are unexercised, as is the delete lifecycle on a throwaway account | deployed (export Job) | human (throwaway-account delete lifecycle) | BL-22, BL-32 |
| 11 | Notifications + inbox | Inbox rows and email delivery are live; signed actions work (303 → 410 on replay); `/api/action` fixed (DEF.3). Quiet hours, Decisions-row transitions, stale-voice and badge click-through are unexercised | deployed | none | BL-22 |
| 12 | Observability + SLOs | Deployed: monitoring stack, dashboard, alert policies, api-availability SLO, `slo_samples` probes. **SLOs are red**, and paging to the channel has never been asserted. Probe definitions have gaps | none | none | BL-07, BL-24 |
| 13 | Infra, stages, delivery | The prod Pulumi stack is live (update 91). `dev` is a 23-resource skeleton, and `pr-<n>` previews have never run. **33 PRs are unmerged**; manual changes sit outside IaC | dev + preview stages; merged `main` | operator merge (mergePolicy OPERATOR); operator budget | BL-01, BL-25, BL-27, BL-28, BL-29 |
| 14 | Evaluation program (§18 / G2) | Machinery built and exercised on the dev set with fakes. Not yet built: live enclave bucket, real `@rhema/evals`, arm executors, judge, workshop UI | a benchmark GCS bucket + principal | HUMAN-H2 (corpus ≈$100k, editors, written provider no-training verification) | BL-40 → BL-43, BL-44, BL-45 |
| 15 | Content + claims | The Showcase uses fixture content; venue tables are honestly stale-dated; §16.4 efficacy claims are **forbidden** until G2 | none | HUMAN-H5 (essay), HUMAN-H4 (venue tables) | BL-41, BL-42, BL-45, BL-15 |
| 16 | Build memory + governance | The validator shows 0 violations, but LEDGER state has drifted, the manifest's `## Plan extensions` stops at 2026-09-18, and the v2 tail never ran (no COVERAGE_MATRIX, REC.1–3, DOC.1–2 or GATE-ACCEPT) | none | operator signs GATE-ACCEPT | BL-02..06, BL-47 |

Capability notes:

- **1 Admission.** ADR-009's revisit trigger (a) has fired in principle: the beta-grade throttle now fronts
  open self-serve signup on a multi-instance deploy.
- **2 Isolation.** Close the api-role bypass (BL-08) before the pen test engagement (BL-35), or the testers
  will re-find it.
- **7 Payments.** Prod runs with a live Stripe key while the double-`included`-grant fix is undeployed.
  Treat BL-09 as the first code deploy after the merge.
- **9 Economics.** On 2026-09-23 the operator accepted proceeding past G3 with this as a *carried product
  risk*. No row owned it until now.
- **12 SLOs.** RCN.1 measured a first-start p95 of ≈57 s (n=15). STB.3's 3,080 s probe reading probably
  includes resume and retry transitions, so BL-07 must separate probe error from real latency before it
  tunes infra.

## Critical path

This is the ordered path from today's state to a public launch. Steps 1–8 are what **continuing to operate the
live paid service safely** requires. Steps 9–14 get from there to **public launch and §16.4 claims**. Each step
names its `ticket:` (a proposed round-3 id where no chain row exists yet) and the `proof:` that shows it done.

1. **Integrate the chain.** Write the integration plan, merge PRs #48–#80 bottom-up, and diff the deployed
   tree against merged `main`.
   ticket: `round-3/REC.3-integration-merge` (BL-01) — proof: `docs/build/INTEGRATION_PLAN.md` committed.
   Every service's `deployments` provenance SHA passes `git merge-base --is-ancestor <sha> origin/main`, and
   the merge PRs show as merged on the remote.
2. **Make build memory trustworthy again.**
   ticket: `round-3/MAINT.2-ledger-hygiene` (BL-02), then `round-3/REC.1-backlog` (BL-04) — proof:
   `check-build-memory.sh .` exits 0. LEDGER CURRENT STATE reads the true `lastCompleted`/`nextTicket`, and
   `## GATE DECISIONS` has its heading back. `check-backlog.sh`'s expected-source count equals the
   first-keyword count of status-owed deferral rows plus the ADRs.
3. **Deploy the Stripe-path fixes.**
   ticket: `round-3/BILL.1-stripe-fixes-deploy` (BL-09) — proof: a `deployments` row for api, web and worker
   at or after `cf40f28`, and the STB.4 regression tests green in CI. One subscription activation on prod
   shows exactly one `grant(included)` per period in `credit_ledger`.
4. **Close the RLS bypass.**
   ticket: `round-3/SEC.1-tenant-isolation` (BL-08) — proof: on prod, `pg_roles.rolbypassrls = false` for the
   api's login role. RLS policies exist on `correspondence_items`, `findings`, `claims` and
   `revision_obligations`, with a deterministic cross-tenant test. The STB.2 foreign-pair read still answers
   404.
5. **Close out ledger integrity.**
   ticket: `round-3/DEF.4-ledger-integrity` (BL-10) — proof:
   - `recompute-balances --apply` passes its test under an active `held>=0` constraint.
   - A migration validates `credit_balances_held_nonnegative`.
   - The nightly `assertBalances` logs 0 divergences.
   - One cancelled and one failed multi-phase run on prod show release-only and refund settle rows.
6. **Get the SLOs green.**
   ticket: `round-3/SLO.1-prod-slo-remediation` (BL-07) — proof: the `rhema-prod — §13.5 SLOs` dashboard shows
   7 consecutive days within the `packages/orchestrator/src/slo.ts` targets:
   - run-start p95 ≤ 45 s
   - success ≥ 97% weekly
   - gate-resume p95 ≤ 60 s
   - event-delivery p95 ≤ 2 s

   A test alert must also reach the wired channel.
7. **Harden signup admission.**
   ticket: `round-3/SEC.2-signup-admission` (BL-23) — proof: a live log of 429s tripping on the shared count
   across ≥2 instances, and an `invite_redemptions` row from a gated signup.
8. **Settle the economics.**
   ticket: `round-3/ECON.1-unit-economics` (BL-13) + `round-3/ECON.2-durable-estimator-store` (BL-14) —
   proof: an operator pricing ruling recorded in LEDGER GATE DECISIONS, and ≥3 quick reviews delivered inside
   their derived caps, with metered and committed credits recorded in the run ledger. The plan's
   `whatItCovers` figures must be recomputed from the measured cost, and the folded constants must survive a
   worker restart.
9. **Run the remaining live-verification legs.**
   ticket: `round-3/STB.5-bounded-live-legs` (BL-16..20), `round-3/STB.5-headless-legs` (BL-21, BL-22) and
   `round-3/STB.5-launch-verification` (BL-24) — proof: `docs/build/runs/STB.5.md`, with each named D-row
   flipped to DONE and carrying its run ids. The canary-injection run is paused, with a `pause_signals` row.
10. **Operator legs.**
    ticket: `operator` (BL-32 browser session, BL-33 live-mode Stripe, BL-34 admin key) — proof:
    - A browser-leg section in `runs/STB.5.md` with a trace or screenshot per leg.
    - Real `cs_`/`sub_`/`in_` ids in `stripe_events`.
    - A `usage.reconcile` window row with provider totals and a drift %.
11. **External security.**
    ticket: `round-3/SEC.3-runtask-confinement` (BL-26), then `operator` (BL-35 pen test) — proof:
    `privsep-check.sh` green inside the distroless image under a non-`Unconfined` AppArmor profile, and a
    pen-test readout in `docs/build/readouts/` triaged per `docs/security/pen-test-findings-triage.md` with
    zero open criticals.
12. **The G2 program.**
    ticket: `HUMAN-H2` (BL-40), then `GATE-G2` (BL-43, BL-44, BL-45), with `round-3/CITE.1-citation-completeness`
    (BL-15) — proof: the corpus is registered in the enclave with an IAA ≥ the pre-registered floor, and
    `recordPilotPower` has written σ_d + n. `docs/build/readouts/GATE-G2.md` must carry a PASSED disposition
    with wave-1 LIFT, and the citation-completeness metric must be reported.
13. **Real content.**
    ticket: `HUMAN-H5` (BL-42) + `HUMAN-H4` (BL-41) — proof: `assertShowcaseFixture` green on the real bundle,
    and `protocols.venue_table_verified_at` non-null in a seeded db.
14. **Close the build.**
    ticket: `round-3/CAP.1-coverage-matrix` (BL-03), `round-3/REC.2-spec-reconciliation` (BL-05),
    `round-3/DOC.1-DOC.2-docs-refresh` (BL-06), then `GATE-ACCEPT` (BL-47) — proof: `COVERAGE_MATRIX.csv`
    and `SPEC_RECONCILIATION_PLAN.md` committed, `docs/build/readouts/GATE-ACCEPT.md` signed by the operator,
    and LEDGER `projectStatus: DONE`.

Off the critical path, owned but not sequenced:

- BL-11 small fixes and BL-12 CI flake
- BL-25 dev/preview stages, which should precede any further live-verification round
- BL-27 IaC drift, BL-28 Turbo cache and BL-29 cost posture
- BL-30 refund window and BL-31 matcher tuning
- BL-36 nightly golden (budget-gated)
- BL-37 exposure review, BL-38 test-data cleanup and BL-39 H3 decision

## Cost and risk posture

### Measured costs (from the run ledgers; credits at $0.01)

| What | Figure | Source |
|---|---|---|
| STB.3 bounded live legs (9 runs + ingest) | **$4.51 committed / $13.04 metered** (451 cr / 1,304 cr over 526 proxy rows). About 853 cr of burn was never committed and was absorbed as platform cost under the D-PRB.16-5 ruling | `runs/STB.3.md` |
| DEF.1 Stage B reruns (6 runs) | 2,053 cr committed (≈$20.53), every leg under its cap | `runs/DEF.1.md` §7 |
| DEF.2 + DEF.3 Stage B | ≈$0.53 of a ≤$8 target | LEDGER `updatedAt` note |
| Provider-window metered side, 2026-09-26 UTC | $24.23 list · 3,363 cr · 1,001 proxy rows (100% `provider_request_id` coverage); the provider side is not computable without the admin key | `runs/STB.4.md` Leg C |
| **Per quick review** | **~$7–10 metered**. The one delivered derived-cap quick review, `01M36663…`, metered 720 cr and committed 586 cr (cap 783). STB.3's figure run estimated 7 cr and metered 58 cr (8.6× under) | LEDGER GATE DECISIONS 2026-09-23; D-PRB.21-1 |
| Writer plan | $20/mo, 2,000 included credits (≈2.8 quick reviews at 720 cr metered). The G3 row itself calls $7–10/review against the $20/mo stop-threshold "a pivot signal" | `packages/contracts/src/domain/pricing.json`; LEDGER 2026-09-23 |
| **Prod infra** | **~$95/mo always-on floor** (Cloud SQL db-g1-small, 1× e2-medium GKE, BASIC Redis, proxy MIG ×1) against a **~$50/mo authorized target**. The actual monthly bill has never been measured against the target (BL-29) | LEDGER GATE DECISIONS 2026-09-17; `infra/PROD-BRINGUP.md` §0 |
| Nightly golden run (not running) | ~$150–300/night — not authorized | D-P0.15-4 |
| H2 corpus (not started) | ≈$100k across two quarters | manifest H2 (Q-23) |
| Live-mode Stripe legs (unspent) | ≤$50 ceiling authorized for STB.4; test mode was used, so $0 was spent | manifest row 58; `runs/STB.4.md` |

Round-3 live budgets proposed in the backlog: BL-16 ≤$3, BL-17 ≤$5, BL-18 ≤$15, BL-19 ≤$30, BL-20 ≤$5 and
BL-10 ≤$5, about **≤$63** of inference. The rest (BL-21/22/24/32) is $0 inference.

### Risks, ranked

1. **Money correctness on live money.** The undeployed fix for the double `included` grant on subscription
   activation, while a live Stripe key is active (BL-09). The fix is small; the exposure is real.
2. **Tenant isolation.** The api's login role bypasses RLS. One cross-tenant read was already found and
   patched at the route level, so the systemic cause is open (BL-08). Its exposure window has had no
   access-log review (BL-37).
3. **Integration.** Prod runs code from unmerged branches, and there is no functioning `dev` or `pr-<n>`
   stage to catch a regression before prod (BL-01, BL-25).
4. **Margin.** Metered cost per review is at or above plan-level revenue per user-month, and uncommitted burn
   is absorbed by the platform by ruling (BL-13).
5. **Reliability.** Run success was 66.7% and run-start p95 3,080 s on the STB.3 window. These are real
   readings, not waived (BL-07).
6. **Claims and legal.** §16.4 efficacy claims are forbidden until G2 LIFT. REQ-EVAL-16's consequences apply
   retroactively to UI already built if the eval fails, so G2 is a hard gate before any marketing launch
   (BL-45).
7. **External security assurance.** The pen test is unprocured, and the run-task pod runs AppArmor
   `Unconfined` with `SYS_ADMIN` behind compensating controls (BL-35, BL-26).
8. **Governance.** The drifted ledger and the unrun v2 tail make the committed memory an unreliable resume
   point. Several DEFERRALS rows overstate what is still owed (BL-02, *Stale rows* in `BACKLOG.md`).
