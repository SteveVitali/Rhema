<!--
  docs/build/BUILD_INDEX.md (BM-INDEX-01). One row per landed chain row, reconstructed by MAINT.1
  (build-memory v2 migration) from docs/build/LEDGER.md PHASE LOG (ground truth) + `gh pr view 1..25`.
  Columns per BM-INDEX-01. Every `evidence` path is a committed file under docs/build/runs/ or docs/build/pr/.
  Written by the worker at close; corrected by a new row, never rewritten.
-->
# Build index

Rhēma Phase-0 build — one row per pull request (#1–#25) plus this migration ticket. Evidence points at the
committed run ledger (`runs/<ID>.md`) where one exists, else the committed PR body (`pr/<ID>.md`). The
`cloud-switch` (#7) is the AWS→GCP amendment (ADR-001), recorded as an insert; P0.15h (#24) has no run ledger
(its evidence is its PR body). Live verification: `run` = executed live on `dev`; `gate-pending` = live leg
operator-gated/deferred (DEFERRALS + G1); `fixture-only` = deterministic/integration tests; `n-a` = pure library.

| Seq | Ticket | Kind | Branch | PR | Base | Landed | ADRs | Deferrals opened→closed | Live verification | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | P0.01 | ticket | `stevevitali/p0-01-monorepo-and-infra` | #1 | `main` | 2026-09-03 | — | D-P0.01-1..7 opened → none closed | gate-pending | `runs/P0.01.md#evidence` |
| 2 | P0.02 | ticket | `stevevitali/p0-02-contracts-and-data-model` | #2 | `main` | 2026-09-03 | — | D-P0.02-1 opened → none closed | n-a | `runs/P0.02.md#evidence` |
| 3 | P0.03 | ticket | `stevevitali/p0-03-protocols-port-and-manifests` | #3 | `main` | 2026-09-09 | — | D-P0.03-1..5 opened → none closed | fixture-only | `runs/P0.03.md#evidence` |
| 4 | P0.04 | ticket | `stevevitali/p0-04-parsers-serializers-protocols-version` | #4 | `main` | 2026-09-09 | — | D-P0.04-1..2 opened → none closed | n-a | `runs/P0.04.md#evidence` |
| 5 | P0.05 | ticket | `stevevitali/p0-05-boundary-hooks` | #5 | `main` | 2026-09-09 | — | — | n-a | `runs/P0.05.md#evidence` |
| 6 | P0.06 | ticket | `stevevitali/p0-06-engine-and-run-task` | #6 | `main` | 2026-09-09 | — | D-P0.06-1..4 opened → none closed | fixture-only | `runs/P0.06.md#evidence` |
| 7 | cloud-switch | insert | `stevevitali/cloud-switch-gcp` | #7 | `main` | 2026-09-02 | ADR-001 | — | n-a | `pr/cloud-switch.md` |
| 8 | P0.07 | ticket | `stevevitali/p0.07-egress-proxy` | #8 | `stevevitali/cloud-switch-gcp` | 2026-09-03 | — | D-P0.07-1..5 opened → none closed | fixture-only | `runs/P0.07.md#evidence` |
| 9 | P0.08 | ticket | `stevevitali/p0-08-run-orchestration` | #9 | `stevevitali/p0.07-egress-proxy` | 2026-09-03 | — | D-P0.08-1..4 opened → none closed | fixture-only | `runs/P0.08.md#evidence` |
| 10 | P0.08b | ticket | `stevevitali/p0-08b-run-events` | #10 | `stevevitali/p0-08-run-orchestration` | 2026-09-03 | — | D-P0.08b-1..4 opened → none closed | n-a | `runs/P0.08b.md#evidence` |
| 11 | P0.09 | ticket | `stevevitali/p0-09-mirror-harvest-delivery` | #11 | `stevevitali/p0-08b-run-events` | 2026-09-03 | — | D-P0.09-1..3 opened → none closed | fixture-only | `runs/P0.09.md#evidence` |
| 12 | P0.10 | ticket | `stevevitali/p0-10-gates-decisions-writeback` | #12 | `stevevitali/p0-09-mirror-harvest-delivery` | 2026-09-03 | — | D-P0.10-1..2 opened → none closed | n-a | `runs/P0.10.md#evidence` |
| 13 | P0.11 | ticket | `stevevitali/p0-11-credit-ledger` | #13 | `stevevitali/p0-10-gates-decisions-writeback` | 2026-09-03 | — | D-P0.11-1..3 opened → none closed | n-a | `runs/P0.11.md#evidence` |
| 14 | P0.12 | ticket | `stevevitali/p0-12-revision-obligations` | #14 | `stevevitali/p0-11-credit-ledger` | 2026-09-03 | — | D-P0.12-1..3 opened → none closed | n-a | `runs/P0.12.md#evidence` |
| 15 | P0.13 | ticket | `stevevitali/p0-13-benchmark-enclave-scorers` | #15 | `stevevitali/p0-12-revision-obligations` | 2026-09-03 | — | D-P0.13-1..5 opened → none closed | n-a | `runs/P0.13.md#evidence` |
| 16 | P0.14 | ticket | `stevevitali/p0-14-benchmark-arms-wave-runner` | #16 | `stevevitali/p0-13-benchmark-enclave-scorers` | 2026-09-03 | — | D-P0.14-1..3 opened → none closed | n-a | `runs/P0.14.md#evidence` |
| 17 | P0.15 | ticket | `stevevitali/p0-15-phase0-integration-and-exit` | #17 | `stevevitali/p0-14-benchmark-arms-wave-runner` | 2026-09-03 | — | D-P0.15-1..5 opened → none closed | fixture-only | `runs/P0.15.md#evidence` |
| 18 | P0.15b | ticket | `stevevitali/p0-15b-phase0-live-bringup` | #18 | `stevevitali/p0-15-phase0-integration-and-exit` | 2026-09-03 | — | D-P0.15b-1..4 opened → none closed | gate-pending | `runs/P0.15b.md#evidence` |
| 19 | P0.15c | ticket | `stevevitali/p0-15c-live-bindings-engine-e2e` | #19 | `stevevitali/p0-15b-phase0-live-bringup` | 2026-09-03 | — | D-P0.15c-1..8 opened → none closed | run | `runs/P0.15c.md#evidence` |
| 20 | P0.15d | ticket | `stevevitali/p0-15d-live-runspec-infra-green-review` | #20 | `stevevitali/p0-15c-live-bindings-engine-e2e` | 2026-09-04 | — | D-P0.15d-1..4 opened → none closed | gate-pending | `runs/P0.15d.md#evidence` |
| 21 | P0.15e | ticket | `stevevitali/p0-15e-pod-commit-loop-worker-deploy` | #21 | `stevevitali/p0-15d-live-runspec-infra-green-review` | 2026-09-04 | — | D-P0.15e-1..4 opened → none closed | run | `runs/P0.15e.md#evidence` |
| 22 | P0.15f | ticket | `stevevitali/p0-15f-green-review-agent-proxy-and-pod-logs` | #22 | `stevevitali/p0-15e-pod-commit-loop-worker-deploy` | 2026-09-04 | — | D-P0.15f-1..2 opened → none closed | run | `runs/P0.15f.md#evidence` |
| 23 | P0.15g | ticket | `stevevitali/p0-15g-agent-launch-caps-credential-path` | #23 | `stevevitali/p0-15f-green-review-agent-proxy-and-pod-logs` | 2026-09-08 | — | — | run | `runs/P0.15g.md#evidence` |
| 24 | P0.15h | ticket | `stevevitali/p0-15h-per-phase-review-green-exit` | #24 | `stevevitali/p0-15g-agent-launch-caps-credential-path` | 2026-09-09 | — | D-P0.15h-1..8 opened → none closed | run | `pr/P0.15h.md` |
| 25 | P0.15i | ticket | `stevevitali/p0-15i-agent-web-research-sandbox` | #25 | `stevevitali/p0-15h-per-phase-review-green-exit` | 2026-09-09 | — | D-P0.15i-1..2 opened → none closed | run | `runs/P0.15i.md#evidence` |
| 26 | MAINT.1 | ticket | `stevevitali/maint-1-build-memory-v2` | #26 | `stevevitali/p0-15i-agent-web-research-sandbox` | 2026-09-10 | ADR-001, ADR-002, ADR-003, ADR-004 | — | n-a | `runs/MAINT.1.md#evidence` |
| 27 | P0.15j | ticket | `stevevitali/p0-15j-fact-check-citation-discipline` | #27 | `stevevitali/maint-1-build-memory-v2` | 2026-09-11 | — | none opened → none closed (D-P0.15i-2 Stage-A done, live AC3 pending) | gate-pending | `runs/P0.15j.md#evidence` |
| 28 | P0.15k | ticket | `stevevitali/p0-15k-live-three-project-reviews-cost` | #28 | `stevevitali/p0-15j-fact-check-citation-discipline` | 2026-09-11 | ADR-005, ADR-006 | D-P0.15k-1/-2 opened → D-P0.15-1, D-P0.15i-2 closed (D-P0.15-2/-3 → PARTIAL) | run (Stage B live: AC1 3/3 green; AC2/AC3 partial) | `runs/P0.15k.md#stage-b--executed-live-2026-09-11-operator-authorized-300-ceiling` |
| 29 | PRB.01 | ticket | `stevevitali/prb-01-beta-shell-and-invites` | #29 | `stevevitali/p0-15k-live-three-project-reviews-cost` | 2026-09-15 | ADR-007 | D-PRB.01-1/-2/-3 opened → none closed | fixture-only (deterministic + live HTTP boot; live auth/data = D-P0.01-3/D-P0.08-1) | `pr/PRB.01.md` |
| 30 | PRB.02 | ticket | `stevevitali/prb-02-import-fetcher-convert` | #30 | `stevevitali/prb-01-beta-shell-and-invites` | 2026-09-15 | — | D-PRB.02-1/-2/-3 opened → D-P0.09-2 PARTIAL (import half) | fixture-only (SSRF/convert/normalizer deterministic + real PDF parse; live ingestion infra = D-PRB.02-1) | `pr/PRB.02.md` |
| 31 | PRB.03 | ticket | `stevevitali/prb-03-estimator-and-run-sheet` | #31 | `stevevitali/prb-02-import-fetcher-convert` | 2026-09-15 | — | D-PRB.03-1/-2/-3 opened → none closed (D-P0.11-1 unchanged; PRB.3 landed the capFromEstimate primitive) | fixture-only (all 6 ACs deterministic; live pre-pass/per-draft-inputs/obligation-scope = D-PRB.03-1/-2/-3) | `pr/PRB.03.md` |
