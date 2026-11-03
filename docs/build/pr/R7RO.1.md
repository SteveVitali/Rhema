# R7RO.1 — ReadOnlyProject{reason} + the Showcase in the SPA

**Ticket:** `docs/tickets/211_R7RO.1__read-only-project-mode.md` (seq 211 of 254; manifest row 211)
**Requirements:** REQ-DWEB-14, REQ-RELOAD-5 · **Base:** `stevevitali/r7kit-1-control-base` (chainTip `3a5414c`; mergePolicy OPERATOR)
**Stage:** A only ($0) — unit/DOM/request-recorder tests + local builds; no preview (GD-PREVIEW.R7). Stage B + the `R8.showcase.spa` flip ride 224's phase preview via `D-R7RO.1-1`.

## Summary

One client read-only mechanism — `ReadOnlyProject{reason:"demo"|"showcase"|"run_lock"}` — carried in the Page-family JSON twins and the SPA boot payload, hiding/disabling every write control **before any request** with one notice per reason (server 409 guards stay defence-in-depth). The `row.showcase` arm is removed from all five forced-SSR predicates: a showcase row's document serves the SPA shell and its in-app hops are client navigations. Frozen versions are NOT read-only (S-3/RV-19 — typing forks v(N+1)).

## What changed

- `packages/contracts/src/read-only-project.ts` — `READ_ONLY_REASONS`, `ReadOnlyProject`, fail-closed `readOnlyProjectOf`.
- `apps/web/src/spa/read-only.tsx` — `readOnlyProjectFor(boot,twin,routeSlug)` (twin wins; boot slot slug-scoped), `useReadOnlyProject`, `readOnlyProjectNow`, `readOnlyReasonText`, `<ReadOnlyNotice>` (demo sentence / showcase banner + styled primary Duplicate / run_lock→null: the §5.4 lock banner IS the notice).
- `apps/web/src/server.ts` — all five Page-family forced-SSR predicates → `isPhoneRequest(c)` alone (`ssrCause:"phone"`); showcase rows' shell docs stamp `readOnlyProject:{showcase}` in boot; Page-family + dossier + run-report + obligation-new twins emit `project.readOnlyProject` (showcase, and `run_lock` when `doc.lock != null`).
- `states.tsx` + the 5 Page-family leaves — `twinForcesSsr`/`SsrHandoff` showcase arm deleted.
- Withholding (the `compact` lever's sibling, never a parallel prop): overview rename/ide-actions/gates-decide/approval/voice/decisions (`ProjectOverviewBody.readOnly`), `PageChrome.readOnlyReason` → rail restore-apply `disabledTitle` + `PageEditor` proposals/Revise, dossier finding controls + bulk (Duplicate stays — the sanctioned write), run-report refund, chat composer fieldset, obligation-new form, `if (!wire) return` ⌘S fix.
- `packages/journeys/src/r7legs.ts` — the real `R8.showcase.spa` body (`data-renderer="spa"`, notice mounts, `settleClientNav` dossier hop + back); registry row stays `expected:"red"` (nightly hazard — 224 is the sanctioned flipper).
- Docs: ADR-128's REQ-ED-12 item filled; dated banner on the owning spec section (`frontend-spa-spec.md` §14.8); `apps/web/AGENTS.md` §Architecture verdict → phone-only.

**run_lock decision (ticket-owned):** withholds the doc-write family only — gates/decisions/note/chat/Cancel-run stay live (a `waiting_gate` holds the lock; withholding would deadlock; DS §5.4 comments become Guidance).

## Test-arm migration (honest, removal-detecting)

Deleting the showcase arm left NO desktop-shaped SSR path — the surviving arm is the §10.1-compact phone variant. Six surface test files were migrated: phone legs assert the compact truth (rail/compare/voice-picker/approval-settings/chat-tier withheld; gate cards/decisions/approval rows still mount), and desktop-shape coverage moved to direct renders of the SAME shared components (`VersionRail`, `ComparePage`+`PageDataContext`, `ProjectOverviewBody`, `chatPanel`). No assert weakened; several are now removal-detecting against a resurrected arm.

## AC → evidence

| AC | layer req/achieved | verdict | evidence |
|---|---|---|---|
| ReadOnlyProject type, carriers, frozen≠RO, unit tests | engineered/engineered | met | `read-only-project.ts` + test (5); twin/boot emits+decodes; `read-only.dom.test.tsx` |
| Census table green; tooltips; run_lock keeps Cancel | fixture-verified | met | `read-only.dom.test.tsx` census table; `page.test.ts` lock banner + cancel-form asserts |
| One notice per reason + COPY leaf + styled Duplicate | fixture-verified | met | notice tests (demo verbatim, showcase banner+`data-readonly-duplicate` styled, run_lock→lock banner) |
| Showcase doc → SPA shell desktop; not editable; zero non-GET; phone verdict unchanged; P1.*/N10 untouched | fixture-verified | met | `server.test.ts` shell asserts; recorder leg (0 non-GET across census clicks); phone fixture arms green; registry untouched for P1.*/N10 |
| R8.showcase.spa body wired; red at head; ready-to-flip or honest no-target | engineered | met | `r7legs.ts` body; `expected:"red"`; **no local target could host it** (needs running web+api+session — Stage A is $0) → D-R7RO.1-1 |
| Stage B deferred → D-R7RO.1-1 | staging-verified at 224 | met-engineered(D-R7RO.1-1) | DEFERRALS row naming the walk evidence + flip |
| Universal phase-gate AC | agentic | met | this PR + `runs/R7RO.1.md`; BUILD_INDEX row; LEDGER advance; ci-boundary read at head |

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `vitest apps/web/src` — 66 files / 1,348 tests green (new: `read-only.dom.test.tsx` 20, `read-only-project.test.ts` 5).
- `vitest packages/{contracts,ui,journeys}` — green (registry/runner owed-stub pins updated honestly).
- `pnpm check:dom-contract` (`note` role + `data-readonly-*` hooks manifested) / `check:spa-env` / `check:spa-budget` / `check:no-cookies` / `check:protocol-markers` — green.
- `pnpm test` (repo-wide) — green per `runs/R7RO.1.md` evidence log.
- `pnpm format` — pre-existing repo-wide drift at base (not a CI job; unchanged files affected equally).
- Not run: the `R8.showcase.spa` leg live — no local target can host a signed-in walk ($0); rides 224's phase preview (D-R7RO.1-1).

## Deferrals / deviations

- **Opened:** `D-R7RO.1-1` (Stage-B walk + the `R8.showcase.spa` flip at 224). **Closed:** none (D-R7OPEN.1-1/D-R7KIT.1-1/D-FIX.1-2/D-R6CNT.2-1 read, unaffected).
- **MET-DIFFERENTLY:** leg body co-located in `r7legs.ts` (not steps.ts); `run_lock` notice = the existing §5.4 lock banner (ticket's "reuse" clause); `run_lock` census = doc-write family only.
- **Size note:** ~1.5k changed lines total, ~660 non-test — over the ~550 M-upper but the census-withholding mechanism itself is ~270 lines (the split trigger); the balance is the forced six-file test-arm migration + the journey body. Recorded, not stretched.
