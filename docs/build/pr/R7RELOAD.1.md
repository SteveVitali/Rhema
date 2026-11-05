# R7RELOAD.1 — No document reloads from in-app forms and redirects + the GUARD-3 harness

Ticket: `docs/tickets/231_R7RELOAD.1__no-reload-forms.md` · manifest row 231 · Stage A only ($0 — GD-PREVIEW.R7; no preview run)

## What changed

- **`apps/web/src/spa/write-paths.tsx` (new)** — the ONE shared write allowlist `SPA_WRITE` (union of the retired `DOSSIER_WRITE`/`EDITOR_WRITE`/`RUN_REPORT_WRITE` + pane-body-only paths), the shared delegated-submit factory, `usePaneWrite`, `collectJsonFields`/`setFormBusy`/`actionPath`, `PaneBusy`.
- **`spa/ide/chrome.tsx`** — ONE host-level delegated `onSubmit` on the IdeChrome host div: every pane-body form (Timeline gate Approve/Decline, explainer dismiss, run-card steering posts) is now a JSON mutation — scroll/focus preserved (REQ-UX-4). A leaf's own `onSubmit` claims first via `defaultPrevented`; the two legs never double-post.
- **`dossier.tsx` / `editor.tsx` / `run-report.tsx`** — the per-surface `*_WRITE` regexes retired; all three consume the shared module (a source census fails on any re-declared grammar).
- **`server.ts`** — `edit/:draftId/note` + `/cancel-run` redirect straight to `/p/:slug/v/:n` (resolved through `getEditorDoc`, never `/edit/:id`); all nine `/p/:project/chat/*` writes through `mutationOutcome` + stable codes (`chat_*_required`), no-JS empty chat send → flash `#chat` redirect, refusal arms keep `chatFail`'s truthful JSON on both arms; `explainers/:name/dismiss`, `/settings/theme`, `/settings/privacy`, `/logout`, `/p/:project/import/preview` routed through `mutationOutcome`.
- **Routes** — `reloadDocument:true` removed on in-tree targets (`p.$project.index.tsx` handoff, `p.$project.v.$v.tsx` working-miss); the named stubs (`_authenticated` login leg, `edit/$draftId`, `f/$fid`, `usage/r/$runId`) keep it.
- **GUARD-3** — `packages/journeys/src/noreload.ts` (marker + `assertNoReload` + named `SANCTIONED_DOCUMENT_NAVIGATIONS`); the real `U2.noreload` walk in `r7legs.ts`, held `expected:"red"` (ready-to-flip → 250); `noreload.local.test.ts` fixture walk.
- **ADR-134** — the shared grammar, exemption list, chat envelope shape, sanctioned vocabulary.

## Evidence (engineered/fixture-verified — no live/deployed claims)

- `pnpm exec vitest run apps/web/src` — **1,518 pass**; `packages/journeys/src` green incl. `noreload.local.test.ts`: clean walk holds one document, **planted reload FAILS the assert**, sanctioned-name arm green (local `demoDataSource` server + bundled Chromium).
- `write-paths.test.ts` censuses: `SPA_WRITE` accept/reject contract, no `*_WRITE` redeclared, zero `/edit/` redirect targets, `reloadDocument` only on the named list, every `app.post` through `mutationOutcome` or a named exemption.
- `check:dom-contract` green (`data-gate-form` declared). `check:spa-budget`: **entry delta +13.8 kB gz** vs baseline `04a4e98b` — inside the ≤15 kB REQ-KIT-5 allowance.
- `turbo build lint typecheck` green on the touched packages.
- **Deferred to 250 (D-R7RELOAD.1-1):** the deployed `U2.noreload` walk + registry flip — the REQ-DACC-8 owner-flip deviation is accepted (GD-PREVIEW.R7/nightly hazard).

## Out of scope (named)

Chat send's fetch mutation (232), per-form UX copy (245), Stage-B preview walk (250). No money-mode, tenancy, or copy changes.

## Verification

See `docs/build/runs/R7RELOAD.1.md` § Evidence log.
