# PRB.21 — Live-use defect pass: concurrent-run guard + import-preview latency

> **Inserted 2026-09-22** (manifest § Plan extensions). Defect-repair ticket, NOT P1 scope — G3
> stays parked. Two defects surfaced in the first day of real operator use on prod: duplicate
> run submission (D-PRB.20-1) and the synchronous multi-minute import preview. Neither crosses
> the gate; both are fixes to landed behavior.

- **Sequence:** inserted — runs **after `28k_PRB.20`, before `29_P1.01`**. Sorts as `28l`.
- **Phase:** LV — prod launch (defect closeout).
- **base_branch:** current chainTip at dispatch (the PRB.20 branch — stacked PR chain).
- **Depends on:** PRB.20 (the live ingestion path it hardens), PRB.03 (the run sheet).
- **Run:** `implement-spec spec=docs/tickets/28l_PRB.21__live-use-defect-pass.md`
- **Gate status:** no new credentials; Stage B is a bounded prod verify, $0 inference.
- **Live stage:** Stage A is the real work; Stage B is a bounded prod verify.

## Goal
A second run click on a project with an active run can never spawn a duplicate (and its hold),
and the import preview stops looking like a hang for the ~3–4 min a cold convert Job takes.

## Load
- `docs/tickets/DEFERRALS.md` — **D-PRB.20-1** (the authoritative defect description + live
  evidence: 4 duplicate `review/quick` runs on `my-first-project`, 2,184 cr of holds on a
  2,500 balance).
- `apps/web/src/server.ts` — `POST /p/:project/run` (line ~541); `buildSheet` (~1216) mints
  `idempotencyKey` per render.
- `packages/ui/src/run-sheet.tsx` — the hidden `idempotencyKey` field + the Run button.
- `packages/orchestrator/src/run-creation.ts` — `createRun` + `claimMemo` (the per-key dedupe).
- `packages/live-clients/src/ingest.ts` — `createConvertJobPreview` (the ~2.5–4 min cold Job
  poll) + `apps/web` `previewImport`/`createImport` (PRB.20).

## In scope — Stage A (code + tests, PR-able)
1. **D-PRB.20-1 — the concurrency ruling is MADE here (conservative beta semantics):** at most
   ONE non-terminal run per project. A second `POST /projects/:id/runs` while a run is in
   `created`/`queued`/`running`/`waiting_gate`/`cancelling` (check the real non-terminal set)
   returns **409 `run_in_progress`** carrying the active run's id — never a second hold.
   - **api:** enforce in `createRun` (or its route) under the same transaction the hold runs in —
     a check-then-insert race must be impossible (project-scoped row lock or a partial unique
     index; pick the mechanism and note it).
   - **web:** the run sheet GET renders a "run in progress" state (link to the active run's
     surface) instead of the Run affordance when the project has one; the POST handles 409 by
     re-rendering that state, not an error page. Belt-and-suspenders: the hidden idempotencyKey
     still dedupes true retries.
   - The policy is documented as beta-scoped: P1.06 scoped runs may legitimately parallelize —
     record the relaxation point as a comment + ledger note, don't build it.
2. **Import-preview latency UX.** A cold convert Job runs ~2.5–4 min (PRB.20 measured 246 s); the
   browser POST sits open that long. Make it honest, not necessarily faster: minimum bar is a
   submitted preview renders a "converting (can take a few minutes on a cold start)" state that
   polls/retries server-side rather than holding one request — pick the lightest mechanism that
   works behind the prod LB (a short-poll retry on a preview-id, or keep the request but stream
   a pending page + auto-retry). If a cheaper fix exists (e.g. the read-back cache makes a quick
   retry loop trivial), take it. Do NOT keep the convert Job warm (no-network posture stands).
3. Deterministic tests: second-create → 409 + no second `hold` row; the sheet's in-progress state;
   the preview pending/retry path. `turbo build lint typecheck` + `pnpm test` green.

## In scope — Stage B (live on prod, $0 inference)
4. `pulumi up` with the new api + web images (preview first — no unexpected resources).
5. Live verify headlessly: two same-project create calls → second 409s + one hold row total;
   a real upload → preview → create round-trip through the new pending path.
6. Close **D-PRB.20-1** in DEFERRALS.md with evidence; run ledger + BUILD_INDEX + PHASE LOG;
   `check-build-memory.sh .` clean.

## Acceptance
- D-PRB.20-1 → DONE with live evidence (409 assert + single-hold ledger assert).
- The import preview no longer presents as an opaque multi-minute hang.
- No new OPEN rows without a `D-PRB.21-*` id + owner.

## Out of scope
- P1.* skeletons (G3-parked), project-create UI (P1.04), the add-credits affordance gap,
  merges (OPERATOR policy), parallel scoped runs (P1.06's call).
