# ADR-132: The global ⌘K palette + tenant-scoped GET /search — owned decisions

- **Status:** accepted
- **Date:** 2026-11-05
- **Ticket:** 228_R7SHELL.1c (REQ-SHELL-7, REQ-RELOAD-3, REQ-SPEC-30, REQ-ISL-10)
- **Spec:** `docs/tickets/228_R7SHELL.1c__global-palette-search.md`

## Context

The ticket assigns four decisions to the change: the `GET /search` DTO, "one palette" (the IDE
palette retired, delegated, or absorbed), the command-source registry, and the fate of
`/p/:project/palette-search`. The IDE palette was an in-document overlay fetching a project-scoped
proxy whose draft hits deep-linked `/edit/:id` — a `reloadDocument` stub under REQ-RELOAD-3.

## Decisions

1. **DTO shape — grouped hits, not a flat list.** `WorkspaceSearchGroups` carries
   `projects` / `drafts` / `letters` / `voices` arrays of `WorkspaceSearchHit` (contracts
   `domain/workspace-search.ts`): the palette renders groups natively and the API keeps a flat
   `results` list for `/projects/search` unchanged. Draft hits carry `draftN` (a `drafts` join
   in the shared query) so the twin maps to `/p/:slug/v/:n` — never `/edit/:id`. Voices match by
   `display_name ilike` with LIKE-escaping; the index intentionally gains no voice docs (index
   changes stay a separate ticket's decision). Under `?project=<id>` only the project's LINKED
   Voice can hit.
2. **One palette, absorbing the IDE palette.** The cmdk palette mounts once in the
   `WorkspaceAppShell`, lazy-chunked on first ⌘K (`check-spa-entry-graph` denies `cmdk` and
   `spa/palette` in entry chunks). The IDE palette's local-only commands survive verbatim through
   the `data-palette` `PaletteData` embed — moved onto `.ide` — read through the same
   `paletteModel`/`buildPalette` view-models the island consumed. The island + controller palette
   code paths are deleted; ⌘K inside `.ide` dispatches `rhema:palette-open`, the same event the
   sidebar Search item and the shell keymap arm dispatch. On SSR documents (no AppShell) ⌘K is
   inert and issues no request.
3. **Command sources.** Workspace commands (New project, Inbox, Voices, Usage, Settings) navigate;
   theme rows dispatch `rhema:app-theme` to the shell's existing theme seam (localStorage + the
   account-menu POST — the palette itself issues **zero** non-GET requests, REQ-ISL-10 re-asserted
   globally). Local commands come only from the `data-palette` embed — verbs resolve to run-sheet
   GETs, everything else navigates; the `/` command row is `paletteModel`'s structured grammar.
4. **`/p/:project/palette-search` retired, not aliased.** `/bff/search?q=&project=<slug>` is the
   one search twin (slug→id through `bffProjectRow`, the same tenant check every `/bff` twin
   uses). Removing the route discharges the `/edit/` deep link for 231's T5 — recorded for that
   ticket. The demo's forwarded `palette-search` endpoint arm retires with it: a demo-namespaced
   hit 404s without touching a DataSource.
5. **Demo boot — palette off.** `DemoAppShell` mounts no palette host and no Search item; the
   `rhema:palette-open` dispatch inside a demo IDE document has no listener — ⌘K is inert and no
   `GET /bff/search` (or any search request) fires. The DOM test proves zero search calls and the
   choice is recorded here for 248 (demo variant = "hidden").

## Consequences

- `GET /search` reuses `project_search_docs` through `queryProjectSearchDocs`, the shared
  self-heal + select both routes run — one `d.workspace_id = $1` predicate, inside the
  request-scoped `withTenant` client, never the system pool. The deterministic probe's
  query-bearing legs search each tenant's marker token as the other tenant; the api test's
  mutation leg proves the predicate is what isolates.
- The sidebar Search item is always present on signed-in pages (the palette's reach is the whole
  workspace shell). `paletteHere` in `app-shell.tsx` now only gates the <768 pane toggle.
- `data-palette-input` / `data-palette-results` / `data-palette-empty` keep their names on the
  cmdk surface; `data-ide-palette`, `data-palette-sections`, `data-palette-search`, and
  `data-active` are retired hooks (removed from the manifest in the same change).

## Alternatives considered

- **Alias `/p/:project/palette-search` → `/bff/search`.** Rejected: two search twins invite drift
  and keep a `/p/:slug` twin shape the demo allowlist then has to keep describing.
- **A registry object the palette queries for command sources.** Deferred: two concrete sources
  (workspace list + embed) cover the ticket; a registry abstraction lands with a third source.
- **Keep `data-palette-sections`.** Rejected: the labels live in `COPY.ide.palette.sectionLabels`
  — the palette bundle reads them directly, so a duplicate JSON embed is dead weight.
