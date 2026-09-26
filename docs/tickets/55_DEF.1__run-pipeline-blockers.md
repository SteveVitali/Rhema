# DEF.1 — Run-pipeline blockers (F1/F2/F3)

- **Sequence:** 55 · **Phase:** post-P1 defect pass · **Tag:** fix
- **base_branch:** `stevevitali/p1-22-launch-checks` (chain tip — stacks on the existing chain).
- **Depends on:** STB.3 (the legs that surfaced these).
- **Blocks:** STB.4 must not run until this lands — real money must not ride over delivery-blocking defects.
- **Scope (one line):** fix the three live-verified defects that killed deliveries on prod: the
  missing/unparseable `.rhema/phase-result.json` (F1), the never-satisfiable
  `second_read_producer_checked` predicate (F2), and the `structure-plan.json` sidecar missing
  `sections[].anchor.{blockId,startOffset,endOffset}` (F3).
- **Spec §§:** 12.6 (phase-result contract, second-read orchestrator rule), 12.2 (sidecar shapes).
- **REQ coverage:** REQ-SPEC-25 (verification integrity), REQ-DATA-20 (iteration caps), the
  affected runs' REQ-WF rows.
- **Run:** `implement-spec spec=docs/tickets/55_DEF.1__run-pipeline-blockers.md`
- **Gate status:** $0 Stage A (code + tests). Stage B = re-running the three killed legs at their
  original caps (outline ≤$3, research ≤$5, draft ≤$10, memo ≤$15 — combined ≤$33).
- **Live stage:** Stage B is the leg re-runs — operator-gated per standing policy.

## Goal

Three STB.3 legs died on pipeline defects, not cost. Fix them so the affected workflows actually
deliver:

- **F1 — missing/unparseable `.rhema/phase-result.json`.** Killed 3 of 10 runs (outline, research
  burst, full profile) — repeated `missing or unparseable` errors. Root cause and fix are the
  ticket's to find (harness/agent-side emission vs the orchestrator's parse — check
  `apps/run-task` phase-result writing against the manifest contract). ~511cr absorbed.
- **F2 — `second_read_producer_checked` unsatisfiable.** The Memo review died at `second_read`
  because the predicate expects an orchestrator-launched input-scoped producer query
  (`secondReadProducerQueryId`/`expectedProducerQueryId` both null on the wire). Pod logs:
  `[hook] Agent deny second-reader`. This is the live manifestation of **D-P0.15h-5** — wire the
  orchestrator-launched scoped read (or make the predicate's fallback path real per spec §12.6).
- **F3 — `structure-plan.json` missing anchors.** Draft died at `sidecar_validates:structure` —
  the emitted plan lacked `sections[].anchor.{blockId,startOffset,endOffset}`. Tighten the
  producer to emit the contract's fields (or the contract if the spec says otherwise — check
  `packages/contracts`).

## Load-bearing context

- Findings detail + pod-log evidence: `docs/build/runs/STB.3.md` §4 (F1–F3 entries).
- D-P0.15h-5 already names the `second_read` unwiring (annotated in DEFERRALS) — fixing F2 closes
  its residual.
- Killed runs: `01M3DC1VYGJXM1G36TAR9D7F8W` (outline), `01M3DETHZ8ENTRTSXH3SJ6Y2FW`
  (research_burst), `01M3DGGCZR2CWV99FJTN19VD2T` (draft), `01M3DJ5V3D99NCC8JSZGTPM17P` (voice),
  `01M3DKQR0TY6ADGV2D1RTJBVG5` (memo).
- Regression tests for each fix are mandatory — reproduce the failure against the defect's
  observed input shape first.

## In scope

- Diagnose + fix F1, F2, F3 at the real root (not symptom-patching — read the pod-log evidence and
  the manifest/predicate code paths before writing).
- Regression tests per fix.
- If a fix reveals the contract itself is wrong, amend the contract + flag it in the run ledger
  rather than coding around it.

## Out of scope

- F4–F10 (tickets 56–57). Re-running the legs in this ticket (that's Stage B).

## Acceptance

- **AC1** — each of F1/F2/F3 has a root-cause diagnosis + a fix + a regression test that fails
  against the pre-fix code.
- **AC2** — gates green: `turbo build lint typecheck`, `pnpm test`, licenses, protocol-markers,
  build-memory.
- **AC3** — `docs/build/runs/DEF.1.md` carries the diagnosis narrative + evidence.

## Verify

- Standard gates + `check-build-memory.sh .`. Stage B re-runs recorded per-leg against the
  original STB.3 caps.
