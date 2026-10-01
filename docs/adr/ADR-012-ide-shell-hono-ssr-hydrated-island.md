# ADR-012: The IDE shell mounts as a hydrated island on the landed Hono SSR host (no React Router framework mode)

- **Status:** Accepted
- **Date:** 2026-09-24
- **Ticket:** P1.01 (design system + IDE shell)
- **Requirement ids:** REQ-IDE-8, REQ-IDE-9, REQ-IDE-38, REQ-ARCH-33; ADR-007 (predecessor ruling)
- **Spec:** rhema-design-spec §5.1, §5.9, §13.1; ticket 29 item 11

## Context

Ticket P1.01 names §13.1's React Router framework mode as the nominal target, then rules it itself:
keep the Hono SSR + `renderToStaticMarkup` + esbuild islands host (ADR-007 — deployed, prod-verified
through the PRB chain) and mount the IDE as **one hydrated React subtree** at `/p/:project*`, a second
esbuild entry after the editor's `editor.ts` pattern. The beta's flat pages are progressive-enhancement
HTML; the IDE needs real client behavior (pane drag/clamp, per-user×project arrangement persistence,
menus, `⌘` chrome, theme writes) — but none of it needs a new server framework, a Vite toolchain, or a
route-manifest rewrite.

The alternative — rewriting `apps/web` into React Router framework mode — is explicitly out of scope for
this ticket and would break the `tsc -b` composite build + the deployed SSR host for no functional gain.

## Decision

- The host stays **Hono SSR + `renderToStaticMarkup`** (`render.tsx`); every `/p/:project…` document is
  SSR-static markup for the full §5.1 seven-region shell, correct at any viewport before any script runs
  (the pane state is attribute-driven: `data-files`/`data-timeline`/`data-desk`/`data-view`/`data-margin`).
- The client behavior is a **second esbuild island**, `apps/web/src/client/ide.ts` → `public/ide.js`
  (the ticket's `ide.tsx → ide.js` question answered: `.ts`, not `.tsx` — the island mutates the SSR
  markup's attributes/classes rather than `hydrateRoot`-ing a React subtree; SSR owns the DOM, the island
  owns behavior. No hydration mismatch class exists because no React tree is hydrated).
- All pane/theme state is **client-side** (`localStorage`, key `rhema:pane:v1:<user>:<project>` — never
  in the URL; `?focus=1` is the one shareable flag, applied then stripped). Theme persistence is
  server-side (`user.app_theme`, `projects.paper_theme`) with the localStorage mirror as the boot-time
  fallback that prevents wrong-theme flash.
- Data flows through `apps/web`'s `DataSource` → `@rhema/api-client` exactly as the beta routes do; the
  island POSTs to same-origin web routes (`/ide/theme`, `/p/:slug/paper-theme`) that forward the session —
  the bundle never holds a credential (REQ-ARCH-33).
- Workspace-scope routes (`/app`, `/voices`, `/settings`…) keep the flat `Shell` until their own P1.*
  tickets land; they already consume the same `themeCss()` token set so the two scopes never disagree.

## Consequences

- Good: zero toolchain churn; the green gate (`tsc -b` composite + turbo) is untouched; SSR keeps
  first-paint correctness and no-JS function; the island degrades inert when `public/ide.js` is absent.
- Good: the pane system is testable as pure functions (`@rhema/ide` — no DOM) plus SSR markup assertions.
- Bad: two rendering idioms coexist until the workspace routes' P1.* tickets land; deep-link surfaces
  (`/v/:n`, `/r/:run`, `/f/:id`, `/a/:id`) arrive with their owners (D-P1.01-2).
- The React Router `StaticRouter`/`matchRoutes` usage from ADR-007 is unchanged.

## Alternatives considered

- **React Router framework mode (Vite build):** rejected — new toolchain, breaks `tsc -b`, no functional
  need; the ticket itself rules it out of scope.
- **Full React hydration (`hydrateRoot` over the shell):** rejected — forces SSR/client markup parity for
  no benefit; attribute-driven enhancement is smaller and cannot mismatch.

## Revisit trigger

A P1.* surface that demonstrably cannot ship on attribute-driven enhancement (e.g. real-time collab
needing a client-owned document tree) — at which point a scoped `hydrateRoot` island for THAT surface is
the next step, still not a framework-mode migration.
