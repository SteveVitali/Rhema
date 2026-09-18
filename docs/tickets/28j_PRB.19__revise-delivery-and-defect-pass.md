# PRB.19 — Revise `response` delivery fix + the remaining live-verify defects

> **Inserted 2026-09-18** (manifest § Plan extensions). The last code-bearing row of the prod-launch
> round: the F26 design defect that left every prod Revise finalizing bare, plus the small live-verify
> debts PRB.16b/PRB.17 carried forward. After this lands, the launch round is complete and the chain
> rests on G3's parked read.

- **Sequence:** inserted — runs **after `28i_PRB.18`, before `29_P1.01`**. Sorts as `28j`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (the PRB.18 branch — stacked PR chain).
- **Depends on:** PRB.18 (the credential deploy + auth finish), PRB.16b (the findings), PRB.17
  (the ±2% finding context).
- **Run:** `implement-spec spec=docs/tickets/28j_PRB.19__revise-delivery-and-defect-pass.md`
- **Gate status:** the Stage-B verifies are live inference — a **small stated budget** (~$15
  envelope: one Revise + one Quick Voice sized to reach the verifying phases). The F26 design choice
  is the worker's to make within the constraints below — record it as an ADR if the mount policy
  changes materially.
- **Live stage:** Stage A is the real work (design + code + tests); Stage B is a bounded prod verify.

## Goal
Make a prod Revise actually **deliver** — `response` correspondence written, response-ledger folded
into `dispositions`, reserved `nextDraftId` draft materialized + frozen — and sweep the remaining
open live-verify rows.

## Load
- `docs/tickets/DEFERRALS.md` — **D-PRB.16-1** (F26, two halves — the authoritative defect
  description), **D-PRB.16-2** (F27 persona-root writability — fix deployed, live-verify owed),
  **D-PRB.16-4** (stranded-gate re-arm / `gate.expiry` firing unobserved), **D-P0.15d-2**
  (`refundPhases` — reference only; stays OPEN unless a real reduced-commit path now exists),
  fetch byte-receipts (`kind=fetch` rows carry no status/bytes — PRB.16 finding), **D-PRB.16-5**
  (operator ruling — referenced, not decided here).
- `apps/worker/src/runspec.ts` (the `inputs.draftId` delivery gate), the mirror/mount policy code
  (§12.6 author-seat allowlist), `packages/ledger` + `packages/orchestrator` delivery path
  (`deliverRun`/`runDeliveryTransaction`), `docs/build/runs/PRB.16b.md` (the live evidence).
- Spec §12.4 (delivery/freeze), §12.6 (mount policy), REQ-WF-* (revise semantics).

## In scope — Stage A (code + tests, PR-able)
1. **F26(a) — the delivery gate.** `runspec.ts` only sets `spec.delivery` when `inputs.draftId`
   resolves; revise launches carry `nextDraftId` + `priorReviewId`. Fix the gate to fire on the
   revise input shape too — the delivery must write the `response` correspondence, fold the
   response-ledger into `dispositions`, materialize + freeze the reserved `nextDraftId` draft, and
   emit `revision.move_traced`. Tests: a revise-shaped input produces a delivery spec.
2. **F26(b) — the mount-policy half.** Declared deliverables under `drafts/**`/`correspondence/**`
   are currently mounted read-only for the author seat and harvested out of the allowlist — decide
   the intended contract (declared `phase.artifacts` writability vs §12.6 read-only evidence mounts)
   and implement it. If the contract itself changes, write the ADR (`docs/adr/`, next number) and
   regenerate the index with `build-memory adr-index` — never hand-edit `docs/adr/README.md`.
3. **Fetch byte-receipts decision.** `kind=fetch` `fetch_log`/`access_log` rows carry no
   status/bytes — either extend the proxy's fetch-row writer to record them (small, preferred if the
   data is at hand) or record an accepted-gap decision in the deferral note. Implement the chosen
   half.
4. Deterministic tests for all of the above; `turbo build lint typecheck` + `pnpm test` green.

## In scope — Stage B (live on prod, bounded spend)
5. **Revise delivery verify.** Drive one real Revise run on prod to a delivered `response` —
   assert the `correspondence_items` kind=`response` row, the dispositions fold + freeze, the
   `drafts` row for the reserved `nextDraftId`, `revision.move_traced`. This closes D-PRB.16-1.
6. **F27 live-verify** (D-PRB.16-2). One persona_builder (Quick Voice) run — assert artifacts land
   at the persona root (no EACCES, no `/work/project` fallback). If a QV run already proves this
   under PRB.18's legs, cite it instead of re-spending.
7. **Stranded-gate re-arm** (D-PRB.16-4) — only if an honest scenario exists (a real
   deadline-bearing gate that expires or loses its job); do not fabricate. Otherwise annotate.
8. Re-assert `spent_credits` vs proxy truth on the runs above (feeds the D-PRB.16-5 ruling — report
   the numbers, don't decide).

## Acceptance
- D-PRB.16-1 → DONE with the live Revise rows; D-PRB.16-2 → DONE or annotated; D-PRB.16-4 → DONE or
  annotated; byte-receipts decided (code or accepted-gap note).
- No new OPEN rows without a `D-PRB.19-*` id + owner.
- `check-build-memory.sh .` clean; run ledger + BUILD_INDEX + PHASE LOG updated on close.

## Out of scope
- D-PRB.16-5 ruling (operator), P1.* (G3-parked skeletons), merges (OPERATOR policy).
