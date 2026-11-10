# R7FIX.5 (250e) — run ledger: owner fixes for the R7DEP.2 defect boundary, round 5

Harness: devin-desktop/swe-2-high/subagent

- **Insert:** 250e of 254 (`250e_R7FIX.5__defect-round-5.md`) — 250_R7DEP.2's defect path,
  round 5; the T1d re-walk at `e143828f` greened 14/15 legs and left two evolved layers
  (plus one recorded `]`-press timing flake on U3).
- **Branch:** `stevevitali/r7fix-5-defect-round-5` on `stevevitali/r7dep-2-t1-prod`
  (`37a5df58` at setup). PR stacks on 250's Part-B records branch; **unmerged
  (mergePolicy: OPERATOR)**.
- **Stage:** A only — one leg-side fix + one surface fix + U3 hardening, local
  build/typecheck/lint/unit sweeps. **No preview mutation, no re-walk of `pr-293`** — the
  deployed proof is 250's own T1e re-walk (`D-R7FIX.5-1`). **Spend $0.**
- **Changed lines:** ~80 across 4 files — `apps/web/src/spa/ide/controller.ts` (the surface
  defect), `apps/web/src/spa/format-bubble.dom.test.tsx` (regression test),
  `packages/journeys/src/r7legs.ts` (U2 leg), `packages/journeys/src/u3-probe.ts` (U3
  hardening). No new selectors (declared vocabulary only).

## Findings → diagnosis → fix → local verdict

| Leg | Diagnosis | Fix | Local arm verdict |
|---|---|---|---|
| `U2.noreload` (F-R7DEP.2-1 evolved, peer hop layer) | **Leg bug — the surface is honest.** The signed-in context runs Playwright's default 1280×720 viewport. chat-send's `]` press leaves the right panel OPEN, and `paneLayout(1280, {panelOpen:true})` → `data-ide-sidebar="rail"` on `.app-shell` (the tested REQ-PANE-2 ceiling — "1280–1439 while the panel is open" → icon rail) → `.app-shell-recents { display:none }` → EVERY `data-shell-recent` is in DOM but honestly unactionable (the T1d invisible `untitled-4`). Earlier hops confirmed it: `project→writable` passed while the panel was still closed; the peer hop is the first recent pick AFTER chat-send opened the panel. No visible recent exists to pick in rail mode — the disclosure a reader performs is closing the panel they opened. | Before the peer pick: if `.ide[data-panel="open"]`, blur any focus zone (bare chrome chord) → `]` → `waitForSelector('.ide[data-panel="closed"]')` (throws honestly on a panel that won't close — the same arm pattern as the open side), then the unchanged `.first()` non-showcase recent pick. Nothing weakened; the pick itself is identical. | Leg body is deploy-only; journeys sweep **228/228** + web **1668/1668** green; T1e is the deployed proof. |
| `U5.write` (F-R7DEP.2-3 evolved — composer layer) | **Real surface defect (REQ-WRITE-2 write path).** `onDocSelectionChange` (controller.ts) closes `kind="selection"‖"format-bubble"` cmd menus whenever `window.getSelection()` is collapsed — meant to dismiss the bubble when the selection is lost elsewhere. But `openCommentForm` (and `openLinkForm` — same class) mounts its composer with `data-kind="format-bubble"` then calls `input.focus()`: focusing the textarea legitimately collapses the document selection → `selectionchange` → `closeCmdMenu()` removes the whole form — composer AND its `data-comment-submit` Post. Reproduced in live Chromium: `selectionchange collapsed=true active=TEXTAREA → CLOSE` fires immediately after `input.focus()`; the composer self-destructs on open (T1d's `data-comment-input` waitFor/`fill` raced into the async gap; the submit never resolved for 30 s). For a real user the Post path was unusable — the arm had never been exercised at a deployed SHA (the title-focus layer failed ×3, then the synthetic-selectText layer, then the drag layer — this was the next layer beneath). | `onDocSelectionChange` gains the guard `!(document.activeElement != null && cmdMenu?.contains(document.activeElement))` — the collapse close now fires only when the selection is lost ELSEWHERE; a menu holding focus is the menu in use, never a lost selection. One-line predicate, fixes the Comment AND Link composers, preserves every other close path (mousedown-outside, outside-mouseup, Esc, item handlers, plain-bubble collapse while focus sits outside). Verified in the same live-browser repro: with the guard, fill+Post complete and the composer closes on commit. | `format-bubble.dom.test.tsx` **9/9** incl. the new regression test (collapse+`selectionchange` with focus in the composer → composer+Post survive; focus leaving the menu → closes). Live-Chromium repro script run pre/post fix (uncommitted tool). T1e is the deployed proof. |
| `U3.occlusion` (recorded `]`-press race at `e143828f` — first-run flake, retry passed) | Timing flake per the T1d report: the `]` press raced the listener mount (or a held focus zone — the blank Page's title-focus claim makes `]` inert). The probe's on-demand open asserted `data-panel==="open"` immediately after the press — no wait, no retry. | `u3-probe.ts` — both panel arms hardened: blur active element first (the same arm U2/U5 use — `]` is a bare chrome key), then `waitForSelector` on the target state (open/closed) with ONE retry press; a still-wrong state throws the same honest error. Also hardened the ≥1280 close press — a raced toggle would carry an open panel into the next size's auto-open check and misreport it. | `u3-occlusion.local.test.ts` **3/3** — the five-size demo walk + tour-target arm + negatives green against a local build. |

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys --force` — 15/15 fresh.
- `pnpm --filter @rhema/web typecheck` / `@rhema/journeys typecheck` — clean.
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/journeys` — 0 errors.
- `pnpm exec vitest run apps/web/src` — **1668/1668** (the new composer-collapse regression
  test included; the `act()` stderr note is pre-existing on every test in that file).
- `pnpm exec vitest run packages/journeys/src` — **228/228** (all local leg arms green:
  noreload, u3-occlusion hardened probe, demo-legs, demo-hub, demo-side-effects,
  demo-readonly, u4-controls, hero-capture 9/9).
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` /
  `check:no-cookies` — OK.
- `pnpm check:spa-budget` — OK, all ceilings held; WARN: cumulative entry delta vs
  `04a4e98b` **+33.3 kB** — the standing pre-existing deficit (GD-KIT3A-BUDGET /
  GD-SPA-ENTRY.R7); this ticket's increment is ≈ 0 kB (the controller guard is a
  conditional clause inside an existing function).
- No new selectors (declared vocabulary: `data-panel`, `data-shell-recent`,
  `data-comment-input`/`data-comment-composer`/`data-comment-submit`); no paid leg; spend **$0**.
- The demo-side-effects walk manifests + report screenshots the local sweeps regenerate
  were reverted — this ticket's diff is the four source files only (the 250c/250d
  convention).
- Note: `pnpm format` (`prettier --check`) is NOT a CI gate and these committed files
  already carried pre-existing non-conformance; a repo-wide `--write` would add ~700 lines
  of unrelated churn — deliberately not run (the diff stays surgical, ~80 lines).

## Judgement calls

- **U2 — close-the-panel over pick-visible.** In rail mode NO recent is visible — there is
  nothing else to pick, and the rail is the tested REQ-PANE-2 contract, not a defect.
  The alternatives (expanding via `[` — the rail ceiling overrides the user's collapse
  pref; re-routing through All projects) change the hop's semantics. Closing the panel is
  what a reader does after finishing with chat; it restores the expanded sidebar and the
  honest recents list. The `writable` pick earlier needs no arm — the panel is still
  closed there.
- **U5 — the focus-inside guard, not a new `data-kind`.** Giving the composer a distinct
  kind would exempt it from the collapse close too, but it would also drop it out of the
  Esc `wasBubble` focus-restore path and invent a second vocabulary for the same chrome.
  The `activeElement`-inside-`cmdMenu` predicate names the real invariant — a menu being
  used is not a lost selection — and covers the Link composer, which has the identical
  `input.focus()`-on-open shape (latent same-class defect, fixed for free).
- **U3 — bounded wait + one retry on BOTH toggle arms.** A toggle retry is only safe
  behind a bounded state wait (a second `]` after a successful-but-lagged open would
  close it again — the 5 s wait makes the retry conditional on a genuinely un-flipped
  state). The close arm is hardened for arm hygiene, not because a failure was recorded:
  without it a raced close would surface at the next size as a misleading "auto-opened"
  defect.
- **U5 — anchor integrity unaffected.** `onCommentSubmit` derives the §11.3 anchor from
  `view.state.selection` (ProseMirror's persisted selection — survives the textarea's
  focus theft), not `window.getSelection()`; `focusPageSelection()` restores it on
  commit/Esc. Verified in the live repro (Post received the filled text; composer closed
  on commit).

## Explicitly NOT proven here

No preview or production behavior was verified — `pr-293` is 250's owned stack and was
neither updated nor re-walked. The live-browser composer repro was a local instrumented
fixture, not the deployed surface. Deployed evidence for U2 + U5 arrives at 250's T1e
re-walk (`D-R7FIX.5-1`).
