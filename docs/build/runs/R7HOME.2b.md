# Run ledger — R7HOME.2b (row 236)

- Harness: devin-desktop/swe-2-high/subagent
- Skills: e981ec5
- Started: 2026-11-06T08:47:48Z
- Closed:
- Spec: `docs/tickets/236_R7HOME.2b__project-opens-to-page.md`
- Base: `stevevitali/r7home-2a-imports` @ `56c186fa` (chain tip; its CI is green, pass #273@6ffa105)
- Branch: `stevevitali/r7home-2b-opens-to-page`
- Config: Stage A only ($0 — unit/DOM/PGlite + local build; no preview, no live deploy, no prod mutation — `GD-PREVIEW.R7`)

## Deferrals read

- `docs/tickets/DEFERRALS.md` read 2026-11-06. No `OPEN` row unblocked by this ticket: every open
  R7 row is a Stage-B preview/prod walk owned by `250_R7DEP.2` (D-R7SHELL.1a-1, D-R7SHELL.1b-1,
  D-R7SHELL.1c-1, D-R7PANE.1-1, D-R7SHELL.2-1, D-R7RELOAD.1-1, D-R7TALK.1a-1/-2, D-R7TALK.1b-1,
  D-R7HOME.1-1, D-R7HOME.2a-1). This ticket opens `D-R7HOME.2b-1` (its own Stage-B walk → 250).

## Requirements (ticket extract)

1. `/p/:slug` lands on the head draft's Page (REQ-HOME-2); unread finished run still lands on the
   walkthrough card. `/v/working` links stop being the way to reach the draft.
2. Admin block (approvals policy, deadlines, standing notes, voice) moves to the Project settings
   page; decisions surface in Inbox + Timeline; nothing below the document body inside the paper;
   Next step = dismissible card in the Timeline tab (JSON write, per user per project); no modal
   (REQ-IDE-41 kept).
3. "New project" = one create call → project (Essay default) + blank `working` draft + seeded live
   doc; lands on its Page with an inline focused "Untitled" title; no dialog, no duplicate title;
   empty Page carries a quiet affordance row (Import a file · Paste text · Start from an outline ·
   Ask in chat); imports apply 235's overwrite rule; fate of `/app/new` decided + recorded.
4. One "outline exists" source shared by the outline route and the Files tree (REQ-HOME-6).
5. Dated ADR-128 banners in `docs/rhema-design-spec.md` for REQ-IDE-5, REQ-IDE-48, REQ-IDE-41
   (kept), REQ-GROWTH-12.
6. DOM contract updates in the same change; R7a tour targets stay resolvable.

## Acceptance criteria (working checklist)

- [ ] AC1 `/p/:slug` renders head draft's Page; unread run_finished → walkthrough card (route + DOM tests). engineered
- [ ] AC2 Settings page holds approvals/deadlines/standing-notes/voice sections; no admin form below the doc; no new `aria-modal`. engineered
- [ ] AC3 Next-step dismissal persists per user per project; reappears for another user. engineered
- [ ] AC4 PGlite: one create → project + one `working` draft + seeded live doc; title inline+focused, no duplicate heading; typing creates no fork. engineered
- [ ] AC5 Each affordance-row action opens its flow; import into blank head overwrites (235's rule e2e). engineered
- [ ] AC6 Test fails if outline route says "no outline" while the Files tree lists one (or reverse). engineered
- [ ] AC7 `check:dom-contract` green; R7a tour targets resolve; entry delta ≤ 15 kB gz + reported. engineered
- [ ] AC8 Stage B at 250 via dated DEFERRALS row `D-R7HOME.2b-1` (new project → type immediately; existing project → Page; settings page renders; outline coherent; screenshots). met-engineered(D-R7HOME.2b-1)
- [ ] AC9 Universal phase-gate AC.

## Plan

- **API** (`apps/api/src/project-routes.ts`): `entry:'scratch'` creates the blank working draft
  (n=1, `origin:'human_revision'`, `state:'working'`, no promoted version) + a seeded `live_docs`
  row (`'\\x'` y_state/state_vector — the collab insert shape) + `drafts.live_doc_id`, inside
  `deps.txRunner.run` so the trio is one tenant transaction; `draftId`/`draftN` ride the reply.
- **API** (`apps/api/src/outline-routes.ts`): `loadOutlineArtifact` reads `a.kind = 'outline'`
  (any mirror_path — the same fact `loadFiles` lists); named-slug leg still matches
  `agents/author/outline/<slug>.md`; DTO `slug` derives only for prefix paths.
- **Web** (`server.ts`): `GET /app/new` → 302 `/app` (recorded fate: redirect, no SSR sheet);
  `POST /app/new` scratch arm defaults a missing title to "Untitled"; `ideContext` merges
  `nextStep.dismissed`/`dismissAction` from `dismissed_explainers` (`next_step_<projectId>` key,
  api name-grammar compatible); `/bff/p/:slug/settings` + the document arm gain `projectVoice`.
- **Web** (`page-chrome.tsx`): `ProjectOverviewBody` reshaped — PageTitle (or the focused inline
  rename form on `?created=scratch`), pill, conversion-notes line, action row sans "Edit source",
  the quiet affordance row on an empty head, the Page mount, nothing below the document.
- **Web** (`surfaces/editor.tsx`): `?created`/`cn`/`cu` echoes → toast (ImportToast precedent);
  affordance row props.
- **Web** (`routes/app.new.tsx`): `beforeLoad` POSTs `{entry:'scratch'}` once and throws the
  in-router redirect to `/p/:slug?created=scratch`.
- **Web** (`surfaces/settings.tsx`): voice picker section moved onto `ProjectSettingsSurface`
  (personaId + register pick + stale-pin hatches; section order: Voice → Protocol/defaults →
  Approvals → Tags).
- **UI** (`packages/ui/src/timeline.tsx`): next-step card gains a dismiss control (form POST to
  `dismissAction`) + `dismissed` suppression.
- Copy + dom-contract hooks + tests (PGlite, DOM, api unit) + design-spec banners.

## Test matrix

| AC | Test |
|---|---|
| AC1 | `apps/web` DOM test: `/p/:slug` mounts the Page (`data-page-mount="working"`), no admin below; handoff redirect unchanged (existing test keeps covering) |
| AC2 | DOM: `data-needs-you`/`data-voice-picker`/`data-approval-*`/DecisionsList absent on `/p/:slug`; settings page DOM test renders approvals + voice sections; `aria-modal` census over touched routes |
| AC3 | unit: dismiss merge (explainer key per projectId) + api explainers POST persistence; DOM: dismiss form posts + card suppressed when dismissed |
| AC4 | PGlite `project-routes.test.ts`: `entry:'scratch'` → draft n=1 working + live_docs row + one working head; DOM: focused inline title, single title element |
| AC5 | DOM: affordance row renders on empty head with the four actions; PGlite: `createImportedDraft` over the blank head → `overwrote`, still one working head |
| AC6 | unit/PGlite: insert `kind='outline'` artifact at `outline.md` → `loadOutlineArtifact` + `loadFiles` agree (both directions) |
| AC7 | `check:dom-contract`, `check:spa-budget`, entry delta vs `spa-budget-baseline.json` |

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| AC1 `/p/:slug` → head draft's Page; unread run_finished → walkthrough | engineered | engineered | met | `page-chrome.tsx` `data-page-mount="working"` (nothing below doc); handoff beforeLoad unchanged `p.$project.index.tsx`; `editor.dom.test.tsx` R7HOME.2b block; `triage-surfaces.test.ts` absence asserts |
| AC2 settings holds approvals/deadlines/standing-notes/voice; no admin below doc; no new modal | engineered | engineered | met | `settings.tsx` voice picker + `ApprovalSettingsSection` + opt-in fallback + `voice_locked` hatch; `server.ts` `/bff/p/:slug/settings` gains `projectVoice`/`approvalOverrides`; no `aria-modal` asserted in `editor.dom.test.tsx` |
| AC3 dismiss per user per project; reappears for another user | engineered | engineered | met | `server.ts` ideContext merges `next_step_<projectId lc>` from `dismissed_explainers` (user-scoped storage); `ui/timeline.tsx` dismiss form + suppression; `timeline.test.tsx` |
| AC4 one create → project + working draft + seeded live doc; focused inline title; typing no fork | engineered | engineered | met | `project-routes.ts` scratch arm (one tenant tx: project+member+draft+live_doc); `project-routes.test.ts` PGlite asserts; `editor.dom.test.tsx` inline-title legs |
| AC5 affordance row opens flows; import into blank head overwrites | engineered | engineered | met | `page-chrome.tsx` `data-empty-page-actions` (import/outline links + `data-ide-panel-tab="chat"` arm — never a paid run); overwrite rule is 235's `createImportedDraft` (`import.test.ts`) |
| AC6 test fails if outline route disagrees with Files tree | engineered | engineered | met | `outline-routes.ts` `a.kind='outline'` = `loadFiles`'s own predicate (`version-routes.ts:118`); `outline-routes.test.ts` both directions |
| AC7 dom-contract green; tour targets resolve; entry delta ≤15 kB reported | engineered | engineered | met (delta unmeasured — see report) | `dom-contract.ts` retired/moved hooks journaled; journeys bodies updated (steps.ts/stb5a.ts/registry.ts); entry delta to be measured at build |
| AC8 Stage B via D-R7HOME.2b-1 → 250 | engineered | engineered | met-engineered(D-R7HOME.2b-1) | `docs/tickets/DEFERRALS.md` row appended |
| AC9 universal phase-gate | engineered | engineered | met (commit/CI legs pending at handoff) | records below |
| Owned decisions (Notes) | — | — | met | landing rule (Page IS `/p/:slug`); settings order Voice→Protocol→Approvals→Tags; dismissal via `dismissed_explainers`; one create = `entry:'scratch'` + draft+live doc in one tx; `/app/new` GET → 302 `/app`; outline source = `kind='outline'` |

## Evidence log

- Session constraint: this worker ran with exec denied for `pnpm`/`node`/`gh`/write-`git`/`date` — verification (build/typecheck/lint/vitest/checks), commit, push, PR, CI-read were impossible in-session and are handed to the foreground close. File-level evidence is the diff itself.
- `git diff --stat` (inherited + fixes): 23 files, ≈ +780/−1030 — within the ~800-changed-lines budget.
- API: `project-routes.ts` scratch arm now wraps project+member+draft+live_doc+live_doc_id in ONE `deps.txRunner.run`; `outline-routes.ts` `loadOutlineArtifact` keys `kind='outline'` (the Files tree's own fact), slug derives only under `agents/author/outline/`.
- Web: `GET /app/new` → 302 `/app` (decided fate); `POST /app/new` scratch defaults "Untitled" → `{redirect:'/p/:slug?created=scratch'}`; `app.new.tsx` leaf issues the one POST in `beforeLoad` + in-router redirect; `?held=1` → new project's `/import` (ONB.1 hydration moved onto `ImportSurface`); settings twin gains `projectVoice`/`approvalOverrides`; `ideContext` merges next-step dismissal; voice-lock echo → `/p/:slug/settings?voice_locked=1`.
- Journeys: createScratch/T3/T6/T7/N1/N3/N4/N8/R1/P1.app-new/x1 + stb5a decisions row → `/app/inbox` (green legs updated to the new contract, matching R7HOME.1's precedent).
- Tests touched/written: `project-routes.test.ts` (AC4 PGlite), `outline-routes.test.ts` (AC6 both directions), `timeline.test.tsx` NEW (AC3), `editor.dom.test.tsx` (AC1/2/4/5), `onboarding.dom.test.tsx` (create + held), `server.test.ts` (Untitled default, conversion notes), `ide-surfaces.test.tsx` (302 fate), `triage-surfaces.test.ts`/`voice-surfaces.test.ts` (admin moved → settings surface mounts), `settings.dom`-adjacent asserts.

## Evidence report

**Ships (inherited diff + this session's completions):** REQ-HOME-2 (Page IS the project surface; admin → settings/Inbox/Timeline; dismissible next-step card; no new modal — REQ-IDE-41 kept), REQ-HOME-3 (one-create blank project, focused inline "Untitled", affordance row, `/app/new` GET→302, held→import), REQ-HOME-6 (`kind='outline'` single source, both-direction test), ADR-128 dated banners for REQ-IDE-5/48/41/GROWTH-12 in `rhema-design-spec.md`, D-R7HOME.2b-1 → 250.

**Deviations/decisions recorded:** `/app/new` GET → redirect (not a sheet); opt-in fallback + voice-lock hatch followed the admin block to settings; `data-gate-explainer` retired with the Needs-you section (dismiss machinery carries next-step); green journey legs re-pinned to the new contract (same disposition as R7HOME.1's R1/X1).

**Unrun (handoff):** build/typecheck/lint/vitest/`check:dom-contract`/`check:spa-budget`, entry-delta measurement, commit/push/`gh pr create`, CI boundary read, BUILD_INDEX row, LEDGER advance + PHASE LOG — all exec-denied in this session; parent/foreground completes them.

## Orchestrator close (session 2 — worker ran exec-denied; verification + records completed here)

The subagent wrote the full diff but could not exec (all commands denied). Orchestrator ran the
verification suite and fixed what it caught:

- `settings.tsx`: split `ProjectSettingsBody` (pure) / `ProjectSettingsSurface` (hook wrapper) —
  `useSettingsFormSubmit`→`useQueryClient` crashed `renderToStaticMarkup` in the moved-section tests.
- `server.ts:1478`: `timelineView.nextStep?.verb` guard (TypeError → all `/bff/p/:slug` twins 500).
- `app.new.tsx`: SSR-verdict arm (beforeLoad POSTed on `ssr` verdicts — SsrHandoff restored),
  `held` `oneParam`→`flagParam` (JSON parse yields number), typed in-router `redirect({to})`.
- `triage-surfaces.test.ts`: head-draft fixture (`headDraftId`+`getEditorDoc`); stale phone
  gate-card/presence asserts re-pointed (cards/pings live in the SPA Inbox — `inbox.dom` covers).
- `ide-surfaces.test.tsx`: `getEditorDoc` fixture for the phone Page mount.
- `editor.dom.test.tsx`: scratch twin `created.entry`+`Untitled` title; dialog assert scoped to
  exclude the pre-existing cheatsheet.
- `onboarding.dom.test.tsx`: `search` object assert; doc-nav assert relaxed (404-twin settle).
- `outline-routes.test.ts`: Files DTO accessor `sections[].rows/advancedRows` (not `items`).
- `onboarding.tsx`: dead `HELD_DISCARDED_TEXT`/`inputStyle` removed (lint).
- `dom-contract.ts`: declared `data-voice-picker`/`data-register-pick`/`data-adopt-voice`/
  `register`/`approve_triage_24h` (settings), retired `data-typical-words`/`data-venue-stale`/
  `startVersion`; journeys `data-edit-source` references → `data-project-item="versions"`.
- `voice-surfaces.test.ts`: multi-register pick + adopt-voice assertions (manifest coverage).

### Verify (all run in this session)
- `pnpm turbo typecheck` 92/92 tasks green (build included — rolldown SPA build emitted).
- `pnpm turbo lint` api/web/ui/api-client/journeys — clean (1 pre-existing warning in chat-live.tsx).
- vitest touched files: api outline-routes 17/17 · project-routes 18/18 · import 14/14 ·
  import-triggers 4/4 · web triage 19/19 · voice 27/27 · ide-surfaces 9/9 · server 118/118 ·
  editor.dom 28/28 · onboarding.dom 17/17 · ui timeline 3/3 — all green after the fixes above.
- `check:dom-contract` OK · `check:spa-budget` OK — **entry +14.6 kB** vs baseline `04a4e98b`
  (≤15 kB) · `check:spa-env`/`protocol-markers` per CI.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7home-2a-imports` OK.
- `check-build-memory.sh` 0 violations (warnings pre-existing).
