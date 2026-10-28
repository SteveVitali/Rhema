# AGENTS.md — API

## Purpose

- Expose authenticated project, writing, run, and billing operations; adapt requests to shared packages.
- Root `AGENTS.md` applies. Database changes also require `packages/db/AGENTS.md`; lifecycle changes
  require `packages/orchestrator/AGENTS.md`.

## Architecture

- `createApp(deps)` composes Hono routes with injected dependencies for in-process tests.
- `apps/api/src/server.ts` is the live composition root: PostgreSQL, Redis, pg-boss, Secret Manager,
  and storage clients. Keep infrastructure construction separate from route logic.
- Browsers use the web host's same-origin BFF. Better Auth's base URL and callback use the app origin;
  the web host proxies auth requests and forwards session cookies to the API.

## Key Files

| File                           | Lines (approx) | Purpose                                                          |
| ------------------------------ | -------------- | ---------------------------------------------------------------- |
| `apps/api/src/index.ts`        | ~700           | App factory, dependency interfaces, and route registration.      |
| `apps/api/src/server.ts`       | ~550           | Production dependency wiring and server startup.                 |
| `apps/api/src/auth-context.ts` | ~200           | Session principal, request context, origin guard, and scoped DB. |
| `apps/api/src/env.ts`          | ~300           | Validated configuration and secret-name inputs.                  |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/api...
pnpm --filter @rhema/api typecheck
pnpm --filter @rhema/api lint
pnpm exec vitest run apps/api/src
pnpm exec vitest run packages/security-checks/src/rls-catalog.test.ts packages/security-checks/src/system-pool-boundary.test.ts
```

- Commands run from the repo root. Route tests use injected dependencies; starting the live server
  requires configured services and credentials, as described in `docs/configuration.md`.

## Code Conventions

- Place feature handlers beside their `*-routes.test.ts`; register them in the app factory.
- Resolve the principal once through session middleware. User-serving database access goes through
  the request-scoped client or a tenant transaction, under `USER_SERVING_ROLE`.
- Correct ✓: consume the authenticated principal and parameterize SQL within its workspace.
  Wrong ✗: trust caller-supplied workspace headers in production or use the system pool for a route.
- Keep shared request/response shapes in `packages/contracts` and their consumers aligned; do not
  expose private protocol/eval text through DTOs, events, or OpenAPI.
- Read configuration through `readApiEnv`; pass Secret Manager resource names, never key values,
  through deployment configuration.

## Critical Gotchas

1. **The database client is request-scoped.** `createScopedDb` checks out a connection and calls
   `withTenant` when a principal exists. Its unscoped path must remain a non-bypass application
   role: FORCE RLS denies tenant rows, while account/auth tables remain accessible as designed.
   Add new tenant reads to the two-tenant probe in `packages/security-checks/src/rls-catalog.test.ts`.
2. **System clients are exceptional seams.** Queue transport and documented system operations can
   require elevated access; this does not authorize route handlers to use it. Consult
   `tools/system-pool-boundary.json` and retain explicit workspace predicates.
3. **Same-site does not mean trusted origin.** User content has its own host. Preserve the mutation
   origin allowlist and host-only auth cookie behavior; do not weaken them to make a browser test pass.
4. **Header identity is not production auth.** The middleware's injected-header fallback is for
   dev/preview only. `sessionScopedPrincipal` outside middleware returns null, never header identity.
5. **Financial state belongs to the shared ledger.** Preserve idempotency, holds, refunds, and
   transaction coupling; do not add ad hoc balance writes in routes. Prices, estimates, and trial
   entitlements must come from their shared configuration.
6. **Unconfigured external services fail honestly.** Auth and billing have explicit unconfigured
   behavior; a mock response or placeholder key is not evidence that login or payment works live.

## Do / Don't

- **Do:** test refusal and cross-tenant cases alongside a successful request.
- **Don't:** instantiate infrastructure clients inside a route or bypass shared auth/accounting seams.
