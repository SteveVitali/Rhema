# Rhēma — operational readiness

> Rewritten 2026-10-04 by REC.1 (`reconcile-build mode=backlog`), alongside
> [`BACKLOG.md`](BACKLOG.md) / [`BACKLOG.csv`](BACKLOG.csv). Supersedes the 2026-09-30 read — every
> round-3 disposition that changed a capability row is named. Every "owner" is a backlog row naming
> its landing. Evidence is the committed build memory: `docs/tickets/DEFERRALS.md`,
> `docs/build/LEDGER.md`, `docs/build/runs/*`, `docs/build/readouts/*`, `docs/build/COVERAGE_MATRIX.csv`.

## Verdict

**Prod is live and materially healthier than the 2026-09-30 read, but still not launch-ready.**

What changed since the last read (all live-verified on prod, run ledgers committed):

- **RLS bypass closed** (SEC.1, `runs/SEC.1.md`): the api serves through `rhema_app_login`
  (NOBYPASSRLS); an 8-route two-tenant probe read clean.
- **Stripe-path fixes deployed** (BILL.3): the purchase path runs deliberately **closed**
  (`purchaseMode:"closed"`, ADR-028); the double-`included`-grant defect class is fixed at source.
  Prod no longer exposes the purchase surface to real users pending `GD-BILL.3-1`.
- **Ledger integrity closed** (DEF.4): `held>=0` convalidated, `assertBalances` 0 divergences / 71
  accounts, refund-window settle path live behind `REFUND_WINDOW_MODE=test_tenants`.
- **SLO probes corrected** (SLO.1): the seven mis-measuring probes now read honestly — run-start p95
  27.8 s ≤45, gate-resume 25.9 s ≤60. Four **named** breaches remain (D-SLO.1-5..8).
- **Product repaired end-to-end**: dossier 500 (HOT.1), edit path (EDIT.1), chat + Send occlusion
  (RUN.1), quiet affordance (HOT.1), scope-gate deadlock (RUN.1), import path (ONB.1), copy/IA
  (UX.1), layout/pricing phone (UX.2+ACT.1), estimator single-sourcing (EST.1+RPT.1).
- **GATE-ACCEPT signed 2026-10-04** — all 13 capstone deviations ACCEPTED
  (`readouts/GATE-ACCEPT.md`); build state is `IN_PROGRESS`, not DONE.

What still stands between here and a public launch — one hard gate, plus operator-held rulings and
one funded live-verification window:

- **G2 (wave-1 LIFT)** — hard gate before §16.4 claims or launch; H2 corpus does not exist (BL-40/45).
- **Unmerged code** — prod still runs the stacked-branch tip; 33 round-2 + ~30 round-3 PRs are
  unmerged (BL-01 → REC.3).
- **Operator rulings** — trial everyone-flip (`GD-ACT.1-1`), purchase re-open (`GD-BILL.3-1`),
  retro refund/relabel (`GD-RES.2-1`), metered-debit flip + notice, refund-window go-live
  (`D-DEF.4-3`), pricing ruling (BL-13/29/30/50/51/68/75).
- **One funded window** — every guard-refused leg converges on the 2026-10-05 ISO weekly reset:
  queued `pulumi up`s (CITE.1 pins at tip, ECON.2), 21 paid registry steps + paid new-visitor
  journey (D-CAP.2-1), the full JOURNEY.1 suite (D-CAP.2-2), CAP.3's live legs (D-CAP.3-1),
  RES.1/N6 legs (D-RES.1-*), lever pairs (D-ECON.2-2..5), STB.5a/b residuals (BL-16..19/21/22/56/66/67/69/71).
- **HUMAN gates** — H7 browser/invite/Stripe/admin-key legs, H2 corpus (~$100k), H4 venue stamps,
  H5 showcase sign-off, pen-test procurement (BL-32..42).

## Capability matrix

| # | Capability | Code state (highest layer reached) | Infra needed | Human gate (owner · due) | Proof |
|---|---|---|---|---|---|
| 1 | Sign-up, sign-in, admission | **Live.** Better Auth (Google + magic link), open self-serve, shared Redis throttle store proven across instances (SEC.2) | deployed | H7: real invite consumed by a live signup — operator · on acceptance of the invite leg (BL-23, D-SEC.2-1) | `runs/SEC.2.md`; `runs/JOURNEY.1.md` N2 |
| 2 | Tenant isolation + data security | **Live.** `rhema_app_login` NOBYPASSRLS; distroless run-task image + Localhost `rhema-run-task` AppArmor profile on prod; zero mount denials on the scoped leg | none new | H7: exposure-window access review + disclosure (operator · before pen test); pen-test procurement (operator · pre-launch) — BL-35/37, D-SEC.1-2 | `runs/SEC.1.md`, `runs/SEC.3.md` |
| 3 | Import + ingestion | **Live.** Paste/upload/Substack import path live (ONB.1 N1/N3, conversion preview p95 736–922 ms); held-draft handshake verified | deployed | none blocking | `runs/ONB.1.md` |
| 4 | Review (core workflow) | **Live.** Delivers with research floor + preflight (RES.1 probes $7.49); canonical cited⇒retrieved completeness identity shipped + persisted (CITE.1); **queued `pulumi up` for CITE.1 image pins** (D-CITE.1-1) | CITE.1 pins deploy (operator · now — Pulumi logged in) | Operator deploy → probe legs L1/L2/N11 + ADR-086 rate read (BL-67) | `runs/RES.1.md`, `runs/CITE.1.md` |
| 5 | Other workflows | **Mostly live.** draft/outline/profile_voice/chat delivered live (DEF.1/3, RUN.1 three turns ~16 cr); research_burst `blocked` at `plan` on thread-local questions (product ruling owed); finalize/approve legs guard-refused until the funded window | deployed | Operator product ruling on thread-local routing (BL-20); funded window 2026-10-05 (BL-18/19) | `runs/DEF.1.md`, `runs/RUN.1.md` |
| 6 | IDE surfaces | **Live headless.** All P1 surfaces return 200; `/v/working` edit path live (EDIT.1); `/app/new` shell + phone layout green at 390/320 px (UX.2) | deployed | H7: interactive browser/device legs + Safari N8 walk (operator · H7 session) — BL-32, D-EDIT.1-2 | `runs/EDIT.1.md`, `runs/UX.2.md` |
| 7 | Payments (Stripe) | **Deliberately closed.** Purchase path deployed `purchaseMode:"closed"`; N9 flagged-tenant legs green at $0; pending-checkout email trigger documented (ADR-029) | deployed | Operator ruling `GD-BILL.3-1` to re-open + live-mode Stripe legs ≤$50 real money (BL-33/51, D-BILL.3-1/-2) | `runs/BILL.3.md`, ADR-028 |
| 8 | Metering, ledger, reconciliation | **Live.** Proxy meter of record; `held>=0` convalidated; nightly `assertBalances` 0 divergences; refund window deployed test-tenants-gated; usage.reconcile blocked on placeholder admin key | none new | H7: admin/org-scoped key (operator · on provision) — BL-34; go-live ruling D-DEF.4-3 (BL-30) | `runs/DEF.4.md` |
| 9 | Estimation + pricing | **Live mechanism, open economics.** Single-source `surfacePricer` everywhere (EST.1); durable cap-calibration store live (ECON.1); ~$7–10 metered per quick review vs $20/mo plan; restore read NOT MET (≈$14.25 gap) | none new | Operator: pricing ruling + metered-debit flip + paid-account notice (BL-13/68/69); funded calibration legs | `runs/EST.1.md`, `runs/ECON.1.md`, `runs/ECON.2.md` |
| 10 | Export + data rights | **Mostly live.** Export formats + account zip live; anonymous export token + deterministic slug deconflict landed (CAP.3 fixes); T7 purge probe bounded (ADR-092); T8 7-day expiry is a clock leg | deployed | Funded window + clock legs (BL-22); no human gate | `runs/CAP.3.md`, `runs/STB.5a.md` |
| 11 | Notifications + inbox | **Live.** Digest sweep green post-HOT.1 (`finished_at`→`ended_at`); signed actions 303→410; Inbox honest rows (ADR-063) | deployed | none | `runs/HOT.1.md`, `runs/UX.1.md` |
| 12 | Observability + SLOs | **Live and honest.** Corrected probes read true (start 27.8 s, resume 25.9 s); 15 `rhema_slo_weekly` series; LB 5xx metrics + alert policies live (OBS.1); **named red**: D-SLO.1-5/-6/-7/-8 | deployed | none blocking; weekly review continues (BL-07) | `runs/SLO.1.md`, `runs/OBS.1.md` |
| 13 | Infra, stages, delivery | **Partial.** Prod Pulumi live; `dev` deployed + `pr-102` preview up/destroy proven (OPS.1); turbo-cache scale-to-zero live (OPS.2); **deployed tree ≠ merged main**; measured bill $285.80 list vs ~$50 target | dev + previews live; merged `main` absent | Operator merge REC.3 (BL-01); billed-actuals export + lever ruling D-OPS.2-1/-2 (BL-29); D-OPS.1-1..3 (BL-25) | `runs/OPS.1.md`, `runs/OPS.2.md`, ADR-082 |
| 14 | Evaluation program (§18 / G2) | **Machinery only.** Dev-set exercised with fakes; enclave bucket, real `@rhema/evals`, arm executors, judge, workshop UI unbuilt | benchmark GCS bucket + principal | H2 corpus ≈$100k + editors + provider no-training verification (operator · pre-G2) — BL-40/43/44/45 | `readouts/GATE-G2.md` (deferred) |
| 15 | Content + claims | **Partial.** Showcase on fixture content; venue tables stale-dated; §16.4 claims forbidden until G2 | none | H5 essay + H4 venue stamps (operator · pre-launch) — BL-41/42 | ADR-062; `runs/GATE-G2` disposition |
| 16 | Build memory + governance | **Trustworthy again.** REC.1 reconciled backlog (357 sources, 0 orphans); `check-append-only` + `check-build-memory` green at this commit; validator-stuck cells named on BL-02 | none | none — REC.1 lands it | this commit; `runs/REC.1.md` |

## Critical path (ordered)

Each step names `ticket:` (backlog row → landing) and `proof:` (the artifact that shows it done).
Steps 1–4 are what **continuing to operate safely** requires; 5–10 get to **public launch + §16.4 claims**.

1. **Integrate the chain.** Merge the round-2 (#48–#80) and round-3 (#81–#110+) stacks bottom-up;
   diff deployed tree vs merged `main`.
   ticket: `REC.3` (BL-01) — proof: `docs/build/INTEGRATION_PLAN.md`; every service's `deployments`
   provenance SHA passes `git merge-base --is-ancestor <sha> origin/main`.
2. **Deploy the queued tips.** Run the two pending `pulumi up`s — CITE.1 image pins at the chain tip
   (D-CITE.1-1) and ECON.2 (D-ECON.2-1) — now that Pulumi is logged in.
   ticket: `operator deploy` (BL-67, BL-69) — proof: Pulumi update ids + `deployments` rows at the
   tip SHA in `runs/REC.3.md` or the next round's stage-B records.
3. **Run the funded live-verification window** (post-2026-10-05 00:00 UTC ISO guard reset):
   21 paid registry steps + paid new-visitor journey (D-CAP.2-1), full JOURNEY.1 suite on the tip
   (D-CAP.2-2), CAP.3 live legs incl. export-token/import/purge re-verify (D-CAP.3-1, D-STB.5a-1..3),
   STB.5b B16–B19 legs, RES.1 residuals + N6 planted-error (D-RES.1-1..3 — flips REQ-SPEC-31 to MET),
   ECON.2 lever pairs + refit (D-ECON.2-2..6), guard re-proof (D-STB.5b-1).
   ticket: `round-4 funded window` (BL-16..19, BL-21/22, BL-56, BL-66, BL-67, BL-69, BL-71, BL-72) —
   proof: per-leg run ids + flipped D-rows in `docs/tickets/DEFERRALS.md`; weekly metered spend
   within the $5 guard on the system-scoped DSN.
4. **Operator rulings on money surfaces.** `GD-ACT.1-1` (trial everyone-flip), `GD-BILL.3-1`
   (purchase re-open), `GD-RES.2-1` (retro refund/relabel), metered-debit flip + paid-account notice,
   `D-DEF.4-3` refund-window go-live, and the BL-13/BL-29 pricing/lever rulings.
   ticket: `operator` (BL-13, BL-29, BL-30, BL-50, BL-51, BL-68, BL-75) — proof: dated GATE
   DECISIONS rows in `LEDGER.md` + the resulting config diffs (`trial.audience`, `purchaseMode`,
   `REFUND_WINDOW_MODE`) with live-verified flips.
5. **H7 operator session** (one sitting): real invite signup (D-SEC.2-1), interactive
   browser/device legs + Safari N8 (D-EDIT.1-2), live-mode Stripe re-verify ≤$50 (D-BILL.3-1/-2),
   admin/org key → usage.reconcile (D-ECON.1-1), exposure-window review + disclosure decision
   (D-SEC.1-2), prod test-data cleanup.
   ticket: `HUMAN-H7` (BL-23, BL-24, BL-32, BL-33, BL-34, BL-37, BL-38) — proof: `invite_redemptions`
   row, real `cs_`/`sub_` ids in `stripe_events`, a `usage.reconcile` drift-%, the completed
   `rls-exposure-since-0026.md` census + dated disclosure ruling.
6. **Get the named SLOs green.** D-SLO.1-5 (success 80 %/wk), D-SLO.1-6 (event-delivery tail
   p95 2 238 ms), D-SLO.1-7 (proxy-vs-SDK divergent attempts), D-SLO.1-8 (egress_denied canary
   semantics); under REQ-ARCH-34 each breach pauses feature work on its owning surface.
   ticket: `round-4 SLO.2` (BL-07) — proof: 7 consecutive green days on the `rhema-prod — §13.5`
   dashboard + the named rows flipped in DEFERRALS.
7. **External security.** Pen-test procurement + triage.
   ticket: `operator` (BL-35) — proof: pen-test readout in `docs/build/readouts/`, zero open
   criticals per `docs/security/pen-test-findings-triage.md`.
8. **The G2 program** (hard gate). H2 corpus commissioning → live eval bindings → pilot wave →
   wave-1 LIFT read.
   ticket: `HUMAN-H2` (BL-40) → `GATE-G2` (BL-43, BL-44, BL-45) — proof: corpus registered in the
   enclave with IAA ≥ the pre-registered floor; `recordPilotPower` σ_d + n; `readouts/GATE-G2.md`
   carrying PASSED with wave-1 LIFT.
9. **Real content.** H5 showcase essay + dossier sign-off; H4 venue-table `verified_at` stamps.
   ticket: `HUMAN-H5` (BL-42) + `HUMAN-H4` (BL-41) — proof: `assertShowcaseFixture` green on the real
   bundle; `protocols.venue_table_verified_at` non-null.
10. **Close the build.** REC.2 spec reconciliation (BL-05), DOC.1/DOC.2 docs refresh (BL-06),
    round-4 maintenance incl. the validator-stuck cells (BL-02), then the final ledger read.
    ticket: `REC.2` → `DOC.1`/`DOC.2` → `round-4` — proof: `check-backlog.sh` still green,
    `LEDGER.md` `projectStatus: DONE` only when every open row above has a landed disposition.

Off the critical path (owned, not sequenced): BL-25 dev/preview residuals, BL-31 matcher tuning
(needs H2 data), BL-36 nightly golden (budget-gated), BL-39 H3 partner decision, BL-46 (accepted),
BL-47/76/77 watch rows, BL-73 spec-scheduled 1.x scope, BL-74 time-based soak windows.

## Cost and risk posture

### Measured costs (from committed run ledgers; credits at $0.01)

| What | Figure | Source |
|---|---|---|
| Prod infra (measured) | **$285.80/mo list** — OPS.2 billing-read recompute vs ~$50/mo target; billed-actuals export owed (D-OPS.2-1) | `runs/OPS.2.md`, ADR-082 |
| Per quick review | **~$7–10 metered**; one derived-cap delivery metered 720 cr / committed 586 cr (cap 783) | LEDGER GD 2026-09-23; D-PRB.21-1 |
| RES.1 live probes | $7.49 total across the verification set | `runs/RES.1.md` |
| Weekly flagged-tenant metered spend (week 2026-09-28) | **$58.08** under the system role (1,675 proxy rows) — the $5 weekly guard's measured reason for refusing `--paid` | `runs/STB.5b.md`, D-STB.5b-1 |
| CITE.1 + ECON.2 stage-B legs | $0 (guard-refused / deploy-pending) | `runs/STB.5b.md` |
| H2 corpus (not started) | ≈$100k across two quarters (Q-23) | manifest H2 |
| Live-mode Stripe legs | ≤$50 ceiling authorized; $0 spent (test mode) | `runs/STB.4.md` |
| Nightly golden (not running) | ~$150–300/night — not authorized | D-P0.15-4 |

### Risks, ranked (2026-10-04 read)

1. **Integration.** Prod runs the stacked-branch tip; ~63 PRs unmerged; no regression net between
   tip and `main` until REC.3 lands (BL-01).
2. **Margin.** Metered cost per review ≈ plan-level revenue/user-month; the pricing ruling +
   metered-flip + notice are operator-held, deliberately unlaunched (BL-13/68/69).
3. **Spend-guard integrity.** The $5 weekly guard reads $0 through the app role's RLS — the
   fail-closed tripwire is landed but the binding convention + live re-proof are owed; a future
   paid leg on the wrong DSN would silently pass (BL-72, D-STB.5b-1).
4. **Reliability.** Four named SLO breaches remain; probes now read honestly so the reds are real
   (BL-07).
5. **Claims and legal.** §16.4 claims forbidden until G2 LIFT; REQ-EVAL-16 consequences apply
   retroactively to built UI (BL-45).
6. **Money surfaces paused on purpose.** Purchase closed-mode, refund window test-tenants, trial
   test-tenants — each safe as-is, each needing its operator ruling to open (BL-30/50/51).
7. **Exposure review.** The RLS-bypass exposure window predating SEC.1 has no access-log census
   (BL-37, D-SEC.1-2); pen test unprocured (BL-35).
8. **Unexercised legs.** The funded-window backlog is large but bounded and pre-costed (≤$63
   inference + the CAP.2 paid steps under the $5/wk guard).
