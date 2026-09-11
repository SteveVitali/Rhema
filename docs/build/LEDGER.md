<!--
  docs/build/LEDGER.md (BM-LEDGER-01/02). The machine-state file orchestrate-build / drive-build.sh parse.
  Reconstructed by MAINT.1 (build-memory v2 migration) from the legacy .agents/scratch/rhema-build-ledger.md
  (state) + git + the 25 pull requests (PHASE LOG). This file holds ONLY state; the plan is the manifest
  (`manifest:` key). Legacy PHASE PLAN / invariants / SETUP / CAPSTONE sections were dropped — they cited the
  manifest by section already.
-->
# Rhēma — build ledger (machine state)

> **OPERATING MODE.** Fresh session resume prompt: read `docs/tickets/DEFERRALS.md` first, then this
> `CURRENT STATE` block and `docs/tickets/00_MANIFEST.md § The chain`. The build is a stacked PR chain on the
> manual floor (no orchestrate-build sequencing); `implement-spec` reads the next chain row, forks from the
> current branch, and closes its own ticket here (D4). A pending milestone gate (G1) is **not** a block — it is
> a gate ahead of `nextTicket`. Never guess a gate past; never let a code ticket block on a HUMAN row.

## CURRENT STATE

```
projectStatus:   IN_PROGRESS
nextTicket:      GATE-G1           # 16a_GATE-G1__phase0-exit.md — the operator's readout; BLOCKED on the RETURN PASS live re-runs (P0.15j + P0.15k Stage B) — do NOT disposition until they close
lastCompleted:   P0.15k            # live three-project Reviews + instrumented cost — Stage A construction, PR #28
blockedOn:       (nothing)         # a REAL block only (red verification, missing dependency/infra). Human gates + pending G1 are NOT blocks
pauseRequested:  false
returnPass:      P0.15j, P0.15k    # both have Stage-B live legs [OPERATOR GATE]d (paid inference on a deployed dev); re-run after the operator releases budget
manifest:        docs/tickets/00_MANIFEST.md
canonicalSpec:   docs/rhema-design-spec.md
memoryRoot:      docs/build
dispatchTarget:  manual
buildWorktree:   /Users/stevenvitali/Rhēma
buildBranchBase: main
pinnedBaseSha:   bbb5d81            # merge-base(main, stevevitali/p0-01-monorepo-and-infra) — P0.01's fork point
chainTip:        stevevitali/p0-15k-live-three-project-reviews-cost
benchmarkSet:    PENDING_CREATE     # §18 corpus is HUMAN row H2; dev set = the three real projects
autonomy:        checkpoint
mergePolicy:     OPERATOR           # stacked chain; operator merges bottom-up at the end
round:           1
updatedAt:       2026-09-11
```

## OPEN FINDINGS

- **G1 blocker (cited⇒fetched delivery, [[D-P0.15i-2]]).** Phase-0 exit (G1) is not yet passable: a complete
  `second_read=false` Review runs all six required phases with real proxy-logged web research, but delivery still
  throws `cited_not_fetched` because the fact-check cites authoritative URLs from training knowledge it did not
  retrieve this session. Owned by `16_P0.15j` (citation-discipline eval / skill-tuning, or a cited⇒fetched
  spec-semantics decision). See `docs/phase0-exit-readout.md` and DEFERRALS `D-P0.15i-2`.
- **Live G1 legs remaining ([[D-P0.15-1]], [[D-P0.15-2]], [[D-P0.15-3]]).** `16_P0.15k` (PR #28) did the Stage-A
  construction — the three-project fixture + the previously-missing instrumented-fold call-site (ADR-005) — so the
  three-project Reviews + instrumented cost + gate round-trip are a plain budgeted re-run. They stay OPEN /
  gate-pending (operator authorization + a deployed `dev` + paid inference), and depend on P0.15j's live AC3
  delivering first. The exit-readout MEASURED rewrite + the "G1 ready" flag ride that Stage-B re-run.
- **REQ coverage (informational).** With `req_id_pattern` now set, `check-build-memory.sh` runs REQ→ticket
  coverage against `docs/rhema-design-spec.md`; any warning it emits is recorded here, not fixed by this ticket
  (RH.1 scope). None were violations (warnings only) at MAINT.1 close.

## GATE DECISIONS

_(append-only: `| date | ticket | gate | item | answer | consequence |`)_

| date | ticket | gate | item | answer | consequence |
|---|---|---|---|---|---|
| — | — | — | (none recorded; G1 has not been read out — its disposition, when taken, lands here and in `docs/build/readouts/GATE-G1.md`) | — | — |

## RETURN PASS

_(tickets run with a gate skipped; re-run after the operator acts. `returnPass:` lists the same ids.)_

| ticket | gates | what the operator must do | re-run line |
|---|---|---|---|
| P0.15j | AC3 (live `second_read=false` deliver, [OPERATOR GATE]) | release `dev` Anthropic budget; bake the hardened skill into a new run-task image + roll `RUN_TASK_IMAGE_DIGEST` | launch a `second_read=false` Review of `proj_pv` on `dev`, score its claim ledger vs fetch_log with `citationFetchCompliance`, confirm DELIVERS (no `cited_not_fetched`, `assessPhase0ExitForRun` green) → closes D-P0.15i-2 |
| P0.15k | AC1/AC2/AC3 (live three-project Reviews + instrumented cost + gate round-trip, [OPERATOR GATE]) | release `dev` Anthropic budget on a deployed `dev`, AFTER P0.15j's live AC3 delivers | `node scripts/live/prepare-fixture.mjs` (funds `bill_seed` + repoints all 3 drafts) → `RHEMA_LIVE_EXIT=1 PROJECT_IDS=proj_pv,proj_sd,proj_cr … tsx integration/src/run-live-exit.ts`; confirm `assessPhase0ExitForRun` green on all three, `estimatorsAreProvisional()` false, `proxyVsSdkCrossCheck` ±2%, a gate round-trip; then rewrite `docs/phase0-exit-readout.md` with measured values + close D-P0.15-1/-2/-3 → flag G1 ready |

## PHASE LOG (append-only, newest last)

_Seed + reconstruction. "done" entries are one per landed PR in chain order; the `cloud-switch` amendment and the
run-time `P0.15b…P0.15i` inserts are `inserted` events. Reconstructed by MAINT.1 from `gh pr view 1..25`._

- 2026-09-01 — decompose — Ledger created by decompose-spec from `docs/rhema-design-spec.md` (v1.0, ratified): 49 tickets + 6 HUMAN rows + 3 milestone gates.
- 2026-09-01 — split — Phase-4 fresh-context adversarial review (0 blocker / 6 major / 6 minor, all applied); P0.08 split → P0.08b; total 50 tickets (16 Phase-0). Manifest decomposition-decision #8 records the fixes.
- 2026-09-01 — round — Filenames renumbered with global sequence prefixes (01–50); HUMAN/GATE markers slotted (00a, 06a, 16a–c, 28a–b, 44a, 48a).
- 2026-09-03 — P0.01 done — branch `stevevitali/p0-01-monorepo-and-infra` · PR #1 · base `main` · Monorepo, stages, core infra, CI · **Deferrals:** D-P0.01-1..7
- 2026-09-03 — P0.02 done — branch `stevevitali/p0-02-contracts-and-data-model` · PR #2 · base `main` · Contracts package + data model (PGlite-tested) · **Deferrals:** D-P0.02-1
- 2026-09-09 — P0.03 done — branch `stevevitali/p0-03-protocols-port-and-manifests` · PR #3 · base `main` · Skill port + phase manifests (@rhema/protocols committed member) · **Deferrals:** D-P0.03-1..5
- 2026-09-09 — P0.04 done — branch `stevevitali/p0-04-parsers-serializers-protocols-version` · PR #4 · base `main` · Sidecar parsers, gate serializers, protocols_version · **Deferrals:** D-P0.04-1..2
- 2026-09-09 — P0.05 done — branch `stevevitali/p0-05-boundary-hooks` · PR #5 · base `main` · Boundary hooks + seat policy (packages/hooks) · **Deferrals:** —
- 2026-09-09 — P0.06 done — branch `stevevitali/p0-06-engine-and-run-task` · PR #6 · base `main` · Engine, AgentSdkEngine, two-uid run-task image, event mapper · **Deferrals:** D-P0.06-1..4
- 2026-09-02 — cloud-switch inserted — branch `stevevitali/cloud-switch-gcp` · PR #7 (merged to `main` 2026-09-10) · base `main` · AWS→GCP + inference via the direct Anthropic API (spec §12–13 amendment date 2026-09-02; **ADR-001**); collapses the H1 auth spike.
- 2026-09-03 — P0.07 done — branch `stevevitali/p0.07-egress-proxy` · PR #8 · base `stevevitali/cloud-switch-gcp` · egress-proxy: meter of record, cap 402, fetch log · **Deferrals:** D-P0.07-1..5
- 2026-09-03 — P0.08 done — branch `stevevitali/p0-08-run-orchestration` · PR #9 · base `stevevitali/p0.07-egress-proxy` · Run orchestration: lifecycle, internal API, locks, reaper, phase loop · **Deferrals:** D-P0.08-1..4
- 2026-09-03 — P0.08b done — branch `stevevitali/p0-08b-run-events` · PR #10 · base `stevevitali/p0-08-run-orchestration` · Run events: partitioned store, seq, SSE replay/tail · **Deferrals:** D-P0.08b-1..4
- 2026-09-03 — P0.09 done — branch `stevevitali/p0-09-mirror-harvest-delivery` · PR #11 · base `stevevitali/p0-08b-run-events` · Mirror materialize/harvest, delivery transaction, attestation · **Deferrals:** D-P0.09-1..3
- 2026-09-03 — P0.10 done — branch `stevevitali/p0-10-gates-decisions-writeback` · PR #12 · base `stevevitali/p0-09-mirror-harvest-delivery` · Gates, decisions, guidance, write-back overlays · **Deferrals:** D-P0.10-1..2
- 2026-09-03 — P0.11 done — branch `stevevitali/p0-11-credit-ledger` · PR #13 · base `stevevitali/p0-10-gates-decisions-writeback` · Credit ledger: holds, cap-clamped debits, refunds · **Deferrals:** D-P0.11-1..3
- 2026-09-03 — P0.12 done — branch `stevevitali/p0-12-revision-obligations` · PR #14 · base `stevevitali/p0-11-credit-ledger` · Revision obligations: spawn, routing, discharge, lineage, stall · **Deferrals:** D-P0.12-1..3
- 2026-09-03 — P0.13 done — branch `stevevitali/p0-13-benchmark-enclave-scorers` · PR #15 · base `stevevitali/p0-12-revision-obligations` · Benchmark enclave, gold tooling, deterministic scorers · **Deferrals:** D-P0.13-1..5
- 2026-09-03 — P0.14 done — branch `stevevitali/p0-14-benchmark-arms-wave-runner` · PR #16 · base `stevevitali/p0-13-benchmark-enclave-scorers` · Benchmark arms, normalization, adjudication, wave runner + report · **Deferrals:** D-P0.14-1..3
- 2026-09-03 — P0.15 done — branch `stevevitali/p0-15-phase0-integration-and-exit` · PR #17 · base `stevevitali/p0-14-benchmark-arms-wave-runner` · Phase-0 integration suite, exit asserters, pilot power, readout · **Deferrals:** D-P0.15-1..5
- 2026-09-03 — P0.15b done — branch `stevevitali/p0-15b-phase0-live-bringup` · PR #18 · base `stevevitali/p0-15-phase0-integration-and-exit` · Stage A live bring-up artifacts (Pulumi/GCP IaC, SDK adapter, arm executors, live-exit driver; **ADR-003**) · **Deferrals:** D-P0.15b-1..4
- 2026-09-03 — P0.15c done — branch `stevevitali/p0-15c-live-bindings-engine-e2e` · PR #19 · base `stevevitali/p0-15b-phase0-live-bringup` · Live client bindings + Stage B dev execution (deploy proven; live Review blocked on unbuilt RUN_SPEC) · **Deferrals:** D-P0.15c-1..8
- 2026-09-04 — P0.15d done — branch `stevevitali/p0-15d-live-runspec-infra-green-review` · PR #20 · base `stevevitali/p0-15c-live-bindings-engine-e2e` · Server-authored harness run-spec + node-egress/proxy IaC · **Deferrals:** D-P0.15d-1..4
- 2026-09-04 — P0.15e done — branch `stevevitali/p0-15e-pod-commit-loop-worker-deploy` · PR #21 · base `stevevitali/p0-15d-live-runspec-infra-green-review` · pod→server commit/deliver loop + deployable worker · **Deferrals:** D-P0.15e-1..4
- 2026-09-04 — P0.15f done — branch `stevevitali/p0-15f-green-review-agent-proxy-and-pod-logs` · PR #22 · base `stevevitali/p0-15e-pod-commit-loop-worker-deploy` · pod-log observability + agent→proxy path + worker GKE launcher · **Deferrals:** D-P0.15f-1..2
- 2026-09-08 — P0.15g done — branch `stevevitali/p0-15g-agent-launch-caps-credential-path` · PR #23 · base `stevevitali/p0-15f-green-review-agent-proxy-and-pod-logs` · agent-launch caps + credential injector + green-review construction · **Deferrals:** —
- 2026-09-09 — P0.15h done — branch `stevevitali/p0-15h-per-phase-review-green-exit` · PR #24 · base `stevevitali/p0-15g-agent-launch-caps-credential-path` · per-phase artifacts + budget config + hook enforcement + IaC (full 6-phase Review proven live to the deliver path) · **Deferrals:** D-P0.15h-1..8
- 2026-09-09 — P0.15i done — branch `stevevitali/p0-15i-agent-web-research-sandbox` · PR #25 · base `stevevitali/p0-15h-per-phase-review-green-exit` · proxy-guaranteed server-side web research (cited⇒fetched provenance; AC3 proven live) · **Deferrals:** D-P0.15i-1..2
- 2026-09-03…09 — P0.15b…P0.15i inserted — the eight live-bring-up sub-tickets were inserted at run time under the `16_` prefix (ID-suffixed), each synthesized from the prior ticket's live blockers; see manifest § Plan extensions and **ADR-003**.
- 2026-09-10 — MAINT.1 done — branch `stevevitali/maint-1-build-memory-v2` · PR #26 · base `stevevitali/p0-15i-agent-web-research-sandbox` · build-memory v2 migration: committed `docs/build/` root, 23 run ledgers moved (byte-identical), LEDGER + BUILD_INDEX reconstructed from 25 PRs, ADR-001..004 retro-fitted, chain-table + docs reconciled · **Verify:** `check-build-memory.sh .` exit 0; `pnpm turbo build lint typecheck` + `pnpm test` unchanged (no code) · **Deferrals:** opened none · closed none · **Deviations:** patched the shared build-memory validator (ID-keyed dup check + status-prose tolerance; separate agent-skills PR); 3 DEFERRALS rows given a canonical status prefix; BM-COMPAT-05 (SHOULD) honored — no ticket renamed · chainTip → `stevevitali/maint-1-build-memory-v2` · next → P0.15j
- 2026-09-11 — P0.15j done — branch `stevevitali/p0-15j-fact-check-citation-discipline` · PR #27 · base `stevevitali/maint-1-build-memory-v2` · citation-fetch-compliance eval (`@rhema/benchmark` §18 scorer, guard-parity) + editorial-review fetch-then-cite skill discipline (Path A; Path B not taken — no operator ruling); `validateCitedFetched` unchanged · **Verify:** eval 8; guard 12 (still rejects un-retrieved); benchmark+protocols+mirror 294; `pnpm turbo build lint typecheck` 102/102; drift gate OK; `PROTOCOLS_VERSION` → `0.4.0+5b08d37da59aad92`; `check-build-memory.sh .` 0 violations · **Deferrals:** opened none · closed none (D-P0.15i-2 Stage-A construction done; live AC3 gate-pending) · **Deviations:** Path A(b) model-routing left unchanged offline (Stage-B lever, no offline proof) · chainTip → `stevevitali/p0-15j-fact-check-citation-discipline` · next → P0.15k (RETURN PASS: P0.15j AC3)
- 2026-09-11 — P0.15k done — branch `stevevitali/p0-15k-live-three-project-reviews-cost` · PR #28 · base `stevevitali/p0-15j-fact-check-citation-discipline` · Stage A of the last live G1 leg: multi-project fixture (all 3 real drafts) + the previously-missing instrumented-fold call-site (estimator override registry + driver fold seam + `createDbInstrumentedFolder`, ADR-005) + `run-live-exit.ts` `draftIdFor`/`second_read=false` + exit-readout Stage-A section · **Verify:** `pnpm turbo build lint typecheck` 102/102; protocols+integration+mirror+orchestrator 394 pass / 1 skip; new estimator-registry/driver-fold/folder/launcher tests green; upstream-diff OK; `PROTOCOLS_VERSION` unchanged `0.4.0+5b08d37da59aad92`; `check-build-memory.sh .` 0 violations · **Deferrals:** opened none · closed none (D-P0.15-1/-2 Stage-A advanced; D-P0.15-3 AC3 gate marked — all live, gate-pending) · **Deviations:** the fold is recorded process-local (not durably persisted) — ADR-005; the MEASURED exit-readout rewrite + "G1 ready" flag are gate-pending (need Stage B), reported honestly not asserted · **Stage B NOT run** — [OPERATOR GATE] (no auth/budget/deployed dev; depends on P0.15j live AC3) · chainTip → `stevevitali/p0-15k-live-three-project-reviews-cost` · next → GATE G1 (blocked on RETURN PASS: P0.15j + P0.15k Stage B)
