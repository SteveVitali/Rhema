# R6PAIDARM — paid-arm nightly substrate fixes (F-R6LCH.PAID-1..4)

## Summary

The scheduled nightly arm is green (`41472916874`); the Monday **paid** arm (`41447948373`,
42 pass / 9 owed / 14 fail) red for substrate reasons — every finding root-caused live against
prod over the IAP tunnel (system-DSN, read-only, $0) and fixed honestly:

1. **`journeys.yml` env gap** — the `!paid` carve-outs on the IAP+SSH tunnel step and the
   `JOURNEY_DATABASE_URL` rewrite are removed. The carve-out was authored under the misread
   that the bound secret is the app-login pool; the bound secret is in fact the **system-role
   `postgres` DSN** (`pg_roles` → `rolbypassrls=true`, verified live) — exactly what the spend
   guard's own trust probe requires (D-STB.5b-1). With it bound, the paid arm takes the
   **measured** weekly read instead of the no-db attestation, and the DB legs + fixture
   substrate (N9 seat, T8 re-mint, B-leg workspace resolution) all run. Secret absent ⇒ the
   cron's no-db attestation survives verbatim; non-cron `--paid` without it still refuses in
   `paidDispatchPreflight`.
2. **T8 → 404 was the same env gap, not a mint defect.** The route looks tokens up by
   `sha256Hex(token)` (`account-export-routes.ts:184`) and `ensureT8ExpiredExport` writes
   exactly that (`fixture-substrate.ts:92`). The arm no-ops without the DSN, so the ~26 h-purged
   row stayed dead → 404. Bound token already correct (scheduled-green evidence); no rebind.
   The 404 error now names the unbound-DSN arm-skip.
3. **T14 badge 0→0 was a harness substrate defect, not a badge-counter regression.** jrn-a's
   current workspace holds **zero** `decision_requests`/`inbox_items` — the escalate never
   committed because `findDeliveredReview` picked `/p/showcase/…`, the seeded `showcase:true`
   dossier which `showcaseReadOnlyGuard` 409s on every write. New `writable` option skips
   `data-ssr-cause="showcase"` dossiers on T12/T13/T14 (same root explains those two fails) and
   the error names the substrate state honestly.
4. **B16 `no workspace` was the same env gap, not a purge.** `test+jc…b16`'s workspace exists
   (verified live — minted at signup). `signInLeg`'s retry swallowed `needs
   JOURNEY_DATABASE_URL` ×10 and misreported `no workspace`; it now retries only the
   not-provisioned miss (`tenantLookupRetryable`) and surfaces anything else verbatim.

## What changed

- `.github/workflows/journeys.yml` — `!paid` gates removed on the tunnel step + DSN export;
  comments corrected (finding id + the app-login misread recorded).
- `packages/journeys/src/stb5a.ts` — `findDeliveredReview` `writable` option (skips
  `data-ssr-cause="showcase"`); T12/T13/T14 opt in; T8 error hint.
- `packages/journeys/src/stb5b.ts` — `signInLeg` retry honesty.
- `packages/journeys/src/stb5b-helpers.ts` — `tenantLookupRetryable`.
- `packages/journeys/src/workflow-env.test.ts` — NEW: pins both workflow arms at the YAML layer
  + the helper contracts.

## Verification

- Deterministic: `pnpm exec vitest run packages/journeys/src` **197/197** incl. the new file;
  `pnpm turbo build lint typecheck` 135/135; `pnpm test` (see ledger).
- Live-read diagnostics (system DSN over the IAP tunnel, read-only, $0): `postgres`
  `rolbypassrls=true`; ISO-week metered **$3.34**/96 rows; zero decision/inbox rows on jrn-a;
  `showcase:true` seed; `jc…b16` workspace present.
- Guard posture preserved: `spend-guard.test.ts` (fail-closed on non-bypass pool; meter query
  never runs blind) + `cli-flags.test.ts` (non-cron paid refuses without DSN; cron attests
  no-db) all green unchanged.

## Spend

**$0** — read-only prod diagnostics; no paid re-dispatch (the week's $3.34 + `--headroom 3`
honestly refuses; live re-proof owed on next Monday's paid cron → `D-R6PAIDARM-1`).

## Finding → evidence table

| Finding | Verdict | Evidence |
|---|---|---|
| F-R6LCH.PAID-1 (env gap) | RESOLVED-IN-CODE | `journeys.yml` diff + `workflow-env.test.ts` + live `pg_roles` probe |
| F-R6LCH.PAID-2 (T8 404) | RESOLVED (diagnosed; no mint defect) | route/arm `sha256Hex` match; scheduled green; arm-skip error hint |
| F-R6LCH.PAID-3 (T14 badge) | RESOLVED-IN-CODE (harness, not product) | zero decision/inbox rows live; `showcase:true` row; `writable` filter |
| F-R6LCH.PAID-4 (B16 workspace) | RESOLVED-IN-CODE (env-gap mask) | `jc…b16` ws exists live; `tenantLookupRetryable` + test |

Live re-proof on the next paid cron is carried by `D-R6PAIDARM-1` (OPEN).
Run ledger: `docs/build/runs/R6PAIDARM.md`.
