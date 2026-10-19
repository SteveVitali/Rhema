<!--
  docs/build/README.md — the memory-root marker file (build-memory v2). Created by MAINT.1 (RH.1,
  build-memory v2 migration) from templates/build-README.md. MUST contain the marker line below
  verbatim — memory-root.sh keys committed mode on it. Do not delete the marker.
-->
# Build memory

<!-- build-memory: v2 -->

The committed record of **what happened** while building Rhēma from the canonical spec
(`docs/rhema-design-spec.md`). The layout contract — the tree, the modes, who writes what — is
`skills/build-memory/layout.md` (in the `agent-skills` repo); this directory does not restate it.
Adopted here by **MAINT.1** (ADR-004): the run ledgers moved out of the gitignored `.agents/scratch/`
and the machine ledger + build index were reconstructed from git and the pull requests so the Phase-0
build finally has a committed completion record.

- `LEDGER.md` — the machine-state file (`orchestrate-build` and `drive-build.sh` parse it): CURRENT
  STATE / OPEN FINDINGS / GATE DECISIONS / RETURN PASS / PHASE LOG. The PHASE LOG rotates one
  `## PHASE LOG — Round <n>` region per build round (REQ-MEM-4, HYGIENE.1): when a new round's
  first entry lands, append the round's `##` heading *after* the previous region's last line —
  older regions stay byte-frozen (append-only), and the checker's per-region rules judge only the
  current region.
- `BUILD_INDEX.md` — one row per landed chain row (one per PR #1–#25).
- `runs/<ID>.md` — the `implement-spec` run ledger for each ticket · `pr/<ID>.md` — its PR body.
  Entry-ID convention (REQ-MEM-5): `<ID>` is the ticket/run id verbatim (`HYGIENE.1`, `ARMB.2`) and
  BUILD_INDEX `evidence` cells point at `runs/<ID>.md` (else `pr/<ID>.md`); a dated operational run
  that is not one ticket keeps `runs/<NAME>-<YYYY-MM-DD>.md` (e.g. `runs/ARMB-2026-10-14.md`).
- `readouts/GATE-G<k>.md` — gate readouts (append-only) · `planning/` — re-planning rounds.
- `tools/`, `fixtures/`, `reports/` — committed · `logs/` — the one gitignored subtree.

Everything here is a **historical record**: corrected by a new entry, never by editing an old one.
Run `check-build-memory.sh .` to validate.

<!-- migrate appends a "## Migration rename mapping" section below when adopting v2 from a legacy scratch dir. -->

## Migration rename mapping

Written by `build-memory migrate` on 2026-09-10. Move/rename only; contents byte-identical.

| original path | new path |
|---|---|
| .agents/scratch/implement-spec_p0-02_20260901.md | docs/build/runs/P0.02.md |
| .agents/scratch/implement-spec_p0-08b_20260903.md | docs/build/runs/P0.08b.md |
| .agents/scratch/implement-spec_p0-15c_20260903.md | docs/build/runs/P0.15c.md |
| .agents/scratch/implement-spec_p0-15e_20260904.md | docs/build/runs/P0.15e.md |
| .agents/scratch/implement-spec_p0-15g_20260908.md | docs/build/runs/P0.15g.md |
| .agents/scratch/implement-spec_p0-15i_20260909.md | docs/build/runs/P0.15i.md |
| .agents/scratch/implement-spec_stevevitali-p0-01-monorepo-and-infra_20260901.md | docs/build/runs/P0.01.md |
| .agents/scratch/implement-spec_stevevitali-p0-03-protocols-port-and-manifests_20260901.md | docs/build/runs/P0.03.md |
| .agents/scratch/implement-spec_stevevitali-p0-04-parsers-serializers_20260901.md | docs/build/runs/P0.04.md |
| .agents/scratch/implement-spec_stevevitali-p0-05-boundary-hooks_20260901.md | docs/build/runs/P0.05.md |
| .agents/scratch/implement-spec_stevevitali-p0-06-engine-and-run-task_20260901.md | docs/build/runs/P0.06.md |
| .agents/scratch/implement-spec_stevevitali-p0-08-run-orchestration_20260902.md | docs/build/runs/P0.08.md |
| .agents/scratch/implement-spec_stevevitali-p0-09-mirror-harvest-delivery_20260903.md | docs/build/runs/P0.09.md |
| .agents/scratch/implement-spec_stevevitali-p0-10-gates-decisions-writeback_20260903.md | docs/build/runs/P0.10.md |
| .agents/scratch/implement-spec_stevevitali-p0-11-credit-ledger_20260903.md | docs/build/runs/P0.11.md |
| .agents/scratch/implement-spec_stevevitali-p0-12-revision-obligations_20260903.md | docs/build/runs/P0.12.md |
| .agents/scratch/implement-spec_stevevitali-p0-13-benchmark-enclave-scorers_20260903.md | docs/build/runs/P0.13.md |
| .agents/scratch/implement-spec_stevevitali-p0-14-benchmark-arms-wave-runner_20260903.md | docs/build/runs/P0.14.md |
| .agents/scratch/implement-spec_stevevitali-p0-15-phase0-integration-and-exit_20260903.md | docs/build/runs/P0.15.md |
| .agents/scratch/implement-spec_stevevitali-p0-15b-phase0-live-bringup_20260903.md | docs/build/runs/P0.15b.md |
| .agents/scratch/implement-spec_stevevitali-p0-15d-live-runspec-infra-green-review_20260903.md | docs/build/runs/P0.15d.md |
| .agents/scratch/implement-spec_stevevitali-p0-15f_20260904.md | docs/build/runs/P0.15f.md |
| .agents/scratch/implement-spec_stevevitali-p0.07-egress-proxy_20260902.md | docs/build/runs/P0.07.md |
| .agents/scratch/rhema-build-ledger.md | docs/build/LEDGER.md (converted) |
