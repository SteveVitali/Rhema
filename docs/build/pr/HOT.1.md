# HOT.1 — Prod hotfix pack: dossier 500, page.js route, Quiet affordance, digest query, LB logs, false claims hidden

Ticket: `docs/tickets/60_HOT.1__prod-hotfix-pack.md` · run ledger:
`docs/build/runs/HOT.1.md` · ADR-019.
Stacks on `stevevitali/sec-1-tenant-isolation-in-depth` (PR #81). **DO NOT MERGE** —
mergePolicy=OPERATOR.

## Summary

The 2026-09-30 prod design review found six production-facing defects; this pack fixes all of
them behind deterministic tests and deploys the chain tip.

- **Dossier 500s on legacy evidence** — `normalizeEvidence` in `@rhema/findings-core` coerces the
  three historical shapes (`{verdict?, urls[]}`, Showcase `[{claim, source}]` arrays,
  `{verdict}`-only, malformed/partial) to canonical `{verdict?, urls: []}` at every read seam
  (`find-view.ts`, `surface.ts`, `ledger.ts`, `dossier-routes.ts`, `pages.tsx`,
  `ui/findings.tsx`). `Finding.evidence.urls` stays optional so unguarded reads fail typecheck;
  a regression test fails if the normalizer is bypassed. Showcase seed writes canonical evidence
  for new workspaces; **no backfill** — read-boundary normalization is the fix (ADR-019).
- **`/assets/page.js` had no route** — `client-entries.mjs` is now the single source of truth;
  `build-client.mjs` consumes it and `server.ts` serves one table-driven `/assets/<entry>.js`
  route per entry. `asset-parity.test.ts` fails on a built-but-unserved entry or a
  referenced-but-unbuilt bundle in either direction.
- **Quiet affordance** — the collapsed Quiet group's `<summary>` regained a visible, focusable
  marker, the `N quiet` count, and a Show/Hide cue while preserving native `<details>`
  semantics; server/component tests fail if the marker is removed.
- **Digest SQL bug** — the hourly digest queried `r.finished_at` (nonexistent) → `r.ended_at`,
  plus explicit `r.workspace_id`/`p.workspace_id` predicates (tenant isolation proven
  independently of RLS). PGlite test drives `runDigest` through the user-serving role on a
  migrated schema; an AST guard `PREPARE`s every SQL literal in `notifications.ts`.
- **LB request logs** — `logConfig {enable:true, sampleRate:1}` on the web/api/collab
  BackendServices so user-visible 5xx/404s leave a `loadbalancing.googleapis.com/requests`
  trail; preview showed the change as an in-place update, logging-cost delta ≪ $15/mo.
- **Unsupported claims hidden** — `PUBLIC_CLAIMS` in `@rhema/contracts` keyed by claim id
  (`trial.firstReviewIncluded`, `plans.whatItCovers` — both off). Landing `trialNote`, the
  landing FAQ answer, billing `includedNote`, and the plan `≈N loops` descriptions render only
  when their claim is enabled; hidden copy lives in contracts, not the web copy table, so
  `collectCopyStrings` cannot leak it. Toggle-on tests re-render each claim — ACT.1/EST.1
  re-enable ids without parallel copy.
- **Additive-migration lint** — `scripts/check-additive-migrations.mjs` rejects DROP / RENAME /
  `ALTER COLUMN … TYPE` / table-rewrite / role-change patterns over post-base migrations
  (accepts SEC.1's new-role migration per ADR-018 and `ADD COLUMN IF NOT EXISTS`); wired into
  the `contracts` CI job and `infra/PROD-BRINGUP.md` as a pre-deploy gate.

## Verification (deterministic)

- `pnpm turbo build lint typecheck test` — **132/132 tasks green**.
- Vitest — **395 files passed | 1 skipped; 3,683 tests passed | 4 skipped**.
- `check-build-memory.sh` — 0 violations.
- `check-additive-migrations.mjs` — clean over post-SEC.1 migrations.

## Stage B (prod)

Live deploy + HTTP/logging evidence recorded in `docs/build/runs/HOT.1.md` §Stage B and the
evidence report; screenshots under `docs/build/reports/<date>_HOT.1/`. Deployment provenance
row: `deployments` table, `git_sha` = deployed chain tip.

## Out of scope

RUN.1, EDIT.1, ACT.1, EST.1, UX.1, OBS.1, BILL.3 remain tracked on their own tickets;
SEC.1's role switch was already executed (D-SEC.1-1 DONE).
