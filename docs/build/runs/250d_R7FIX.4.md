# R7FIX.4 (250d) — run ledger: owner fixes for the R7DEP.2 defect boundary, round 4

Harness: devin-desktop/swe-2-high/subagent

- **Insert:** 250d of 254 (`250d_R7FIX.4__defect-round-4.md`) — 250_R7DEP.2's defect path,
  round 4; the T1c re-walk at `d372de85` greened 13/15 legs and left two evolved layers.
- **Branch:** `stevevitali/r7fix-4-defect-round-4` on `stevevitali/r7dep-2-t1-prod`
  (`2ca958aa` at setup). PR stacks on 250's Part-B records branch; **unmerged
  (mergePolicy: OPERATOR)**.
- **Stage:** A only — leg-side fixes + local build/typecheck/lint/unit sweeps.
  **No preview mutation, no re-walk of `pr-293`** — the deployed proof is 250's own T1d
  re-walk (`D-R7FIX.4-1`). **Spend $0.**
- **Changed lines:** ~25 in `packages/journeys/src/r7legs.ts` (inside the ~50–200 bound).
  One file touched; zero surface code, zero new selectors.

## Findings → diagnosis → fix → local verdict

| Leg | Diagnosis | Fix | Local arm verdict |
|---|---|---|---|
| `U2.noreload` (F-R7DEP.2-1 evolved, chat-send layer) | **Leg-ordering bug — the surface is honest.** The leg's FIRST `chatTab.click()` ran before the `]` panel-open: the Chat tab lives inside the CLOSED right panel — it resolves in the DOM (`aria-selected`) but is legitimately invisible, so the unconditional click could never land (the T1c timeout). The prior code then pressed `]` and re-clicked with `.catch(() => undefined)` — the second arm was unreachable code behind a 30 s first-click timeout. | Re-ordered to the reader's real sequence inside `leg("chat-send")`: blur any field focus (`]` is a bare chrome chord — inert in `input`/`page`/`source` zones; the same arm U5 uses for `f`), if `.ide[data-panel]` is not `open` press `]` and `waitForSelector('.ide[data-panel="open"]')` (the same on-demand open U3.occlusion's probe takes — it throws honestly if the panel won't open), THEN `chatTab.click()` — a real click, no swallowed failure. Composer/disabled-withheld arms unchanged. | Leg body is deploy-only; journeys sweep **228/228** + web **1667/1667** green; T1d is the deployed proof. |
| `U5.write` (F-R7DEP.2-3 evolved — title-focus PASSES at `d372de85`; next layer failed) | **Leg arm too synthetic — not a mount regression.** The bubble's arm is a real selection gesture: the IDE chrome's `selectionMenu` fires on a `mouseup` inside `[data-pane="page"]` (or a shift-`keyup`) and then reads a non-collapsed `window.getSelection()` range (controller.ts:1002–1018, bound at 1326–1328). Playwright's `editor.selectText()` sets the DOM range directly — no `mouseup`, no shift-`keyup` — so the arm could never fire. The mount itself is intact: `[data-pane="page"]` is still emitted by `IdeShell` (ide-shell.tsx:268, the same shell `IdeProjectLayout` renders on the SPA leaf), `format-bubble.dom.test.tsx` greens the identical arm at this head (mouseup inside the pane + a non-collapsed range), and this arm had NEVER been exercised at a deployed SHA — the title-focus layer failed ×3 before the walk ever reached it. | Real selection: drag across the typed paragraph — `editor.locator("p", { hasText: "sentence one" }).boundingBox()` then `page.mouse` move/down/move(steps)/up across the line, the gesture a reader makes; the `mouseup` lands inside the page pane → `selectionMenu` → the bubble. A missing/invisible paragraph fails honestly (`!lineBox → throw`), never a silent skip. `data-placed="above"` + Comment-first asserts unchanged. | Same — sweeps green; the bubble arm itself is proven at this head by `format-bubble.dom.test.tsx` (9 tests); T1d is the deployed proof. |

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — green (fresh; 15/15).
- `pnpm --filter @rhema/journeys typecheck` / `@rhema/web typecheck` — clean.
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/journeys` — 0 errors.
- `pnpm exec vitest run apps/web/src` — **1667/1667**.
- `pnpm exec vitest run packages/journeys/src` — **228/228** (all local leg arms green:
  noreload, demo-legs, demo-hub, demo-side-effects, demo-readonly, u3-occlusion,
  u4-controls, hero-capture 9/9). The demo-side-effects walk manifests + screenshots the
  local sweep regenerates were reverted — this ticket's diff is the leg bodies only
  (the 250c convention), not regenerated noise.
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK.
- `pnpm check:spa-budget` — OK, all ceilings held; WARN: cumulative entry delta vs
  `04a4e98b` **+33.3 kB** — the standing pre-existing deficit (GD-KIT3A-BUDGET /
  GD-SPA-ENTRY.R7); this ticket's increment is **0 kB** (journeys-only — no shipped JS).
- No new selectors (declared vocabulary only: `data-ide-panel-tab`/`data-ide-desk-tab`,
  `data-panel`, `data-format-bubble`); no paid leg; spend **$0**.

## Judgement calls

- **U2 — `]` before click, click not swallowed.** The ticket's "open the panel first →
  wait for its open state → click" is implemented literally; the panel-open wait now
  throws if it lapses (a real defect signal), and the tab click is a real click — the
  earlier `.catch(() => undefined)` would have hidden an unactionable tab (the F-6
  class). The `]` chord is the surface's primary open path (keymap.ts:287 →
  `togglePane("panel")`; U3's probe relies on the identical press at these widths).
- **U5 — pointer-drag chosen over shift-selection.** Both are real surface arms
  (`onDocMouseUp` / `onDocKeyUp`-with-shift). The drag is the primary reader gesture,
  exercises the exact arm the DOM probe greens, and does not depend on caret state
  surviving the 6 s collab-materialization wait. A keyboard selection would need a
  fresh caret claim first; the drag needs none.
- **U5 — no surface change needed.** The honest diagnosis is the too-synthetic arm:
  `selectText()` never dispatched a gesture the controller listens for, and the arm
  had never been exercised before T1c (the title-focus layer failed first, three
  rounds running). No mount defect exists at this head — nothing weakened, nothing
  reordered.

## Explicitly NOT proven here

No preview or production behavior was verified — `pr-293` is 250's owned stack and was
neither updated nor re-walked. Deployed evidence for both legs arrives at 250's T1d
re-walk (`D-R7FIX.4-1`).
