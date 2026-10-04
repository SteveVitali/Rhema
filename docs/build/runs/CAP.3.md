# CAP.3 — capstone closure (run ledger)

- **Spec:** `docs/tickets/88_CAP.3__capstone-closure.md` (manifest row 88, round-3 tail)
- **Base:** `stevevitali/cap-2-composed-verification` @ `76a9d8c3b0e3adef117f2b76d18dcd1049a9fbb5` (PR #109 open; tree verified clean at fork)
- **Branch:** `stevevitali/cap-3-capstone-closure` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** implement-spec @ `~/agent-skills`
- **Started:** 2026-10-04T08:36Z
- **Closed:** 2026-10-04 (all eight offline-closable gaps closed; live legs consolidated → D-CAP.3-1)
- **Config:** full rigor; Live stage = **offline-only**; metered spend $0 (cumulative round ~$71)

## Deferrals read

Read `docs/tickets/DEFERRALS.md` (882 lines) at run start. Routed queue for this ticket
(verified against `CAPSTONE_GAP_ANALYSIS.md` + `COMPOSED_E2E_REPORT.md`):

- **Closable offline (code fix + test; live-verification leg kept as a DEFERRALS row note):**
  `D-CAP.2-3` (dead phone CSS — base `.ide-actions a` rule declared after the <768px override),
  `D-STB.5a-1` (export-email token 404 — anonymous token lookup RLS-denied),
  `D-STB.5a-2` (`/account/import` 500 — showcase-slug UNIQUE(workspace_id,slug) collision),
  `D-STB.5a-3` (`pgboss.job` unreadable by `rhema_app_login` — bounded read path),
  `D-STB.5b-1` (weekly spend guard DSN-sensitivity — fail-closed tripwire),
  `D-STB.5b-2`/`D-STB.5b-3` (unreachable legs — wire or consciously accept w/ ADR),
  `D-CAP.1-2` instrumented half, `D-CAP.1-1` REQ-IDE-1 clause.
- **Accept/marshal (no code):** SLO reds `D-SLO.1-5..8`, `D-OBS.1-2/-3`, `D-EDIT.1-2`,
  CITE.1/ECON.2 deploy+legs, STB.5b paid legs (`D-CAP.2-1`), `D-DEF.4-1/-3`, OPS.* cost rows,
  N4+N9 substrate drift (`D-OBS.1-3`), historical-residual rows, `D-CAP.2-2` (chain-tip deploy).

## Requirements

1. Close each routed gap or move it to an ACCEPTED/DEFERRALS row with reason; update
   `COVERAGE_MATRIX.csv` verdicts as rows close.
2. An ADR for EVERY MET-DIFFERENTLY verdict (18) and every SHOULD-level deviation.
   Regenerate `docs/adr/README.md`.
3. `CAPSTONE_CLOSURE.md`: closed list, accepted list, the ACCEPTED-deviations signature table
   (id / what deviates / why sound / compensating control) + round-3 note items: H7 items still
   open, D5 (G2/H2 deferred), interim trial terms (ADR-014), any SLO re-basing ADR.
4. Do NOT mark the build DONE; `nextTicket` → row 88a GATE-ACCEPT.

## Acceptance criteria (verbatim from the ticket)

- [ ] every gap CAP.1/CAP.2 routed to closure is closed or moved to an ACCEPTED/DEFERRALS row
  with reason
- [ ] `CAPSTONE_CLOSURE.md` carries the ACCEPTED-deviations list for signature
- [ ] an ADR exists for every MET-DIFFERENTLY verdict and every SHOULD-level deviation
- [ ] verification green; every new behaviour has a test that fails if removed; requirement ids
  stamped in the PR; DEFERRALS rows for anything not automatically verifiable; ADRs for every
  deviation/owned decision; BUILD_INDEX row + LEDGER advanced

## Plan

Offline code fixes, each with a failing-then-green seam test:

1. `ide-css.ts` — move the `.ide .ide-actions` base rules before the media blocks (source-order
   fix); CSS-seam test asserts the phone override is the last equal-specificity declaration.
2. `account-export-routes.ts` + `index.ts` — token-gated `/export/download` resolves via
   `deps.systemExec` (BYPASSRLS system pool — the token IS the credential; cross-tenant lookup
   cannot run on the RLS-scoped app pool); unset ⇒ 503 fail-closed.
3. `archive/src/import.ts` — deterministic slug deconflict for `projects`/`personas`
   (`UNIQUE(workspace_id, slug)`): `base`, `base-2`, …; a candidate owned by our derived id is a
   re-import (dedupe), a foreign candidate remaps the slug so dependents land.
4. Migration `0058` — `rhema_project_purge_schedule(project_id)` SECURITY DEFINER probe (the
   `project.purge` queue only; no payload columns) granted to `rhema_app`; T7 leg uses it with a
   `42883` fallback to the raw read (system-DSN path preserved).
5. `spend-guard.ts` — fail-closed: a bound role without `rolbypassrls`/`rolsuperuser` reads
   `usage_records` RLS-blind ⇒ refuse (`withinCap:false`, reason names the system-DSN binding).
6. `D-STB.5b-2`/`-3` — ADR-accepted: no new engine/tool-grant machinery at capstone.
7. `D-CAP.1-1` — deterministic SSR test: deep link → anchored dossier with layout chrome.
   `D-CAP.1-2` — reverse emission sweep: every emitted literal is catalogued + classified.
8. `CAPSTONE_CLOSURE.md` + ACCEPTED-deviations table; ADRs for the uncovered MET-DIFFERENTLY
   verdicts (REQ-DATA-28, REQ-ARCH-20, REQ-ARCH-24, REQ-MOBILE-3, REQ-MOBILE-10,
   REQ-SPEC-5/23/26/28) + the CAP.3-owned decisions.

## Test matrix

| AC | test |
|---|---|
| phone ≥44 px rule fires | tokens CSS-order seam test |
| token link resolves cross-tenant | api route test: systemExec-bound lookup, 503 unbound |
| import survives slug collision | archive import test into a workspace holding `showcase` |
| purge schedule readable by app role | PGlite `set role rhema_app` + pgboss fixture test |
| guard refuses RLS-blind binding | spend-guard test (non-bypass role → refused) |
| deep link restores layout | web SSR test asserting anchor + shell chrome on the landing |
| uncatalogued emission impossible | ledger sweep test + intake 403/422 (existing) |

## Progress

All eight offline-closable gaps closed with code + failing-then-green seam tests:

1. **D-CAP.2-3** — `ide-css.ts`: base `.ide .ide-actions{, a}` rules moved before the media
   blocks; `tokens.test.ts` ordering seam proves the 44 px phone rule now wins.
2. **D-STB.5a-1** — `account-export-routes.ts` + `index.ts`: anonymous token lookup +
   `downloaded_at` on `deps.systemExec`; unbound ⇒ 503 `download_unavailable`; tests assert
   the system executor carries the lookup (ADR-090).
3. **D-STB.5a-2** — `archive/src/import.ts`: `resolveImportSlug` deterministic deconflict;
   dependents map to actually-inserted ids; re-import dedupes (ADR-091); `archive.test.ts`.
4. **D-STB.5a-3** — migration `0058_pgboss_purge_probe.sql` (SECURITY DEFINER, one queue,
   schedule-only, dynamic plpgsql so PGlite migration databases apply it) + T7 probe call
   with `42883`/`42501` fallback → owed (ADR-092).
5. **D-STB.5b-1** — `spend-guard.ts`: `pg_roles` role probe before metering; non-bypass or
   absent pool ⇒ `withinCap:false` + `weeklyMeteredUsd:null`; `>=` cap refuses; `cli.ts`
   binds the DSN to `pg.Pool` (ADR-093); `spend-guard.test.ts` 8 tests.
6. **D-STB.5b-2** — `attestation.ts`: `recordSubagentLaunch` enforces `SCOPED_LABEL_CAPS`
   (fidelity-auditor→3, gap-analyst→3) per run; (cap+1)-th throws `IterationCapError`,
   inserts nothing (ADR-094); `attestation.test.ts` 6 tests.
7. **D-STB.5b-3** — consciously KEPT: holdout-calibrator-only fetcher grant is the §12.6
   least-privilege surface (ADR-095); live leg rides D-CAP.2-1's funded window.
8. **D-CAP.1-1 / D-CAP.1-2** — engineered halves: SSR deep-link seam test (`server.test.ts`;
   ADR-097) + reverse emission sweep (`emission-audit.test.ts`; ADR-096). Live legs stay
   routed (D-CAP.2-2 suite / D-CAP.1-2 PARTIAL).

Marshal pass: all live/operator/human rows carried into `CAPSTONE_CLOSURE.md` §2 with
compensating controls; `DEFERRALS.md` flipped 8 rows PARTIAL (append-only — dated
precedence), annotated D-CAP.2-2, appended D-CAP.3-1/-2. Nine ADR-less MET-DIFFERENTLY
verdicts retro-fitted (ADR-098…103); `docs/adr/README.md` regenerated by `adr-index.sh`.
Matrix updated: REQ-ACCT-3 AT-RISK-INTEGRATION→PARTIAL; REQ-IDE-1/BETA-5/DATA-20/ARCH-21
stay PARTIAL w/ new evidence+ADRs.

**Errors hit + fixed mid-run:** migration 0058 v1 referenced `pgboss.job` inside a
SQL-language function — PGlite parses bodies at CREATE and the schema is absent → whole
migration harness failed (all api/archive tests incl. teardown `db.close()` on undefined).
Rewrote as plpgsql dynamic SQL (`EXECUTE format`) — applies cleanly, function errors only
if called pre-pg-boss. Iteration-cap test v1 reused deterministic ids → pkey collision;
switched to seeded id factories.

## Gap table

See `docs/build/CAPSTONE_CLOSURE.md` §1 (closed) + §2 (accepted/deferred) + §4 (signature
table). Two NEW rows appended: **D-CAP.3-1** (live re-verify legs — T3/T7/P1 + guard
two-role read — ride D-CAP.2-2's post-deploy suite) and **D-CAP.3-2**
(`completed_partial` step-state — product decision). Every CAP.1/CAP.2 routed gap is
closed, flipped, or carried into an explicit row — none dropped.

## Evidence log

| leg | command | result |
|---|---|---|
| spend guard | `vitest packages/journeys/src/spend-guard.test.ts` | 8/8 pass — non-bypass pool refused w/o issuing the meter query; boundary `>=` refuses |
| tokens CSS | `vitest packages/tokens/src/tokens.test.ts` | 19/19 pass — phone override ordering proven |
| archive import | `vitest packages/archive/src/archive.test.ts` | 4/4 pass — slug deconflict + artifact remap + dedupe |
| export routes | `vitest apps/api/src/account-export-routes.test.ts` | 6/6 pass — systemExec lookup, 503 unbound, bogus token 404 |
| attestation | `vitest packages/mirror/src/attestation.test.ts` | 6/6 pass — cap+1 refuses, per-run, uncapped roles |
| emission sweep | `vitest packages/ledger/src/emission-audit.test.ts` | pass — reverse sweep covers every emitted literal |
| web deep-link | `vitest apps/web/src/server.test.ts -t "deep link"` | 1 pass (103 skipped by filter) |
| gate | `pnpm turbo build lint typecheck` | **135/135 green** (after adding `account-export-routes.ts` to `tools/system-pool-boundary.json` — the REQ-SPEC-30 allowlist pins every system-pool touch) |
| full suite | `pnpm test` | **4562 pass / 0 fail** (449 files; +10 tests vs CAP.2's 4552 — the additive-migrations enumeration test updated to list 0058) |
| memory | `check-build-memory.sh .` | **0 violations** (9 warnings — all baseline class: chain-order tokens, legacy status vocabulary, readout guards) |
| append-only | `check-append-only.mjs --base 76a9d8c…` | **OK** — every base DEFERRALS cell survives verbatim (flips prepend dated statuses; CAP.3 section appended) |
| matrix gate | `check-coverage-matrix.test.mjs` | 6/6 pass — spec ⇄ CSV completeness, evidence paths, ref integrity |
| security | `packages/security-checks` suite | 110/110 pass (system-pool boundary pin accepts the audited entry) |
| licenses / markers | `check:licenses` / `check:protocol-markers` | 745 packages OK / 54 files clean |
| baseline debt (pre-existing at base, verified by stash-compare) | `check-no-cookies` (2 fingerprint-cookie findings, `server.ts:378/395`) + `check-additive-migrations` (3 DROP findings in 0036/0040/0044) | unchanged at base — not CAP.3's; 0058 itself is additive-lint clean |

## Evidence report

**Closed-in-code:** 8/8 offline-closable routed gaps; **accepted/deferred:** every
live/operator/human row ledgered with compensating controls; **signature table:** 13
proposed accepted deviations in `CAPSTONE_CLOSURE.md` §4 for the operator's `GATE-ACCEPT`
signature. Build state stays IN_PROGRESS; `nextTicket` → 88a. Zero deploys, zero live
claims beyond what was observed.
