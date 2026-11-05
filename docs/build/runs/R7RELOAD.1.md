# R7RELOAD.1 — run ledger

- **Spec:** `docs/tickets/231_R7RELOAD.1__no-reload-forms.md`
- **Base:** `stevevitali/r7shell-2-project-scope` @ `357b3bb26d14aaab4f3fb854362f35b0a91c7011`
- **Branch:** `stevevitali/r7reload-1-forms`
- **Config:** implement-spec full · Stage A only ($0; GD-PREVIEW.R7 — no per-ticket preview)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** agent-skills @ unknown (loaded 2026-11-05)
- **Started:** 2026-11-05T21:15Z · **Closed:** pending

## Deferrals read
`docs/tickets/DEFERRALS.md` read first (2026-11-05). No OPEN row is unblocked by this ticket —
the R7 OPEN rows (D-R7SHELL.1a-1, D-R7SHELL.1b-1, D-R7SHELL.1c-1, D-R7PANE.1-1, D-R7SHELL.2-1)
all belong to 250_R7DEP.2's preview walk. This run opens `D-R7RELOAD.1-1` (owner 250).

## Requirements (from ticket + spec §4.8/§4.16)
- REQ-RELOAD-2 [UXC-2]: one chrome-level delegated submit at the IdeChrome host covering every
  pane body (Timeline/panel/margin); one shared write-path allowlist module replacing the
  per-surface `*_WRITE` regexes; gate Approve/Decline + explainer dismiss as JSON mutations;
  scroll/focus preserved (REQ-UX-4); chat forms excluded (232).
- REQ-RELOAD-3 [UXC-3/4/5]: no write response produces `/edit/:id` (note, cancel-run, revise
  redirect straight to `/p/:slug/v/:n…`); palette deep link already fixed by 228 (verify);
  `reloadDocument:true` removed on in-tree targets (project-index handoff, `v/working` miss);
  every in-app `href="/"` targets `/app`.
- REQ-RELOAD-4 [UXC-28]: every form route answers through `mutationOutcome` (flash redirect for
  no-JS, stable code for JSON); `/p/:project/chat/*` prose errors → stable codes, no-JS empty
  chat send lands a flash; census test over `server.ts` POST handlers with a named exemption list.
- REQ-RELOAD-6 / REQ-GUARD-3: journeys helper asserting
  `performance.getEntriesByType('navigation').length === 1` + persisted window marker across a
  scripted walk; sanctioned document navigations excluded by name (S-14 demo entry/exit,
  `/logout`, Stripe/OAuth handoffs, binary exports, `/p/:p/f/:fid`, document stubs — R6 T10–T13);
  U2.noreload walk implemented, registry stays `expected:"red"` held `ready-to-flip` (250 flips).
- REQ-KIT-5: entry-delta allowance ≤ 15 kB gz, reported in the PR.
- DOM contract updated wherever a hook moves.

## Acceptance criteria
(9 rows — see ticket §Acceptance criteria; tracked in the gap table below.)

## Plan
1. `apps/web/src/spa/write-paths.ts` — shared `SPA_WRITE` allowlist (union of DOSSIER_WRITE,
   EDITOR_WRITE, RUN_REPORT_WRITE + `explainers/*/dismiss` + `r/*/pause|resume|stop|cancel|note`),
   shared helpers (`actionPath`, `setFormBusy`, `collectJsonFields`), one delegated submit
   factory, one `usePaneWrite` hook.
2. `ide/chrome.tsx` — host-level `onSubmit` on the host div covering every pane body + Outlet.
3. `dossier.tsx`/`editor.tsx`/`run-report.tsx` — consume the shared module (drop `*_WRITE`).
4. `server.ts` — note/cancel-run redirect → `/p/:slug/v/:n` (resolve via `getEditorDoc`);
   chat family → `mutationOutcome` + stable codes; explainers dismiss, `/settings/theme`,
   `/settings/privacy`, `/logout`, `/p/:project/import/preview` → `mutationOutcome`.
5. Route files — drop `reloadDocument:true` at `p.$project.index.tsx:46` and
   `p.$project.v.$v.tsx:37,60`.
6. `packages/journeys/src/noreload.ts` — GUARD-3 helper + sanctioned-name list;
   `U2_NORELOAD` body in `r7legs.ts` (`REAL_BODIES`, registry stays red);
   `noreload.local.test.ts` fixture walk (clean + planted reload).
7. Tests: allowlist census, mutationOutcome census, `/edit/` census, reloadDocument census,
   gate-approve DOM test, updated chat/editor/server tests.

## Test matrix
- AC gate approve → JSON fetch + no nav + scroll kept: `write-paths`/chrome dom test (fetch spy,
  `data-nav-count` untouched).
- One allowlist module: census fails if any surface declares `*_WRITE`.
- No server write → `/edit/`: census over `server.ts` POST redirects + note/cancel-run route tests.
- `reloadDocument` census under `spa/routes/_authenticated/**` (named allowlist only).
- mutationOutcome census + named exemptions; no-JS empty chat send → 302 flash `/p/:slug#chat`.
- Harness unit test: planted reload fails; clean fixture walk passes (local demoDataSource +
  Chromium, the u3-occlusion.local.test pattern).
- `check:dom-contract` green; spa-budget entry delta ≤ 15 kB gz reported.
- U2 stays `expected:"red"` (ready-to-flip) — D-R7RELOAD.1-1 to 250.

## Progress
- 2026-11-05T21:15Z — branch forked; spec/anchors loaded; ledger seeded.
- Anchors drift noted: T5 palette `/edit/` link already discharged by 228 (`/bff/search` maps
  drafts → `/v/:n`); states.tsx 404 + AppShell wordmark already `/app` (226); `explainers`
  dismiss + `/settings/theme|privacy` + `/logout` + `import/preview` lacked `mutationOutcome`.
- DONE: `spa/write-paths.ts` (SPA_WRITE union + delegatedSubmitHandler + usePaneWrite + PaneBusy);
  `ide/chrome.tsx` host `onSubmit`; dossier/editor/run-report consume the shared module
  (`*_WRITE` retired); `p.$project.index.tsx` + `p.$project.v.$v.tsx` in-router redirects;
  server.ts note/cancel-run → `/v/:n` via `getEditorDoc`, explainers dismiss + settings/theme +
  settings/privacy + logout + import/preview → mutationOutcome.
- IN PROGRESS: chat routes → mutationOutcome + stable codes (codes: `chat_turn_required`,
  `chat_action_required`, `chat_name_required`, `chat_pin_required`, `chat_thread_required`,
  `chat_correction_required`, `chat_suggestion_required`, `chat_note_required`,
  `chat_attachment_required`, `not_found`; success → `mutationOutcome{redirect:/p/:slug#chat,
  data}`; refusal keeps chatFail truthful JSON both arms; verb redirects → envelope).
- TODO: journeys `noreload.ts` (GUARD-3 marker + SANCTIONED names + U2_NORELOAD body +
  noreload.local.test.ts); tests (write-paths allowlist census, mutationOutcome census with
  named exemptions — `/bff/*` JSON-only, `/ide/theme`, `/p/:project/paper-theme`,
  `/edit/:draftId/save` beacon, `/a/*` beacons, `gates/:gid/activity` ping, `/p/:project/export`
  binary, `/signup` `/login` funnel documents, named handler factories); update
  chat-surfaces/editor/server/intercept tests; ADR; DEFERRALS D-R7RELOAD.1-1; BUILD_INDEX 270;
  LEDGER; PR; ci-boundary.

## Gap table
(pending Phase 4)

## Evidence log
(pending Phase 5)

## Evidence report
(pending Phase 6)
