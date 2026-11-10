## R7KIT.3e — dossier layout + claims + the dossier-file migration

**Stage A only, `$0`, unmerged** (`mergePolicy: OPERATOR`), stacked on `stevevitali/r7kit-3d-ide-surfaces`.

REQ-PANE-5, REQ-COPY-8, REQ-KIT-3 (dossier), REQ-KIT-5, REQ-GUARD-1, REQ-DACC-7/8. Audit refs: C7, C9, F1, F3, C6.

### What changed

- **Dossier relayout (REQ-PANE-5):** the letter is the main column at Page measure (68ch, cream card chrome removed); the run card collapses to a one-line `data-run-header`; findings live in the right panel's Findings tab only (`data-dossier-desk` furniture + `FindingsDesk` — the body's `FindingsList`, margin rail and colour-dot minimap are **removed**, not labelled); the claim ledger is a section of the letter column (`#claims` inside `LetterView`'s new `claims` slot); the sticky in-column outline emits at every width but displays only ≥1440.
- **Claims (REQ-COPY-8):** `claimOrdinalLabel` = `[sourceId ?? ordinal+1]` — never `[0]`; the verdict renders once (the duplicated `· Tier 1` badge removed, `data-contradicted-tier1`/`data-verdict` kept); `sourceId` supported on `ClaimTableRow`/`DossierClaim`.
- **Six files migrated + GUARD-1 on:** `packages/ui/src/{dossier,letter,claims,findings}.tsx`, `apps/web/src/dossier-view.tsx`, `apps/web/src/spa/surfaces/dossier.tsx` all run `rhema/no-raw-controls` `error`; three reasoned exemptions (`HiddenField` ×2, `BulkOnlyCheck`). `onPaneError` added to `IdeChromeData` so pane-body write refusals keep `?ferr` parity.
- **U4.controls (AUTHORED_HELD):** `u4-probe.ts` computed-style probe + `U4_SURFACES` (12 named surfaces) + `U4_CONTROLS` leg + local test; registry stays `expected:"red"` — 250 flips it at `--expect-sha`.

### Verification

`turbo build` 13 ✓ · typecheck web+journeys ✓ · eslint 0 errors on touched files · web sweep 1,601/1,601 · dossier.dom 17/17 · rule test 21/21 · `check:dom-contract` (114 dossier hooks) · `check:spa-env` · `check:protocol-markers` · `uiCss()` **24,516/24,576** · entry delta **+15.4 kB vs `04a4e98b`** (ticket increment ≈ −0.1 kB vs parent).

### Deferral

**D-R7KIT.3e-1 (OPEN):** dossier screenshots/provenance/computed-style evidence at the R7b phase preview — `250_R7DEP.2`.

Full evidence: `docs/build/runs/R7KIT.3e.md`.
