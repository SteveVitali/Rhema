# ADR-107: The forever-SSR island set retains `page.js` + `ide.js` — SPA.26 retires `outline` (and confirms `editor`) only

- **Status:** Accepted
- **Date:** 2026-10-10
- **Ticket:** SPA.26 (round 4 cleanup wave — island-bundle retirement)
- **Requirement ids:** REQ-ED-12 (forced-SSR posture); REQ-ISL-1 (retirement leg); REQ-TL-12
  (auth'd islands die only when their flags are proven dead); REQ-SEQ-11 (SSR fallback never
  deleted mid-migration); REQ-ISL-11 (no-JS floor); REQ-ISL-4 (the shared collab wire); REQ-INV-8
  (redirect/transport surfaces carried or explicitly retired)
- **Spec:** docs/frontend-spa-spec.md §5/§11; docs/design/23_spa-editor-collab-binding.md §7
  (dual-mode contract + OQ5) + emitted REQ-ED-12; docs/design/29_spa-migration-sequencing.md

## Context

SPA.26's ticket prose names the goal as "`page.js`/`ide.js`/`outline.js`/`editor.js` entries
deleted" on the premise (Depends-on line) that after SPAF.14 "islands [are] no longer reachable."
The consumer trace does not support that premise for two of the four:

- **`page.js`** — `server.ts`'s `/p/:slug` (and Page-family) handlers run the `editor` flag consult
  **after** the forced-SSR capability check (`!isPhoneRequest(c) && row.showcase !== true`).
  Phone and showcase documents — and every flag-off/`?ssr=1` render — therefore still render the
  SSR `PageEditor`, which emits the `data-page-doc|prov|findings` embeds **and** the
  `/assets/page.js` tag (`embeds` defaults true). That mount is not vestigial: design/23's
  adopted OQ5 arm keeps the non-editable ProseMirror mount on reader paths so findings/authorship
  decorations render, and D-SPAF.14-3 names the island the flag-rollback arm — a reverted document
  re-acquires the collab session through the same `client/collab.ts` wire (REQ-ISL-4).
- **`ide.js`** — every SSR-framed IDE document stamps `data-ide` (including the forced-SSR family
  and `?ssr=1` fallbacks) and `render.tsx` emits the tag; the island owns pane toggles, menus,
  the theme endpoints, the ⌘K palette, and the feed/keymap layer the SSR markup is inert without.
- **`outline.js`** — its single mount is the `/p/:slug/outline` editable SSR page, whose SPA leaf
  (SPA.18) owns the debounced `ed.*` save outright. The SSR fallback degrades honestly to the
  explicit-Save form (the no-JS floor, REQ-ISL-11): the `ed.*` POST, the delete form, and the
  `?saved=1` flash all keep working.
- **`editor.js`** — source already retired at SPA.24 (unrouted since P1.02); only stale manifest
  material remained.

## Decision

- `CLIENT_ENTRIES` shrinks to `["ide", "page", "landing"]`. `outline` is deleted (source +
  `/assets/outline.js` route + SSR mount tag + the island-only mount attributes
  `data-autosave`/`data-label-{saving,saved,failed}` on the SSR form); `editor` stays deleted.
- `page` + `ide` join `landing` in the **permanent SSR island set** — they leave
  `CLIENT_ENTRIES` only when nothing served can mount them (the forced-SSR Page family is
  flag-independent forever; the `?ssr=1` escape and flag-off renders persist until SPA.27's
  handler deletions, and the forced-SSR branch persists beyond them).
- The ticket's literal "delete all four" is therefore satisfied *as scoped*: retirement covers
  islands whose SPA surface replaced their mount; a forever-SSR leaf that still loads an island
  keeps it.
- The `data-outline-editor` hook stays on the SSR form as the renderer-shared form identity
  (the SPA leaf emits the same attr); `data-autosave`/`data-label-*`/`data-autosave-status`
  become leaf-owned vocabulary in the dom-contract.

## Consequences

- The `?ssr=1`/flag-off SSR Page and IDE documents keep their full island behavior (collab mount,
  decorations, panes/menus/palette) — the rollback arm in D-SPAF.14-3 stays real.
- The SSR outline page loses debounced autosave; the explicit Save button is the documented floor.
- A future ticket can only remove `page`/`ide` from `CLIENT_ENTRIES` after the forced-SSR Page
  family itself stops emitting the mounts — that is a REQ-ED-12 design change, not cleanup.

## Alternatives considered

- **Delete all four as the ticket prose reads.** Rejected: it breaks the forced-SSR forever path
  and the D-SPAF.14-3 rollback arm — the "islands no longer reachable" premise is false.
- **Keep all three auth'd islands** (re-add nothing — leave `outline` too). Rejected: the outline
  leaf genuinely owns the surface now; keeping a dead-route bundle is the defect class
  (built-not-served / served-not-emitted) this ticket exists to close.
- **Strip `page.js`/`ide.js` from the forced-SSR render only** (e.g. `embeds={false}` on the
  phone/showcase branch). Rejected: that is design/23 OQ5's *not-recommended* PmPreview-only arm —
  it drops decorations parity and weakens the fallback for no parity benefit.

## Revisit trigger

If the forced-SSR Page family is ever redesigned to a non-island read (a REQ-ED-12 spec change —
e.g. a `PmPreview`-only posture with finding-span support), `page`/`ide` re-enter retirement scope
and this ADR is superseded.
