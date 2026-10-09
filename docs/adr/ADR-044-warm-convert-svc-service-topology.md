# ADR-044: The interactive preview leg is a warm `convert-svc` Cloud Run service; the Job stays for batch + fallback

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ONB.1
- **Requirement ids:** REQ-GROWTH-1 (amended), REQ-ARCH-23, REQ-ARCH-4
- **Spec:** §12.1, §13.3, §15.1, §13.5

## Context

REQ-GROWTH-1 promises a text-import preview inside 20 s. Measured live (PRB.20/PRB.21,
D-PRB.02-1): a 1,003-word `.md` took **3.5–5.6 minutes** end to end, almost all of it the convert
Cloud Run Job's cold start (~2.5–4 min per cold execution). §12.1 specifies `convert` as "a Cloud
Run Job per batch" — a shape built for `ingest.sync` re-conversion, not an interactive preview a
visitor waits on. The ticket owns this decision and requires every §12.1/§13.3 isolation property
to survive the change: no DB credential, no network egress route, memory cap + decompression
guard + content sniffing, an SA that writes `converted/` only, and conversion never inside `api`
or `fetcher`.

## Decision

- **`convert-svc`, a second Cloud Run *service***, runs the SAME `apps/convert` image — `main.ts`
  dispatches on `args: ["--serve"]` to a tiny HTTP server (`server.ts`) instead of the Job
  entrypoint. `POST /convert {quarantineKey}` reads `/<root>/<key>` through the SAME gcsfuse
  `/usercontent` mount (the service holds no GCS client), runs the SAME `convertBytes`, writes
  `converted/<ws>/<id>.json` through the mount (the replay contract is unchanged — a Job, a
  retry, or `ingest.sync` reading that prefix cannot tell which path wrote it), and returns the
  `ConversionResult` JSON in the response body.
- **Isolation is preserved verbatim, with two additions:**
  - same `convert` SA (bucket read + conditioned `converted/`-only write — `iam.ts` unchanged);
  - **no `vpcAccess`** — identical to the Job; the process has no network client and the mount is
    the platform's (the egress bound stays process + IAM level, live-probed in Stage B);
  - no DB credential, no env secrets, `CONVERT_ROOT` + `PORT` are the only envs;
  - **ingress `INTERNAL_LOAD_BALANCER`** and **`roles/run.invoker` for the api SA only** — the api
    mints an OIDC ID token per hop (the LIVE-FINDING-11 pattern fetcher/export already use);
  - **`minInstanceCount: 1` on prod** (the warm pool is the whole point — est. ≈$13/mo idle,
    inside the ticket's ≤$15 pre-authorization), **0 on non-prod** (a cold preview there is
    slower, never wrong); `maxInstanceCount` 4 prod / 2 non-prod.
- **The api's `Converter` becomes service-first with the Job as the resilience leg**
  (`createConvertServicePreview`, `packages/live-clients/src/ingest.ts`): `converted/` read-back
  first (a converted upload never re-converts), then `POST /convert` bounded by the caller's
  `waitMs`, then Job fallback on service 5xx / transport failure. A deterministic 4xx throws —
  the Job would fail identically, and the error surface matches the pre-ONB.1 contract. A client
  timeout returns `null` = pending: the service still finishes and writes `converted/`, so the
  next poll is a read-back hit.
- **§12.1's "Job per batch" remains the batch topology.** This ADR records the deviation: the
  *interactive preview* leg deviates to a service. The Job stays for `ingest.sync`, PDF, and the
  fallback — it is never replaced or deleted.

## Consequences

- Text formats answer in seconds from a warm instance; the 25 s request bound becomes headroom,
  not a cold-start budget. PDFs keep the 202-pending → Job path they already had.
- The warm instance is a real cost (≈$13/mo prod (idle min-instance)) — measured in the Stage B preview before
  deploy; above $15/mo the operator pauses per the ticket's gate.
- One image, one parser, one quarantine contract — no second conversion codebase to drift.
- A service outage degrades to Job latency (minutes), never to failure — the fallback leg keeps
  §12.1's resilience.
- `import_preview_p95_s` now measures this path; a warm-pool eviction or a steady Job-fallback
  share shows up as a p95 regression before users feel it.

## Alternatives considered

- **Pre-warmed Job executions / scheduled no-op runs.** Jobs have no min-execution knob — warm
  would need a keep-alive cron racing real invocations, and a race still cold-starts. Rejected:
  it burns spend without guaranteeing warmth at the request's moment.
- **Slimmer image + `startupCpuBoost` only.** Cuts seconds, not minutes — the cold-start
  measurement was 2.5–4 min dominated by instance provisioning, not code init. Insufficient
  against a 20 s SLO including the idle-cold case.
- **Conversion inside `api` or `web`.** Violates §13.3 outright (conversion only in `convert`)
  and smuggles untrusted-document parsing onto the request-serving tier. Rejected.
- **A separate converter service (different image/code).** Adds a second codebase + image to
  audit for the same isolation properties; the `--serve` mode keeps one. Rejected.

## Revisit trigger

Reopen when the p95 breaches for a sustained window AND the breach is warm-capacity-bound (max
instances saturated), or when conversion load makes a dedicated convert tier (bigger service,
separate scaling policy) cheaper than one shared image — or if §12.1 itself is amended to bless
service-topology conversion.
