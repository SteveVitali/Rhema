# ADR-047: The held draft dies only to a token-matched consumed marker or an explicit Discard — never to a page view

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ONB.1
- **Requirement ids:** REQ-GROWTH-1 (amended)
- **Spec:** §15.1, §15.3

## Context

PR-R4's defect: a landing-dropped draft attached on the *first* post-signup `/app/new` view only.
P1.17's island called `markClaimed()` immediately after hydrating the file input — a
`claimed` flag on the IDB record meant every later visit skipped hydration, showing "Your held
file is here" over an **empty** input. REQ-GROWTH-1 is amended: the hold persists until it is
*consumed into a project or discarded*. The ticket owns the lifecycle that makes "consumed"
server-confirmed rather than browser-assumed.

## Decision

- **No claim-on-attach.** The `claimed` flag is retired from `HoldRecord` semantics (legacy
  records carrying it are simply ignored). On EVERY `/app/new` load while a hold exists, the
  island reads IDB and re-populates the file input via `DataTransfer` — the second visit and the
  tenth behave like the first. The server renders `data-held`, the notice, the hidden
  `heldToken` field, and `landing.js` unconditionally on `/app/new`, so hydration does not depend
  on `?held=1` surviving as a query param.
- **The hold's token rides the create.** When the held bytes attach, the island stamps the
  hold's `token` into the hidden `heldToken` input (only when the file actually attached — an
  unrelated upload never consumes someone else's hold). It flows form → poll URL → preview
  hidden fields → `POST /app/new/create`.
- **Consumption is server-echoed.** On a successful create the web redirects to the project
  with `?hc=<token>`; the project page renders `data-held-consumed="<token>"` + `landing.js`;
  the island deletes the hold (bytes included) ONLY when the echoed token matches the hold's
  own token. A foreign, empty, or absent marker leaves the hold untouched — consumption is
  provable from the server having seen the create, not inferred from the page having loaded.
- **Discard is the other, user-owned path.** A prominent island-injected control deletes the
  hold + clears the input immediately — device-local by definition, so no server route is
  needed (or wanted: a shared device's hold must be abandonable without a round-trip).
- **Privacy invariants are unchanged:** the hold carries no account binding off-device; the
  pre-auth beacon still carries token + kind + size only — never bytes or filename.

## Consequences

- The hold survives sign-in, magic-link hops, reloads, and repeated `/app/new` visits — it is a
  durable client-side intent, not a one-shot attachment (the ticket's N1 proof).
- Deletion requires positive evidence (a server-confirmed matching token) — a stray page view,
  an abandoned preview, or an unrelated upload can never silently lose the draft.
- On `DataTransfer`-less browsers the notice says exactly what to do ("pick the same file
  again") — never an empty input under "your held file is here".
- The token is meaningless outside the browser that holds the bytes; the `?hc=` echo leaks
  nothing an attacker could redeem.

## Alternatives considered

- **Keep `claimed`, fix the copy.** Still loses the draft to any post-claim abandonment and
  still cannot distinguish "consumed" from "seen once". Rejected — it was the defect.
- **Delete the hold at hydrate-time / at preview.** A failed upload or a closed tab loses the
  draft before a project exists. Rejected — consumption must mean *project created*.
- **Delete on ANY success landing (no token).** An unrelated create (e.g. a second upload on the
  same device) would eat the hold. The token match makes consumption causal. Rejected.
- **Server-tracked hold.** Uploads pre-auth bytes to the server — violates REQ-GROWTH-1's
  "held client-side until signup" outright. Rejected.

## Revisit trigger

Reopen if cross-device holds become a requirement (a hold is per-browser by design — a device
switch today requires re-dropping), or if a create path can succeed without the `?hc=` echo —
the handshake assumes every create-success route carries it.
