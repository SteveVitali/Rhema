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

## For step owners

Your step is `expected: "red"` until your ticket's Stage B proves it. Run it, watch it pass for the
right reason, flip `expected` to `"green"`, attach the screenshot to your run ledger — that's the
whole flip. If a green step of yours fails in nightly, the run goes red and the report names you.
