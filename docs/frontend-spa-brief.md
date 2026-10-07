# Brief — frontend SPA migration ("snappy, modern, no page refreshes")

**Goal (operator, 2026-10-07):** migrate `apps/web` from full-SSR (Hono + server-side-only React +
vanilla-TS island bundles) to a single React SPA — TanStack-class stack, client routing, no document
refreshes inside the app — with a markedly snappier, more modern, more beautiful UI/UX. Plan it through
the repo's own machinery: synthesize-spec → decompose-spec → orchestrate-build.

## Fixed constraints (⚑ — operator-fixed, not up for redesign)

- `mergePolicy: OPERATOR`; stacked PRs; build-memory conventions; append-only history.
- JOURNEY.1 browser journeys remain the user-surface acceptance mechanism (REQ-SPEC-29).
- Canonical-vocabulary lint, `check:protocol-markers`, `check:no-cookies`, `check:licenses` gates all
  continue to apply to whatever ships to browsers.
- Strict CSP posture is retained (script-src 'self'; no `unsafe-eval`; the MAINT.5 `form-action` lesson
  — outbound hand-offs must be navigations to allowlisted origins).
- Session cookies stay on `rhema.tools`; the ADR-040 web→api internal-stamp seam is preserved
  (whatever the SPA calls, it rides that channel or an equivalent audited one).
- The ProseMirror + Y.Doc + Hocuspocus collab/editor capability must survive (feature parity minimum;
  a React binding is welcome).
- Prohibited claims / copy discipline unchanged (REQ-EVAL-19, banned-vocab lint).
- Public/SEO surfaces keep fast first paint (hybrid SSR vs SPA-everything is a §Q decision, but first
  paint is never regressed knowingly).

## What the spec must answer

- Framework/router/data-layer choice and why (TanStack Router+Query vs React Router 7 data APIs vs
  TanStack Start; bundler — Vite amends ADR-007).
- The BFF boundary: which of ~175 routes become JSON endpoints; mutation model; SSE/ws story in SPA.
- Islands→React mapping incl. the editor/collab island (the heaviest).
- Public-vs-auth'd split (SSR hybrid boundary).
- Design ambition + design-system plan (tokens exist in `@rhema/tokens`).
- Verification strategy: journeys adaptation, component tests, a11y/responsive posture, bundle budget.
- Migration sequencing: strangler/flag/cutover; interaction with the 45-PR unmerged stack.
- Operator-decision register for everything genuinely operator-level.

## Explicitly out of scope

- Backend data-model changes; api route semantics; billing/auth semantics.
- §16.4 marketing claims (G2 still frozen).
