# R7WRITE.1b — Comment → anchored Guidance + fork toast + discard-fork Undo (ticket 238)

- Harness: devin-desktop/swe-2-high/subagent · branch `stevevitali/r7write-1b-comments` · base `stevevitali/r7write-1a-format-bubble` @ `63418514`
- Layer: engineered (Stage A only, $0; GD-PREVIEW.R7 — no owned preview). Stage-B legs owed → `D-R7WRITE.1b-1` (owner 250_R7DEP.2).
- REQ ids: REQ-WRITE-2, REQ-WRITE-7, REQ-SYNC-4 (discarded marker + label only), REQ-DACC-7 (U5), REQ-DACC-8 (flip by 250). Consumes REQ-RELOAD-2/4, REQ-DWEB-14. Kept: REQ-IDE-32, REQ-DATA-41. Findings: UXC-23, I5, B18, RV-27.

## Plan (all steps landed unless noted)
1. Additive migration `0062_drafts_discard.sql`: `drafts.discarded_at`/`discarded_by` + `guidance.draft_id` (+ drizzle schema `drafts.ts`/`misc.ts`).
2. API: `POST /projects/:id/drafts/:n/discard-fork` (version-routes.ts): session + ownProject(404) + `withTenant`; success iff (a) ≤1 `artifact_versions` row on the head's `drafts/v<N>.md` artifact (= "no edits beyond the forking keystroke(s)") and (b) no `runs.lock_set`/`inputs.draftId`/`inputs.nextDraftId` ref and no `correspondence_items` row on the head (S-4's triggers; promote/export already fail `state='working'`). Refusals: 404 not_found, 409 `not_a_fork`/`fork_has_edits`/`fork_read_by_run`. On success: `state='frozen'` + `frozen_by={cause:'discard'}` + `discarded_at/by` + `promoted_version_id` coalesced to the base's (the frozen invariant holds; the number is kept — append-only). `project_search_docs` draft row deleted. `loadVersionRail` carries `discarded`; `editor/resolve 'working'` excludes discarded so the parent is the working view.
3. `POST /editor/:draftId/note` accepts `{text, anchors}` → `captureGuidance` gains `draftId`; editor doc DTO gains `comments` (active inline_comment rows on the draft).
4. `saveManualRevision` refuses `not_editable` on a discarded head. Collab `resolveDraftBinding` carries `discarded`; `authenticateConnection` refuses a discarded attach with the `frozen_fork` payload → resolved head (non-discarded working else highest-n non-discarded) — open sessions rekey to the parent through the existing `rebase` path.
5. Web: api-client `postEditorNote`/`discardFork` + `DiscardForkDto`; data.ts relays; `POST /p/:slug/drafts/:n/discard-fork` → mutationOutcome (JSON `{data}` arm, form → parent page); note POST gains JSON `{text,anchors}` arm (`{data:{noted:true}}`).
6. UI: menus `comment` slot filled; controller `openCommentForm` (textarea+Post in the bubble box, ⌘⏎/Esc); page-mount emits `rhema:fork-toast` on onFork and handles `rhema:comment-submit` (derives the §11.3 anchor from `view.state.selection` — blockId/quote/from→to/confidence=1 — POSTs `{text,anchors}` to `…/note`, emits `rhema:comment-added`); `version-rail` renders `data-discarded` "· discarded"; SPA note form gated off by `embeds===false` (phone-UA SSR keeps it — disposition recorded for 247_R7RO.2).
7. Remaining: editor.tsx ForkToastBridge (rhema:fork-toast → Toast queue w/ Undo → discard-fork POST → ["bff"] invalidate → remount at parent; refusal toast) + marginBody comment cards; EditorDocDto.comments field; copy keys (discardedLabel + fork toast/undo copy); dom-contract hooks; U5.write body + AUTHORED_HELD; two-tenant probe leg; tests; verify; records.

## Key decisions
- "No edits beyond the forking keystroke(s)" = ≤1 `artifact_versions` row on the head's own draft artifact (the forking materialization); a never-diverged head (0 rows) also discards cleanly.
- The discarding session does NOT rebase its Y.Doc — the leaf invalidates `["bff"]`, the twin refetches with `doc.draftId`=parent, and PageMount remounts on a fresh session (typed keystrokes die with the discarded head — a true undo; no phantom v(N+2) fork).
- A second open session can't attach to the discarded head (auth → frozen_fork→parent); its doc's diverged content materializes under the ordinary first-save rule (v(N+2), number never reused).
- `frozen_by.cause='discard'` is a record fact alongside the four freeze triggers, not a fifth trigger (the marker is `discarded_at`).

## Test matrix / evidence log

- `turbo build` (46 tasks) + `turbo typecheck` (92) — green. `turbo lint` — clean; one PRE-EXISTING `chat-live.tsx` unused-disable warning (untouched).
- `pnpm exec vitest run apps/api/src` — **605/605** (incl. `version-routes.test.ts` discard describe: success/marker/parent-restore/kept-number, `fork_has_edits`, `fork_read_by_run` lock_set + correspondence arms, `not_a_fork`, 404; `editor-routes.test.ts` anchored-comment leg).
- `pnpm exec vitest run apps/web/src` — **1547/1547** (incl. `format-bubble.dom.test.tsx` Comment-first/composer/`rhema:comment-submit`; `editor.dom.test.tsx` no-note-form + margin card + fork-undo + refusal toast; `versions-surface.test.ts` `data-discarded`).
- `pnpm exec vitest run` collab/mirror/ide/journeys — **53/53** (discarded-attach `frozen_fork`→parent; `not_editable` on a discarded head + v(N+2) re-fork; comment slot; U5 AUTHORED_HELD + runner arm); ui/orchestrator/api-client/db — **273/273**; `integration/src/two-tenant-probe.test.ts` — PASS (foreign discard-fork 404 leg + own 409).
- `pnpm check:dom-contract` — OK (7 new hooks declared+emitted+asserted). `check:spa-env` OK. `check:protocol-markers` OK. `check:spa-budget` OK — **entry +14.9 kB gz vs `04a4e98b` (≤15 kB; 0.1 kB headroom)**.
- `node scripts/check-additive-migrations.mjs --files packages/db/migrations/0062_drafts_discard.sql` — pass (additive).

## AC gap table

| AC | Status | Where proven |
|---|---|---|
| Comment = first bubble item; composer → anchored Guidance → margin card | DONE | menus.ts + controller.ts + api note anchors + guidance.draft_id + editor.tsx margin |
| Margin card at its anchor; collapsed/tick follows 229 geometry | DONE (Stage A; Stage-B screenshot owed → D-R7WRITE.1b-1) | `data-comment-card`/`data-anchor-block` + tick projection; dom test |
| SPA note form removed | DONE | `embeds===false` gate (phone SSR keeps → 247) |
| Fork toast "You're editing a reviewed version… · Undo" non-modal, no reload | DONE | `rhema:fork-toast` → Toast queue → discard-fork JSON → `["bff"]` invalidate → parent remount |
| `discard-fork` API guarded + refusal codes + parent restored | DONE | version-routes.ts route + six api legs |
| Marked not deleted; `· discarded` history; number never reused | DONE | migration 0062 + rail DTO/`data-discarded`; re-fork v(N+2) |
| Open sessions rekey to parent; nothing edits a discarded head | DONE | collab auth `frozen_fork`→resolved head + `not_editable` (collab + mirror tests) |
| Frozen versions editable (not run_lock read-only); demo/showcase/run_lock withhold writes | DONE (unchanged arms + tests) | read-only mount: no bubble/composer → zero non-GET |
| U5.write authored local, `expected:"red"`/AUTHORED_HELD → 250 | DONE (held) | r7legs.ts `U5_WRITE` + AUTHORED_HELD/runner arms |
| Stage-B screenshots + registry flip | OWED → `D-R7WRITE.1b-1` | owner 250_R7DEP.2 |

## Operating clauses

- mergePolicy OPERATOR — PR on `stevevitali/r7write-1a-format-bubble` is left unmerged for the stack.
- $0 Stage A — no preview, no prod mutation (GD-PREVIEW.R7); Stage-B evidence owed at 250.
- Append-only records; the discarded marker is an additive column, never a rewrite.
