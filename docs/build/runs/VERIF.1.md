# VERIF.1 — SHA-exact composed verification pass at `ffbb8ad` (run ledger)

- **Spec:** `docs/tickets/153_VERIF.1__composed-verification-ffbb8ad.md` (manifest row 153,
  round 5 — stream V-1)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §9 stream V;
  `docs/research/r5_g1_dispositions.md`; `docs/research/r5_d234_stage-residuals.md`;
  `docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md` §3 (the verbatim recipes)
- **Base:** `stevevitali/fix-1-journey-fixture-repairs` @ `0623042` (round-5 chain tip)
- **Branch:** `stevevitali/verif-1-composed-ffbb8ad` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** implement-spec + build-memory @ `~/agent-skills`
- **Requirement ids stamped:** REQ-G1-3 (V-1 half)
- **Started:** 2026-10-14T23:58Z · **Closed:** 2026-10-15 (gates green; PR opened, never merged)
- **Config:** verification/evidence; **Live stage: prod — reads + $0 journey legs only**;
  **Production mutations: none** (no `--paid`, no fixture mints — the FIX.1 seed scripts stay
  operator-gated prod writes)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows this ticket owns or unblocks:

- **BL-82 / stream V-1 set:** D-SPA.28-1 (thin legs), D-SPACAP.2-1..4, D-SPACAP.3-1,
  D-CAP.1-2 (zero-uninstrumented-surface half), D-CAP.2-2 ($0 composed half).
- **D-FIX.1-2** — the live re-run of the six legs FIX.1 repaired (P1.dossier, T17, T12F,
  T13F, T15, T16) on the deployed tip; legs needing the operator-gated seeded substrates
  record still-owed, never forced.
- **BL-74 residual** — the first scheduled nightly green on a deployed-SHA-equal `main`
  (merge-dependent; literal rule per the ticket).
- Adjacent rows read but NOT owned: D-FIX.1-1 (T8 mint — operator execution),
  D-FIX.1-3 (BL-78 probes — `--execute` seed is a prod write), D-FIX.1-4 (Monday-digest
  claim — clock-owed), D-MAINT.3-1 (rides D-FIX.1-3's substrate), D-OPS.1-2 (paused-AlloyDB
  leg — VERIF.2's per the contract's own note).

## Environment state (verified this run)

- **Provenance:** `check-deploy-provenance --expect ffbb8ad` → **PASS** — web + api
  `/healthz` both report `ffbb8ad01b4383ab7f11088c8427b668bc442b01`.
- **DB access:** IAP tunnel `127.0.0.1:15433` → `10.46.0.3:5432` via
  `gcloud compute ssh rhema-prod-proxy-3ms6 --tunnel-through-iap` (us-central1-c);
  `JOURNEY_DATABASE_URL` bound to the **system role** (`postgres`, verified
  `current_user=postgres`, `_migrations`=58). App-role DSN also available
  (`rhema-prod-app-database-url`) for two-role reads.
- **Mailbox:** `test@rhema.tools` via the journeys DWD SA + `gcloud` ADC caller credential
  (`signJwt`) — `gcloud auth application-default print-access-token` verified.
- **Browser:** real Chrome channel (probe launch ok) + bundled chromium fallback.
- **`main`:** `origin/main` = `e78c799c`; `ffbb8ad` is NOT an ancestor — the merge chain
  (BL-01/BL-81) has not caught `main` to the deployed SHA.

## Harness findings repaired this run (live-surfaced, all evidence-committed)

The first surface sweep (`2026-10-14_VERIF.1-surfaces`, nonce `523e86229f04`) produced three
non-green legs; each was root-caused live rather than waived:

1. **N8 (was FAIL)** — the `/app` scan window (`slice(0,12)`) never reached `/p/showcase` on the
   accumulated `jrn-a` tenant (19 rows; showcase at index 18). Fix (`steps.ts`): the designed
   fallback `/p/showcase` is pinned to the END of the scan window, so a real reviewed-frozen head
   still wins the literal leg and the fallback can never fall off the tail. **Re-run → PASS.**
2. **P1.dossier (was owed, mis-classified as a product defect)** — the leg demanded a forced-SSR
   verdict on `/p/:p/review/:runId`, but that route is sole-renderer SPA (SPA.27; the REQ-ED-12
   set is the five Page-family GETs only — spec §14.8). `data-renderer="spa"` +
   `data-device="phone"` IS the correct phone verdict on a dossier. Fixed the assert (reject SSR
   only under a non-phone cause; wait for leaf mount before the §10.1 sweep). **Re-run →
   ready-to-flip** (`2026-10-15_VERIF.1-dfix12-rerun`).
3. **T13F (was owed ×2)** — first the apply POST **502'd** on prod: api `ZodError` —
   `draftId` failed `idSchema` ("26-char Crockford-base32 ULID") inside
   `traceManualRevision`→`parseRunEvent` (requestIds `8d4ca6a1…`/`7fb2ea41…` in Cloud Logging,
   2026-10-15T00:22Z). Root cause: `seedWritableDossier`'s `ids: () => randomUUID()` minted
   UUID-shaped draft/finding ids; run-event payloads validate ULIDs at the api write boundary.
   Fix: new `src/ulid.ts` (`journeyUlid` — Crockford mint, unit-pinned) + all four seed call
   sites switched (`ids: seedIds`). Second failure: bare `count()` reads on the `?applied=`/
   `?bulkdone=` notices raced the leaf repaint — the REQ-FIX-T12F response-capture + attach-wait
   pattern replicated on both arms (and on the paid twin T13, same verbatim block). **Re-run →
   ready-to-flip** (`2026-10-15_VERIF.1-t13f-rerun3`).

A last consistency sweep found one more `randomUUID()` in `stb5a.ts` — the T16
`persona_profiles` substrate insert (a paid step, so it never ran live). Switched to
`journeyUlid()` with the rest: `persona_profiles.id` is read through the same ULID contract at
the api boundary and a UUID there would have failed the identical Zod check the first time T16's
paid arm executes. `randomUUID` is now gone from `packages/journeys/src/`; it remains only in
`scripts/live/seed-bl78-fixtures.mjs` (`bl78_${uuid}` marker ids — not event-payload ids) and
`scripts/live/mint-t8-export.mjs` (`t8exp_…` token ids) where the column is plain text.

## Deployed-SHA surprise (provenance traceability)

`/healthz` reports `ffbb8ad01b4383ab7f11088c8427b668bc442b01` on both web and api; the
`deployments` row `prod:ffbb8ad01b…` (2026-10-14T17:42Z) records the same. **That commit is not
in this repository** — not local (`git cat-file` fails), not on any fetched remote ref, and
`gh api repos/.../commits/<sha>` → 422. The local prefix `ffbb8ad` collides with a DIFFERENT
commit (`ffbb8ad3f2dedd…`, an ARMB.2 ledger commit); every provenance match in this ticket is a
prefix match against the healthz value. Recorded as a live finding: the deployed image's baked
SHA is not diffable to a repo commit — flag for the operator (the Cloud Build d16ff6db checkout
must have carried an unpushed tip). Provenance assertions in all runs used the verbatim
`--expect-sha ffbb8ad` contract and matched; legs verify the deployed code regardless.

## Live evidence ledger (all at `ffbb8ad`, $0, zero prod writes outside is_test fixtures)

| Leg / D-row | Result | Evidence |
|---|---|---|
| Provenance gate | PASS — web+api `/healthz` = `ffbb8ad01b…` | `check-deploy-provenance` run |
| **D-SPA.28-1** (BL-82 thin legs) | **legs all green** — 67 served assets, 0 hits on `x-rhema-renderer`, `SPA_OVERRIDES`, `JOURNEY_PIN_RENDERER`, `pin-renderer`, `spaSurfaces`, `SPA_SURFACES`, `SPA_RENDERER_HEADER`, `parseSpaSurfaces`; markers present (`data-renderer`/`data-mounted`/`spa-root`); `--pin-renderer` + `JOURNEY_PIN_RENDERER` → exit 2; `?ssr=1`/`?renderer=spa`/`x-rhema-renderer:ssr` → inert same shell; signed-in `/p/showcase` → ssr+`data-ssr-cause="showcase"`+page.js/ide.js; phone-UA `/p/showcase/v/working` → ssr+`data-ssr-cause="phone"`+page.js/ide.js | `reports/2026-10-15_VERIF.1-thin-legs/` |
| **D-SPACAP.2-1(a)** surface suite | **green** — `--expect-sha ffbb8ad --expect-renderer spa --surface <15 keys>` | `reports/2026-10-15_VERIF.1-surfaces-clean/report.json` |
| **D-SPACAP.2-1(b)** full free suite | **green** — 40 pass/ready-to-flip, T8 owed (verbatim blocker), 21 paid skipped, provenance match, spend $0 | `reports/2026-10-15_VERIF.1-suite/report.json` (nonce `fabfb0661184`) |
| **D-SPACAP.2-2** two-tenant BFF | **green** — X1.voices/usage/home/inbox/detail PASS + raw BFF: A markers vacuity-confirmed, zero leak on 5 B routes, foreign slug → 404, anon `/bff/app` → 401 `unauthenticated` | `reports/2026-10-15_VERIF.1-two-tenant/` + `…_x1detail/` |
| **D-SPACAP.2-3** SSR baseline | **green** — all 5 routes' semantic fields match BEFORE baseline; only allowed deltas (dataRenderer null→ssr, dataRoute/dataMounted present, nonce/bytes churn); N10 PASS `--expect-renderer ssr` | `reports/2026-10-15_VERIF.1-public-ssr-baseline-after/` + `…_ssr-regression/` |
| **D-SPACAP.2-4** zero-CSP | **green** — CSP header nonce'd `script-src` (no unsafe-eval/unsafe-inline) on authed `/app`; zero CSP violations across every leg (3 non-CSP noise entries: hcaptcha logo, export-download abort, X1.detail's intentional 404) | `reports/2026-10-15_VERIF.1-csp/` |
| **D-SPACAP.3-1** showcase handoff | **green** — in-SPA click → document nav → `/p/showcase` ssr+`ssr-cause=showcase`+page.js+ide.js; control project → spa+mounted; empty consoleErrors/pageErrors/failedRequests | `reports/2026-10-15_VERIF.1-thin-legs/showcase-handoff.json` |
| **D-CAP.1-2** emission audit (stream arm) | **green arm** — all 36 distinct prod `analytics_events` catalogued (67-name `ANALYTICS_EVENT_NAMES`) + classified in `BETA_EMISSION_AUDIT`; 0 uncatalogued, 0 stuck `beta_absent`; 13 events emitted inside this run's window | `reports/2026-10-15_VERIF.1-emission-audit/stream-audit.json` |
| **D-CAP.2-2** chain-tip $0 suite | **green** — the `2026-10-15_VERIF.1-suite` run IS the composed suite at the deployed tip, `weeklyMeteredUsd: 0` | same report |
| **D-FIX.1-2** six repaired legs | **4 flip** (P1.dossier, T12F, T13F, T17 — all ready-to-flip on committed reports); **T15/T16 still owed** — `paid:true` steps; `--paid` never runs autonomously (weekly guard carries them) | reruns + suite report |
| **D-FIX.1-1** (T8 410 arm) | still owed verbatim — operator-gated `mint-t8-export.mjs --execute` not run (prod fixture write) | suite report T8 owed text |
| **D-FIX.1-3** (BL-78 seeds) | still owed — `seed-bl78-fixtures.mjs --execute` is an operator-gated prod write; NEW: latent ULID defect recorded above | row note |
| **D-FIX.1-4** (Monday digest) | still owed — clock event not occurred | row note |
| **BL-74** | **OPEN** — `origin/main` HEAD `e78c799c` does not contain the deployed SHA; every scheduled nightly runs `main` (all recent runs red at `e94d01ae`/`c13d865a`/`221c16d1`, and none can prove the deployed SHA while `main` ≠ it). Merge dependency: the round-4/5 chain must merge into `main` until `main` HEAD == the deployed tip, then the next **scheduled** `journeys.yml` run decides. A `workflow_dispatch` does not satisfy "first scheduled nightly". | `gh run list --workflow=journeys.yml` |

## Registry flips (evidence-backed, `ready-to-flip` → `green`)

`packages/journeys/src/registry.ts`: **R6F, T12F, T13F, T17, P1.outline, P1.figures, P1.dossier**
→ `expected: "green"` with dated evidence comments. Still red by design: N6 (paid), T15, T16
(paid), T8 (410 arm owed — D-FIX.1-1), B17–B19C (paid).

## Spend / mutation statement

`spend.weeklyMeteredUsd: 0` on every report; `withinCap: true`. No `--paid`, no fixture mint
outside the legs' own is_test-scoped seeders, no `pulumi`, no `git push` until closeout, no merge.

## DEFERRALS dispositions (2026-10-15)

Flipped `DONE` with committed evidence: **D-SPACAP.2-1** (surface suite + full free suite),
**D-SPACAP.2-2** (X1 + raw BFF probe), **D-SPACAP.2-3** (baseline diff + N10 ssr leg),
**D-SPACAP.2-4** (zero-CSP + header probe), **D-SPACAP.3-1** (showcase handoff + control),
**D-CAP.1-2** (stream arm exercised + clean; honest residual noted), **D-CAP.2-2** ($0 composed
suite re-verified at `ffbb8ad`).

Left `OPEN` with dated notes: **D-SPA.28-1** (all four verify legs green; the row's
"nightly green after the last flip" clause is merge-gated → BL-74), **D-FIX.1-1** (T8 mint —
operator-gated), **D-FIX.1-2** (4/6 legs carry live evidence; T15/T16 paid arms ride the weekly
`--paid` window), **D-FIX.1-3** (seeds not executed — prod writes), **D-FIX.1-4** (clock-owed),
**BL-74** (`main` ≠ deployed SHA; merge+deploy dependency named).

## Closeout

- Gates: `pnpm turbo build lint typecheck` — see PHASE LOG `ci:` field; build-memory structure +
  append-only checks green.
- PR: **#174** — `stevevitali/verif-1-composed-ffbb8ad` → base
  `stevevitali/fix-1-journey-fixture-repairs`, mergePolicy=OPERATOR (opened, not merged);
  `ci:` checks pending at closeout (the recurring first-read class).

