# R5.A4 — Verification design: the settle-contract extension that sees nav mechanism

**Stream:** A (nav completion) · **Researched:** 2026-10-15 · **Ledger rows:** A4 · **Confidence:** high; two pinned-version runtime behaviors flagged as open questions.

## Key findings

- **F1** — `awaitMounted`/`settleNav`/`gotoOk` verify *which* document rendered, never *how* the browser arrived (`settle.ts:102-194`; `settleNav`'s own comment concedes it at :170-174). This is exactly why zero-client-routing shipped invisibly.
- **F2** — `data-route` flips at nav START while `data-mounted` never clears (`head.tsx:41-52`) → settle passes mid-pending. Clearing `data-mounted` while `isLoading` is one line and makes `[data-route][data-mounted]` mean "resolved leaf" again — adopted (REQ-NAVT-2). Fixes every existing mid-pending false-pass for free.
- **F3** — The observable: `data-nav-count` on `<html>` = committed in-document location transitions since this document loaded. SSR stamps `0`; shell stamps `0`; HeadManager increments per new `location.state.key`. A doc nav lands a fresh `0` — the reset IS detection; a monotone +1 assert is unfakeable. Rejected: `data-nav-kind` (last-hop only), PerformanceTiming (per-document, can't see the boundary), `window.__navCount` (invisible to SSR, outside dom-contract vocabulary).
- **F4** — Counting semantics: pushes+replaces+pops count; hydration doesn't. Whether `navKey` changes on replace/pop at pinned 1.170.40 needs a dom test (Q-A4-1).
- **F5** — Runner already watches document responses (`runner.ts:189-240`); a `documentLoads` counter on `StepCtx`/`SettleScope` is a 5-line extension — the harness-side proof that survives document boundaries (the in-page counter alone can't see a reload-to-same-count).
- **F6** — Chain route `/app`→`/p/:slug`→`/p/:slug/v/working` fully in-tree on desktop for a non-showcase scratch project (anchors verbatim: `a[href^="/p/"]`, `a[data-edit-source]`).
- **F7** — `PAGE_SESSION_IDLE_TTL_MS = 120_000` (corrects the ledger's "30s"). Keep-alive proof: `data-page-session="<bootNonce>.<seq>"` minted per registry entry on `[data-page-root]` + the semantic undo leg (type marker → synced → away → back <TTL → Ctrl+Z removes marker — impossible on a re-seeded EditorState). Away hop must be a non-Page route (`/app`) so the entry actually idles.
- **F8** — dom-contract rows required same-PR: `data-nav-count` (shell, required) + `data-page-session` (editor, conditional).
- **F9** — Registry: `R10` + `R10.keepalive`, `paid:false`, `expected:"red"` until first live leg, on `project-home`+`editor` surface gates.

## Design summary

1. `data-nav-count` in `render.tsx`/`spa-shell.ts` htmlAttrs; HeadManager increments on committed transitions; `data-mounted` removes during `isLoading`.
2. `settleClientNav`/`settleDocumentNav` — nav-count ±doc-loads pair; `settleNav`/`gotoOk`/`reloadSettled` untouched (mechanism-agnostic by design).
3. `R10` chain leg: click→click→Back, `documentLoads===1` end-to-end, zero re-issued twin GETs on warm return (honest warm-paint proof — skeleton absence is weak since `defaultPendingMs` suppresses on fast navs).
4. `R10.keepalive`: session-id stability + undo-semantic arm; requires the A5-F7 generation-check fix landed first (the phantom-destroy race would intermittently nuke the session being proven).
5. Boundary pinning: two `settleDocumentNav` spot-legs (stub hop, download).

## §Q additions

- Q-A4-1/6 — `navKey` change on replace/pop/hash commits (dom test answers).
- Q-A4-2 — bfcache: do auth'd responses carry `no-store`? If not, a `pageshow`-persisted probe or explicit pinning needed.
- **Q-A4-3 — REQ-NAVC numbering collision: A1 emitted 7..13, A5 emitted 7..15 over the same range — synthesis must renumber one set.**
- Q-A4-4 — does `/p/:slug` mount the same `draft:<id>` as `/v/working` (decides which hops exercise idle→re-acquire).
- Q-A4-5 — leg ids `R10`/`R10.keepalive` naming confirmation.

## Spec requirements emitted (REQ-NAVT-1..8)

1 `data-nav-count` contract (stamp 0, increment per committed transition, hydration=0) · 2 `data-mounted` removed while pending · 3 `settleClientNav`/`settleDocumentNav` + `documentLoads` · 4 `R10` free chain leg (monotone count, 1 doc load, warm-twin zero-refetch) · 5 `R10.keepalive` (session-id + undo arm, 120s TTL) · 6 mechanism pinned both directions, `settleNav` stays agnostic · 7 dom-contract rows same-PR · 8 happy-dom guard-table suite over the real routeTree covering every A1/A2 decision row.
