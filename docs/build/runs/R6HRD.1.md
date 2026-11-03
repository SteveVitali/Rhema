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
- **Started:** 2026-11-03T02:5xZ · **Closed:** 2026-11-03T03:0xZ
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
| Verify | `pnpm turbo build lint typecheck`; `pnpm test` touched pkgs; check-build-memory; append-only vs `d2bd2c4`; ci: pass #235@f0854ed |

## Progress

- 2026-11-03T02:5xZ — branch cut at `d2bd2c4` off `origin/main`; DEFERRALS/LEDGER/R6DEP.4/ADR-122
  read; design settled (app-side `DATABASE_URL_SECRET` via `createSecretAccessor` — the same
  seam `ANTHROPIC_KEY_SECRET` uses; program-managed SecretVersion from the retained
  `rhema:proxyDatabaseUrl` config so `pulumi up` alone lands the value; `proxy-ip` deleted —
  ILB clean since 10-24, failover drill green, ≥7 d soak per ADR-122's own cleanup step).

## Gap table / Evidence log / Evidence report

- 2026-11-03T02:5xZ — code landed `994c177`: `main.ts` `resolveProxyDatabaseUrl`
  (`DATABASE_URL_SECRET` via `createSecretAccessor`, `DATABASE_URL` fallback, named
  fail-closed) + `main.test.ts` (5 tests); `proxy.ts` script → `database-url-secret` /
  `-e DATABASE_URL_SECRET`; `compute.ts` metadata swap + `proxy-ip` conditional on
  `egressProxyIpPin` + template `dependsOn` secretVersions+iam.members; `iam.ts` proxy-SA
  grants (prod `proxy-database-url` / non-prod `system-database-url`); `index.ts` prod
  `extraIds` + program-managed `SecretVersion` from `rhema:proxyDatabaseUrl`
  (`ignoreChanges: secretData`, app-database-url precedent); journeys.yml debug line out;
  `Pulumi.prod.yaml` doc + pin.
- Verify pre-deploy: `pnpm turbo build lint typecheck` 135/135 · vitest egress-proxy+infra
  295 pass (incl. `main.test.ts` 5, `proxy.test.ts` 3, `compute.test.ts` 26) ·
  `workflow-env.test.ts` 5 · `infra/pulumi tsc --noEmit` clean.
- 2026-11-03T02:5xZ — **Cloud Build `d1b8f9ec-1896-474b-872c-fa14bca44be1` SUCCESS** —
  `_SERVICES=egress-proxy`, `_GIT_SHA=994c177…`, `_TAG=r6hrd-1`, 1m10s → digest
  `sha256:5237d8f9f2838911693736b9b7003e6f378f93a876e90271053e309b20ad1cdc`, pinned in
  `Pulumi.prod.yaml` w/ dated comment.
- **Stripe (item 4) — discharged live:** `plink_1UVxKU2MLe3ETP9S0YzD7T9L` → `active:false`
  (200) via the nonprod `sk_test_` (SM `rhema-nonprod-stripe-secret`, stdin pipe — key never
  printed; `sk_live` can't touch test-mode). Stripe exposes NO delete verb for payment
  links — `active=false` is the removal. `price_1UVxKU2MLe3ETP9S58EMA6es` can't archive
  ("default price of its product"); parent `prod_VX1NQq7Q9E3oVP` ("Rhema preview top-up
  (test)") → `active:false` — nothing purchasable remains.
- 2026-11-03T02:5xZ — **`pulumi preview --diff --stack prod` classified:** +3 create
  (`rhema-prod-proxy-database-url` Secret + `…-v1` SecretVersion + `proxy-reads-proxydb`
  IAMMember), +-1 replace (stateless InstanceTemplate — `database-url` removed,
  `database-url-secret` NAME + new digest + new script), ~1 update (MIG version ptr),
  **−1 delete (`proxy-ip` Address — the ADR-122-named post-soak cleanup)**, 175 unchanged.
  Zero stateful replace/delete; the one delete is the ticket's own item 3. Cost Δ≈−$0.001/day.
- **`pulumi up` update 172 SUCCEEDED (46s).** MIG rolled to `rhema-prod-proxy-tmpl-b54c9b9`;
  old instances deleted, `proxy-rwjl`/`proxy-bvpb` RUNNING on the new template.
- **Zero-secret verified live:** `instance-templates describe b54c9b9` + `instances describe
  proxy-rwjl` metadata = `database-url-secret`→`projects/…/rhema-prod-proxy-database-url/
  versions/latest` + `anthropic-key-secret` NAME + `proxy-image` + `proxy-port` + `ssh-keys`
  + `startup-script` — **no `database-url` key, no secret value anywhere in metadata.**
- **Proxy healthy post-roll:** serial log shows image `5237d8f9` pulled + startup-script
  exit 0; `docker logs egress-proxy` = **`[egress-proxy] listening on :8443 →
  api.anthropic.com`** (that line is gated on the awaited SM DSN fetch + pool — the
  `createSecretAccessor` path works through the instance SA); `docker inspect` env carries
  only `DATABASE_URL_SECRET=projects/…/versions/latest` — a NAME, no value;
  `backend-services get-health` = 2×HEALTHY behind VIP `10.8.16.7`.
- **`10.8.16.4` (item 3) — DELETED honestly:** `addresses list` = only `proxy-vip`
  `10.8.16.7`; the reservation `rhema-prod-proxy-ip-effec9d` is gone. Basis: ADR-122's own
  rollback note ("cleanup `up` D deletes the reservation once the VIP path has soaked",
  suggest ≥7d) — deployed 2026-10-24 (updates 160–162), failover drill green (232s autoheal,
  credentialed egress through the VIP with metered rows), ~10 d soak, and three clean deploys
  since (R6DEP.3/R6DEP.4/this roll). Post-soak rollback per the ADR's caveat: a re-created
  Address takes a NEW literal — repoint `rhema:proxyBaseUrl` + up.
- **Smoke:** api `/healthz` `gitSha=4938b8e…` (unchanged — only the proxy image rolled;
  `record-deployment`/`deployments` row honestly not owed, R6OPS.2 precedent); `rhema.tools`
  web 200.
- **Carry note (not a deferral):** `Pulumi.dev.yaml` + the destroyed `Pulumi.pr-230.yaml`
  still pin pre-fix `egress-proxy` digests — a non-prod `pulumi up` on an OLD pin now pairs
  `DATABASE_URL_SECRET` with an image that only reads `DATABASE_URL` → fail-closed
  crash-loop (no leak). Program + image pins travel in the same checkout (preview lifecycle
  builds from its own SHA); prod is pinned. No owed action.
- **Carry note 2:** the Stripe `price_1UVxKU2MLe3ETP9S58EMA6es` cannot be archived (default
  product price); harmless — the link and its product are both `active:false`.

## Gap table

| item (directive §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| 1. DSN out of metadata → SM-ref + boot fetch, zero-secret end state | live-executed | live-executed | **met** | `main.ts` resolver + SM container + IAM + `database-url-secret` NAME; update 172; template/instance metadata describe clean; `listening` log; inspect env NAME-only |
| 1b. preview = zero stateful replace/delete except stateless template roll | live-executed | live-executed | **met** | preview classified +3/+-1/~1/−1(`proxy-ip`, the ticket's own item); up 172 46s |
| 2. journeys.yml debug line removed | engineered | engineered | **met** | `.github/workflows/journeys.yml` — `console.error("journey dsn user:",…)` gone; `workflow-env.test.ts` green |
| 3. `10.8.16.4` disposition — honest decide | live-executed | live-executed | **met** | deleted (up 172); `addresses list` VIP-only; ADR-122 soak basis recorded |
| 4. `plink_1UVxKU…` TEST-mode cleanup | live-executed | live-executed | **met** | `active:false` on link + product (price unarchivable — recorded); no delete verb exists |
| 5. verify commands | engineered | engineered | **met** | turbo 135/135; vitest 295+5; check-build-memory + append-only + ci-boundary at close |
| 6. records | engineered | engineered | **met** | this ledger + pr/R6HRD.1.md + BUILD_INDEX 239 + LEDGER + PR |

**Findings:** F-R6DEP4-2 (plaintext proxy DSN in template metadata — flagged without an id in
`runs/R6DEP.4.md`) → **RESOLVED live**. **Deferrals:** none opened/closed. **Deviations:**
Stripe "delete" = `active:false` (no delete verb for payment links); the DSN stays in
`rhema:proxyDatabaseUrl` SECRET config as the program-managed source (encrypted state — the
value is now in SM only, metadata carries a NAME). **Spend:** $0 (image build + IAM/metadata
mutations only; Stripe API calls free).
- **Closed:** 2026-11-03 · **layer:** live-executed · **harness:** devin-desktop/swe-2-high/subagent
