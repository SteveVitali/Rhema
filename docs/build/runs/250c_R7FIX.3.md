# R7FIX.3 (250c) — run ledger: owner fixes for the R7DEP.2 defect boundary, round 3

Harness: devin-desktop/swe-2-high/subagent

- **Insert:** 250c of 254 (`250c_R7FIX.3__defect-round-3.md`) — 250_R7DEP.2's defect path,
  round 3; the T1b re-walk at `2817ba73` greened 12 legs and left four pin-vs-surface
  mismatches.
- **Branch:** `stevevitali/r7fix-3-defect-round-3` on `stevevitali/r7dep-2-t1-prod`
  (`a048766a` at setup). PR stacks on 250's Part-B records branch; **unmerged
  (mergePolicy: OPERATOR)**.
- **Stage:** A only — source/leg-pin fixes + local build/typecheck/lint/unit sweeps.
  **No preview mutation, no re-walk of `pr-293`** — the deployed proof is 250's own T1c
  re-walk (`D-R7FIX.3-1`). **Spend $0.**
- **Changed lines:** ~110 across 5 files (inside the ~100–300 bound).

## Findings → diagnosis → fix → local verdict

| Leg | Diagnosis | Fix | Local arm verdict |
|---|---|---|---|
| `R8.showcase.spa` (F-R7DEP.2-1 residual, ×3 identical) | `/showcase` 302s **onto the dossier** itself (`server.ts:2987` — `sc.reviewRunId` arm), so the leg's `a[href*="/review/"]`.first() hunts for a dossier link *on the dossier* — and DOM-first resolves the findings-desk filter **"Clear"** anchor (`findings-desk.tsx:141`, `filterAction` = the dossier's own URL) inside the legitimately-closed right panel. In R7a that anchor was in the visible body (pre-REQ-PANE-5), so the green leg passed through it. | Re-pinned honestly: after the landing asserts the walk client-navs **dossier → project Page** (`[data-project-item="page"]`), then back **through `[data-project-item="reviews"]`** — the declared, visible dossier link — and asserts the landing path IS `/p/<slug>/review/` (an unresolved `/p/:slug` fallback fails loudly as its own defect). No markup reorder; the panel furniture stays hidden. | Leg body is deploy-only; journeys sweep **228/228** + web **1667/1667** green; T1c is the deployed proof. |
| `U2.noreload` (F-1b evolved) | The walk rides `[data-shell-recent="showcase"]` (round-2 substrate for the dossier hop — passed at T1b), then wants `a[href="/p/showcase/export"]` — absent because the read-only Showcase withholds Export/Project settings (`writeOnly` items render `aria-disabled` spans — the **honest R7b surface decision**, GD-class, not a regression). | Re-pin: keep the withheld-state **assertion** (both items must be `aria-disabled` — never a vanished control), then detour `project→writable` over the first non-showcase `[data-shell-recent]` and walk `export→settings` there; the tail returns to the Showcase (`inbox→project`) so approve/chat exercise their **safe skip arms** (a chat turn is a metered `chat_turn` run — real send on a writable project would spend on a `paid:false` leg). Chat arm made disability-aware: enabled composer → real send; disabled → asserts `data-chat-readonly`. Exit now `project→peer`/`project→back` via the wordmark — the same-URL `a[href^="/p/showcase"]` tail is gone (a no-op hop proves nothing). | Same — sweeps green; local noreload harness arm green. |
| `U5.write` (F-3 residual, ×3 identical) | `data-inline-title` was emitted on the `<form>` WRAPPER (`page-chrome.tsx`) while `document.activeElement` lands on the inner `<input>` — the leg's `activeElement === el` could never pass. The contract names "the focused blank-Page title" — that element IS the input. | Moved the hook onto the `<input>` itself (the element the contract names). Consumers updated to match: `editor.tsx` re-assert `"[data-inline-title] input"` → `"[data-inline-title]"`; `steps.ts` P1.app-new → `input[data-inline-title][name='title']`; `editor.dom.test.tsx` asserts the input carries the hook inside the `data-rename-form` action. `head.tsx`'s presence-yield and the leg body are unchanged (they now resolve the right element). | `?created=scratch` dom leg green (focused input asserted); web sweep **1667/1667**; journeys **228/228**. |
| `U1.shell` (F-5 evolved) | On a project with **no delivered review** (the walk's `untitled` substrate) the Reviews item's href is the honest `/p/:slug` fallback — the overview IS "the dossier cards' home" (app-shell.tsx design comment). Its nav lands on the Page, where `aria-current` correctly lands on the "page" item — the surface is right, the leg's clicked-item==current pin was stale. | Re-pinned the loop: `aria-current` is asserted on the item whose route family OWNS the landed pathname (page\|outline\|figures\|versions\|reviews\|export\|settings, mirroring the items' own `active` rules) — same strength for the armed items, truthful carrier for the reviews fallback; a same-URL hop asserts current directly (a no-op click proves nothing), and an unmapped landing fails loudly. | Same — sweeps green; T1c is the deployed proof. |

## Verification at this head

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — green (fresh; 15/15).
- `pnpm --filter @rhema/web typecheck` / `@rhema/journeys typecheck` — clean.
- `pnpm turbo lint --filter=@rhema/web --filter=@rhema/journeys` — 0 errors.
- `pnpm exec vitest run apps/web/src` — **1667/1667**.
- `pnpm exec vitest run packages/journeys/src` — **228/228** (all local leg arms green:
  noreload, demo-legs, demo-hub, demo-side-effects, demo-readonly, u3-occlusion,
  u4-controls, hero-capture 9/9).
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK.
- `pnpm check:spa-budget` — OK, all ceilings held; WARN: cumulative entry delta vs
  `04a4e98b` **+33.3 kB** — the standing pre-existing deficit (GD-KIT3A-BUDGET /
  GD-SPA-ENTRY.R7); this ticket's increment is ≈ 0 kB (one attribute moved, no new
  vocabulary, leg-side changes are not shipped JS).
- No new selectors (existing declared vocabulary only); no paid leg; spend **$0**.

## Judgement calls

- **U5 attr onto the input, not the leg.** The contract's `data-inline-title` names "the
  focused blank-Page title" — the input is that element; keeping the wrapper carrier would
  have required weakening the leg to `contains()`. Three consumers re-pointed; the leg is
  untouched.
- **U2 export/settings are a GD-class withheld state, not a regression.** The items exist
  as `aria-disabled` + reason on the read-only Showcase — the leg now ASSERTS that
  withholding (stronger than absence) and detours to a writable recent for the hops. When
  the tenant has no writable recent the withheld assert alone carries the segment — recorded.
- **U2's tail stays on the Showcase deliberately.** A real chat send is a metered
  `chat_turn` run — on a writable project it would burn on a `paid:false` leg; the disabled
  composer arm asserts `data-chat-readonly` instead.
- **R8 asserts dossier reach, not just click.** If the sidebar Reviews item still carries
  the `/p/:slug` fallback at T1c (its own defect — `latestReviewRunId` unresolved), the leg
  fails naming it rather than silently "hopping" to the overview.
- **U1 owner-resolved aria-current.** The assert keys on the LANDED surface's owning item
  (mirroring the items' `active` rules) — it cannot pass on a wrongly-lit sidebar and does
  not depend on a stale "clicked == current" pin.

## Explicitly NOT proven here

No preview or production behavior was verified — `pr-293` is 250's owned stack and was
neither updated nor re-walked. Deployed evidence for all four legs arrives at 250's T1c
re-walk (`D-R7FIX.3-1`).
