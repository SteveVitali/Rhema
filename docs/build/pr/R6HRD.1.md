# R6HRD.1 — post-launch posture hardening bundle

**Kind:** findings/cleanup · **Base:** `main` @ `d2bd2c4` · mergePolicy=OPERATOR (never self-merged)

## Summary

Four post-launch posture items, three landed and deployed live on prod, one discharged via the
Stripe API:

1. **Plaintext DSN in the proxy InstanceTemplate metadata (F-R6DEP4-2)** — the egress-proxy
   MIG's `database-url` instance metadata carried the postgres DSN in plaintext, visible to
   anyone with `compute.instances.get`. The DSN now lives only in Secret Manager
   (`rhema-prod-proxy-database-url`, program-managed version seeded from the retained
   `rhema:proxyDatabaseUrl` SECRET config); the template metadata carries the secret **NAME**
   (`database-url-secret`), and the proxy resolves `versions/latest` at boot via the instance
   SA — the exact `ANTHROPIC_KEY_SECRET` / `createSecretAccessor` seam. Deployed
   (update 172, MIG rolled to `b54c9b9`); template + instance metadata verified clean;
   `docker inspect` env carries NAME only; `[egress-proxy] listening` (the boot-time SM fetch
   is awaited before listen); 2×HEALTHY behind the VIP.
2. **`console.error("journey dsn user:", …)` debug line** removed from `journeys.yml` (was a
   diagnostic printing the DB username to CI logs; tunnel is proven now).
3. **`10.8.16.4` (`proxy-ip`) rollback reservation DELETED** — ADR-122's own cleanup step:
   "cleanup `up` D deletes the reservation once the VIP path has soaked." The ILB held clean
   since 2026-10-24 (failover drill green, credentialed egress through the VIP, three deploys
   since); ~10 d ≥ the suggested ≥7 d soak. Post-soak rollback per the ADR's caveat: a
   re-created Address takes a new literal → repoint `rhema:proxyBaseUrl` + up.
4. **TEST-mode `plink_1UVxKU2MLe3ETP9S0YzD7T9L` deactivated** — `active:false` via the nonprod
   `sk_test_` (stdin-piped, never printed; `sk_live` can't touch test mode). Stripe has no
   delete verb for payment links — `active=false` is the removal. Its price can't archive
   (product default); the parent product `prod_VX1NQq7Q9E3oVP` is `active:false` too.

## What changed

- `apps/egress-proxy/src/main.ts` — `resolveProxyDatabaseUrl` (`DATABASE_URL_SECRET` via the
  shared `SecretAccessor`; `DATABASE_URL` env stays the local/test fallback; neither → named
  fail-closed). `main.test.ts` +5 tests.
- `infra/pulumi/proxy.ts` — startup script reads `database-url-secret` →
  `-e DATABASE_URL_SECRET`.
- `infra/pulumi/compute.ts` — metadata `database-url` → `database-url-secret` (NAME);
  `proxy-ip` Address now exists only while `egressProxyIpPin` needs it; template `dependsOn`
  the secret versions + IAM members (boot-order).
- `infra/pulumi/iam.ts` — egress-proxy SA `secretAccessor` on `proxy-database-url` (prod) /
  `system-database-url` (non-prod).
- `infra/pulumi/index.ts` — prod `extraIds: ["proxy-database-url"]` + program-managed
  `SecretVersion` (`ignoreChanges: secretData`, the app-database-url prod precedent); arg
  rewired to `proxyDatabaseSecret`.
- `infra/pulumi/compute.test.ts` / `proxy.test.ts` — pins updated to the new contract
  (NAME-only metadata, conditional `proxy-ip`).
- `.github/workflows/journeys.yml` — debug line out.
- `infra/pulumi/Pulumi.prod.yaml` — doc comment + `rhema:proxyImage` → `5237d8f9…`
  (Cloud Build `d1b8f9ec`, `_SERVICES=egress-proxy` @ `994c177`).

## Verification

| AC | evidence |
|---|---|
| zero-secret-in-metadata, deployed | update 172; `instance-templates describe` + `instances describe` metadata = NAME-only; `docker inspect` env NAME-only; `[egress-proxy] listening`; 2×HEALTHY |
| preview zero stateful replace/delete | +3 create / +-1 template / ~1 MIG / −1 `proxy-ip` (the ticket's own item), 175 unchanged |
| debug line gone | grep; `workflow-env.test.ts` 5/5 |
| `10.8.16.4` disposed | `addresses list` = `proxy-vip` `10.8.16.7` only |
| plink deactivated | API 200 `active:false` (+ product archived) |
| repo green | `pnpm turbo build lint typecheck` 135/135; vitest egress-proxy+infra 295; `infra/pulumi tsc --noEmit` clean |

Live smoke: api `/healthz` `gitSha=4938b8e` (unchanged — only the proxy image rolled;
`deployments` row honestly not owed), `rhema.tools` 200. Spend $0.

## Carries

- `Pulumi.dev.yaml` (and the destroyed `Pulumi.pr-230.yaml`) pin pre-fix egress-proxy digests —
  a non-prod `up` on an old pin pairs `DATABASE_URL_SECRET` with an image that only reads
  `DATABASE_URL` → fail-closed crash-loop (no leak). Program + image pins travel in the same
  checkout; prod is pinned.
- `price_1UVxKU2MLe3ETP9S58EMA6es` cannot be archived (product default) — harmless, the link
  and product are both inactive.
