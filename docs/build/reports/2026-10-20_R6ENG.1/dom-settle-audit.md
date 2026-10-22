# R6ENG.1 (REQ-ENG-1) — DOM mount-settle audit, `apps/web/src/spa/*.dom.test.tsx`

**Date:** 2026-10-20 · **Ticket:** R6ENG.1 · **Flake class:** BL-87 / D-R5REC.1-1 — a bare
`querySelector(...)!` between the router's `data-mounted` stamp and the leaf's own
query/mutation repaint reads null intermittently.

## The contract the gate rests on

`data-mounted` on `<html>` is stamped by the head manager only after the route match has
resolved (REQ-NAVT-2); it is removed while a navigation is pending. **The stamp marks match
resolution — not the leaf's data repaint.** A leaf's `useQuery` commit legitimately postdates
it, so two waits are needed:

1. **Mount gate** — every `mountAt` returns only after `data-mounted` lands
   (`vi.waitFor`, `SETTLE_TIMEOUT = 4000` — the 1s default itself flaked under CPU
   contention; headroom, not a semantic).
2. **Interaction gate** — `settled(selector, scope)` in `testkit.ts` polls for the element a
   test is about to drive; on timeout it throws with a DOM excerpt so a future flake capture
   is self-describing (which arm rendered, not just that it missed).

Lookups nested inside an already-settled element, and lookups inside `vi.waitFor`, stay bare
— a settled subtree commits atomically with its parent.

## Per-file dispositions

| file | disposition |
| --- | --- |
| `outline.dom.test.tsx` | mount gate added; `settled` on top-level form/surface lookups (delete-form, editor form, surface axe); `outlineAfter` posts-gated. |
| `figures.dom.test.tsx` | mount gate added; `settled` on card/pane top-level lookups incl. `form[data-propose-form]` (the observed null); `cardAfter`+`figuresAfter` posts-gated. |
| `billing.dom.test.tsx` | mount gate added. |
| `dossier.dom.test.tsx` | mount gate added (inside the `awaitLoad` branch — the deliberate pending legs stay un-gated). |
| `editor.dom.test.tsx` | mount gate added. |
| `export.dom.test.tsx` | mount gate added; `settled` on surface axe. |
| `inbox.dom.test.tsx` | mount gate added; `settled` on row/form lookups. |
| `onboarding.dom.test.tsx` | mount gate added; `settled` on surface axe. |
| `project-home.dom.test.tsx` | mount gate added; `settled` on surface lookups. |
| `run-report.dom.test.tsx` | mount gate added. |
| `run-sheet.dom.test.tsx` | mount gate added; `settled` on the submit form (inner leaf form can postdate the stamp); `twinAfter` posts-gated (same latent defect). |
| `settings.dom.test.tsx` | mount gate added; `settled` across the form lookups. |
| `transitions.dom.test.tsx` | mount gate added; `settled` where post-mount. |
| `usage.dom.test.tsx` | mount gate added; `settled` on surface lookups. |
| `voices.dom.test.tsx` | mount gate added; `settled` across the form lookups. |
| `spa.dom.test.tsx` | **deliberately not gated** — owns the marker contract and mounts unresolved boots (401 → `/login` doc-nav, SSR-leave arms) where the stamp must never land; its `!` lookups read `[data-route-announcer]` chrome that commits with the provider, not the leaf. |
| `intercept.dom.test.tsx` | **not gated** — mounts only the click interceptor, no React route tree → no stamp exists. |
| `ide-chrome.dom.test.tsx` | **not gated** — custom injected leaf; lacks the standard head-marker contract. |
| `page-collab.dom.test.tsx` | **not gated** — synchronous custom substrate, no router mount. |
| `page-source.dom.test.tsx` | **not gated** — synchronous custom substrate. |
| `dom-contract.dom.test.tsx` | **not gated** — manifest/regex assertions, no mount. |

## Root cause found — the `*After` fixture counter (second half of the flake)

The post-headroom loop still caught one failure per ~20 iterations, and `settled`'s new
DOM-excerpt error made it self-describing: the target form was **legitimately absent** — the
surface had rendered its post-mutation arm. Mechanism: the `makeFetch` stubs serve the
`*After` fixture (`outlineAfter`, `cardAfter`, `figuresAfter`, `twinAfter`) on read
**count** (`reads > 1`), but `<StrictMode>` + `staleTime: 0` make the leaf's mount refetch
legitimate, so the second read could serve the post-mutation truth **before the mutation
ever posted** — `cited: true` hides the delete form, `pendingProposal` hides the propose
form. Whether the stray refetch landed before or after the test's `settled` poll was the
residual race.

Fix: all three stubs now gate the `*After` fixture on `posts.length > 0` — a recorded POST —
which is the documented "post-mutation refetch's server truth" semantic verbatim. Observed
arms: `outline` iter 5 `form[action$='/outline/delete']` (cited truth early) and `figures`
iter 1 `form[data-propose-form]` (pending-proposal truth early); `run-sheet`'s `twinAfter`
carried the identical latent defect and was fixed prophylactically.

## Iteration evidence

- Isolated baseline (pre-fix, two-file suite): 2 files / 50 tests green.
- Pre-headroom 20-iteration loop: 18/20 clean — iter 5 one `outline` failure, iter 20 one
  `figures` failure (the non-null-asserted lookups still raced before `settled` covered them).
- Post-`settled` capture (1s `vi.waitFor` ceiling): iter 1 `figures` —
  `settled("form[data-propose-form]")` timed out at ~1029ms under load → `SETTLE_TIMEOUT`
  raised to 4000 and a DOM excerpt added to the timeout error (self-describing captures).
- Post-headroom loop on gates+`settled` (before the `*After` fix): 24/25 clean — iter 5
  `outline` `settled("form[action$='/outline/delete']")` timed out at ~4s with the DOM excerpt
  proving the cited arm had rendered early → the `*After` root cause above.
- Post-`*After`-fix 25-iteration loop on the final code: **see `flake-iterations.md`**.

