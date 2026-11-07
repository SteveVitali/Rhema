# R7HOME.2a — Editable imports (API/DB) + import fidelity

Chain row **235** · ticket `docs/tickets/235_R7HOME.2a__editable-imports.md` · run ledger
`docs/build/runs/R7HOME.2a.md` · ADR-136 · Stage A, $0 (GD-PREVIEW.R7 — no preview).

Brings the imported-draft workflow into conformance with DS §5.4: an import is the project's
**working** head — the first keystroke edits in place instead of forking — and it freezes only on
the four triggers. Implements REQ-HOME-4/5, REQ-DATA-14, REQ-VIS-4/REQ-DATA-21's trigger set.

## What lands

**Imports land working.** `createImportedDraft` creates `state='working'` +
`origin='human_upload'` with `promoted_version_id` set; the live doc lazy-seeds from it via collab's
`loadPersistedState` on first connect (the `saveManualRevision` precedent — recorded). A save to a
freshly imported draft edits in place (`forked:false`).

**REQ-DATA-14 in one transaction** under `one_working_head_per_project` (project row `FOR UPDATE`
serializes racing imports):

- **empty head → overwrite** — the owned definition (ADR-136): no promoted version AND no committed
  doc content. The head's row + `n` are kept; the import's content and editable origin stamp onto it.
- **non-empty head → supersede** — the head freezes as vN (`superseded_by_import`, origin
  unchanged), the import lands as working v(N+1). A typed-never-materialized head refuses
  `uncommitted_head` (409) — honest, never a silent overwrite.
- **no head → create** — the import is the head at the next ordinal (`startVersion` still honored).

**Four freeze triggers** on a working imported draft, one removal-sensitive test each:
run read (`createRun`), dossier reference (`deliverRun`), promote — the product's Promote is
promote-on-launch (`POST /projects/:id/runs`; ADR-136 records the finding: no standalone promote
verb exists), and export (`POST /projects/:id/export` — genuinely missing, now wired to seal the
head to the exact version rendered).

**Import fidelity (REQ-HOME-5 / I3):** the leading `# H1` keeps the title and is never silent —
a `title_extracted` conversion note lists it and the preview shows a title line; the converted pane
is typeset in the paper face (`var(--font-paper)`), not mono; a clean conversion offers exactly one
"Create draft" CTA; the native file input is now a styled, keyboard-accessible dropzone
(`data-import-dropzone`, Tab + Enter/Space + drag/drop, `aria-hidden` proxy input preserved for the
form).

**Web landing:** `POST /p/:slug/import/create` redirects to the editable Page
`/p/:slug/v/:n?imported=<outcome>` — a `ToastProvider`-mounted push names the REQ-DATA-14 arm
("Draft imported — it replaced the empty working draft" / "…v{n} — v{m} was frozen").

**U7.import** leg implemented (`U7_IMPORT` in `r7legs.ts`), held `ready-to-flip` —
`expected:"red"` stays; **250 flips** (D-R7HOME.2a-1). No migration — working drafts already carry
`promoted_version_id`/`frozen_by`.

## Verification

- `pnpm turbo build lint typecheck` (touched closure) — 90 tasks green.
- `apps/api/src/import.test.ts` 14/14 (working-head landing, overwrite, supersede, index proof,
  save-in-place); `import-triggers.test.ts` 4/4 — one per trigger, each removal-sensitive;
  `editor-routes`/`project-routes` updated to the born-working shape (32/32); `apps/convert` 22/22;
  `packages/ui` 22/22; `apps/web` dom suites green incl. keyboard dropzone + `?imported` toast.
- `check:dom-contract`/`spa-env`/`protocol-markers`/`spa-budget` all green.
- **Entry delta: +14.5 kB gz vs baseline `04a4e98b`** (≤15 kB REQ-KIT-5 allowance; the number rides
  the stacked R7 chain at this tip).
- Full api+mirror+orchestrator suite: only the four intended born-frozen→working expectations
  needed updating; re-run green.

## Deferrals / carries

- **Opened** `D-R7HOME.2a-1` — U7's Stage-B deployed walk (title kept, typeset preview, editable
  import/no fork, screenshots) → **250_R7DEP.2** under `GD-PREVIEW.R7`.
- **Carries:** `FreezeCause`'s `"promote"` member stays for a future explicit promote verb (ADR-136
  revisit trigger).

## Operator asks

None — standard merge-under-OPERATOR.
