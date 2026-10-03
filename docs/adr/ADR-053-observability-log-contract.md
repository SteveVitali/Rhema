# ADR-053: The structured error log contract — allowlisted fields, route templates, request/trace ids

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** OBS.1
- **Requirement ids:** REQ-VIS-11, REQ-ARCH-13, REQ-SPEC-29
- **Spec:** §13.5; ticket 74_OBS.1 owned decisions (1)

## Context

Two production defects motivated OBS.1: a chat 502 with no corresponding application log line, and
the discovery that error paths log ad-hoc strings (`console.error("[web] unhandled route error:",
err)` — full message + stack, which can embed user text). The ticket's enduring requirement: every
user-visible 5xx leaves ONE line an operator can follow from the load balancer to the line of code,
and nothing in that trail carries user text.

The decisions needing a record: (a) which fields a log line may carry and how the rule is enforced;
(b) what identifies a route in a log; (c) how a request is correlated LB → web → api; (d) how
swallowed-but-degrading reads stay visible without flooding the error stream.

## Decision

1. **Fixed-shape formatter.** `formatRouteErrorLine` in `@rhema/contracts` accepts a closed
   `RouteErrorFields` struct and serializes a fixed key allowlist: `severity`, `msg`, `service`,
   `route`, `method`, `status`, `upstreamStatus`, `upstreamCode`, `requestId`,
   `logging.googleapis.com/trace`, `errorClass`, `stack`, `degradedCount`. There is no `path`,
   `query`, `body`, `cookie`, `token`, or free-text `message` field — a call site cannot smuggle one
   in even by accident. `msg` is a stable event-name vocabulary token (`unhandled_route_error`,
   `unlogged_5xx_response`, `chat_upstream_refused`, `degraded_reads`, …), never the error's message.
2. **Route = the registered Hono template** (`c.req.routePath`, e.g. `/p/:slug/chat/turns`), never
   `c.req.path` — slugs, run ids, and filenames are user-selected data.
3. **Errors contribute class + message-stripped stack only.** `errorClass(err)` keeps the sanitized
   constructor name (`NonErrorThrow` for non-`Error` throws — their values are never serialized);
   `stackForLog` drops `err.stack`'s first line, which is `<name>: <message>` — the message is
   user-content-unsafe — and keeps the frame lines (`at fn (file:line:col)`), which are code
   positions. `err.message` is never read for logging anywhere.
4. **Request identity.** `x-rhema-request-id` is the web→api hop header (same convention as SEC.2's
   `x-rhema-client-ip`). Precedence on the api: `x-cloud-trace-context` trace id → W3C `traceparent`
   trace id (the LB's own trace, so app lines join the LB's trace-sampled request log) → a sanitized
   caller `x-rhema-request-id` (≤128 chars, inert transport characters only) → a minted UUID. The web
   mints for browser traffic and never honors an inbound `x-rhema-request-id` (client-forgeable). The
   id echoes on every response and rides the session headers web→api. `gcpProject` builds
   `projects/<p>/traces/<t>` for the Cloud Logging trace join.
5. **Exactly one line per 5xx, enforced structurally.** `app.onError` covers thrown errors; a
   non-`Error` throw is normalized to `NonErrorThrow` at the outermost middleware because Hono's
   `onError` gates on `err instanceof Error` (a non-Error throw otherwise escapes `app.fetch` to a
   silent bare 500). The request middleware sweeps: any response answered ≥500 without an
   `errorLogged` mark emits `unlogged_5xx_response`, so every direct `return c.json(…, 503)` is
   covered without ~40 call-site edits. Severity `WARNING` is reserved for expected refusals
   (upstream <5xx pass-throughs) and the degraded-read counter — the 5xx metric keys `severity=ERROR`
   + `status>=500`.
6. **Degraded reads count, they don't error.** A best-effort read a route swallows
   (`.catch(() => null)`) that still answers <500 emits ONE `WARNING degraded_reads` line per request
   carrying `degradedCount` — the count bumps at the dependency funnels: web's wrapped api-client
   fetch (upstream 5xx or transport drop) and api's `instrumentReads` proxies over `db.query`,
   `contentStore.get/put`, `ingestBlobs.read/write`, `restoreBlobs.*`, `txRunner.run`,
   `contentStoreFor(...)`. Funnels rather than ~170 call-site edits; AsyncLocalStorage carries the
   per-request counter because the funnel sits below the call sites. A funnel rejection that reaches
   `onError`/the 5xx sweep emits the error line instead — never both.

## Consequences

- Any 5xx — thrown, returned, or middleware-swept — emits exactly one allowlisted line at ERROR.
- The web→api request-id hop means an api error line for a web-originated request carries the SAME
  requestId; the LB trace id joins all three when the hop is trace-sampled.
- `degraded_reads` lines in test environments over-count: fake db/store implementations throw where
  production returns empty rows, so test logs show warnings on happy paths. In production a funnel
  rejection is a real failure. Accepted — the line is WARNING and carries no user text.
- Cloud Logging hoists `severity` and `logging.googleapis.com/trace` from the parsed jsonPayload, so
  the lines land in Error Reporting and join the LB request log by trace id.

## Alternatives considered

- **OpenTelemetry SDK end-to-end** — the ticket scopes OTel out for round 3; these ids are the seam
  it attaches to later. The formatter contract survives an OTel migration unchanged.
- **Per-call-site logging for the ~40 direct-5xx returns** — rejected: mechanical churn, and any
  missed site silently returns to the defect. The middleware sweep is one edit that covers every
  present and future ≥500 answer.
- **Per-call-site degraded counters** — same reasoning; funnel proxies cover all present and future
  call sites.
- **`err.message` in the line** — rejected outright: messages concatenate user input at call sites
  the linter cannot police.

## Revisit trigger

Reopen if: an attacker or defect demonstrates user text reaching a production log through this
shape; a field proves necessary that the allowlist lacks (amend the allowlist deliberately, in
`@rhema/contracts` only); or a real OTel collector lands (the line shape becomes span-event input,
the ids become baggage attributes — the contract should map 1:1).
