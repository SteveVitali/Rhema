# R7RELOAD.1 — run ledger

- **Spec:** `docs/tickets/231_R7RELOAD.1__no-reload-forms.md`
- **Base:** `stevevitali/r7shell-2-project-scope` @ `357b3bb26d14aaab4f3fb854362f35b0a91c7011`
- **Branch:** `stevevitali/r7reload-1-forms`
- **Config:** implement-spec full · Stage A only ($0; GD-PREVIEW.R7 — no per-ticket preview)
- **Harness:** devin-desktop/swe-2-high/subagent
- **PR:** #269 (base `stevevitali/r7shell-2-project-scope`)
- **Skills:** agent-skills @ unknown (loaded 2026-11-05)
- **Started:** 2026-11-05T21:15Z · **Closed:** 2026-11-05T21:35Z

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

## Gap table (Phase 4 — full re-read)
| Requirement/AC | Disposition |
| --- | --- |
| REQ-RELOAD-2 (pane forms → delegated submit, one shared allowlist) | DONE — host `onSubmit` at `IdeChrome`; `SPA_WRITE` in `write-paths.tsx`; surface `*_WRITE` regexes retired (census-pinned); field collection before busy-disable; submitter name/value rides the post |
| Gate Approve/Decline + explainer dismiss → JSON mutation | DONE — `gates/<gid>` + `explainers/<name>/dismiss` are in `SPA_WRITE`; the explainer handler now answers `mutationOutcome` |
| Scroll/focus preserved (REQ-UX-4) | DONE by construction — the JSON fetch never tears the document down |
| REQ-RELOAD-3 (no `/edit/:id` write targets; in-tree `reloadDocument` removed; home targets `/app`) | DONE — note/cancel-run resolve `/v/:n` via `getEditorDoc`; census asserts zero `/edit/` redirect literals + the named-stub `reloadDocument` list; `states.tsx`/AppShell already `/app` (prior tickets) |
| REQ-RELOAD-4 (mutationOutcome everywhere; chat stable codes; no-JS empty send → flash) | DONE — 9 chat routes + explainers/settings/logout/import-preview routed; `chat_*_required` codes; census = conform-or-named-exempt (ADR-134 §3) |
| REQ-RELOAD-6 / REQ-GUARD-3 (one document per walk; sanctioned excluded by name) | DONE Stage-A — `noreload.ts` + `U2.noreload` walk; fixture walk passes clean, fails on planted reload, sanctioned-name arm expects its doc nav |
| U2 held `ready-to-flip` (`expected:"red"` until 250) | DONE — REAL_BODIES entry; registry/runner tests re-pinned; D-R7RELOAD.1-1 opened |
| REQ-KIT-5 entry delta ≤15 kB | PASS — +13.8 kB gz vs baseline `04a4e98b` |
| Out of scope (chat send mutation → 232; per-form copy → 245; Stage B → 250) | HONORED — chat forms stay native (outside `SPA_WRITE`); no preview/live run; no money-mode/copy/tenancy changes |
| Deviations | ACCEPTED — REQ-DACC-8 owner flip deferred to 250 (GD-PREVIEW.R7 hazard); chat JSON arm unified on envelope 200 `{ok,redirect,data}` replacing verbatim-DTO 201 (ADR-134) |

## Evidence log (Phase 5 — all local, $0)
- `pnpm turbo build --filter=@rhema/web --filter=@rhema/journeys` — 15/15 (write-paths.tsx rename after .ts JSX error)
- `pnpm --filter @rhema/web typecheck` / `lint` — clean; `@rhema/journeys` typecheck/lint clean
- `pnpm exec vitest run apps/web/src` — **1,518 pass / 85 files**
- `pnpm exec vitest run packages/journeys/src` — green incl. `noreload.local.test.ts` (local demoDataSource server + bundled Chromium): clean walk holds one document; planted `location.reload()` FAILS the assert (lost marker + second nav entry); sanctioned `demo-exit` arm expects-not-permits
- `pnpm check:dom-contract` — OK (`data-gate-form` declared for U2's approve selector)
- `pnpm check:spa-budget` — entry graph 224.8/250 kB; **entry delta +13.8 kB vs baseline `04a4e98b`** (≤15)
- `check-build-memory.sh` — 0 violations (18 pre-existing warnings)
- `check-append-only.mjs --base stevevitali/r7shell-2-project-scope` — OK
- NOT RUN: preview/live journeys, `scripts/live`, deploy, paid legs — Stage A only per GD-PREVIEW.R7

## Evidence report (Phase 6)
- Commits: implementation+records commit on `stevevitali/r7reload-1-forms`; PR #269 (base `stevevitali/r7shell-2-project-scope`), unmerged (OPERATOR)
- Records: DEFERRALS `D-R7RELOAD.1-1` OPEN (→250); ADR-134 accepted; BUILD_INDEX row 270; LEDGER CURRENT STATE + PHASE LOG advanced (`lastCompleted: R7RELOAD.1`, `nextTicket: 232_R7TALK.1a`, chainTip `stevevitali/r7reload-1-forms`)
- Carries to 232: chat forms remain native (outside `SPA_WRITE`) — 232 replaces them with fetch mutations and appends the chat-send segment to `U2.noreload`'s walk
- CI: pending at PR-open; ci-boundary read recorded at head
