# ADR-007: The beta shell is React Router SSR built with `tsc` (no Vite / no framework mode)

- **Status:** Accepted
- **Date:** 2026-09-15
- **Ticket:** PRB.01 (beta web shell, invite gating, sample dossier)
- **Requirement ids:** REQ-BETA-21 (beta-only stopgap #2), REQ-BETA-19 (private + capped), §4.2 (URL scheme), §5.9 (tokens)
- **Spec:** rhema-design-spec §17 (Review beta scope), §5.9 (design system), §4.2 (URLs)

## Context

`apps/web` was a P0.01 `tsc -b` skeleton whose comment named it a "React Router SSR shell", but no React,
React Router, or Vite was installed anywhere in the monorepo. PRB.01 must deliver the beta's front door: an
invite-gated flat shell, a project list, and a public invite page with a read-only sample dossier. The ticket
frames this shell as **REQ-BETA-21 beta-only stopgap #2** — deliberately flat, throwaway-by-design, to be
replaced by the §5 design-system IDE shell at P1.01.

The monorepo's green gate is `pnpm turbo build lint typecheck`, where every package builds with `tsc -b`
(composite projects, NodeNext, `verbatimModuleSyntax`). React Router's **framework mode** requires a Vite
build (`react-router build`), generated route types, and its own dev/build integration — a large new toolchain
that does not fit `tsc -b`, needs a bespoke Turbo/Dockerfile/CI-images integration, and whose live surface
(auth on `dev`) is itself operator/deploy-gated (D-P0.01-3). Spending that integration cost on a
throwaway-by-design shell is poor value and a real risk to the green gate.

## Decision

Build `apps/web` as **React Router v7 SSR in declarative/library mode**, compiled by `tsc`:

- Rendering is `renderToStaticMarkup(<StaticRouter location><page/></StaticRouter>)`; route dispatch uses React
  Router's `matchRoutes` over a typed route manifest (`routes.tsx`) — genuinely React Router, no Vite, no
  framework-mode codegen.
- Served by **Hono** (`@hono/node-server`), the same server stack as `apps/api`.
- **No client bundle / no hydration** — the flat shell is progressive-enhancement HTML: native `<form>` POSTs
  and `<a>` navigation. No bundler (Vite/esbuild-app) enters the build.
- The §5.9 tokens live in `@rhema/tokens` (values + `themeCss()`); presentational React primitives live in
  `@rhema/ui` (text-agnostic — copy is injected, so the vocabulary lint governs `apps/web`'s copy table).
- `apps/web` stays decoupled from heavy packages: the project list arrives as a DTO from `apps/api` (which owns
  the `@rhema/orchestrator` `projectState` derivation); web depends only on `@rhema/api-client`, `@rhema/ui`,
  `@rhema/tokens`, `@rhema/contracts`.

## Consequences

- **Positive:** the whole shell builds/lints/typechecks under the existing gate with no new build system; the
  deterministic ACs are provable via `renderToStaticMarkup` + Hono `app.request` without a browser; the diff is
  small and reviewable; nothing is thrown away that the full IDE keeps (canonical `/p/:project` URLs, the state
  function, the DTOs, the token set).
- **Negative / accepted:** no client-side interactivity (acceptable for a flat read/sign-in/list shell; the
  full IDE brings the SPA/editor at P1.01). If a future beta surface needs client interactivity before P1.01,
  it adds a scoped client bundle then.

## Alternatives considered

- **React Router framework mode (Vite):** the "intended" reading of the skeleton comment. Rejected for this
  ticket: heavy toolchain, green-gate/CI/Dockerfile integration cost, and it is throwaway work — the real
  bundled SPA is P1.01.
- **Hand-rolled route table + React SSR (drop React Router):** lower-risk still, but discards the named tech and
  the free param-matching/manifest; the declarative-mode middle ground keeps React Router meaningfully in the
  loop at no real cost.

## Amended 2026-10-08 — Vite admitted for the auth'd SPA scope (ADR-106)

ADR-106 amends this ruling for the authenticated-surface scope: the auth'd app migrates to a real
TanStack Router + Query SPA built by Vite (`apps/web/vite.config.ts`, `src/spa` → `public/spa`). The
"no bundler" posture was scoped to the REQ-BETA-21 throwaway shell — both stated revisit conditions
(a real SPA arriving; a bundler the green gate can carry) are met rather than violated. The public
SSR documents and the esbuild island pipeline are unchanged and keep building under `tsc -b` +
`build-client.mjs` — Vite owns only `src/spa/**`.

## Revisit trigger

P1.01 (design-system + IDE shell) replaces this shell wholesale — it is stopgap #2 of the two REQ-BETA-21
stopgaps and is expected to be discarded, not extended. Revisit sooner only if a pre-P1.01 beta surface needs
client-side interactivity (then add a scoped client bundle) or if the green gate later adopts a bundler that
makes framework mode cheap.
