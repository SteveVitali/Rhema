# R6HRD.1 — post-launch posture hardening bundle (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — four findings/cleanup items:
  (1) plaintext DSN in the proxy InstanceTemplate `database-url` metadata → move to a
  Secret-Manager-reference consumed at boot; (2) `console.error("journey dsn user:", …)` debug
  line in `journeys.yml`; (3) the retained `10.8.16.4` (`proxy-ip`) rollback reservation — decide
  post-soak per ADR-122; (4) TEST-mode Stripe Payment Link `plink_1UVxKU…` cleanup.
  Authorization: GD-DEPLOY.R6 posture + the 2026-11-02 operator directive ("yeah sure, whatever
  you can do now, might as well"). mergePolicy=OPERATOR — never merge.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); LEDGER GATE DECISIONS
  `GD-DEPLOY.R6`/`GD-REMAINING.R6`; `docs/adr/ADR-122-…md` (rollback + cleanup-up-D ordering);
  `docs/build/runs/R6DEP.4.md` (the F-flag + env/IaC recipe); `infra/AGENTS.md`;
  `apps/egress-proxy/AGENTS.md`.
- **Base:** `origin/main` @ `d2bd2c410af096d52a312c0d0783cb19f622ee99` (post-#234 merge).
- **Branch:** `stevevitali/r6hrd-1-posture` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-03T02:5xZ · **Closed:** (at close)
- **Production mutations (named scope):** `pulumi up --stack prod` (proxy InstanceTemplate roll —
  metadata `database-url` → `database-url-secret` NAME + new `rhema:proxyImage` digest; +1
  `rhema-prod-proxy-database-url` Secret container + program-managed version + IAMMember;
  **−1 `proxy-ip` Address** — the ADR-122-named post-soak cleanup); egress-proxy Cloud Build
  (`_SERVICES=egress-proxy`); Stripe API `active=false` on the TEST-mode `plink_1UVxKU…`
  via the nonprod `sk_test_` (SM `rhema-nonprod-stripe-secret`, stdin-piped, never printed).
  Rollback: `git revert` + redeploy (proxy DSN: `rhema:proxyDatabaseUrl` config retained — the
  SM version is program-written from it; the `proxy-ip` reservation is post-soak — a re-created
  Address takes a new literal and `proxyBaseUrl` repoints, ADR-122's own caveat).
- **Pre-state (recorded BEFORE mutations):** prod serves `4938b8e` (R6DEP.4; web+api `/healthz`
  gitSha match; `deployments` row `prod:4938b8e…`). Proxy MIG `targetSize=2` behind ILB VIP
  `10.8.16.7:8443` (`rhema:proxyBaseUrl`); `proxy-ip` `10.8.16.4` reserved-but-unused since
  2026-10-24 (update 162). Proxy template metadata carries `database-url` plaintext (the F-flag).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in blast radius: none scoped to this
bundle — the four items are findings/cleanups, not deferral carriers. `D-R6INF.1-1` is DONE
(R6INF.2); its ADR-122 rollback note is the item-3 authority. `D-R6PAIDARM-1` stays OPEN
(paid-cron re-proof — not touched here; the debug-line removal doesn't change semantics).

## Requirements (operator directive — deliverables)

1. **DSN out of metadata.** Root-cause: `infra/pulumi/proxy.ts` `buildProxyStartupScript` reads
   `database-url` instance metadata → `docker run -e DATABASE_URL`; `compute.ts` writes the
   plaintext value (`args.proxyDatabaseUrl` — `rhema:proxyDatabaseUrl` secret config) into the
   InstanceTemplate `metadata` — visible to `compute.instances.get`. Fix per the existing
   `access()` seam: SM container `rhema-prod-proxy-database-url` + version + proxy-SA
   `secretAccessor`; metadata carries only the secret NAME (`database-url-secret`); the proxy app
   resolves `DATABASE_URL_SECRET` via `createSecretAccessor` at boot (same path as
   `ANTHROPIC_KEY_SECRET`). End state: zero secret in template/instance metadata.
2. **Debug line removal** — `journeys.yml` `console.error("journey dsn user:", u.username)`.
3. **`10.8.16.4` disposition** — ADR-122 retained it as the rollback path, "cleanup `up` D
   deletes the reservation once the VIP path has soaked" (suggest ≥7d). Deployed 10-24;
   failover drill green; ~10 d soak. Decide honestly, date-note either way.
4. **`plink_1UVxKU…` cleanup** — TEST-mode object; `sk_test_` via `rhema-nonprod-stripe-secret`
   (Stripe API has no delete for payment links — `active=false` is the removal verb).
5. **Deploy + verify** — `pulumi preview` zero stateful replace/delete except the stateless
   template roll + the named `proxy-ip` delete; `pulumi up`; proxy healthy post-roll
   (backend health + boot log listening); `instances describe` shows no DSN metadata.
6. **Verify** — `pnpm turbo build lint typecheck` + `pnpm test` touched;
   `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base <merge-base>` OK.
7. **Records** — this ledger + `docs/build/pr/R6HRD.1.md` + `gh pr create` + BUILD_INDEX 239 +
   LEDGER (findings → RESOLVED, PHASE LOG, `nextTicket` stays `200_R6WATCH.1`) + ci-boundary.

## Plan

1. App half: `apps/egress-proxy/src/main.ts` resolves `DATABASE_URL_SECRET` (SM version name)
   through the shared `createSecretAccessor`, `DATABASE_URL` env stays the fallback; tiny
   exported resolver + unit test.
2. IaC: `proxy.ts` script reads `database-url-secret` metadata → `-e DATABASE_URL_SECRET`;
   `compute.ts` metadata swap + `proxy-ip` creation conditional on `egressProxyIpPin` +
   template `dependsOn` the program-managed secretVersions; `iam.ts` proxy-SA grant;
   `index.ts` prod-only `proxy-database-url` extraIds + SecretVersion from
   `rhema:proxyDatabaseUrl` (`ignoreChanges: secretData` prod precedent) + arg rewire.
3. journeys.yml debug line out (+ comment fix).
4. Update `compute.test.ts`/`proxy.test.ts` pins to the new contract (conditional `proxy-ip`,
   `database-url-secret` NAME-only metadata).
5. Build egress-proxy image (`_SERVICES=egress-proxy`, `_TAG=r6hrd-1`) → pin `rhema:proxyImage`
   → `pulumi preview --diff` classify → `pulumi up` → verify (template/instance metadata clean,
   backend health, boot log) → Stripe deactivate → records + PR + boundary.

## Test matrix

| AC → leg | kind |
|---|---|
| `DATABASE_URL_SECRET` resolves via accessor; `DATABASE_URL` env fallback; neither → named fail | unit — `main.test.ts` resolver |
| startup script reads `database-url-secret` + passes `DATABASE_URL_SECRET`; no `database-url` | unit — `proxy.test.ts` |
| template metadata carries a NAME not the value; `proxy-ip` conditional on `egressProxyIpPin` | unit — `compute.test.ts` source pins |
| IAM grant proxy-SA → `proxy-database-url` (prod) / `system-database-url` (non-prod) | unit — `compute.test.ts` source pin |
| Live: template+instance metadata show no `database-url`; proxy boots + serves via VIP | live — `instance-templates describe`, `instances describe`, backend health, serial/boot log |
| journeys.yml has no `journey dsn user` line | unit — workflow source grep (+ workflow-env tests stay green) |
| `plink_1UVxKU…` inactive on Stripe | live — API `active:false` response |
| Verify | `pnpm turbo build lint typecheck`; `pnpm test` touched pkgs; check-build-memory; append-only vs `d2bd2c4` |

## Progress

- 2026-11-03T02:5xZ — branch cut at `d2bd2c4` off `origin/main`; DEFERRALS/LEDGER/R6DEP.4/ADR-122
  read; design settled (app-side `DATABASE_URL_SECRET` via `createSecretAccessor` — the same
  seam `ANTHROPIC_KEY_SECRET` uses; program-managed SecretVersion from the retained
  `rhema:proxyDatabaseUrl` config so `pulumi up` alone lands the value; `proxy-ip` deleted —
  ILB clean since 10-24, failover drill green, ≥7 d soak per ADR-122's own cleanup step).

## Gap table / Evidence log / Evidence report

(filled at close)
