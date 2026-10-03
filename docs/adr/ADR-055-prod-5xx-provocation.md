# ADR-055: provoke the one verification 5xx by env-misconfiguration, not a deployed fault route

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** OBS.1
- **Requirement ids:** REQ-ARCH-13
- **Spec:** §13.5; ticket 74_OBS.1 owned decisions (3)

## Context

The ticket's production evidence requires one real 5xx traced end to end: LB request log →
application structured error line (same requestId) → Error Reporting group → recorded incident.
Someone must deliberately produce that 5xx — but the ticket also forbids the two easy mechanisms:
no user-data writes, and no permanently deployed route whose only job is to return 500.

Options considered:

1. **A temporary `?__fault=500` route / env-gated fault flag.** Rejected: even a "temporary" or
   token-gated fault route is attack surface that ships to prod, survives reverts, and invites
   copy-paste. The ticket's prohibition covers the spirit (deployed code whose only purpose is
   faulting), not just the letter.
2. **Wait for an organic 5xx.** Rejected: beta traffic may not produce one inside the ticket
   window, and an uncontrolled failure is the least reproducible evidence.
3. **Env-misconfigure a real dependency for one request window.** Point the api's
   `OBJECTS_BUCKET` at a nonexistent bucket via `gcloud run services update`, drive one
   authenticated request on a real user flow that reads object bytes (a dossier page → the api's
   `store.get` → GCS 403/404 → the route's unhandled error path → 500), then revert the env var.
   The failure is genuine — it exercises the real auth, fetch, and error path, not a stub —
   and leaves no code or route behind.

## Decision

The verification 5xx is provoked by temporarily pointing `OBJECTS_BUCKET` at a nonexistent bucket
on the prod api revision, issuing one request on a real byte-reading flow, and reverting the env
var in the same session. Total exposure window is one request; the failure mode is a real GCS
permission/404 error through the new plain-fetch transport; nothing is committed, and the revert
is verified by the health check before the evidence is recorded.

The LB log line, the app's `route_error` structured line, and the Error Reporting group are
correlated by the propagated request id (`x-cloud-trace-context` → `logging.googleapis.com/trace`
field); the query set and timestamps are recorded in the run ledger.

## Consequences

- No fault code ships to prod; the only deployed artifact is the observability work itself.
- The provocation is repeatable (any operator can re-run the three-command procedure) and the
  revert is self-verifying.
- If the api is later bound to additional byte stores, the procedure stays valid — any
  bucket-scoped env var works.

## Revisit trigger

Revisit if a future ticket adds a sanctioned fault-injection surface (e.g., a Chaos/ops toolkit
behind IAP), or if the observability ticket set later requires sustained error-rate generation
rather than a single traceable event — at that point a purpose-built, operator-gated fault path
may beat ad-hoc env misconfiguration.
