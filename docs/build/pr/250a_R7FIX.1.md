# R7FIX.1 — owner fixes for the R7DEP.2 Part-A defect boundary (insert 250a)

Row 294 · base `stevevitali/r7dep-2-phase-preview` @ `d702872c` · Stage A only ($0, `GD-PREVIEW.R7`) · mergePolicy OPERATOR — never self-merged.

Run-time insert on 250_R7DEP.2's defect path: five `F-R7DEP.2-*` findings from the T0 preview walk + the `U3.stopgap` re-disposition. **No preview mutation, no re-walk** — `pr-293` is 250's owned stack; the deployed proof is 250's own T1 re-walk (`D-R7FIX.1-2`). Spend $0.

## What lands (~75 lines, 7 files)

- **F-R7DEP.2-1 — `/review/` dossier link invisible (`R8.showcase.spa` regression + `U2.noreload`).** R7b moved every review anchor inside the closed `display:none` panel, and the visible sidebar Reviews item could never resolve a run id (`files` provenance rows carry `{actor}` only, verified against the live twin). `GET /bff/p/:slug?view=tree` now stamps `project.latestReviewRunId` off the `listProjects` row; `ProjectSection` prefers it, then the provenance scan (`advancedRows` included). The Reviews item now carries the dossier href DOM-order before `.ide-panel`, so the legs' `.first()` resolves to a visible, actionable anchor.
- **F-R7DEP.2-2 — `[data-ide-panel-tab="chat"]` not enabled @1440×900 (`U3.occlusion`).** `spa/ide/chrome.tsx` passed `demo: true` to `IdeShell` on every SPA document — `demo` is a boolean (`boot?.demo != null`), so `demo != null` was true for authenticated tenants and the REQ-DWEB-7 gate disabled Chat on workspace leaves. Fixed to gate on the flag's value; the demo gate is untouched (verified still gating on `/demo/*`).
- **F-R7DEP.2-3 — inline title not focused (`U5.write`, REQ-HOME-3).** `autoFocus` fires on mount only; the editor mount + chrome publish in the same commit claim focus after it. `ProjectPageSurface` now re-asserts focus on `[data-inline-title]` input when `?created=scratch` (parent effect after descendant mounts + one RAF re-assert). `autoFocus` stays for the SSR/island path.
- **F-R7DEP.2-4 — Conversion notes miss `title_extracted` (`U7.import`).** The warning IS emitted by `convertBytes`, but `ConversionNotesCard` rendered outside `data-conversion-form` and the leg reads the notes off that hook. The card now renders inside `form[data-conversion-form]` (same visual order; `form[data-conversion-form]` selector unchanged).
- **F-R7DEP.2-5 — returning tenant's recents empty (`U1.shell`).** Diagnosed as a leg-vs-fixture gap, not an app defect: the `/app` 302→dossier + `?view=tree` resolution prove the showcase row exists; the leg's immediate `count()===0` raced the async `/bff/app` twin (`data-page-header` mounts on the leaf's own twin first). Both reads now `waitFor` the row — a genuinely empty list still fails on timeout, so the assertion is unchanged. If T1 still fails after the wait, it re-files as a real `/bff/app` defect.
- **`U3.stopgap` re-disposition** — superseded by `U3.occlusion` (dated note appended to `D-R7PANE.1-1`); the leg body is preserved untouched.

## Verification (all run, honestly)

fresh `pnpm turbo build` (15/15) · typecheck via `tsc -b` · `turbo lint` web+ui+journeys **0 errors** · web sweep **1667/1667** · journeys **228/228** (incl. `u3-occlusion.local`, `noreload.local`, `demo-legs.local`, `u4-controls.local` — the failing arms' local counterparts) · `check:dom-contract` / `check:spa-env` / `check:protocol-markers` green · `check:spa-budget` ceilings held — **entry +33.3 kB vs `04a4e98b` over the ≤15 kB allowance (pre-existing cumulative deficit on the base branch; ≈ +0.1 kB this ticket — GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7 stand)**.

No selector added or removed; no journey assertion weakened; no paid leg; **$0**.

## Deferrals

- Opened **D-R7FIX.1-2** → `250_R7DEP.2`: the T1 re-walk proves all five fixes deployed (`--expect-sha`, screenshots, then REQ-DACC-5 flips).
- `U3.stopgap` disposition appended to `D-R7PANE.1-1` (superseded by `U3.occlusion`).

## Judgement calls

- F-1 uses the existing sidebar dossier affordance (R7b's dossier entry of record) rather than a new visible link — no new hook, no leg change. The demo twin's snapshot carries no `latestReviewRunId` (honest gap noted; the demo item keeps its `/p/demo~…` fallback — no leg asserts otherwise).
- F-5 is a leg-mechanics fix recorded honestly — if the T1 wait still fails, `/bff/app` on showcase-only tenants becomes a new F-finding.

Run ledger: `docs/build/runs/250a_R7FIX.1.md`.
