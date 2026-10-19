# VERIF.1 — SHA-exact composed verification pass at `ffbb8ad`

Manifest row 153 · stacks on `stevevitali/fix-1-journey-fixture-repairs` (PR chain tip
`0623042`) · merge policy **OPERATOR** — do not merge from the build environment ·
live-verification ticket: **all legs ran on prod `ffbb8ad` at $0** — no `--paid`, no
fixture mints, no prod writes beyond the legs' own `is_test` seeds.

## What lands

The deployed-tip evidence for every BL-82 / stream-V-1 row, plus the harness repairs
the live legs surfaced.

- **Provenance gate** — `check-deploy-provenance --expect ffbb8ad` PASS; web + api
  `/healthz` both report `ffbb8ad01b4383ab7f11088c8427b668bc442b01`.
- **D-SPA.28-1 (BL-82 thin legs)** — served-asset + source scan: zero hits on the
  retired override vocabulary; `--pin-renderer` / `JOURNEY_PIN_RENDERER` refuse with
  exit 2; `?ssr=1` / `?renderer=spa` / `x-rhema-renderer` headers inert; forced-SSR
  fires on phone-UA + showcase rows only.
- **D-SPACAP.2-1** — surface-scoped suite under `--expect-renderer spa` green
  (34 pass + T8 owed, `2026-10-15_VERIF.1-surfaces-clean/`) and the full free suite
  green (40 pass/ready-to-flip + T8 owed + 21 paid skipped, `2026-10-15_VERIF.1-suite/`).
- **D-SPACAP.2-2** — X1 family green + raw two-tenant BFF probe: zero marker leakage
  on five B routes, foreign slug → 404, anon → 401 `unauthenticated`. Probe committed
  as `scripts/live/two-tenant-bff.mjs`.
- **D-SPACAP.2-3** — post-deploy public-SSR re-baseline: all five routes' semantic
  fields match the 2026-10-10 baseline; N10 `--expect-renderer ssr` PASS.
- **D-SPACAP.2-4** — zero CSP violations across every leg; authed `/app` serves a
  nonce'd `script-src` with no `unsafe-eval`/`unsafe-inline`.
- **D-SPACAP.3-1** — in-SPA showcase click → real document navigation → SSR document
  (`data-renderer="ssr"`, `data-ssr-cause="showcase"`, `page.js`+`ide.js`); non-showcase
  control stays SPA + mounted. Probe committed as `scripts/live/showcase-handoff.mjs`.
- **D-CAP.1-2 / D-CAP.2-2** — emission stream audit clean: all 36 distinct prod
  `analytics_events` catalogued + classified, zero uncatalogued, zero `beta_absent`;
  the $0 composed suite re-verified at the deployed tip.
- **D-FIX.1-2** — the six repaired legs re-run: P1.dossier / T12F / T13F / T17 carry
  live green evidence; T15/T16 are `paid:true` — skipped by the $0 suite, still owed
  to the weekly window (never forced).
- **BL-74** — stays OPEN: `main` HEAD `e78c799c` does not contain `ffbb8ad`; the
  qualifying scheduled nightly is merge/deploy-gated (named dependency).

## Harness repairs surfaced by the live legs

- `steps.ts` — N8's `/app` scan window never reached `/p/showcase` on the accumulated
  jrn-a tenant: wait for the project list to attach, filter `/p/<slug>` hrefs only,
  pin the designed fallback to the END of the scan window.
- `steps.ts` — P1.dossier demanded a forced-SSR verdict on `/p/:p/review/:runId`, a
  sole-renderer SPA route (SPA.27): the phone verdict there is `data-renderer="spa"`
  + `data-device="phone"`. Assert corrected; classification still checked first.
- `ulid.ts` + `stb5a.ts` — T13F's seeded dossier minted `randomUUID()` ids; the api's
  run-event parser requires 26-char Crockford-base32 ULIDs (live 502 `dossier_finding_action_failed`,
  traced in Cloud Logging). New `journeyUlid()` mint (unit-pinned, `ulid.test.ts`) +
  every seed id site switched, including the T16 `persona_profiles` insert.
- `stb5a.ts` — T13F notice reads raced the leaf repaint: the REQ-FIX-T12F
  response-capture + attach-wait pattern applied to the `?applied=`/`?bulkdone=` arms.
- `registry.ts` — seven `expected:"red"` steps flipped `green` with dated evidence
  comments: R6F, T12F, T13F, T17, P1.outline, P1.figures, P1.dossier.

## Live surprise recorded (not a blocker)

`/healthz`'s deployed SHA `ffbb8ad01b…` is **not a commit in this repository** (not
local, not on any remote ref, `gh api` 422) — the Cloud Build `d16ff6db` checkout
carried an unpushed tip; the local `ffbb8ad` prefix collides with a different commit.
Every provenance assertion matched the healthz value verbatim; the mismatch is
ledgered in `runs/VERIF.1.md` for the operator.

## Verify

`pnpm turbo build lint typecheck` 135/135 · ULID unit tests green ·
`check-build-memory.sh` 0 violations · `check-append-only` vs `0623042` OK ·
all runs `--stage prod --expect-sha ffbb8ad`, spend $0, no secrets in evidence.
