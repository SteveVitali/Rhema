# R7RO.1 — ReadOnlyProject{reason} + the Showcase in the SPA

- **Spec:** `docs/tickets/211_R7RO.1__read-only-project-mode.md` (seq 211 of 254; manifest row 211)
- **Base:** `stevevitali/r7kit-1-control-base` @ `3a5414c` (chainTip; stack rides unmerged PRs, OPERATOR)
- **Branch:** `stevevitali/r7ro-1-read-only`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-03T19:39Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Size budget ~550 changed lines excl. route tree + fixtures — if census exceeds, STOP + report.
- **Closed:** —

## Deferrals read

- `D-R7OPEN.1-1` OPEN — 14 R7 legs incl `R8.showcase.spa` report `owed`, flip at 224/250. This ticket implements the R8.showcase.spa body but keeps `expected:"red"` (nightly hazard — prod serves pre-R7a until 224). Row stays OPEN.
- `D-R7KIT.1-1` OPEN — Stage B at 224; unaffected.
- `D-FIX.1-2` OPEN — real-UA phone; unaffected under the default phone decision (phone arm kept).
- `D-R6CNT.2-1` OPEN — not closable here (per ticket).
- Must OPEN `D-R7RO.1-1` — Stage-B walk + `R8.showcase.spa` flip at 224.

## Requirements

1. `ReadOnlyProject{reason:"demo"|"showcase"|"run_lock"}` shared type in `@rhema/contracts`; carried in Page-family twins (showcase, run_lock) + boot (demo slot consumed by 220); accessor `useReadOnlyProject()` + non-React read, derived once. Frozen versions NOT read-only (S-3/RV-19). (REQ-DWEB-14)
2. Write-control census (R3 §4 rows 14–17 + finds): every affordance hidden/disabled BEFORE any request, reason tooltip; committed as a test table; `run_lock` keeps Cancel-run. Build on `compact` lever. (REQ-DWEB-14) [C2]
3. One notice per reason, page header area, COPY leaves: demo = spec sentence (HUMAN-H15 signs later); showcase = existing banner copy + styled primary Duplicate [C10]; run_lock = reuse lock banner.
4. Showcase in SPA: remove `row.showcase` arm from 5 forced-SSR predicates + `twinForcesSsr` handoff; showcase twins carry `readOnly:true`, no collabWsUrl, `ReadOnlyProject{showcase}`; `data-renderer`/`data-route` truthful; phone-UA verdict unchanged; honest renderer tests. (REQ-RELOAD-5) [C1, UXC-6]
5. DOM tests: read-only SPA overview/version Page not editable, PM refuses input; request recorder zero non-GET across census clicks under showcase.
6. `R8.showcase.spa` body implemented (signed-in `/showcase` → workspace Showcase `data-renderer="spa"`, notice visible, in-app hops `settleClientNav`); stays `expected:"red"`; record `ready-to-flip` w/ local result or state no local target. `R8.showcase` stays green.
7. ADR-128 REQ-ED-12 item filled (Showcase Pages render SPA read-only) + dated banner on REQ-ED-12's owning spec section; fix `apps/web/AGENTS.md` §Architecture verdict line.

## Acceptance criteria (spec §AC)

- [ ] Type in contracts, carriers, frozen≠read-only, unit tests (engineered)
- [ ] Census test table green; tooltips; run_lock keeps Cancel (fixture-verified)
- [ ] One notice/reason w/ COPY leaf; showcase styled Duplicate (fixture-verified)
- [ ] Showcase Page served as SPA shell desktop; not editable; zero non-GET; phone verdict unchanged; P1.*/N10 untouched green (fixture-verified)
- [ ] R8.showcase.spa body wired; still red at head; ready-to-flip w/ local result or honest no-target (engineered)
- [ ] Stage B deferred → `D-R7RO.1-1` opened (staging-verified at 224)
- [ ] Universal phase-gate AC (agentic)

## Key code findings (anchors confirmed)

- **5 forced-SSR predicates** `isPhoneRequest(c) || row.showcase === true`: server.ts L3950 (`/p/:p` overview), L5448 (`/p/:p/revisions/:cid`), L5527 (`/p/:p/v/:v`), L5639 (`/p/:p/v/:n/diff/:m`), L5702 (`/p/:p/a/:artifactId`). Each else-arm → `spaShellDocument`. Remove `|| row.showcase === true`; `ssrCause` becomes `"phone"` only.
- **5 Page-family twins** ~L5257–5436 (`/bff/p/:slug`, `/v/:v`, `/v/:n/diff/:m`, `/a/:artifactId`, `/revisions/:cid`): emit `project.showcase:true`; `page.readOnly`/`collabWsUrl` gated on `phone || row.showcase` (KEEP — showcase stays readOnly+no collab in twin). Add `project.readOnlyProject`: showcase → `{reason:"showcase"}`; the two doc twins add `{reason:"run_lock"}` when `pageLoad.doc.lock != null`.
- `states.tsx` L68 `twinForcesSsr` (showcase → SsrHandoff); called by the 5 leaves (`p.$project.index.tsx` L70, `p.$project.v.$v.tsx` L64, `p.$project.v.$n.diff.$m.tsx` L52, `p.$project.revisions.$cid.tsx` L43, `p.$project.a.$artifactId.tsx` L44). `renderer-overrides.test.ts` L99/103 pins it — update honestly.
- `spa-boot.ts` SpaBoot (add `readOnlyProject?: ReadOnlyProject`); `boot.ts` `readSpaBoot` decodes + `getSpaBoot`/`setSpaBoot` singleton.
- `surfaces/editor.tsx`: EDITOR_WRITE L76; PageHost readOnly=`page.readOnly||compact` L333; leaves L411/501/548/581/626; `useEditorChrome` L355 (timeline gate card + chat publish).
- `page-chrome.tsx` `ProjectOverviewBody` L371: rename form L425, next-step L442, ide-actions links L470–486 (import/run/export/edit-source — C2: hide under RO), PageChrome L487, Needs-you gate rows L499–538, approval settings/opt-in L543–563, voice picker+hatches L569–641, DecisionsList L642. `compact` lever precedent.
- `dossier-view.tsx`: `findingControlsFor` L488 (apply L505 compact-withheld; dispositions L516; add-obligation L529); `dossierBulkActions` L545; `dossierSurfaces` L580 (bulk withheld `compact` L645); `DossierArticle` L662 `data-showcase-banner` L716–737 + `data-duplicate-form` L731 (STAYS under showcase — the sanctioned write; C10 → styled primary button).
- `dossier.tsx` DOSSIER_WRITE L79; `TimelineGateCard` L266; `DossierSurface` L304.
- `run-report.tsx` RUN_REPORT_WRITE L63; refund form `data-refund-form` L255.
- `packages/ui/src/page-editor.tsx`: `readOnly = props.readOnly || locked` L334; lock banner L383–395 (DS §5.4 = run_lock notice, reused); readonly banner L396–400; proposal accept/reject buttons L415–432 (hide when readOnly/locked); note form L512 gated `!props.readOnly` (stays under run_lock — DS §5.4 "comments are allowed and become Guidance").
- `page-mount.tsx`: editable formula L174 `!locked && !(hostReadOnly && collabUrl==="")`; `/doc` poll L454–470 (GET only — fine for recorder); ⌘S mint L498 — `wire` null under RO → "syncing" lie → add `if (!wire) return`.
- copy.ts: `COPY.dossier.readOnlyNote` L308; `COPY.editor.readOnlyNote` "This version is read-only." ~L928; lock copy L903–905; `COPY.showcase.bannerTitle/bannerBody/duplicateCta` ~L2324–2326.
- Locks: `HOLDING_STATES` incl `waiting_gate` → gate/decision/note/chat/Cancel must stay under run_lock or a gate-wait deadlocks; run_lock census = doc-write family only (typing already locked, proposal accept, restore apply, revise). RECORDED DECISION.
- Journeys: `R8.showcase.spa` registry.ts L849–856 (red, owner R7RO.1); owed stub in r7legs.ts L41 + L68 map; real body goes in steps.ts near `R8_SHOWCASE` L2435; `P1_DOSSIER` L2061 uses iPhone UA context + classifies `data-ssr-cause="phone"`/`data-device="phone"` — unchanged by keeping phone arm. `settleClientNav(page, ctx, act, {route})`.
- ADR-128 shell drafted by R7OPEN.1 in docs/adr; REQ-ED-12 banner goes on the owning spec section (find REQ-ED-12 in docs/rhema-design-spec.md or spec docs).
- `apps/web/AGENTS.md` §Architecture L15 verdict → phone-only.

## Plan

1. contracts `src/read-only-project.ts` (reasons, type, validator) + index export + tests.
2. boot carrier: `SpaBoot.readOnlyProject` + decode; `spa/read-only.ts` accessor (`readOnlyProjectFor(boot,twin)`, `useReadOnlyProject(twin)`, `readOnlyProjectNow(twin)`).
3. server.ts: 5 predicates → phone-only; twins emit `readOnlyProject`; shell stamps boot slot for showcase rows.
4. states.tsx + 5 leaves drop twinForcesSsr; renderer test honest.
5. Withholding via `readOnly` prop beside `compact`: overview (rename/actions/gates-decide/approval/voice/decisions/proposals/restore/revise/note per reason), dossier (apply/dispositions/obligations/bulk; duplicate stays), run-report refund, chat composer, compare/revision comment forms. `if (!wire) return` ⌘S fix.
6. `ReadOnlyNotice` per reason (COPY leaves; showcase = banner copy + styled primary Duplicate; run_lock = existing lock banner).
7. Census DOM test table + zero-non-GET request recorder test under showcase.
8. `R8.showcase.spa` body in steps.ts (+ registry row unchanged red); try local target.
9. ADR-128 item + REQ-ED-12 banner + AGENTS.md verdict fix.
10. Records: this ledger, pr/R7RO.1.md, BUILD_INDEX row 243, LEDGER advance (lastCompleted R7RO.1, nextTicket 212_R7FIX.1, chainTip), D-R7RO.1-1, ci-boundary read.

## Test matrix

| AC | Test |
|---|---|
| type/carriers | contracts unit test (validator reasons, frozen≠RO); boot decode test; twin emits readOnlyProject (server test) |
| census | dom test table: per reason, each affordance selector hidden-or-disabled+tooltip(title); run_lock Cancel enabled |
| notice | dom: notice text per reason; showcase Duplicate button styled (non-native class/style) |
| SPA showcase | request-recorder test: click census affordances → 0 non-GET; server test: doc GET → shell for showcase row; twin readOnly+no collab |
| run_lock | dom: lock banner = notice, note form stays, doc-writes withheld |
| journey | R8.showcase.spa body exercised vs local target if one can host it |

## Progress

- Phase 0 done: branch cut @3a5414c; DEFERRALS read; Load docs read; anchors confirmed.
- Contracts: `src/read-only-project.ts` (READ_ONLY_REASONS, ReadOnlyProject, readOnlyProjectOf) + index export + test; builds green.
- Boot: `SpaBoot.readOnlyProject` added (spa-boot.ts); `readSpaBoot` decodes via readOnlyProjectOf; `spaBootPayload`/`spaShellDocument` accept + stamp the slot.
- Accessor: `apps/web/src/spa/read-only.tsx` — readOnlyProjectFor(boot,twin) [twin wins], useReadOnlyProject, readOnlyProjectNow, readOnlyReasonText, <ReadOnlyNotice> (demo sentence / showcase banner+styled Duplicate / run_lock→null=lock banner).
- COPY: `COPY.readOnly.{demoNotice, reason.{demo,showcase,run_lock}}` added (~L2335).
- server.ts: all 5 forced-SSR predicates → `isPhoneRequest(c)` only (L3950/5469/5548/5660+/5729+); ssrCause "phone" everywhere; shell arms stamp `readOnlyProject:{showcase}` for showcase rows on all 5 Page-family doc GETs; all 5 Page-family twins emit `project.readOnlyProject` (showcase→reason; the 2 doc twins add run_lock when doc.lock != null); dossier + run-report twins emit `project.readOnlyProject` (showcase only).
- states.tsx: twinForcesSsr deleted + 5 leaves updated (imports + call sites + stale comments); queries.ts twin types carry `readOnlyProject?: ReadOnlyProject | null` (7 sites) + type import.
- Withholding: PageChrome `readOnlyReason` prop → rail restore apply (VersionRail restoreAction optional + disabledTitle) + PageEditor (withholdWrites: proposals + revise disabled w/ tooltip); PageEditor gets `readOnlyReason`/`readOnlyTooltip` props; ProjectOverviewBody `readOnly` prop → withhold = demo|showcase → rename/ide-actions/approval/voice hidden, gate cards wrapped in disabled fieldset w/ tooltip (gateCardFor opts.readOnlyTitle), DecisionsList disabledTitle prop (buttons type=button+disabled+title); dossier-view findingControlsFor `opts.readOnly` (text+tooltip replaces controls) + bulk withheld + DossierArticle showcase banner now data-readonly-notice="showcase" + styled primary data-readonly-duplicate button.
- run_lock semantics DECISION: withhold doc-write family only (typing already locked, proposals, restore, revise); keep run-lifecycle (gates/decisions/note/chat/cancel — waiting_gate holds its lock; withholding deadlocks) per DS §5.4 "comments are allowed and become Guidance".
- DONE: DossierSurface (ro via useReadOnlyProject; dossierSurfaces readOnly=roTip for demo|showcase; TimelineGateCard readOnlyTitle; demo notice; showcase notice = DossierArticle banner), run-report refund gate + notice + chrome roTip, chat-pane composer (readOnlyTitle → disabled fieldset), obligation-new twin carries readOnlyProject + form withheld, all 5 editor leaves wired (useReadOnlyProject + ReadOnlyNotice + readOnly/readOnlyReason props), readOnlyProjectFor boot-slot SLUG-SCOPED (boot is doc-level; in-app hops to other projects never inherit), beforeLoad handoff POST skipped under RO via route-slug scope, page-mount `if (!wire) return`, dom-contract rows for data-readonly-notice/duplicate/controls.
- renderer-overrides.test.ts rewritten: phone-only predicate pins (1 forcedSsr + 4 inline), twinForcesSsr gone, carrier counts (13 readOnlyProject emits, 13 showcase, 2 run_lock).
- server.test.ts: SHOWCASE→PHONE fixture arm updates (PHONE = sec-ch-ua-mobile:?1; 9 request sites) + SPACAP.3→R7RO.1 asserts (readOnlyProject showcase/run_lock/null; frozen≠RO). 117 tests pass.
- read-only.dom.test.tsx: 20 tests (carrier derive, boot decode, notices ×3, census: gate fieldset/decisions/proposals/revise/rail-apply/finding-controls, zero-non-GET recorder, 8 source pins). PASS.
- DONE (this session): `R8.showcase.spa` real body in `r7legs.ts` (signed-in `/showcase` → workspace Showcase `data-renderer="spa"`, `data-readonly-notice='showcase'` mounts, dossier hop + back via `settleClientNav`, `assertBundleParity`, screenshot) — `expected:"red"` stays (nightly hazard; 224 flips); registry.test.ts/runner.test.ts updated honestly (body is no owed-stub; offline still classifies `owed` by red-step rule).
- DONE: ADR-128 REQ-ED-12 item filled; dated banner on the owning spec section (`frontend-spa-spec.md` §14.8); `apps/web/AGENTS.md` §Architecture verdict → phone-only.
- DONE: `pnpm turbo build lint typecheck` 135/135; `pnpm exec vitest run apps/web/src` 66 files/1348 tests green; contracts/ui/journeys suites green; check:dom-contract/spa-env/spa-budget/no-cookies/protocol-markers green. `pnpm format` = pre-existing repo-wide drift at base (not a CI gate).
- DONE (test-arm migration, this session's gap closure): the showcase-arm deletion left NO desktop-shaped SSR path — the surviving forced-SSR arm is the §10.1-compact phone variant. Six surface test files' SSR render asserts were migrated honestly: phone legs assert the compact truth (rail/compare/voice-picker/approval-settings/chat-tier withheld; gate cards/decisions/approval rows mount compact), and the desktop-shape coverage moved to direct renders of the SAME shared components (`VersionRail`, `ComparePage`+`PageDataContext`, `ProjectOverviewBody`, `chatPanel`) — never an assert weakened, several now removal-detecting against a resurrected rail/compare on phone.
- Local-target note (AC5): no local stack can host a signed-in Playwright walk — the leg needs running web+api+seeded session; Stage A's seam is the app.request/dom fixtures (zero-browser). The body is exercised at the 224 phase preview (D-R7RO.1-1).
- Size: ~1.5k changed lines total; ~660 non-test incl. docs. The census-withholding mechanism itself ≈270 lines — under the ~550 M-upper; the overage is the six-file test-arm migration the arm deletion forced (recorded; not stretched).

## Gap table

| item (spec §) | req layer | achieved | status | evidence |
|---|---|---|---|---|
| ReadOnlyProject type + carriers + frozen≠RO (deliv 1, AC1) | engineered | engineered | met | `contracts/src/read-only-project.ts`; `read-only-project.test.ts` (5); twins emit `project.readOnlyProject` (server.ts L5296-5305, L5372-5379, +4 sites); `SpaBoot.readOnlyProject` + `readSpaBoot` decode; `useReadOnlyProject`/`readOnlyProjectNow`/`readOnlyProjectFor` (spa/read-only.tsx) |
| Census: hidden/disabled before request + tooltip + table + Cancel under run_lock (deliv 2, AC2) | fixture-verified | fixture-verified | met | `read-only.dom.test.tsx` census table (gate fieldset/decisions/proposals/revise/rail-apply/finding-controls/bulk/obligation-form/refund/chat fieldset/ide-actions/rename); withholding in page-chrome.tsx L410-412 `withhold`, dossier-view `opts.readOnly`, run-report, chat-pane fieldset, decisions `disabledTitle`, version-rail `disabledTitle`; Cancel-run stays (lock banner family untouched by withhold) |
| One notice per reason + COPY leaves + styled Duplicate (deliv 3, AC3) | fixture-verified | fixture-verified | met | `<ReadOnlyNotice>` (spa/read-only.tsx); `COPY.readOnly.{demoNotice,reason.*}`; showcase = banner copy + `data-readonly-duplicate` styled primary; run_lock = existing lock banner (notice null by design); dom tests 74-103 |
| Showcase in SPA: 5 predicates → phone-only, twinForcesSsr gone, truthful stamps, phone verdict kept (deliv 4, AC4) | fixture-verified | fixture-verified | met | server.ts forced-SSR `isPhoneRequest(c)` ×5 + `ssrCause:"phone"`; `states.tsx` twinForcesSsr deleted + 5 leaves; `renderer-overrides.test.ts` rewritten (phone-only pins + carrier counts); `server.test.ts` PHONE arms; shell stamps boot `readOnlyProject` on showcase rows; dom: SPA showcase leaf mounts read-only (editor.dom.test.tsx R7RO.1 block, 573-660) |
| DOM: read-only SPA Page not editable + zero non-GET across census clicks (deliv 5, AC4/5) | fixture-verified | fixture-verified | met | `read-only.dom.test.tsx` request-recorder leg (clicks census affordances under showcase → 0 non-GET); PageHost readOnly → no collab wire; `if (!wire) return` ⌘S fix |
| R8.showcase.spa body wired; still red at head; ready-to-flip or honest no-target (deliv 6, AC5) | engineered | engineered | met | `r7legs.ts` R8_SHOWCASE_SPA body (gotoOk → /p/<slug>, `data-renderer="spa"`, notice, `settleClientNav` dossier hop + back, `assertBundleParity`); registry row `expected:"red"` unchanged; registry.test/runner.test special-cased; NO local target could host a signed-in walk — the 224 phase preview hosts it (D-R7RO.1-1) |
| ADR-128 REQ-ED-12 item + dated banner + AGENTS.md verdict (deliv 7) | engineered | engineered | met | `docs/adr/ADR-128…md` REQ-ED-12 section; `frontend-spa-spec.md` §14.8 "Amended (R7RO.1 … 2026-11-03)"; `apps/web/AGENTS.md` §Architecture phone-only verdict |
| Stage B + flip deferred → D-R7RO.1-1 (AC6) | staging-verified at 224 | engineered | met-engineered(D-R7RO.1-1) | `docs/tickets/DEFERRALS.md` D-R7RO.1-1 (walk evidence + flip) |
| Out-of-scope honored (demo wiring 220/220a/221, phone island 247, header strip 237, 409 guards unchanged) | — | — | met | no `demoDataSource`/demo boot payload/demo guard added; api `showcase_read_only` 409 call sites untouched |
| Phone-UA showcase keeps phone verdict (Notes default) | — | — | met (decision: default arm) | only `row.showcase` arm removed; `P1.dossier` unchanged; recorded decision |

MET-DIFFERENTLY notes: (1) the `R8.showcase.spa` body lives in `r7legs.ts` beside the stub map the ticket's anchor suggested steps.ts — co-locating keeps every R7 leg's impl in one owner-mapped table; (2) `ReadOnlyNotice{run_lock}` returns null — the Page's existing §5.4 lock banner IS the notice (ticket's own "reuse" clause), so no second notice mounts; (3) `run_lock` withholds the doc-write family only (gates/decisions/note/chat/Cancel stay live — a waiting gate holds the lock; withholding deadlocks, DS §5.4 comments-become-Guidance).

## Evidence log

- `pnpm turbo build lint typecheck` — 135/135 tasks green.
- `pnpm exec vitest run apps/web/src` — 66 files / 1348 tests green (incl. `read-only.dom.test.tsx` 20, `server.test.ts` 117, `editor.dom.test.tsx` 23, migrated SSR-surface files).
- `vitest packages/contracts+ui+journeys` — green (registry.test.ts + runner.test.ts honest-arm updates).
- `pnpm check:dom-contract` / `check:spa-env` / `check:spa-budget` / `check:no-cookies` / `check:protocol-markers` — green (added `note` role + `data-readonly-*` hooks to the manifest).
- `pnpm test` (repo-wide vitest) — recorded at close (see Evidence report).
- `pnpm format` — pre-existing repo-wide red at BASE (1136 files incl. untouched; not a CI job).
- Live: no local target could host the journey leg (Stage A, $0) — recorded, D-R7RO.1-1 carries the 224 walk.

## Evidence report

See `docs/build/pr/R7RO.1.md` — the submitted PR body (AC → evidence table, verification summary, deferrals, deviations).
