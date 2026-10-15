# @rhema/journeys — browser-journey acceptance (JOURNEY.1; REQ-SPEC-29; ADR-016/ADR-020)

The committed Playwright suite that walks the product as a user does — visible-text and
actionable-control assertions (never status-only), real magic-link sessions into the
operator-provisioned test mailbox, flagged test tenants, a per-step owner registry, a spend guard,
and the deploy-provenance check.

## Layout

- `src/registry.ts` — **the step registry** (the planning-ledger table's live home): `{id, journey,
  asserts, owner, expected, paid}` for every journey step. An owner flips its step `green` in its
  own PR with the Stage-B screenshot attached.
- `src/runner.ts` — runs one step or the whole registry. Expected-flag semantics: a **green** step
  failing fails the run; a **red** step failing is reported `owed` (its owner carries the debt); a
  red step passing is `ready-to-flip`; paid steps skip unless `--paid`.
- `src/occlusion.ts` — `assertActionable`/`clickActionable`: visible + enabled + `elementFromPoint`
  at the center (the covered-Send defect class, PR-J6).
- `src/mailbox.ts` — the **keyless Gmail-DWD mailbox client**: IAM Credentials `signJwt` → OAuth
  jwt-bearer → `gmail.readonly` on `users/test@rhema.tools`. The `sub` is hard-pinned; the client
  refuses any other mailbox. The caller token comes from `JOURNEY_GCP_ACCESS_TOKEN` or `gcloud auth
  application-default print-access-token` — never a key file.
- `src/session.ts` — `JourneySessions`: real `/signup` → magic-link → mailbox → verify navigation.
  `storageState` caches per identity in `.journeys-state/` (gitignored); a dead cache (purged
  tenant, expired cookie) re-mints. `assertTestIdentity` makes non-test sessions impossible.
- `src/spend-guard.ts` — the weekly ≤ $5 metered-spend bound (flagged-tenant `usage_records`).
- `src/provenance.ts` + `scripts/check-deploy-provenance.mjs` — the deploy SHA vs chain-tip check.
- `src/steps.ts` — the step implementations (`STEP_IMPLS`), one per registry row; `src/impls.ts` is
  the map the runner consumes (base steps + the STB.5a live-leg map, split out to avoid an import
  cycle).
- `src/cli.ts` — the `rhema-journeys` entrypoint (nightly $0 legs; weekly adds `--paid`).
- `src/nonce.ts` — the run nonce + test-identity helpers (every created artifact is nonce-namespaced
  so steps are idempotent).
- `src/stb5a.ts` / `src/stb5b.ts` — the bounded live-leg step sets (BL-21/BL-22 browser walks;
  BL-16…19 paid legs riding the spend guard).
- `src/provision-res1.ts` — RES.1's live-probe provisioning through the real surfaces.
- `fixtures/` — the journey inputs: `paid-fixture.md` (the ≤300-word paid fixture that plants one
  knowingly-false claim for N6), `golden-op-ed.md`, `planted-error-essay.md` /
  `planted-error-excerpt.md` (RES.1), `restore-eval-essay.md` (ECON.2's ~6,000-word restore
  measurement).

## Run it

```bash
pnpm --filter @rhema/journeys build
pnpm --filter @rhema/journeys exec playwright install chrome   # or chromium for local dev
pnpm --filter @rhema/journeys exec rhema-journeys \
  --stage prod \          # resolves --web https://rhema.tools --api https://api.rhema.tools
  --steps N2,N7,R1,R5,X1 --expect-sha <chain-tip-sha> \
  --out docs/build/reports/$(date +%F)_JOURNEY.1-journeys
```

`--paid` includes the paid legs (N5/N6/R4/R6) — the weekly run only, bounded by the spend guard and
the single ≤300-word fixture. `workflow_dispatch` on `.github/workflows/journeys.yml` takes
`stage`/`steps`/`paid` inputs.

## Spend guards — the system-DSN convention (BL-72 / REQ-ECON-6/7/8/9/13)

Paid dispatch is **fail-closed** (R5ECON.1). The rules, all enforced at dispatch time:

- **`JOURNEY_DATABASE_URL` is the system-role DSN, always.** `usage_records` is FORCE-RLS: an
  app-login pool reads it as **$0** and the guard would greenlight an unmeasured week
  (D-STB.5b-1). Both guards probe `pg_roles` for `rolsuper OR rolbypassrls` before the meter
  query ever runs; a blind pool is a refusal, never a measurement. The DSN is Pulumi-composed —
  reach it over the IAP tunnel, e.g.
  `JOURNEY_DATABASE_URL=postgres://<system-role>@localhost:<tunnel-port>/rhema`.
- **Operator `--paid` requires the DSN + `--headroom <legCapUsd>`.** `rhema-journeys --paid`
  and `scripts/live/funded-window.mjs` both refuse (exit 3) without them — the headroom ask
  pre-flights the measured spend against the bound before a leg dispatches. The **one**
  exception is the scheduled self-bounding cron (`GITHUB_EVENT_NAME=schedule`): it cannot reach
  the private DB, bounds itself to one paid leg/week, and keeps the no-db attestation.
- **Seeded fixture rows never count (REQ-ECON-6).** Journey seeders write
  `usage_records.provider_request_id` under the `req_jrn_` prefix
  (`JOURNEY_SEED_USAGE_REQUEST_PREFIX`, `@rhema/db`); every guard query — weekly cap AND the
  funded-window cumulative — filters it via the shared `FLAGGED_PROXY_SPEND_SCOPE`. The scope
  is bucket-blind: entitlement/Included proxy spend is real provider spend and counts
  (Q-ECON.d).
- **A leg that meters over its declared `capUsd` closes `cap_overrun` and pauses the funded
  window** (REQ-ECON-7): the runner skips every later leg in the dispatch, the run fails, and
  `funded-window.mjs` drops `<stateDir>/funded-pause.json`, which refuses further dispatches
  until the operator re-authorizes and removes it.
- **The $0 read path** — spend figures without a dispatch: run the guard's queries read-only
  over the tunnel with
  `DATABASE_URL=<system-dsn> node scripts/live/funded-query.mjs "<sql>"` (wraps the statement in
  `BEGIN READ ONLY … ROLLBACK`). The exact scope both guards use is the exported
  `FLAGGED_PROXY_SPEND_SCOPE` fragment (`src/spend-guard.ts`), so a read and a refusal can never
  disagree about what counts.

Round-4 additions: `--surface <key[,key…]>` scopes the run to a `SURFACE_GATES` subset and
`--expect-renderer <ssr|spa>` fails the run when a served document's `data-renderer` marker
differs (the activation cadence's per-surface legs use both). `--pin-renderer`/`JOURNEY_PIN_RENDERER`
are **retired** — the `x-rhema-renderer` override channel was deleted with the flag machinery
(SPA.28), so the flag refuses loudly (exit 2) rather than lie. `--invite-code <code>` rides the
MAINT.6 seeded-preview invite path (`RHEMA_INVITE_CODE`).

## For step owners

Your step is `expected: "red"` until your ticket's Stage B proves it. Run it, watch it pass for the
right reason, flip `expected` to `"green"`, attach the screenshot to your run ledger — that's the
whole flip. If a green step of yours fails in nightly, the run goes red and the report names you.
