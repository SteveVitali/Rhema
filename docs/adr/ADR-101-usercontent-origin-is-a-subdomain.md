# ADR-101: The user-content origin is a subdomain of the apex zone, not a separate registrable domain — retro-fitted record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-ARCH-24
- **Spec:** §12.5 (amended 2026-09-17)

## Context

REQ-ARCH-24's original clause isolated user-generated content on a *separate registrable domain*
(so cookies could not be scoped to it). The 2026-09-17 domain amendment settled on one zone —
`rhema.tools` — with the user-content origin at `usercontent.rhema.tools`, compensating with
host-only `__Host-` cookies (no `Domain` attribute → cookies never leave `rhema.tools`). The
matrix is MET-DIFFERENTLY; this retro-fits the record.

## Decision

User content serves from `usercontent.rhema.tools` — a subdomain of the single managed zone —
with isolation achieved by `__Host-`-prefixed, host-only cookies (`apps/api/src/auth.ts`) rather
than domain separation. The spec's §13.3 banner carries the amendment.

## Consequences

- One zone to manage (cert, DNS, ops) instead of a second registrable domain.
- The isolation property depends on every session cookie being host-only — enforceable and
  tested at the auth layer.
- Renders `rhema.app`/`rhemausercontent.com` references in older docs superseded.

## Alternatives considered

- Separate registrable domain as written: stronger isolation but doubles domain ops; the
  host-only-cookie scheme achieves the cookie-scope property the clause was after.

## Revisit trigger

Reopen if a cookie with `Domain=` ever ships (isolation silently degrades), or if a second zone
becomes operationally free.
