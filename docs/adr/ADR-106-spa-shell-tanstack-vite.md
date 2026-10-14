# ADR-106: Auth'd surfaces migrate to a TanStack Router + Query SPA built with Vite — amends ADR-007, ADR-012

- **Status:** Accepted
- **Date:** 2026-10-08
- **Ticket:** SPA.1 (round 4 — frontend-SPA migration; draft pre-written in `docs/design/20_spa-framework-binding.md` §ADR-106 draft)
- **Requirement ids:** REQ-FW-1 … REQ-FW-12 (`docs/design/20_spa-framework-binding.md`);
  amends ADR-007 (no-Vite/no-framework-mode ruling) and ADR-012 (island-only interactivity
  ruling) for the authenticated-surface scope
- **Spec:** docs/frontend-spa-spec.md §3.5/§3.6 (canonical v1.0, operator-ratified 2026-10-08); docs/design/20_spa-framework-binding.md; docs/design/21_spa-toolchain.md

## Context

ADR-007 banned Vite and React Router framework mode for the REQ-BETA-21 throwaway shell: the
green gate was `tsc -b` only, and spending toolchain integration on a discardable shell was
poor value. ADR-012 extended that posture to P1.01: the IDE mounts as attribute-driven esbuild
islands on the Hono SSR host, no hydration, no framework mode. Both ADRs were scoped — ADR-007's
own revisit trigger was the real SPA arriving, and ADR-012's was a surface needing a
client-owned document tree.

The operator has now fixed the direction (frontend-spa-spec, ratified 2026-10-08): auth'd app surfaces
become a real React SPA — "snappy, modern, no page refreshes" — while public/marketing/login
stay Hono SSR; TanStack Router + TanStack Query is the chosen stack; Vite is the bundler;
migration is strangler-style behind per-surface flags with SSR as the fallback. The forces that
made ADR-007/012 correct (green-gate simplicity, no client interactivity needed at beta) no
longer hold for the auth'd product.

## Decision

- `apps/web` ships a Vite-built SPA bundle (TanStack Router + TanStack Query) mounted inside a
  Hono-served shell document; Hono remains the server host and the same-origin BFF.
- **ADR-007 is amended** for the auth'd scope: its "no bundler" ruling applied to the throwaway
  beta shell and is retired; SSR documents still build under `tsc -b` — Vite owns only the
  client bundle.
- **ADR-012 is amended** per surface: the attribute-driven island idiom is superseded as each
  surface's flag flips; islands remain the fallback implementation while a flag is off.
- The same URL serves SSR HTML (flag off) or the SPA document (flag on) — the flag is a
  server-side, fail-closed `SPA_SURFACES` set injected through `WebDeps`.
- CSP posture is unchanged: `script-src 'self' 'nonce-…'`, no `unsafe-eval`, the `form-action`
  Stripe/Google allowlists intact (outbound hand-offs remain navigations, now client-initiated
  from `{url}` JSON responses).
- The session cookie stays on `rhema.tools`; the browser calls same-origin BFF endpoints with
  `credentials:"same-origin"`; the ADR-040 web→api stamp is unchanged; no bundle holds a
  credential (REQ-ARCH-33).

## Consequences

- Good: client routing + Query caching deliver the no-refresh, snappy surface; the URL space,
  auth boundary, BFF, and CSP are preserved by construction; SSR remains a working fallback
  throughout migration; both ADRs' revisit conditions are met rather than violated.
- Good: `@tanstack/*` types + `@rhema/api-client` DTO `import type`s give end-to-end type
  safety with zero shipped runtime cost.
- Bad: two rendering idioms (SSR documents + islands vs SPA) coexist for the flag period —
  deliberately, this time, and bounded by the flag set.
- Bad: the green gate gains a Vite build; `check:protocol-markers`, `check:licenses`, and the
  asset-parity discipline extend to `public/spa/*`.
- React Router stays as a server-side manifest/match library for SSR; it is not shipped to
  browsers.

## Alternatives considered

- **React Router 7 (data or framework mode):** framework mode wants its own Vite plugin, route
  modules, and `@react-router/node` even for `ssr:false`, re-buying the toolchain ADR-007
  priced out while duplicating document/caching concerns Hono + Query own; library/data modes
  lack typed search and first-class cache semantics.
- **TanStack Start:** full-document SSR + server functions — server capabilities the landed
  Hono host already provides; rejected per TanStack's own guidance.
- **Hydrate the existing SSR markup (`hydrateRoot`):** the SSR component tree is the OLD pages;
  it cannot hydrate into the new SPA tree, and keeping markup parity across both idioms was
  rejected by ADR-012 for the same reason.

## Revisit trigger

Reopen if the hybrid split itself is reversed (e.g., public surfaces move into the SPA, or the
BFF moves off `apps/web`), if TanStack Router/Query exits maintained status, or if a hard
requirement for server-rendered auth'd HTML emerges (which would re-open the Start/RR7
framework-mode comparison).
