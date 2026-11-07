# R7FIX.1 — run ledger: owner fixes for the R7DEP.2 Part-A defect boundary

- **Insert:** 250a of 254 (manifest row `250a_R7FIX.1`) — 250_R7DEP.2's defect path.
- **Branch:** `stevevitali/r7fix-1-defect-boundary` on `stevevitali/r7dep-2-phase-preview`
  (`d702872c` at setup). PR stacks on 250's branch; **unmerged (mergePolicy: OPERATOR)**.
- **Stage:** A only — source fixes + local build/typecheck/lint/unit + the failing legs' local
  arms. **No preview mutation, no re-walk of `pr-293`** — the deployed proof is 250's own T1
  re-walk (`D-R7FIX.1-2`). **Spend $0.**
- **Changed lines:** ~75 across 7 files (well inside the ~250–400 bound).

## Findings → root cause → fix → local verdict

| F | Root cause | Fix | Local arm verdict |
|---|---|---|---|
| F-R7DEP.2-1 (`R8.showcase.spa` GREEN→fail, `U2.noreload`) | Two compounding defects. (a) R7b moved every `/review/` anchor inside the right panel's tab bodies (`.ide-panel` is `display:none` while closed; inactive bodies `display:none`), so `a[href*="/review/"]`/`a[href^="/p/:slug/review/"]` `.first()` resolved only ever to hidden panel links (reproduced on the local demo: `.ide-panel` `display:none`, every review link `inBody:"timeline"/"findings"` invisible). (b) The visible dossier entry that already exists — the sidebar `data-project-item="reviews"` item — never resolved its run id: `latestReviewRunId` scanned `files.sections[].rows[].provenance.runId`/`workflow`, but `getFiles` rows carry `provenance:{actor}` only (verified against `/bff/p/demo~…?view=tree` — zero `runId` fields), so the item collapsed to its `/p/:slug` fallback and every `.first()` match stayed a hidden panel anchor. | (1) `GET /bff/p/:slug?view=tree` now stamps `project.latestReviewRunId` off the `listProjects` row (the same `latestReview?.run_id` the API already derives — `server.ts`). (2) `ProjectSection`'s `latestReviewRunId` prefers the twin's row fact, then the provenance scan (`advancedRows` included — a dossier is advanced-shaped when the sources aren't). Result: the sidebar Reviews item carries `/p/:slug/review/:runId` — DOM-order before `.ide-panel` — so the legs' `.first()` resolves to a visible, actionable anchor. | `data-project-item="reviews"` mounts with the dossier href off the twin's row fact on the workspace path; on the demo twin the snapshot rows carry no `latestReviewRunId` → the item keeps its `/p/demo~…` fallback (honest fixture gap — no local leg asserts a demo reviews href). `demo-legs.local.test.ts` + full web/journeys suites green. T1 re-walk is the deployed proof. |
| F-R7DEP.2-2 (`U3.occlusion` — chat tab `not enabled` @1440×900) | `apps/web/src/spa/ide/chrome.tsx` passed `demo: true` to `IdeShell` on EVERY SPA document: `demo` is a boolean (`boot?.demo != null`), so `demo != null` was `true` for authenticated tenants too, and `IdeShell`'s demo gate rendered `[data-ide-panel-tab="chat"]` `hidden + disabled` on workspace leaves — the §10.1 REQ-DWEB-7 gate misfired beyond demo. The `hidden` attr alone did not visually hide the button (`.ui-btn` display overrides the UA `[hidden]` rule) so it presented as visible-but-disabled — exactly the reported "not enabled". | `chrome.tsx`: `{...(demo ? { demo: true } : {})}` — gate on the flag's VALUE, not its presence. The demo gate itself is untouched. | `u3-occlusion.local.test.ts` green (3/3 — five sizes vs a local `demoDataSource` server, incl. the GUARD-4 arms); the demo gate still gates on demo boots (probe: chat tab `hidden+disabled` on `/demo/*` only). |
| F-R7DEP.2-3 (`U5.write` — inline title not focused; REQ-HOME-3) | `autoFocus` fires on the input's own mount only. On the SPA route the create-and-type commit mounts the title AND the editor (ProseMirror init) + the chrome publish in the same commit; the later mount cascade claims `document.activeElement`, so the title mounts focused and loses focus before the leg reads it. | `ProjectPageSurface` (`spa/surfaces/editor.tsx`) re-asserts focus on the `[data-inline-title]` input when `?created=scratch`: the parent-level `useEffect` runs after every descendant's mount effect, plus one `requestAnimationFrame` re-assert for a later claimer. `autoFocus` stays for the SSR/island path; `page-chrome.tsx` stays DOM-free (server tsconfig — first attempt there failed typecheck on `document`/`window`, so the effect lives in the SPA leaf). | Green — the effect re-asserts after the editor mount; U5's `document.activeElement === title` reads the title. T1 re-walk is the deployed proof. |
| F-R7DEP.2-4 (`U7.import` — Conversion notes don't name `title_extracted`) | `convertBytes` DOES emit the `title_extracted` warning (`The first heading "X" became the document title.` — `apps/convert/src/convert.ts`) and the preview renders it in `ConversionNotesCard` — but the card sat OUTSIDE `data-conversion-form`, and the leg reads its notes off `[data-conversion-form] section, [data-conversion-form]`: the union never covered the card, so the normalization text was unreachable by the declared hook. | `ConversionPreview` (`packages/ui/src/conversion.tsx`) renders `ConversionNotesCard` INSIDE `form[data-conversion-form]` (the create surface the hook names), wrapped in the existing `ui-c2-g3` flex class (the first attempt used an inline `gap` literal — caught by `rhema/no-raw-controls`). | `onboarding.dom.test.tsx` + `check:dom-contract` green; `form[data-conversion-form]` selector unchanged. |
| F-R7DEP.2-5 (`U1.shell` — "no recent project row to walk into") | **Leg-vs-fixture gap, diagnosed — not an app defect.** The seeded returning tenant's only project is the Showcase (`/app` 302s to its dossier — proof the row exists and `listProjects` returns it: the `?view=tree` project query resolves it too). The leg read `[data-shell-recent]` immediately after `[data-page-header]` — but `data-page-header` mounts on the LEAF's own twin while the recents ride the separate `/bff/app` twin (`projectHomeQuery`), which lands later; the immediate `count()===0` raced an unresolved query. The row was owed, not absent. | `r7legs.ts` `U1.shell`: both recents reads now `waitFor` the row (30 s, same bound as every other hook in the leg) — a genuinely empty list still fails on the timeout, so the assertion is unchanged. | Fixture-side verification: `/app` precedence 302 → dossier and `listProjects` returning the showcase row are pinned by `server.test.ts`/seed paths; the wait honors the async twin. If T1's re-walk still reports empty recents after the wait, it is a real `/bff/app` failure on showcase-only tenants and re-files as a new F-finding. |

## U3.stopgap disposition

`U3.stopgap` failed at T0 asserting the R7a-era `⌘J`/`[data-ide-desk-tab]` surface, which R7b
retired on purpose. It is **superseded by `U3.occlusion`** (the R7b occlusion leg of record —
`D-R7PANE.1-1`). The dated re-disposition is appended to `D-R7PANE.1-1` in
`docs/tickets/DEFERRALS.md`; the historical row and leg body are preserved untouched.

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — green (fresh build before checks).
- Typecheck via `tsc -b` in the same build — green.
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/ui --filter=@rhema/journeys` — 0 errors (one intermediate `gap` literal caught by `rhema/no-raw-controls` → `ui-c2-g3` class).
- `pnpm exec vitest run apps/web/src` — **1667/1667**.
- `pnpm exec vitest run packages/journeys/src` — **228/228** (incl. `u3-occlusion.local.test.ts`, `noreload.local.test.ts`, `demo-legs.local.test.ts`, `u4-controls.local.test.ts` — the failing arms' local counterparts, all green).
- `pnpm check:dom-contract` — OK (journey ⊆ manifest ⊆ emitted+asserted; `data-inline-title`/`data-conversion-form`/`data-shell-recent`/`data-ide-panel-tab` untouched).
- `pnpm check:spa-env` — OK. `pnpm check:protocol-markers` — OK.
- `pnpm check:spa-budget` — OK, all ceilings held; **WARN: entry delta +33.3 kB vs baseline `04a4e98b` over the ≤15 kB per-ticket allowance** — the cumulative deficit is pre-existing on the base branch (GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7 stand); this ticket adds ≈ +0.1 kB.
- No selector added/removed; no paid leg; spend **$0**.

## Judgement calls

- **F-1 fix shape** — chose the existing sidebar dossier affordance over adding a new visible
  link in the page body: the Reviews item is R7b's dossier entry of record; the defect was that
  it could never resolve a run id. No new selector, no leg change.
- **F-5 is a leg-mechanics fix, recorded honestly** — the app-side reads (`/app` 302 → dossier;
  `?view=tree` resolves the row) prove the row exists; the leg's immediate `count()` raced the
  async twin. If T1 still fails after the wait, it re-files as a real `/bff/app` defect.
- **Demo `latestReviewRunId` gap noted** — the demo `projects.json` snapshot carries no such
  field and the demo files tree emits `provenance:{actor}` only; the demo Reviews item keeps
  the `/p/demo~…` fallback. No local leg asserts otherwise; flagged for the corpus owners rather
  than patched through.
- **U3.stopgap re-disposition is records-only** — the leg body stays in the registry
  (`expected:"red"` its last recorded state; a superseded leg is never run to green).

## Explicitly NOT proven here

No preview or production behavior was verified by this ticket — `pr-293` is 250's owned stack and
was neither updated nor re-walked. Deployed evidence for all five findings arrives at 250's T1
re-walk (`D-R7FIX.1-2`).
