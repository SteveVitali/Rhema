# ADR-048: `/v/working` resolves the editable head — working head, else the highest-n draft as the lazy-fork source

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** EDIT.1
- **Requirement ids:** REQ-IDE-32, REQ-DATA-14, REQ-DATA-21, REQ-DATA-24
- **Spec:** §5.4, §5.8, §11.6

## Context

`GET /projects/:id/editor/resolve/working` answered only `state='working'` drafts. Every project
whose head is frozen — fresh imports (`human_upload`/`frozen` — the importer freezes every draft,
a plan-vs-code deviation kept per EDIT.1's notes), reviewed-but-unedited heads, `duplicate` copies,
and any `my-first-project`-shaped project — had *no* working row, so `/p/:slug/v/working` 404'd
even though the project overview had already mounted the Page on `headDraftId` (highest-n, any
state). PR-J4's live review caught the dead link.

§5.4's editing rule is *lazy* for a reason: "opening a frozen vN for editing creates v(N+1)
`origin=human_revision`" means the first **write**, not the first **view** — REQ-IDE-46's offline
leg already relied on that (a frozen head attaches writable, the first debounced store performs
the fork). The missing piece was the *route*: which draft id `/v/working` hands the Page when no
working head exists.

## Decision

- **`working` = the editable head.** The resolver prefers the working head (the `human_revision`
  lineage's open head); when none exists it returns the project's highest-n draft — one query,
  `order by (state='working') desc, n desc limit 1`. A frozen head resolves to **itself**: the
  Page renders it editable-with-banner (`v{n} is frozen — your edits here open a new revision`),
  and the fork happens at the first save/materialization through `saveManualRevision` — never at
  open. Resolving therefore mints nothing (tested: two resolves leave the draft count at one).
- **A numeric `/v/:n` stays exact.** The frozen base keeps answering as itself (the rail is
  version-exact; the fork is opt-in by typing, never by viewing).
- **`/v/working` never dead-ends.** A 404 on `working` now means the project has zero drafts —
  the web redirects to `/p/:slug` (the empty-state cards and the import affordance live there)
  instead of rendering the generic not-found. Numeric misses keep the truthful 404.
- **After the fork, the head follows itself.** `resolveEditorHead` already routes a stale base
  id to its working child on non-exact reads; the legacy `/p/:slug/edit/:draftId` redirect now
  reads non-exact too, so a bookmarked base lands on `/v/<childN>` — the live editing surface —
  not the frozen view.

## Consequences

- Fresh imports, reviewed heads, duplicated projects, and `my-first-project` are all one Edit
  click from a working editor; frozen bytes stay content-addressed and byte-identical (the fork
  writes new `artifact_versions` rows, never edits the old).
- A draft's `state` never decides *renderability* — it decides *what typing does* (frozen ⇒
  first write forks; working `human_revision` ⇒ writes in place; locked ⇒ read-only attach).
- The Showcase keeps its §15.4 posture through every leg: HTTP saves 409
  (`showcaseReadOnlyGuard`), collab attaches read-only, materialization refuses, and SSR renders
  the Page read-only with no collab wire.
- No working copies are introduced — REQ-IDE-44/REQ-DATA-27 stay amended to 1.x.

## Amended 2026-10-03 — the human-editable working set + head routing

The N8 `frozen-dup` leg (duplicating the Showcase) caught the first draft of this decision
under-reading: the copy's open head is `origin='duplicate'` + `state='working'` (the row action
copies draft state verbatim — the Showcase's own v2 is seeded that way), and every gate that read
`origin === 'human_revision'` attached it **read-only**: collab auth refused writes,
`saveManualRevision` answered `not_editable`, the stale-base child lookups missed it, and the
mobile block-patch guard 409'd. The pill therefore never reached `synced` on a duplicated project —
the exact "duplicate/frozen projects are recoverable and editable" AC.

The rule is now expressed once — `HUMAN_EDITABLE_DRAFT_ORIGINS` (`human_revision`, `human_upload`,
`duplicate`) in `@rhema/contracts` — and every layer consults it:

- **A working human-authored head is the editable surface, period.** `one_working_head_per_project`
  makes a fork structurally impossible (the child would be a *second* working draft), so a
  `duplicate` head — the §15.4 "duplicate to play" copy — saves **in place**; its `origin` stays
  `duplicate` (creation provenance) while `artifact_versions.created_by` + the block map record the
  human edits. `manual-trace` and `computeReReviewSeed`'s `humanEdit` flag now see it the same way.
- **A frozen base routes to the project's ONE working head, not just its own direct child.** The
  lookups in `saveManualRevision`, collab auth, and `resolveEditorHead` used to search
  `base_draft_id = $1 and origin='human_revision'` — missing `duplicate` heads and deep lineages
  (v1 frozen → v2 frozen → v3 working), where a stale-base save would instead have attempted a
  second working draft and died on the unique index. A frozen head now resolves the project's
  working row; human-editable → the collab socket refuses `frozen_fork` and the client rebinds /
  the save routes; agent-origin → read-only/`not_editable`; none → `openHumanRevision` forks.
- **`openHumanRevision` numbers the child `max(n)+1`, not `base.n+1`.** REQ-DATA-24's "v(N+1)" is
  the next version *number*; a stale mid-lineage base (later frozen drafts standing, no working
  head) would otherwise collide on `(project_id, n)`.

Working agent-sourced origins (`drafted_from_outline`, `response_to_review`, `imported`, `cut`)
remain `not_editable` through this path — they are run surfaces, not the person's editor. No working
copies are introduced (still 1.x).

## Revisit trigger

Reopen if a draft kind appears that must be *frozen and directly editable in place* (no lazy
`human_revision` fork — e.g. a legal-hold draft that humans patch under a different audit rule),
or if `one_working_head_per_project` ever relaxes to multiple working heads — the resolver's
"the ONE working head" premise and the stale-base rebind protocol would both need re-deciding.
