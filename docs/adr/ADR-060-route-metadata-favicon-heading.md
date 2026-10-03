# ADR-060: Route-aware document head — `<page> · Rhēma` titles, public-route social tags, inline-SVG favicon, exactly one `<h1>`

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-SPEC-2 (copy half), REQ-IDE-41, REQ-POS-4/5
- **Spec:** §4.2, §15.1–15.4, REQ-GROWTH-11

## Context
Every rendered document carried `<title>Rhēma</title>` and nothing else: no description, no OG/Twitter
tags, a 404ing favicon, and multiple `<h1>`s per page because `SectionTitle` rendered `<h1>`. The
ticket prescribes the outcomes (per-route titles, public social tags, a served favicon, one h1); the
shape of the mechanism was ours.

## Decision
`renderDocument` computes `docMetaFor(pathname, data)` — a route table mapping every §4.2 route
family to a title word (`"Preferences · Rhēma"`, `"{project} · Rhēma"` on project surfaces). Meta
description + Open Graph + Twitter-card tags emit only for routes that carry a description — the
public set (`/`, `/invite`, `/pricing`, `/signup`, `/login`, `/showcase`); descriptions live in
`COPY.meta` so the copy lint covers them. `canonical`/`og:url` emit only when the handler passes the
request `origin` (tests construct documents without one). The favicon is an inline-SVG brand mark in
`brand.ts` served at both `/favicon.svg` and `/favicon.ico` (same bytes; browsers honor the content
type, not the extension). Heading hierarchy: `PageTitle` renders the single page-level `<h1>`;
`SectionTitle` now renders `<h2>` and every page/section call site in `pages.tsx`/`marketing.tsx`
was re-mapped accordingly. Every interpolated value is attribute-escaped.

## Consequences
Each route is identifiable in a tab strip, share unfurl, or screen-reader landmark list; public pages
carry the social card; the favicon 404 is gone. The route table is one place to extend — a new route
without a title falls back to the generic family title, never to a bare "Rhēma".

## Alternatives considered
- Per-page `data` fields supplied by every handler: rejected — the path is the stable key; handlers
  already pass `c.req.path`, so metadata cannot drift from the route actually serving.
- A `.ico` raster asset: rejected — an inline SVG keeps the repo asset-light; the `/favicon.ico`
  endpoint serves the same SVG bytes for legacy fetchers.

## Revisit trigger
A public route whose description must differ from its page lede per locale or experiment — then the
`docMetaFor` table gains a description override rather than a global fallback.
