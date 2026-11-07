# R7FIX.2 (250b) — run ledger: owner fixes for the R7DEP.2 defect boundary, round 2

Harness: devin-desktop/swe-2-high/subagent

- **Insert:** 250b of 254 (`250b_R7FIX.2__defect-round-2.md`) — 250_R7DEP.2's defect path, round 2.
- **Branch:** `stevevitali/r7fix-2-defect-round-2` on `stevevitali/r7dep-2-t1-prod`
  (`77ec93dd` at setup — the composed tip the preview serves). PR stacks on 250's Part-B
  records branch; **unmerged (mergePolicy: OPERATOR)**.
- **Stage:** A only — source fixes + local build/typecheck/lint/unit + the failing legs' local
  arms. **No preview mutation, no re-walk of `pr-293`** — the deployed proof is 250's own T1b
  re-walk (`D-R7FIX.2-1`). **Spend $0.**
- **Changed lines:** ~120 across 9 files (inside the ~200–400 bound).

## Findings → root cause → fix → local verdict

| F | Root cause | Fix | Local arm verdict |
|---|---|---|---|
| F-1 residual (`R8.showcase.spa` — `.ui-d-l` "Clear" invisible; `U2.noreload` evolved — `/p/untitled/review/` absent) | Two halves. (a) The dossier's first DOM-order `/review/` anchor stayed the FindingsDesk "Clear" filter link inside the closed `display:none` `.ide-panel` — the sidebar Reviews item only wins `.first()` when it carries a `/review/` href, and its `latestReviewRunId` read the `listProjects` correspondence join ONLY; where that join can't see the dossier (the showcase's delivered record lives in the `getLatestReview` seam the overview's `ide.latestReview` uses — reproduced live on the local demo: every `/review/` anchor `inPanel`, zero in the sidebar), the item fell back to `/p/:slug` and the hidden Clear link won for the whole 30 s retry window. (b) `U2`'s walk target: the first `data-shell-recent` was `untitled` — the abandoned scratch project T0's U5 created before its focus assert threw; a project with no delivered review can never mount a `/review/` link — the hop's substrate was the wrong row, not a missing element. | (a) `GET /bff/p/:slug?view=tree` now resolves `getLatestReview` in parallel with `getFiles` and stamps `project.latestReviewRunId = row.latestReviewRunId ?? latestReview.runId` — the delivered-record seam fills whatever the list join misses (the sidebar item then carries `/p/:slug/review/:runId`, DOM-order before the panel, visible+actionable). (b) `U2.noreload` prefers `[data-shell-recent="showcase"]` (the guaranteed-reviewed row) over the bare `.first()` — a union `.first()` is DOM-order, so the preference is an explicit two-locator pick, recorded in-line. | Web sweep **1667/1667**, journeys **228/228** (`noreload.local`, `demo-legs.local`, `u4-controls.local`, `u3-occlusion.local` green). The demo twin still emits `latestReviewRunId: null` — `demoDataSource` has no `getLatestReview` seam; the recorded demo gap stands (corpus owners). Deployed proof = T1b re-walk. |
| F-3 residual (`U5.write` — inline title still unfocused) | The post-mount + RAF re-assert lost to a LATER claimer: the route-settle commit (`isLoading`→false re-stamps `data-mounted`) lands after the mount frame, and its `HeadManager` h1-focus arm (REQ-COPY-7) ran after the leaf's `autoFocus`+RAF — identical symptom at both SHAs because the steal is in the settle effect, not the mount. | Two honest arms: (1) `head.tsx` — the generic h1 route-focus yields when the leaf mounts `[data-inline-title]` (REQ-HOME-3's leaf-declared entry focus: the blank Page's title IS the focus target). (2) `editor.tsx` — the re-assert also watches `data-mounted` via MutationObserver (one settle-time re-assert + one RAF, then disconnects) — covers ANY post-frame claimer, not just the h1 arm. | Both halves verified structurally; the deployed read is T1b. Web/journeys sweeps green. |
| F-5 evolved (`U1.shell` — `/p/untitled/outline` loses the Project › Surface crumb) | `OutlineSurface`'s `{outline:null}` (designed no-outline arm — the normal state for a fresh project with no outline artifact) rendered `PageHeader` WITHOUT `crumbs`, unlike the data arm. | `OutlineSurface` takes the route's `slug` param and the `!data` arm emits `[{slug → /p/:slug}, {heading}]`; the same gap fixed pre-emptively on `FiguresSurface` (`!data` arm) and `ProjectSettingsBody`'s unavailable arm (`routeSlug` prop — `slug` was already bound inside) so the U1 four-leaf walk can't trip the next null-arm. | `outline.dom.test`/`figures.dom.test` unaffected; sweeps green; T1b is the deployed proof. |
| F-6 new (`U4.controls` — `data-ide-panel-tab="chat"` counted native on `/p/untitled`) | A SECOND `data-ide-panel-tab="chat"` emitter: `page-chrome.tsx`'s empty-Page affordance row (`data-empty-page-actions`, `emptyHead` projects only) carried a RAW `<button>` with inline `background:none;border:none` + accent color — no `ui-*` class — that faked the quiet-link look; while the real tab was disabled the raw one was the chat entry, and F-2's fix exposed it to U4's census. | Replaced the raw `<button>` with the `Button` primitive (`variant="ghost" size="sm"`, `data-ide-panel-tab="chat"` kept — the controller's delegated arm still claims the click). Primitive semantics, never re-disabled, no exemption needed. | `u4-controls.local.test.ts` green; GUARD-1 lint clean; `check:dom-contract`/`spa-*` green. |
| F-7 new (`hero-capture` recipe — exit 2, zero artifacts + GFE-intercepted provenance) | (a) `context.cookies()` was called AFTER `context.close()` in `finally` — `browserContext.cookies: Target closed` crashed deterministically post-walk. (b) `fetch(${web}/healthz)` — bare `/healthz` is GFE-intercepted on `*.run.app`; the app serves `/healthz/` (T1 needed a localhost 307 normalizer — a workaround, not a fix). | (a) The post-walk cookie jar is read INSIDE the `try` before the `finally` closes the context. (b) Provenance fetches `/healthz/` first, `/healthz` as fallback. | `hero-capture.test.ts` 9/9 green; a local run's `/healthz/` route verified live (200 + gitSha). |

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — green (fresh; tsc -b included).
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/journeys` — 0 errors.
- `pnpm exec vitest run apps/web/src` — **1667/1667**.
- `pnpm exec vitest run packages/journeys/src` — **228/228** (all local leg arms green).
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK. `check:spa-budget` — OK, all ceilings held; WARN: cumulative entry delta vs `04a4e98b` exceeds the ≤15 kB per-ticket allowance — the standing pre-existing deficit (GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7); this ticket's increment is ≈ +0.1 kB.
- No selector added/removed (`data-inline-title`/`data-ide-panel-tab`/`data-page-breadcrumb`/`data-shell-recent` vocabulary unchanged); no paid leg; spend **$0**.

## Judgement calls

- **U2 walks the Showcase when present** — the leg's dossier hop needs a delivered review; a fresher scratch leftover (`untitled`, minted by T0's failed U5) is the wrong substrate, not a defect. Honest preference, recorded in the leg; the one-document invariant is unchanged.
- **F-3 keeps both arms** — the h1-focus yield is the semantic fix (REQ-HOME-3 owns entry focus on `?created=scratch`); the `data-mounted` observer is the belt for any post-settle claimer the h1 arm wasn't (neither alone is provably sufficient offline — the preview is the judge at T1b).
- **Demo `latestReviewRunId` stays null** — `demoDataSource` never implemented `getLatestReview`; extending it is corpus-owner work, recorded, not patched through.

## Explicitly NOT proven here

No preview or production behavior was verified — `pr-293` is 250's owned stack and was neither
updated nor re-walked. Deployed evidence for all five findings arrives at 250's T1b re-walk
(`D-R7FIX.2-1`).
