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
