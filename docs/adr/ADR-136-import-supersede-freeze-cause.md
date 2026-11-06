# ADR-136 — `superseded_by_import`, and the REQ-DATA-14 empty-head definition

- **Status:** Accepted
- **Date:** 2026-11-06
- **Ticket:** 235_R7HOME.2a
- **Requirement ids:** REQ-DATA-14, REQ-DATA-21, REQ-HOME-4, REQ-HOME-5, REQ-VIS-4
- **Spec:** DS §5.4/§11.6 (vendored design spec); ticket `docs/tickets/235_R7HOME.2a__editable-imports.md`

## Context

REQ-DATA-14's overwrite rule imports a draft over the current working head. When the head is
non-empty, the old head must freeze as vN "with its origin unchanged and its cause recorded."
`FreezeCause` (`packages/mirror/src/freeze.ts`) previously carried exactly the four REQ-DATA-21
triggers — `run_read | dossier_ref | promote | export` — and the ticket names the cause value for
"superseded by import" as a decision requiring an ADR if the union grows.

The ticket also requires the owned definition of an **empty** working head, plus two related
verification findings: what "promote" means in this codebase, and where the imported head's live
document comes from.

## Decisions

1. **A fifth cause: `superseded_by_import`.** The freeze an import performs on a superseded head
   is not one of the DS's four user/run triggers — it is the REQ-DATA-14 rule itself. Recording it
   under `run_read` or `promote` would mislabel the mechanism and poison the `frozen_by` audit trail;
   folding it into an `origin` rewrite would violate "origin unchanged." The union grows by one
   member; the four triggers are untouched.

2. **Empty means never-committed.** A working head is EMPTY when it has no `promoted_version_id`
   AND (`live_doc_id` is NULL OR the live doc carries `octet_length(y_state)=0` AND
   `md_sha256 IS NULL`) — i.e., the head was created by the project seed (or a blank-page entry)
   and has never committed a version, materialized markdown, or CRDT content. Anything with
   committed-or-typed content is non-empty and freezes; the import never destroys it. A head with
   content but no promoted version mints one from its materialized markdown (`md_sha256`); a head
   with pure typed-never-materialized state refuses the import with `uncommitted_head` (409) —
   an honest refusal, never a silent overwrite.

3. **"Promote" is promote-on-launch — there is no standalone promote verb.** Verified in this
   codebase: no `POST /drafts/…/promote` route exists, `accepted_draft_id` is never written, and
   `FreezeCause`'s `"promote"` member is unreferenced. The DS's "the user clicks Promote" is
   realized by the run sheet's promote-on-launch — "the working copy will be promoted to vN when
   this run starts" — implemented by `run-creation.ts`'s freeze (`frozen_by.cause='run_read'`).
   The four-trigger test suite therefore exercises promote at the api run-route level
   (`POST /projects/:id/runs` → the launch), a distinct trigger path from the orchestrator-level
   `createRun` read. `FreezeCause`'s `"promote"` member remains for a future explicit verb; the
   export trigger (`cause:'export'`) was genuinely missing and is now wired in
   `export-routes.ts` (the export seals the head to exactly the promoted version it rendered).

4. **The imported head's live doc lazy-seeds.** The import carries `promoted_version_id` and
   `live_doc_id = NULL`; collab's `loadPersistedState` seeds `y_state` from the promoted version on
   first connect and the editor GET reads `promoted_version_id`. No import-time `live_docs` write —
   the same lazy-seed precedent `saveManualRevision` uses for a fresh head. The first keystroke
   edits the working head in place (origin `human_upload` is Page-editable); it never forks.

5. **`frozen_by` carries the cause everywhere.** `freezeDraft`'s `frozenBy` payload now names the
   cause in every caller's default (the delivery caller's `{kind:"system",runId}` default gains
   `cause:"dossier_ref"`) so the audit column is never cause-less.

## Consequences

- `FreezeCause` consumers must tolerate the new member; it is additive and zod-free (a TS union).
- REQ-DATA-14's single-transaction rule + the `one_working_head_per_project` partial unique index
  together guarantee exactly one working head; concurrent imports serialize on the project row lock
  and a losing insert rolls the whole tx back.
- A migration is not required: working drafts may already carry `promoted_version_id` and `frozen_by`.

## Revisit trigger

If an explicit "Promote" draft verb ships (a standalone endpoint or button), give it `cause:'promote'`
in `freezeDraft` and add its dedicated test; do not re-label the promote-on-launch path retroactively.
