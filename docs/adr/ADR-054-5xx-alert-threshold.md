# ADR-054: 5xx alerting keys the LB-observed count, fires on any occurrence

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** OBS.1
- **Requirement ids:** REQ-ARCH-13
- **Spec:** §13.5; ticket 74_OBS.1 owned decisions (2)

## Context

The ticket requires a log-based 5xx metric, an AlertPolicy (threshold + window owned by this
ticket), and a dashboard tile. §13.5's rule for the api is an error-budget-burn alert (>2×) — but
that policy exists for the aggregate availability SLO (the `gcp.monitoring.Slo` in the same file).
The OBS.1 alert has a different job: flag every discrete 5xx event class as a defect trail, at beta
scale where per-request volume is low and every single 5xx is worth an incident record.

Two candidate signals existed: HOT.1's LB request logs (`httpRequest.status>=500` — the spec'd
metric, which also sees 5xxs the app never reached: backend timeouts, no-healthy-backend) and the
app's structured error lines (`severity=ERROR` + `jsonPayload.status>=500`, labelled by route
template). The policy uses both.

## Decision

- **Metric `rhema_lb_5xx_requests`** — log-based counter over `resource.type="http_load_balancer"`
  entries with `httpRequest.status>=500`, labelled `backend_service` (from
  `resource.labels.backend_service_name`) and `status`. This is the ticket-specified metric.
- **Metric `rhema_route_5xx_errors`** — log-based counter over `cloud_run_revision` jsonPayload
  lines with `severity=ERROR`, `status>=500`, `service` + `msg` present; labels
  `service`/`route`/`status`/`msg`. `requestId` is deliberately NOT a label — per-request label
  cardinality would create one time series per request.
- **One AlertPolicy, OR-combined**: fires when either counter's aligned (300 s, `ALIGN_COUNT`)
  series exceeds 0, `duration: 0s`, `trigger.count: 1`, `autoClose: 1800s`. Any 5xx in a 5-minute
  window records an incident. The policy attaches the existing ops webhook channel when the stack
  configures `rhema:opsAlertWebhookUrl`; on prod today it records incidents unnotified (paging is
  HUMAN-H7's).
- **Dashboard**: two tiles beside the §13.5 widgets — "LB 5xx requests by backend service" and
  "route 5xx errors (structured log)" grouped by `service`/`route`.

## Consequences

- A single 5xx opens an incident (auto-closed after 30 min quiet) — the right sensitivity at beta
  volume: the SLO burn-rate alert would sleep through isolated 5xxs that this ticket exists to make
  traceable. If prod traffic grows to where isolated 5xxs are routine, the threshold tightens
  (revisit trigger).
- The OR-combined policy can record one incident per condition per window (LB-observed AND
  app-logged) — acceptable: they are different defect classes (one is "the LB saw a 5xx", the other
  "the app logged its 5xx trail") and both are unnotified records until H7.
- LB-observed 5xxs without a matching app line are precisely the "no app log line" defect class —
  the two-metric join makes that gap visible on the dashboard.

## Alternatives considered

- **Error-budget burn-rate alert (>2× burn)** — the §13.5 rule, already implemented for the
  availability SLO. Rejected as the OBS.1 alert: at beta volume a burn-rate alert under-reports the
  discrete defect events this ticket is meant to surface; it stays as the availability policy.
- **Alert on the app metric only** — rejected: misses 5xxs the app never saw (the exact class that
  produced "a 502 with no corresponding application log line").
- **threshold > N per window** — rejected: choosing N>0 silently accepts "a few 5xxs are fine",
  which contradicts the ticket's every-5xx-has-a-trail contract at current traffic levels.

## Revisit trigger

Reopen if unnotified incidents become routine noise (a sustained background rate of isolated 5xxs
that are not defects — e.g., public scanners hitting the LB), or when HUMAN-H7 wires the webhook:
then recalibrate to a count/rate threshold that reflects the real 5xx baseline.
