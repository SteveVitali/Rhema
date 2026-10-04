<!--
  docs/build/planning/2026-10-04_decision-memo.md — round-4 planning seed (build-memory layout:
  planning/). Status: DRAFT skeleton — the next `decompose-spec mode=extend` starts here.
  Nothing here amends the spec or adds chain rows; decisions become amendments only through the
  operator (spec → manifest § Spec amendments applied + ADR).
-->
# Round 4 — decision memo (skeleton, 2026-10-04)

## Where the build stands

- **Every chain row through REC.3 is executed.** BUILD_INDEX = 119 rows; the open stack is
  **43 PRs (#70–#113)**, all merge-clean; main sits at the #69 merge. The merge itself is the
  operator's (INTEGRATION_PLAN §6; mergePolicy OPERATOR).
- **Prod runs pre-merge chain code** (`b909fe9a`, inside #100; pending deploys pinned inside
  #104/#105) — reconciled by ancestry after merge-commit landings (INTEGRATION_PLAN §9).
- **GATE-ACCEPT signed 2026-10-04** — all 13 capstone deviations ACCEPTED; standing triggers
  ride as watch items (BL-76/77).
- **The backlog is honest:** 77 rows, each owed thing exactly once (`check-backlog.sh` green).
- **Two standing CI reds found during REC.3's dry-run** (new since REC.1):
  `public-safe` never-cookies gate on the `rhema_fp` construct (#92→tip) and the privsep kernel
  legs in GitHub CI Docker (#101→tip). Both classified in INTEGRATION_PLAN §3 — candidate
  round-4 fix ticket (CI.1) or an operator `waiver` per PR.

## What shipped in round 3 (for the record)

Safety (SEC.1 role split, HOT.1, SEC.2 admission, SEC.3 confinement) · truth (RES.1/RES.2
research floor + Unverified label + platform-fault refunds) · money (BILL.3 closed-mode
purchase path, ECON.1 meter-of-record, EST.1 one-estimate, ACT.1 trial) · product (ONB.1
imports, EDIT.1 edit path, RUN.1 chat/gates, UX.1/UX.2, JOURNEY.1 harness) · ops (OBS.1,
SLO.1, DEF.4, OPS.1/OPS.2, CITE.1, ECON.2, STB.5a/5b) · closeout (CAP.1–3, REC.1–3).

## Open operator decisions (carried, not decided here)

| Ruling | State | Backlog |
|---|---|---|
| **GD-RES.2-1** — retro refund/relabel of 4 zero-coverage runs (scan executed; per-row or blanket) | AWAITING OPERATOR | BL-75 |
| **GD-ACT.1-1** — trial `audience: test_tenants → everyone` (one-line `pricing.json` diff pre-staged; re-run `deriveTrialWordCap` first) | AWAITING OPERATOR | BL-50 |
| **GD-BILL.3-1** — `purchaseMode: closed → open` (one config flip + redeploy; pair with D-BILL.3-1 real-money leg) | AWAITING OPERATOR | BL-51 |
| **BL-30 / D-DEF.4-3** — `REFUND_WINDOW_MODE: test_tenants → open` (user-facing refund window go-live) | AWAITING OPERATOR | BL-30 |
| **ECON.1 metered flip** — `DEBIT_MODE=committed → metered` + paid-account notice (preceded by the notice dry-run already logged) | AWAITING OPERATOR | BL-13/BL-68 |
| **CITE.1 leg-cap reconciliation** — per-leg caps ($1.50/$2) sit below the measured probe cost (~$3.31); raise caps or re-scope legs | AWAITING OPERATOR | BL-67 |
| **CI reds** — fix-forward ticket vs documented `waiver` rows (new — this memo) | AWAITING OPERATOR | INTEGRATION_PLAN §7 |

## The H2 → G2 LIFT path (deferred at D5; still the hard gate)

G2 stays the **hard gate** before §16.4 marketing claims and public launch (standing bars
unchanged: REQ-EVAL-19, REQ-EVAL-16 consequences retroactive). The path, as ledgered:

1. **HUMAN-H2** — corpus commissioning: ≥24 drafts + two editors + adjudicator + six real PDFs
   + written provider no-training verification (~$100k, Q-23) — **BL-40**, external-dep.
2. **BL-43** — eval program live bindings (enclave GCS, real `@rhema/evals`, live arm
   executors, live cross-family judge, workshop UI).
3. **BL-44** — pilot wave on real variance (σ_d + fixed n).
4. **BL-45 / GATE-G2** — wave-1 LIFT read; covers the G2-routed PARTIAL matrix rows.
5. **BL-31** — Matcher-3 floor tuning + rubric conjunct in the Run-rounds stall check —
   *needs H2 adjudication data*, so it rides this path (round-4 candidate only if H2 lands).

## The 77-row backlog by landing

(verbatim groupings from `docs/build/BACKLOG.md`; counts as of 2026-10-04)

- **Operator rulings (7+):** the table above plus D-OPS.2-2 warm-floor/HA levers (BL-29),
  pricing-model ruling (BL-13).
- **Round-4 chain candidates:** funded-window paid legs once the ISO guard resets
  (BL-16/17/18/19/21/22, ~$1–$30/leg, pre-declared caps committed in STB.5b), deploy queue
  (BL-67 CITE.1 `5baa666` + BL-69 ECON.2 levers + D-CAP.2-2 chain-tip suite), SLO breach work
  (BL-07 SLO.2), build-memory hygiene + upstream validator patches (BL-02 → MAINT.3), **CI.1
  fix-forward** (new — the two standing reds), `completed_partial` step-state product decision
  (D-CAP.3-2), RES.2 fact_check label extension (BL-75 tail), BL-66 stale-mount re-verify.
- **HUMAN / external deps:** H2 corpus (BL-40) → eval bindings (BL-43) → pilot (BL-44) → G2
  (BL-45); H4 venue seeds (BL-41); H5 showcase content sign-off (BL-42); H3 partner program
  revisit (BL-39); live-mode Stripe re-verify (BL-33); Anthropic admin key (BL-34); external
  pen test (BL-35); operator browser session + real-device legs (BL-32); cross-tenant
  exposure-window review + disclosure (BL-37); prod test-data residue cleanup (BL-38);
  nightly golden run on a live stage (BL-36, ~$150–300/night — budget decision).
- **Watch rows (no action until triggered):** BL-46 (G3 early-read record), BL-47
  (GATE-ACCEPT signatures), BL-48/49 (records), BL-73 (33 spec-scheduled 1.x rows), BL-76/77
  (ADR revisit triggers evaluated each REC.1 sweep).

## Candidate round-4 scope (input to `decompose-spec mode=extend`, not a decision)

Proposed lanes, ordered like round 3's (harm → truth → polish → closeout):

1. **Land the stack** — operator merges #70→#113 per INTEGRATION_PLAN; this is not a ticket,
   it gates everything below.
2. **CI.1** — fix the two standing reds (gate scope/allowlist for `rhema_fp`; privsep legs
   runner capability or documented skip-with-live-proof) so post-merge `main` is green.
3. **Deploy + verify the tip** — CITE.1/ECON.2 queued deploys, the chain-tip JOURNEY.1 suite
   (D-CAP.2-2), then a `main`-tip deploy so prod provenance names `main` for the first time.
4. **The funded-window legs** — STB.5b's B16–B19 pre-capped legs + BL-21/BL-22 riders once
   the weekly guard resets (all $0–$30, cheapest-first).
5. **SLO.2** — the four named red rows (D-SLO.1-5..8); REQ-ARCH-34 breach rule keeps owning-
   surface feature work paused until green or explicitly accepted.
6. **Operator-ruling executions** — each ruling above becomes a thin ticket only once ruled
   (config flips + redeploy + verification leg).
7. **MAINT.3** — build-memory hygiene tail (BL-02) + the upstream `check-backlog.sh` parser
   patch + PHASE-LOG rotation convention.
8. **DOC.1/DOC.2** — already in flight as rows 92/93 (repo-docs + agent-docs refresh); they
   close round 3's tail, not round 4's.

**Not scheduled without new decisions:** H2→G2 (external ~$100k), nightly golden runs
(budget), BL-31 (needs H2 data), partner program (H3 revisit), the 33 spec-scheduled 1.x rows
(BL-73).

## Spend posture

Round-3 metered ≈$58.08/wk flagged-tenant + per-ticket legs (under the ≤$200 round hard cap).
Round 4 inherits the same discipline: per-leg caps pre-declared in ticket bodies; the weekly
paid guard is a control, not a nuisance — legs refused-not-run resume on the ISO reset.
