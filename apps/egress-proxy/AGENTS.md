# AGENTS.md — Egress proxy

## Purpose

- Authorize model-provider traffic, enforce run/research limits, and record usage and fetched evidence.
- Root `AGENTS.md` applies. Sandbox-side changes also require `apps/run-task/AGENTS.md`.

## Architecture

- Credential → resolved run context → cap and outbound limits → URL policy → provider request →
  response metering and fetch log. The handler injects network/storage dependencies for tests.
- Provider credentials come from Secret Manager at the proxy boundary. Sandbox-supplied credentials
  and internal attribution headers must not reach the provider.

## Key Files

| File                                  | Lines (approx) | Purpose                                                       |
| ------------------------------------- | -------------- | ------------------------------------------------------------- |
| `apps/egress-proxy/src/main.ts`       | ~100           | Production proxy configuration and startup.                   |
| `apps/egress-proxy/src/handler.ts`    | ~650           | Authorization, policy, forwarding, and metering pipeline.     |
| `apps/egress-proxy/src/credential.ts` | ~150           | Credential extraction, allowlists, and upstream header scrub. |
| `apps/egress-proxy/src/metering.ts`   | ~100           | Provider-response usage accounting.                           |
| `apps/egress-proxy/src/cap.ts`        | ~50            | Run-cap admission checks.                                     |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/egress-proxy...
pnpm --filter @rhema/egress-proxy typecheck
pnpm --filter @rhema/egress-proxy lint
pnpm exec vitest run apps/egress-proxy/src
```

- Run from the repo root. Tests inject forwarding and storage; the SQL integration tests use the
  migrated PGlite schema. A passing offline suite does not prove live provider access or metering.

## Code Conventions

- Correct ✓: derive attribution and limits from resolved run context and metering from provider
  responses. Wrong ✗: trust sandbox-supplied costs, claimed usage, credentials, or unrestricted models.
- Preserve the proxy's independent accept/refuse implementation alongside the harness injector;
  sharing the entire gate would remove that defense-in-depth check.
- Extend JSON and streaming-response tests when changing usage or server-tool parsing.
- Keep fetch logs tied to executed provider research so delivery can prove cited sources were fetched.

## Critical Gotchas

1. **Every inference channel must be metered.** Authorization, cap admission, response usage,
   and refusal logging are one boundary; do not create a convenient unmetered forwarding path.
2. **Strip sandbox authentication and cookies.** `Authorization`, `x-api-key`, proxy credentials,
   and harness attribution headers are not forwarded. Insert the authorized provider key only here.
3. **Compression can silently blind the meter.** `credential.ts` strips `accept-encoding` so the
   current response parsers see uncompressed JSON/SSE. Do not restore it without implementing and
   testing metering/fetch-log parity for compressed responses.
4. **Research admission accounts for concurrent work.** Preserve in-flight reservations and the
   distinction between research, preflight, and backfill allowances in
   `apps/egress-proxy/src/outbound-limits.ts` and `apps/egress-proxy/src/url-policy.ts`.
5. **Provider metadata is not a substitute for run authority.** Endpoint/model grants, tenant/run
   ownership, caps, and attribution come from the validated credential context. A denied request
   must remain attributable without logging a credential or user content.

## Do / Don't

- **Do:** test denied, over-cap, and streaming cases alongside successful forwarding.
- **Don't:** trust model-authored billing data or let credentials cross the proxy boundary.
