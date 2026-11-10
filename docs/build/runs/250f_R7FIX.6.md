# R7FIX.6 (250f) — run ledger: owner fix for the R7DEP.2 defect boundary, round 6

Harness: devin-desktop/swe-2-high/subagent

- **Insert:** 250f of 254 (`250f_R7FIX.6__defect-round-6.md`) — 250_R7DEP.2's defect path,
  round 6; the T1e re-walk at `5d001e6b` greened 15/16 legs and left ONE evolved layer on U5.
- **Branch:** `stevevitali/r7fix-6-defect-round-6` on `stevevitali/r7dep-2-t1-prod`
  (`16145732` at setup). PR stacks on 250's Part-B records branch; **unmerged
  (mergePolicy: OPERATOR)**.
- **Stage:** A only — one surface fix + one surfaced primitive fix + a regression test, local
  build/typecheck/lint/unit sweeps. **No preview mutation, no re-walk of `pr-293`** — the
  deployed proof is 250's own T1f re-walk (`D-R7FIX.6-1`). **Spend $0.**
- **Changed lines:** ~60 across 3 files — `apps/web/src/spa/surfaces/editor.tsx` (the defect),
  `packages/ui/src/primitives/toast.tsx` (the aria-allowed-role the new provider surfaced),
  `apps/web/src/spa/editor.dom.test.tsx` (regression test). No new selectors (declared
  vocabulary only).

## The one finding — diagnosis → fix → local verdict

| Leg | Diagnosis | Fix | Local arm verdict |
|---|---|---|---|
| `U5.write` (F-R7DEP.2-3 evolved — deepest layer; title-focus ✓, pointer-drag bubble ✓, composer-survives ✓, `[data-comment-submit]` clicked, `[data-comment-card]` never mounted — 30 s) | **Real surface defect (REQ-WRITE-2) — hypothesis 1's honest variant: the POST succeeds; the twin never refetches.** Of the three live hypotheses: (2) the card's emitted hook IS `data-comment-card` verbatim (`surfaces/editor.tsx` margin map — the leg-pin is correct) and (3) the anchored selection is irrelevant here — `rhema:comment-submit` → PageMount's `onCommentSubmit` → `POST /p/:slug/edit/:draftId/note` → `mutationOutcome` 200 → `rhema:comment-added` all run leaf-agnostically, and a collapsed selection still yields a valid anchor. The break is downstream: `rhema:comment-added` → `EditorEventBridge.onCommentAdded` → `invalidateQueries(["bff","p",slug])` is the ONLY read-back seam, and the bridge was mounted **only** in `VersionPageSurface` (`/p/:slug/v/:v`) — never in `ProjectPageSurface` (`/p/:slug`). U5's scratch create lands `/p/<slug>?created=scratch` (the `/app/new` `beforeLoad` → `POST {entry:'scratch'}` → in-router redirect), i.e. `ProjectPageSurface`. Its PageMount POSTs the anchored note identically and its `useCommentMargin` publishes the cards identically — but with no listener the event fell on the floor, `page.doc.comments` stayed empty, and the card could never mount. R7WRITE.1b deliberately added `useCommentMargin` to this leaf ("…on the working head too") and simply missed the bridge half. | `ProjectPageSurface`'s return is wrapped in `ToastProvider` (the bridge's `useToast` throws outside one; `VersionPageSurface`'s structure verbatim) and mounts `<EditorEventBridge slug={slug} />`. Both bridge arms land: `rhema:comment-added` → the project-twin refetch → `data-comment-card`; `rhema:fork-toast` → the REQ-WRITE-7 Undo toast, which was absent on the working-head Page too (the collab wire can frozen-fork there identically — same missing-listener class, fixed for free). | `editor.dom.test.tsx` **32/32** incl. the new regression test — `/p/:slug` mounted through the production router, `rhema:comment-added` dispatched, the refetch's comment-bearing twin renders `[data-comment-card="g_1"]` keyed `data-anchor-block="b_1"`. Pre-fix the same test fails (no listener → no refetch). T1f is the deployed proof. |

## The surfaced primitive wart — `toast.tsx` `aria-allowed-role`

Mounting `ToastProvider` on `/p/:slug` put its viewport inside that leaf's existing component-axe
leg, which flagged `aria-allowed-role` (1 node): the viewport emitted `<ul role="region">` and its
rows `<li role="status">` — `region` is not an allowed role on `ul`, `status` not on `li` (a real
ARIA violation, latent on `/v/:n` today — that leaf has no axe leg so it never surfaced). Honest
fix, not a check-weakening: the viewport and rows are now `<div>`s carrying the identical classes
(`ui-toast-viewport`, `ui-toast`, `ui-toast--*`) and the identical roles — `region`/`status` are
live-area roles legal on `div`. Every consumer selector (`.ui-toast-viewport [role='status']`
in U7's toast arm; all `.ui-toast*` CSS — class-keyed) is unchanged. The axe leg is green again.

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --force` — 13/13 fresh (Vite bundle incl.).
- `pnpm --filter @rhema/web typecheck` / `@rhema/ui typecheck` / `@rhema/journeys typecheck` — clean.
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/ui --filter=@rhema/journeys` — 0 errors.
- `pnpm exec vitest run apps/web/src` — **1669/1669** (the new `/p/:slug` comment-card
  regression test included).
- `pnpm exec vitest run packages/journeys/src` — **228/228** (all local leg arms green:
  noreload, u3-occlusion hardened probe, demo-legs, demo-hub, demo-side-effects,
  demo-readonly, u4-controls, hero-capture).
- `pnpm exec vitest run packages/ui/src` — **178/178** (toast primitives included).
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` /
  `check:no-cookies` — OK.
- `pnpm check:spa-budget` — OK, all ceilings held; WARN: cumulative entry delta vs
  `04a4e98b` **+33.3 kB** — the standing pre-existing deficit (GD-KIT3A-BUDGET /
  GD-SPA-ENTRY.R7); this ticket's increment is ≈ 0 kB (a JSX wrapper, two tag swaps).
- No new selectors (declared vocabulary: `data-comment-card`, `data-anchor-block`,
  `data-fork-undo`); no paid leg; spend **$0**.
- The demo-side-effects walk manifests + report screenshots the local sweeps regenerate
  were reverted — this ticket's diff is the three source files only (the 250c/250d/250e
  convention).
- Note: `pnpm format` (`prettier --check`) is NOT a CI gate and these committed files
  already carried pre-existing non-conformance; a repo-wide `--write` would add hundreds
  of lines of unrelated churn — deliberately not run (the diff stays surgical, ~60 lines).

## Judgement calls

- **The bridge, not a leg re-pin.** Hypothesis 2 (hook mismatch) fails on inspection — the
  margin card emits `data-comment-card`/`data-anchor-block` verbatim and the contract names
  both. Hypothesis 3 (lost selection) can't produce this symptom — the submit path dispatches
  `rhema:comment-submit` before any anchor work, and even a collapsed selection yields a
  storeable anchor; the card's absence would still need the read-back to fail. The verified
  break is the missing listener on `/p/:slug` — a write-path defect, fixed surface-side.
- **ToastProvider wraps the leaf, not just the bridge.** `VersionPageSurface` wraps its whole
  return for the same reason — the provider is leaf furniture (the fork toast's Undo needs it,
  and future leaf toasts inherit it). `viewportLabel={slug}` mirrors the version leaf's
  `data.page.slug` (the project twin's `page` is optional — the missing-head arm — so the
  project slug is the truthful label there).
- **The primitive fix rides along (it is small, real, and now surfaced).** The alternative —
  mounting the bridge without its toast arm — would weaken REQ-WRITE-7's Undo on the
  working-head Page, where the frozen-fork flow applies identically. Fixing the disallowed
  roles keeps every emitted hook and repairs a violation that exists on `/v/:n` today.
- **Read-only leaves need no bridge.** The artifact/compare/revision Pages mount no composer
  (comments withhold by design); `/p/:slug` and `/p/:slug/v/:v` are the two editable leaves —
  both now carry the seam.

## Explicitly NOT proven here

No preview or production behavior was verified — `pr-293` is 250's owned stack and was
neither updated nor re-walked. The local proof is the mounted-leaf regression test (the real
router + chrome + QueryClient, the exact seam that was missing), not a deployed surface.
Deployed evidence for U5.write arrives at 250's T1f re-walk (`D-R7FIX.6-1`).
