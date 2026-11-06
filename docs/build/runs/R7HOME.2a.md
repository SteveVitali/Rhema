# R7HOME.2a — Editable imports + import fidelity

- Harness: devin-desktop/swe-2-high/subagent
- Skills: e981ec5 (agent-skills HEAD)
- Started: 2026-11-06T04:56:07Z
- Spec: `docs/tickets/235_R7HOME.2a__editable-imports.md` (chain row 235)
- Base: `stevevitali/r7home-1-projects` @ `c6b20873`
- Branch: `stevevitali/r7home-2a-imports`
- Config: implement-spec defaults (ledger, self-review, gap-analysis, tests; live_verification =
  Stage A only — `GD-PREVIEW.R7` forbids a per-ticket preview; Stage B rides 250 via a DEFERRALS row)
- Closed:

## Deferrals read

`docs/tickets/DEFERRALS.md` read 2026-11-06. Every R7-scoped OPEN row is a Stage-B leg owned by
250_R7DEP.2 (`GD-PREVIEW.R7`); none is unblocked by this ticket. This run opens `D-R7HOME.2a-1`
(U7.import Stage-B walk, owner 250). No row closed.

## Requirements (from the ticket)

1. Imports land `working` (REQ-HOME-4; S-4): `createImportedDraft` creates a `working` draft whose
   live doc is seeded (import-time write OR the editor/collab lazy-seed path — choice recorded).
2. REQ-DATA-14 rule in ONE transaction under `one_working_head_per_project`:
   empty working head → overwrite (one head, no extra `n`); otherwise freeze head as vN (origin
   unchanged, cause recorded) + insert import as working v(N+1); concurrent imports/saves never two
   working heads; toast says which.
3. Four freeze triggers tested on a working imported draft: run read, dossier ref, promote, export —
   wire any missing.
4. Import fidelity (REQ-HOME-5; I3): leading `# H1` → title, never silently dropped, every
   normalization in Conversion notes; typeset (paper) preview; clean conversion offers ONE
   "Create draft"; styled keyboard-accessible dropzone replaces native file input.
5. Web landing: after import → editable Page `/p/:slug/v/:n` by SPA navigation + toast.
6. Migration only if required (expectation: none — working drafts may carry `promoted_version_id`).
7. U7.import leg implemented; held `ready-to-flip` (`expected:"red"`; 250 flips).
8. Tenancy: no new tenant GET expected; extend the two-tenant probe if one is added.

## Acceptance criteria

- [ ] PGlite: import into empty working head overwrites — one working head, no extra `n`, import's
      content. (deterministic · engineered)
- [ ] PGlite: import into non-empty head freezes vN (origin unchanged, cause recorded) + working
      v(N+1); concurrent imports never two heads. (deterministic · engineered)
- [ ] Four tests, one per trigger; each fails if its trigger call is removed. (deterministic)
- [ ] Save to a freshly imported draft edits in place (editor-route test, no fork). (deterministic)
- [ ] `# Title\n\nBody` → title "Title" + conversion note; preview computed font = paper, not mono;
      clean conversion one CTA; dropzone keyboard-operable. (deterministic)
- [ ] If migration: additive-check + schema parity green; entry delta ≤ 15 kB gz reported;
      `check:dom-contract` green. (deterministic)
- [ ] U7.import held `ready-to-flip` — steps implemented + typecheck; `expected:"red"` stays; run
      record states 250 flips. (deterministic)
- [ ] Stage B staging-verified at 250 — dated `DEFERRALS.md` row `D-R7HOME.2a-1` opened.
      (agentic · engineered here; staging-verified at 250)
- [ ] Universal phase-gate AC.

## Plan

- `apps/api/src/import.ts` — `createImportedDraft`: insert `state='working'` (lazy-seeded live doc —
  collab `loadPersistedState` seeds y_state from `promoted_version_id`; recorded choice) + the
  REQ-DATA-14 rule in one `txRunner` tx; return `outcome` + `supersededN`.
- `packages/mirror/src/freeze.ts` — `FreezeCause` gains `"superseded_by_import"` (ADR-136).
- `apps/api/src/export-routes.ts` — wire the `export` freeze trigger in the `prepared` tx.
- promote trigger — VERIFICATION FINDING: no standalone draft-promote verb exists in the product
  (no `POST /drafts/.../promote`; `accepted_draft_id` never written; `FreezeCause`'s `"promote"`
  member unreferenced). The codebase's promote IS promote-on-launch — the run sheet's
  "will be promoted to vN" promise, implemented by the run-creation freeze (`cause:'run_read'`).
  Tested at the api run-route level so the two tests exercise distinct trigger paths.
- `apps/convert/src/convert.ts` + `packages/contracts/src/domain/conversion.ts` — emit a conversion
  note when a leading H1 is extracted to `title` (never silently dropped; REQ-HOME-5).
- `packages/ui/src/conversion.tsx` — typeset (paper face) converted pane; ONE "Create draft" CTA on
  a clean conversion (Fix now only when warnings exist).
- `apps/web` — styled dropzone on the import sheet + new-project form (keyboard-operable);
  `POST /p/:project/import/create` redirects `/p/:slug/v/:n?imported=<outcome>`; Page surface shows
  the toast (URL flash `?imported`/`?pn`); COPY keys; dom-contract hooks.
- `packages/journeys/src/r7legs.ts` — `U7_IMPORT` body (paste H1 → title kept → editable → no fork);
  registry row stays `expected:"red"`.
- Tests: `apps/api/src/import.test.ts` (overwrite/supersede/concurrency), editor save-in-place,
  four-trigger tests, `apps/convert` conversion-note test, `packages/ui` conversion component test,
  `apps/web` DOM test (dropzone keyboard + toast + landing nav).

## Test matrix

| AC | Test |
|---|---|
| overwrite | `import.test.ts`: seed working head (empty) → create → same draft id/n, working, promoted=import |
| supersede | seed working head w/ version → create → head frozen `superseded_by_import`, import working v(N+1); Promise.all pair → exactly one working head |
| run read | orchestrator `createRun` w/ `draft:read` on imported head → frozen `run_read` |
| dossier ref | `deliverRun` → frozen `dossier_ref` |
| promote | api `POST /projects/:id/runs` on imported head → frozen (promote-on-launch is the product's Promote) |
| export | `POST /projects/:id/export` → frozen `export` |
| save in place | editor save on imported head → same draft id, `forked:false` |
| fidelity | convert.test (title note), conversion.ui test (paper font, one CTA), DOM (dropzone keys) |
| landing/toast | `?imported=` toast DOM test; redirect target asserted |

## Progress

- 2026-11-06 — context loaded; anchors verified.
- Implemented: `freeze.ts` +`superseded_by_import`; `import.ts` rewrite (one-tx REQ-DATA-14 rule —
  `overwrote`/`superseded`/`created` + `ImportHeadUncommittedError`); `export-routes.ts` export
  freeze; `title_extracted` conversion warning kind; `ConversionPreview` (title, paper pane, one
  CTA on clean); `FileDropzone` in `onboarding.tsx`; `?imported`/`?pn` landing toast on
  `VersionPageSurface`; create-redirect → `/p/:slug/v/:n?imported=…`; api-client + data.ts + queries
  DTOs. **Decision (recorded):** live doc lazy-seeds from `promoted_version_id` via collab
  `loadPersistedState` — no import-time `live_docs` write.
- In progress: trigger tests, U7 leg, records (DEFERRALS row, ADR-136, PR, BUILD_INDEX, LEDGER).
- dom-contract: `data-import-dropzone`/`data-import-file-input`/`data-conversion-title`/
  `data-converted-pane` attrs + `?imported`/`?pn` URL params declared (onboarding section).
- Tests landed in `import.test.ts`: working-head landing + overwrite (outcome `overwrote`, same
  row/n), supersede (head frozen `superseded_by_import`, origin unchanged, import working v(N+1),
  exactly one head), concurrent pair → one head, save-in-place (`forked:false`).
- New `apps/api/src/import-triggers.test.ts`: the four freeze triggers on a real imported head —
  run_read (orchestrator createRun), dossier_ref (deliverRun), promote (api POST /runs =
  promote-on-launch), export (api POST /export). **Verification finding:** no standalone
  draft-promote verb exists; promote-on-launch IS the product's Promote (recorded `run_read`).
- Build+typecheck green (29 tasks). Test fix: pending artifact mirror path made call-unique
  (`drafts/pending-<id>.md`) — racing imports staged `drafts/pending.md` and hit the
  (project_id, mirror_path) unique index.
- Remaining: fix export test status (was ≠200), remove unused ImportHeadUncommittedError import,
  convert title-note test, conversion ui test, DOM tests (dropzone/toast), U7 leg in r7legs.ts
  (stays expected:"red"), DEFERRALS row D-R7HOME.2a-1 (new section at file END), ADR-136,
  PR file docs/build/pr/R7HOME.2a.md, gh pr create --base stevevitali/r7home-1-projects,
  BUILD_INDEX row 274, LEDGER advance (lastCompleted R7HOME.2a; nextTicket → row 236
  `R7HOME.2b`; chainTip → stevevitali/r7home-2a-imports) + PHASE LOG under "## PHASE LOG —
  Round 7", spa-budget entry delta vs apps/web/spa-budget-baseline.json,
  `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R7HOME.2a --json docs/build/logs/ci-R7HOME.2a.json`,
  check-build-memory.sh ., check-append-only.mjs --base stevevitali/r7home-1-projects.

## Gap table

| Item | Ticket asks | Reality found | Disposition |
|---|---|---|---|
| promote trigger | "verify promote and export" | No standalone draft-promote verb exists anywhere in the product — no `POST /drafts/…/promote`, `accepted_draft_id` never written, `FreezeCause`'s `"promote"` member unreferenced. The DS's "user clicks Promote" IS the run sheet's promote-on-launch ("will be promoted to vN when this run starts"), implemented by `run-creation.ts`'s freeze. | ADR-136 records it. The promote test exercises `POST /projects/:id/runs` (the sheet's launch) — a distinct trigger path from the orchestrator-unit run-read test; removing the run-creation freeze fails both. `FreezeCause`'s `"promote"` stays for a future explicit verb. |
| export trigger | wire if missing | `export-routes.ts` resolved the head + version but never froze. | Wired `freezeDraft(cause:"export")` in the `prepared` tx — the head seals to exactly the promoted version rendered; guarded, idempotent on already-frozen heads. |
| supersede cause | "the freeze-cause value for 'superseded by import' (an ADR if `FreezeCause` grows)" | The union had only the four triggers. | `FreezeCause` += `"superseded_by_import"` (ADR-136) — distinct from the four user/run triggers; `frozen_by` carries it. |
| empty-head definition | "the ticket owns the definition" | Not defined in code. | ADR-136: `promoted_version_id IS NULL` AND (`live_doc_id` NULL OR `octet_length(y_state)=0 AND md_sha256 IS NULL`). Typed-never-materialized heads refuse `uncommitted_head` (409) — never a silent overwrite. |
| live-doc seeding | import-time write OR lazy seed — record choice | `loadPersistedState` seeds `y_state` from `promoted_version_id`; the editor GET reads `promoted_version_id`. | Lazy-seed (the `saveManualRevision` precedent): the import carries `promoted_version_id` + `live_doc_id=NULL`; collab seeds on first connect. First keystroke edits in place, never forks. |
| concurrent imports | one tx under the index | PGlite's single-connection wire can't interleave txs at the row-lock level. | One `txRunner` tx + `FOR UPDATE` on the project serializes on real PG; the test asserts the sequential ordering the lock produces + the partial unique index itself refuses a second working head. |
| pending artifact collision | — | Two racing imports staged `drafts/pending.md` → (project_id, mirror_path) unique hit. | Pending path made call-unique (`drafts/pending-<id>.md`) before the vN rename. |

## Evidence log

- `pnpm turbo build lint typecheck` (touched closure: api, web, ui, convert, mirror, orchestrator,
  contracts, api-client, journeys) — **90 tasks green**.
- `vitest apps/api/src/import.test.ts` 14/14 · `import-triggers.test.ts` 4/4 (one per trigger) ·
  `editor-routes.test.ts` + `project-routes.test.ts` 32/32 (updated to the born-working shape) ·
  `apps/convert` 22/22 · `packages/ui` spa-journey-hooks 22/22 · `apps/web` onboarding.dom 20/20 ·
  editor.dom green incl. the `?imported`/`?pn` toast.
- Full-suite run (api + mirror + orchestrator): 1,214 pass / 4 fail — all four were the intended
  born-frozen→born-working expectations, updated; re-run green.
- `check:dom-contract` OK (32/32 onboarding hooks asserted) · `check:spa-env` OK ·
  `check:protocol-markers` OK · `check:spa-budget` OK — **entry +14.5 kB vs baseline `04a4e98b`**
  (≤15 kB allowance; includes the stacked R7 deltas at this chain tip).
- No migration added — working drafts already carry `promoted_version_id` + `frozen_by`.
- U7.import leg implemented (`U7_IMPORT` in `r7legs.ts`); registry stays `expected:"red"`
  (`AUTHORED_HELD`; 250 flips — D-R7HOME.2a-1).
- PR #273 opened (`--base stevevitali/r7home-1-projects`). **First CI read @`5f15430d` failed**
  (run 42167773144, `typecheck / lint / unit`) on five tests the session's local suite sweep had
  not re-run: `data.test.ts` + `server.test.ts` + `bff.test.ts` (stubs/assertions still on the
  pre-`{n,outcome}` create-import shape) and `registry.test.ts` + `runner.test.ts` (U7.import's
  authored body rejects with its own offline failure, so it joins the `AUTHORED_HELD` exemption
  U1/U2/U3/U6 already hold). Fixed at the second commit; `vitest apps/web/src +
  packages/journeys/src` re-run 110 files / 1746 tests green; web+journeys lint/typecheck green.

## Evidence report

Stage A, $0 (GD-PREVIEW.R7 — no preview). All verification above is deterministic/in-repo; the
U7 leg's deployed walk is deferred to 250 under `D-R7HOME.2a-1`.
