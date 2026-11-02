# R6PAIDARM — paid-arm nightly substrate fixes (findings F-R6LCH.PAID-1..4)

- **Spec:** operator directive — fix the 5 reds on the paid Monday arm (run `41447948373`,
  2026-11-02T12:50Z; scheduled nightly arm green `41472916874`). Findings work, no manifest row.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); LEDGER OPEN FINDINGS +
  PHASE LOG 2026-11-02 (F-R6LCH.PAID-1..4 opened); `runs/R6DEP.4.md`; `runs/R6SWP.1.md`;
  `.github/workflows/journeys.yml`; `packages/journeys/AGENTS.md` (paid-arm rules);
  `apps/api/src/account-export-routes.ts`; `apps/worker/src/export-jobs.ts`.
- **Base:** `origin/main` @ `cb61b673db8d6978cd4cd41735cafcaf25a2f986`.
- **Branch:** `stevevitali/paid-arm-substrate` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-02T21:0xZ · **Closed:** (at close)
- **Live stage:** prod, read-only diagnostics + fixture-substrate writes only where a committed
  arm already authorizes them (jrn-a `is_test` rows via `fixture-substrate.ts`); no prod mutation
  otherwise. The paid arm spends real metered budget — no paid re-dispatch this run
  (the ISO-week already metered **$3.34**; `--headroom 3` + $3.34 > $5 would honestly refuse).
- **Production mutations (named scope):** none. (No `gh secret set`, no `pulumi up`, no prod
  writes — the bound T8 token is already correct; see finding 2.)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in blast radius: D-OBS.1-3 and
D-SPA.28-1 (both already discharged-in-substance on the scheduled arm per the 2026-11-02
PHASE LOG; the paid arm is not their verifier), D-STB.5b-1 (the guard's system-DSN contract —
this run honors it exactly), D-P1.18-1 (T8's 410 arm), D-P1.19-1 (T14's badge legs),
D-P1.04-2 (T7's purge-job read), D-P0.03-2 (B16's sidecar-absent arm).

## Requirements

1. **F-1 — T7/T12F/T13F/T15/T16/R6F `needs JOURNEY_DATABASE_URL` on paid runs.** The env
   injection in `journeys.yml` is `!paid`-gated ("an app-login pool can never satisfy the paid
   spend guard") — but the bound secret is the **system-role `postgres` DSN** (verified live:
   `pg_roles` → `rolbypassrls=true`), exactly what the guard's trust probe requires. Fix: inject
   the DSN on the paid arm too (tunnel + rewrite); the no-db attestation survives only when the
   secret is absent. Deterministic tests for both arms.
2. **F-2 — T8 → 404 instead of 410.** Root-cause the route's token lookup; mint must produce a
   lookup-compatible row; check `ensureT8ExpiredExport` first — if its mint is correct, keep the
   bound token (never print it).
3. **F-3 — T14 badge 0→0 on escalate.** Triage: flake vs real badge-counter regression; if real,
   file a product finding with evidence.
4. **F-4 — B16 `no workspace for test+jc…`.** Did the leg create a fresh identity the
   `ensureJrnaPaidFixture` arm doesn't know, or did the purge eat it between steps? Fix honestly.

## Acceptance criteria

- [ ] Paid-arm runs receive `JOURNEY_DATABASE_URL` when the secret is bound *(engineered)*
- [ ] The spend guard's trust probe still fails closed on a blind pool / no-db attestation
      intact for the unbound cron *(engineered — deterministic tests)*
- [ ] T8 410 arm verified (code-path + bound-token evidence) *(engineered; live re-proof owed
      next paid cron)*
- [ ] T14 root cause determined + fixed or product finding filed *(engineered + live evidence)*
- [ ] B16 root cause determined + fixed or timed note *(engineered + live evidence)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. journeys.yml: ungate the IAP+SSH tunnel step and the `JOURNEY_DATABASE_URL` rewrite on the
   paid arm (the bound secret IS the system DSN — the `!paid` carve-out was authored under the
   app-login misread, per R6DEP.4's verified "journey dsn user: postgres").
2. stb5a `findDeliveredReview`: `writable` option — skip `data-ssr-cause="showcase"` dossiers
   (the `showcaseReadOnlyGuard` 409s every write); T12/T13/T14 opt in; the no-writable-review
   error names the substrate state instead of a cryptic badge/verb fail.
3. stb5b `signInLeg`: surface the real tenant-lookup error (`needs JOURNEY_DATABASE_URL`)
   instead of masking it behind `no workspace` after 10 blind retries.
4. T8: no code change to the mint (already `sha256Hex(token)` — matches the route); add the
   unbound-DSN hint to the 404 error for diagnosability.
5. Tests: `workflow-env.test.ts` (the YAML arms pin) + helper tests (tenant-lookup retry
   predicate, showcase-dossier discriminator) + existing guard/preflight suites.
6. Records + PR + closeout (BUILD_INDEX 238, LEDGER findings → RESOLVED-IN-CODE, live re-proof
   owed on next Monday's paid cron or an in-budget `--paid` dispatch).

## Test matrix

| AC → leg | kind |
|---|---|
| Paid arm gets the DSN when bound (tunnel step + export not `!paid`-gated) | deterministic — `workflow-env.test.ts` reads `.github/workflows/journeys.yml` |
| Free arm unchanged (still injected; scheduled cron keeps no-db attestation when unbound) | deterministic — same file + `cli-flags.test.ts`/`spend-guard.test.ts` (existing) |
| Trust probe fails closed on non-bypass role; meter read never runs blind | deterministic — existing `spend-guard.test.ts` |
| `signInLeg` surfaces needs-DSN instead of "no workspace" | deterministic — `tenantLookupRetryable` helper test |
| `findDeliveredReview writable` skips `data-ssr-cause="showcase"` dossiers | deterministic — discriminator helper test |
| T8 404 root cause | live evidence — route code (`sha256Hex` lookup) + `ensureT8ExpiredExport` mint shape + bound-token scheduled-green |
| T14/B16 root cause | live evidence — system-DSN reads over the IAP tunnel (zero `decision_requests`/`inbox_items`; `test+jc…b16` workspace exists) |

## Progress

- 2026-11-02T21:0xZ — branch cut at `cb61b67`; spec files read (LEDGER + R6DEP.4 + R6SWP.1 +
  DEFERRALS + journeys.yml + journeys/AGENTS.md).
- Paid run `41447948373` report.json pulled: **42 pass / 9 owed / 14 fail**, provenance
  `match:true` on `4938b8e`, spend block `{"weeklyMeteredUsd":null,"capUsd":5,"withinCap":true}`
  (no-db attestation — the DSN never reached the runner).
- **Root causes (live-verified over the IAP tunnel, system DSN, read-only):**
  - **F-1** — `journeys.yml` gates BOTH the tunnel step (`if:` line ~109) and the DSN rewrite
    (shell `if` ~line 150) on `!paid`. Bound `secrets.JOURNEY_DATABASE_URL` user = `postgres`,
    `pg_roles` probe: `rolbypassrls=true` → satisfies the guard's system-role contract
    (D-STB.5b-1). ISO-week metered spend measured **$3.34 / 96 rows** — the guard is honest:
    a same-week `--paid` re-dispatch at `--headroom 3` refuses (3.34+3 > 5).
  - **F-4 (B16)** — `test+jc01a4d8e9e56b16@rhema.tools` **has** workspace
    `01M6E5RJ0ABJ6ZVMHP86THGVR0` (is_test, minted 13:04:15Z at signup, alive). The leg's
    `signInLeg→tenantIdFor` read threw `needs JOURNEY_DATABASE_URL` (unbound on paid), the
    retry loop swallowed it ×10, and surfaced the misleading `no workspace for …`. Not a purge
    race, not a fixture-arm gap — same env-gap family as F-1.
  - **F-3 (T14)** — jrn-a's current ws `01M6E52JJPFGMGXFTW465EQ6R2` holds **zero**
    `decision_requests` + **zero** `inbox_items`: the escalate never committed.
    `findDeliveredReview` picked `/p/showcase/review/01M6E52JKVS5CP3300DV844JD2` — the seeded
    `showcase:true` dossier (`projects.showcase`, read-only; `showcaseReadOnlyGuard` → 409 on
    every disposition POST). Badge 0→0 is the 409's honest shadow, not a badge-counter
    regression. T12 (`defer` not persisted) + T13 (`?applied=` never landed) are the same arm.
  - **F-2 (T8)** — the route lookup IS `sha256Hex(token)` (`account-export-routes.ts:184`) and
    `ensureT8ExpiredExport` mints exactly that (`fixture-substrate.ts:92`). The mint is correct;
    the 404 is the same env-gap (arm no-op'd without the DSN → the ~26h-purged row stayed dead).
    Bound token proven by the scheduled green `41472916874` — no re-mint/rebind owed.
  - **Corollaries the same fix covers:** N9 (`ensureJrnaPaidFixture` no-op'd → `topups_require_plan`),
    N11/R6/R9 (`Review launch: not enabled` — unseated plan/credits substrate), B17–B19B
    (identical `no workspace` masking).
- 2026-11-02T21:1xZ — **code landed:** (a) `.github/workflows/journeys.yml` — the `!paid`
  carve-outs removed on BOTH the IAP+SSH tunnel step and the `JOURNEY_DATABASE_URL` rewrite;
  comments corrected (the bound secret is the system DSN — the app-login misread documented).
  (b) `stb5a.ts` — `findDeliveredReview(page, ctx, {writable:true})` skips
  `data-ssr-cause="showcase"` dossiers; T12/T13/T14 opt in; the no-writable error names the
  substrate state. (c) `stb5a.ts` T8 — the 404 error now names the unbound-DSN arm-skip when
  applicable. (d) `stb5b.ts` `signInLeg` — `tenantLookupRetryable` (new helper in
  `stb5b-helpers.ts`) retries ONLY the not-provisioned miss; a needs-DSN or other lookup error
  surfaces verbatim instead of `no workspace for …`.
- 2026-11-02T21:1xZ — **deterministic tests:** `workflow-env.test.ts` (new, 7 assertions across
  5 its) — pins both workflow arms at the YAML layer (tunnel step not `35 4 * * 1`/`inputs.paid`
  gated; `JOURNEY_DATABASE_URL_BOUND` export secret-gated only, no `JOURNEY_PAID` condition;
  `--paid --headroom 3` unchanged) + `tenantLookupRetryable` truth table + the
  `data-ssr-cause="showcase"` discriminator. Existing suites unchanged: `cli-flags.test.ts`
  (non-cron paid refuses without DSN; cron attests no-db), `spend-guard.test.ts` (trust probe
  fails closed; meter query never runs blind).
- **Verify:** `pnpm --filter @rhema/journeys typecheck` clean · `lint` clean · `build` clean ·
  `pnpm exec vitest run packages/journeys/src` **197/197** · `pnpm turbo build lint typecheck`
  (recorded at close).
- **Phase 3 self-review:** two passes — mechanical (build/lint/typecheck/tests green; yaml
  parsed) and design (minimum-diff arms; read-only discriminator is the committed
  `data-ssr-cause` contract, not a slug guess; no retryable/non-retryable conflation; comments
  name the finding + the misread). No open design concerns.
- **Not done (honest):** no `--paid` re-dispatch — the ISO-week already metered **$3.34**;
  the guard would honestly refuse at `--headroom 3` ($6.34 > $5). Live re-proof rides next
  Monday's paid cron (fresh week, ~$0 measured) — or a dispatch if the week's spend stays
  under $2. No `gh secret set` — the bound T8 token is already lookup-correct.

## Gap table

| requirement / AC | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| F-1: paid arm receives the bound DSN (tunnel + export ungated) | engineered | engineered | **met** | `journeys.yml` (no `if:` on tunnel step; export `if` is secret-presence only); `workflow-env.test.ts` ×3 |
| F-1: guard trust probe behaves both arms (system DSN → measured read; absent → cron attestation; non-cron refusal) | engineered | engineered + live-probed | **met** | `spend-guard.test.ts` + `cli-flags.test.ts`; live `pg_roles` probe `rolbypassrls=true`; week spend read $3.34/96 rows |
| F-2: T8 mint lookup-compatible / 410 arm verified | engineered | engineered + live-diagnosed | **met** | route `account-export-routes.ts:184` `sha256Hex(token)`; arm `fixture-substrate.ts:92`; scheduled-green `41472916874`; paid-404 explained (arm no-op + ~26 h purge) |
| F-3: T14 badge root-cause + fix | engineered + triaged | engineered + live-diagnosed | **met** — harness defect, NOT a badge regression | zero `decision_requests`/`inbox_items` on jrn-a (live read); `/p/showcase` = `showcase:true` read-only (409 guard); `findDeliveredReview writable` skips it (T12/T13/T14); new honest error |
| F-4: B16 workspace root-cause + fix | engineered + triaged | engineered + live-diagnosed | **met** — env-gap mask, NOT purge/arm gap | `test+jc…b16` ws `01M6E5RJ0ABJ6ZVMHP86THGVR0` exists (live read); `signInLeg` now surfaces needs-DSN verbatim |
| Paid-arm live re-proof | live-executed | gate-pending | **met-engineered(D-R6PAIDARM-1)** | this week's $3.34 measured ⇒ same-week `--paid` refuses honestly; next Monday's cron (fresh week) or an in-budget dispatch owes the green re-read |

## Evidence log

- Paid run `41447948373` report.json — 42 pass / 9 owed / 14 fail; spend
  `{"weeklyMeteredUsd":null,"capUsd":5,"withinCap":true}` (no-db attestation); provenance
  `match:true` on `4938b8e`.
- Live reads over the IAP tunnel (`rhema-prod-proxy-zq8h` → 127.0.0.1:15433 → 10.46.0.3:5432,
  system DSN staged gitignored `docs/build/logs/r6dep4-system-dsn.txt`, read-only, $0):
  `pg_roles` probe `postgres → rolbypassrls=true`; ISO-week metered **$3.34** (96 flagged-tenant
  proxy rows since 2026-11-02T00:00Z); jrn-a current ws `01M6E52JJPFGMGXFTW465EQ6R2` — zero
  `decision_requests`, zero `inbox_items`; projects incl. `slug:"showcase"` `showcase:true`
  (seed `12:52:15Z`) + seeded delivered run `01M6E52JKVS5CP3300DV844JD2`; `test+jc01a4d8e9e56b16`
  ws `01M6E5RJ0ABJ6ZVMHP86THGVR0` exists (is_test, minted at signup 13:04:15Z).
- Tests: `vitest packages/journeys/src` — 197/197 pass (15 files), incl. the new
  `workflow-env.test.ts`.
- `pnpm --filter @rhema/journeys` typecheck + lint + build — clean.
- `pnpm turbo build lint typecheck` — (recorded at close).

## Evidence report

| Finding | Verdict | Evidence |
|---|---|---|
| F-R6LCH.PAID-1 (T7/T12F/T13F/T15/T16/R6F `needs JOURNEY_DATABASE_URL`) | **RESOLVED-IN-CODE** — `!paid` gates removed on tunnel + export; bound secret verified system-role (`rolbypassrls`) | journeys.yml diff; `workflow-env.test.ts`; live probe |
| F-R6LCH.PAID-2 (T8 404 vs 410) | **RESOLVED (diagnosed — no code defect in the mint)** — arm's `sha256Hex` matches the route; 404 = env-gap no-op + purge; bound token already correct | route/arm code; scheduled green; paid report |
| F-R6LCH.PAID-3 (T14 badge 0→0) | **RESOLVED-IN-CODE (harness defect — showcase dossier selected; NOT a badge regression)** — `writable` filter on T12/T13/T14 + honest error | zero decision/inbox rows live; `showcase:true` row; code diff |
| F-R6LCH.PAID-4 (B16 `no workspace`) | **RESOLVED-IN-CODE (env-gap mask — workspace existed)** — `signInLeg` surfaces needs-DSN verbatim; same F-1 fix covers the leg | live read of the `jc…b16` ws; `tenantLookupRetryable` + test |

- **Spend this run: $0** (read-only prod diagnostics over the tunnel; no paid dispatch — the
  week's $3.34 already metered honestly refuses `--headroom 3`). Fixture writes: none beyond
  the committed arms' own seeds (none run this session — code-level fix only).
- **Owed live re-proof:** next Monday 04:35Z paid cron (or an in-budget `--paid` dispatch while
  the week reads < $2) must show: DSN injected on the paid arm → measured spend read →
  T7/T12F/T13F/T15/T16/R6F green, `ensureJrnaPaidFixture`/`ensureT8ExpiredExport` re-seat →
  N9/T8 green, B16–B19B workspaces resolve, T12–T14 pick a writable dossier (or honestly
  report none). Carried on the findings + D-R6PAIDARM-1.
