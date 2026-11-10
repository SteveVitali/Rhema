# R7KIT.3f — Migrate the unmigrated GUARD-1 tail (residual batch; run-time insert)

- **Sequence:** 248a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  249_R7GUARD.1's own Notes bound: "more than about 150 lines of migration → stop and request an
  insert row"; measured residue is ~500–900 lines)
- **base_branch:** current checkout
- **Depends on:** the final KIT-3 batch (243a_R7KIT.3e) and every row that enabled GUARD-1 per batch:
  232_R7TALK.1a (`chat-panel`), 234_R7HOME.1 (batch c1), 240_R7KIT.3a and 240a_R7KIT.3a2 (batch a),
  241_R7KIT.3b (batch b), 242_R7KIT.3c2 (batch c2), 243_R7KIT.3d + 243a_R7KIT.3e (batch d).
  Must land before 249_R7GUARD.1 can flip the rule globally.
- **Run:** `implement-spec spec=docs/tickets/248a_R7KIT.3f__migrate-tail.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: build + lint + typecheck + unit + DOM tests).
  **No owned preview** (`GD-PREVIEW.R7`).
- **Production mutations:** none
- **Size budget:** L (~500–900 changed lines across ~29 files — a full KIT-3-class batch, honestly
  sized; this is the whole point of the insert, not an overrun).

## Goal
Every UI-scope file 249's global `rhema/no-raw-controls` block will cover is migrated to primitives
or has an honest, recorded home — so the global flip lands as a near-zero-residue enablement:
- raw `<button|input|select|textarea>` → the `@rhema/ui` primitive carrying the same contract;
- inline spacing/type/colour/radius literals → `.ui-*` classes or the token map;
- no-JS/SSR carriers that genuinely qualify stay native inside named exemptions (RV-36) —
  a style literal with no no-JS justification is residue, never an exemption.

## Residue census (measured 2026-11-07 by the stopped 249 run; `docs/build/logs/r7guard1-residue-census.json`)
340 diagnostics — 35 raw controls + 305 inline style literals — across 29 files, all
*migration-uncovered* surfaces (no KIT-3 batch touched them; baseline lint is green). Top offenders:
`packages/ui/src/run-report.tsx` (47), `what-changed.tsx` (29), `apps/web/src/demo-page.tsx` (28),
`page-strip.tsx` (26), `version-rail.tsx` (25), `ide-states.tsx` (20), `conversion.tsx` (19),
`dispositions.tsx` (16), `files-pane.tsx` (14), `apps/web/src/spa/surfaces/run-report.tsx` (13),
`app-shell.tsx` (12 + 7 raw controls). The full list: the dossier/report content family
(`run-report`, `what-changed`, `second-read`, `version-rail`, `page-strip`, `dispositions`,
`decisions`, `approval-row`, `rubric`, `margin`, `files-pane`, `shell`, `ide-states`, `chips`,
`conversion`), SPA `app-shell`/`palette`/`chat-live`, the demo SSR components (`demo-page`,
`demo-markers`, `demo-banner`, `demo-effects`), plus `legal`, `read-only`, `page-header`,
`chat-pane`, `gate-card.tsx`, `surfaces/editor`, `surfaces/run-report`.

## Load (read these — do not re-read others)
- **Spec** `docs/round-7-draft-spec.md` — §4.6 REQ-KIT-1 (styled native controls stay the permanent
  no-JS fallback, RV-36), KIT-2/KIT-3 (the per-batch enablement contract this completes), §4.16
  REQ-GUARD-1.
- **Precedent diffs** — the batch migrations this mirrors: `runs/R7KIT.3a.md`,
  `runs/R7KIT.3b.md`, `runs/R7KIT.3c2.md`, `runs/R7KIT.3d.md`, `runs/R7KIT.3e.md`
  (`docs/build/runs/`).
- **Files:** the 29-file census list above.
- **Rules:** `eslint.config.js` `rhema/no-raw-controls` blocks + the committed exemption list;
  `packages/eslint-plugin-rhema/src/rules/no-raw-controls.ts` (or wherever the rule lives).

## In scope
- Migrate all 29 census files to primitives / `.ui-*` classes / tokens.
- Named no-JS/SSR exemptions where genuinely justified (static-HTML POST carriers; RV-36) —
  recorded in the committed list with the same shape prior batches used.
- Keep the KIT-1 no-JS POST grammar byte-identical on every migrated surface (parity legs).
- No copy/wording changes beyond what the migration forces.

## Out of scope
- Flipping the rule to global `error` — that is 249's single act, not this ticket's.
- The U3 occlusion CI leg — 249's.
- Redesigning any surface — 1:1 migration only.

## AC (every item verified)
1. Running eslint with `rhema/no-raw-controls` at `error` over the 249 target scope
   (`packages/ui/src/**` + `apps/web/src/**/*.tsx`, primitives + `*.test.*` excluded) reports
   **zero** non-exempt diagnostics (the flip's dry-run is the ticket's own AC proof — run it,
   record the count, but do NOT commit the flip).
2. No-JS POST grammar parity legs on every migrated interactive surface (the batch-precedent test
   shape: static HTML POST still carries the same `name`/`value` carriers).
3. Emitted-DOM contract green: `pnpm check:dom-contract`; screenshot/class churn noted.
4. `pnpm check:spa-entry-graph` + `pnpm check:spa-budget` — no Select/markdown/leaf-chunk leak;
   entry delta vs `apps/web/spa-budget-baseline.json` reported honestly.
5. Touched-file tests + the full `pnpm exec vitest run apps/web/src` sweep green.
6. `runs/R7KIT.3f.md` complete; the Stage-B deferral row appended (`D-R7KIT.3f-1` → 250_R7DEP.2).
