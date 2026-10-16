# SPACAP.2 — capstone composed verification: prod provenance read, executable legs run, ordered merge/deploy runbook

Manifest row 141 · stacks on `stevevitali/spacap-1-capstone-gap-analysis` @ `0263581` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
prod READS only, no deploys, no production writes.

Implements `docs/tickets/141_SPACAP.2__capstone-composed-verification.md`. All four
acceptance legs are `live-executed` — the honest outcome is **one baseline leg executed +
three legs deferred with verbatim recipes**, because prod serves pre-chain ancestors.

**Requirement IDs:** none stamped (process/capstone row — the SPA REQ ids are audited by
SPACAP.1's matrix, not owned here).

## What prod actually is (verified, not assumed)

- web `/healthz` → `6ebb1cb…`, api `/healthz` → `0acd16d…` — both ancestors of the tip
  `0263581` (150/153 commits behind). **No round-4 chain code is deployed.**
- Marker vocabulary (`data-renderer`/`data-mounted`/`data-route`/`spa-root`) absent on
  `/`, `/login`, `/showcase`, `/pricing` (curl-verified).
- `GET /bff/app` → **404** — the BFF read twins are undeployed.
- Tip harness vs current prod → **exit 1** (`--steps N10 --expect-sha 0263581…`): provenance
  NO-MATCH + settle-lapse FAIL — the fail-closed refusal is empirically proven, not asserted.
  Evidence: `docs/build/reports/2026-10-10_SPACAP.2-refusal/`.

## What landed

- **`scripts/live/public-ssr-baseline.mjs`** — the public-SSR baseline probe (read-only,
  $0): per route, status/title/h1/meta/banned-copy/markers + normalized hash + raw HTML.
- **`docs/build/reports/2026-10-10_SPACAP.2-public-ssr-baseline/`** — the BEFORE half of
  the SSR regression, captured green (5 routes + favicon, **0 warnings**).
- **`docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md`** — the operator runbook G1
  (SPACAP.1 §4.6, HIGH) routed here: the 15-segment bottom-up merge/bake/deploy cadence
  (14 flip deploys at SPAF boundaries, ≥1 nightly green between flips, cleanup wave gated
  on the `editor` bake) + verbatim per-AC verification recipes + the Arm-B tip-deploy
  fallback with its recorded consequence.
- **`DEFERRALS.md` `## SPACAP.2`** — D-SPACAP.2-1/-2/-4 OPEN, D-SPACAP.2-3 PARTIAL
  (baseline landed). Surviving legs from earlier rows folded in per G1: the `D-SPAF.*-2`
  per-surface legs = the cadence's per-segment legs; D-SPA.6-1's SSR leg = the post-deploy
  `--expect-renderer ssr` N10 leg; the gated `expected:"red"` steps (T17/R6F/T12F/T13F/
  P1.*) get their first prod legs inside the composed surface run. D-MAINT.6-1/D-OPS.1-1
  referenced, not duplicated (they gate preview legs — prod sessions mint through the live
  mailbox).

## Verify

- Live legs above — all $0 prod reads.
- `pnpm --filter @rhema/journeys build` clean; full gate results + validators recorded in
  `docs/build/runs/SPACAP.2.md` (docs + one dependency-free script; no production code
  touched — green gate unaffected).
- PR checks read once at closeout; inherited `integration`/privsep red waived per
  GD-MAINT.4-1 (classified, not repaired).
