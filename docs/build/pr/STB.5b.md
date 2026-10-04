# STB.5b — Bounded paid live legs: the BL-16–19 paid harness, spend-refused at the weekly guard

Ticket: `docs/tickets/85_STB.5b__bounded-paid-live-legs.md` · run ledger: `docs/build/runs/STB.5b.md`
Stacks on `stevevitali/stb-5a-headless-live-legs` (PR #106, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> Stage A landed the seven paid live legs as permanent journey steps —
> cheapest-first, each with a pre-declared cap, driven through the real API
> and a signed-in Playwright session on the prod test tenants. Stage B was
> **refused before any leg launched**: the ISO-week metered spend on flagged
> tenants is already **$58.08** against the **$5** weekly journey guard
> (measured under the system role — the app-serving role reads **$0** through
> `usage_records` RLS). Per the ticket rule the exact refusal is recorded,
> no leg ran, and **$0 was metered**. The steps are committed and
> registry-wired, so the same `--paid --steps B16…B19B` command resumes on
> the next ISO week under cap.

## What landed (journey harness only)

- **`packages/journeys/src/stb5b.ts`** — B16–B19C step implementations,
  reusing STB.5a's seams (`db()` pool, `apiFetch()` on the session cookie,
  `scopedQuery()`/`plainQuery()`, BrowserContext auth, JSON evidence to the
  journey output dir).
- **`stb5b-helpers.ts`** — pure builders/assert evaluators: run-spec
  builders, `parseSseFrames()`, the B16–B19 assert evaluators (each returns
  `{passed, detail}` evidence), cap table.
- **`impls.ts` / `registry.ts` / `registry.test.ts`** — merged dispatch +
  seven rows ordered cheapest-first inside the paid sequence.
- **`stb5b.test.ts`** — 34 colocated tests: cap/order discipline, builder
  payloads, SSE parsing, every assert's pass/fail semantics, registry
  ownership.

## Declared legs (cheapest-first; ticket cap $25, aim ≈$12)

| leg | cap | obligation |
|---|---|---|
| B16 | $1 | BL-16: sidecar-absent Review + mid-phase `phase:"4"` pin — frozen inputs carry no `sidecar` key, `.rhema/phase-result.json` commits |
| B17 | $1.50 | BL-17b: live `/runs/:id/events` tail vs `?poll=1` replay vs `run_events max(seq)` — post-commit high-water for both subscriber kinds |
| B18A | $3 | BL-18a: Full-board Editor fetch rows attributed in `fetch_log`, committed in the verification phase |
| B18B | $4 | BL-18b: Memo user-source host denied before forwarding (`urlPolicy.fetchUserDataForbidden`, zero allowed rows, deny/`pause_signals` evidence on attempt) |
| B19A | $5 | BL-19: `approve_plan` structured `edit` `{artifactVersionId,rows,changes}` → user-authored `.md`/`.json` overlays + later-phase commit + `completed` |
| B19B | $4 | BL-19: `approve_outline` structured edit → outline overlays + promotion + `analytics_events` `outline.approved` |
| B19C | $15 | BL-19 profile-voice leg — **pre-registered DROP** (exceeds the ≈$12 aim); records an owed result, never launches |

## Stage B — refused, recorded verbatim (2026-10-04)

- System-role measurement (`postgres` DSN via IAP tunnel → prod `rhema`):
  ISO-week `is_test`-tenant `source='proxy'` metered **$58.07792 / 1,675
  rows** (week starting Mon 2026-09-28 UTC); 6,040 total `usage_records`.
- Same query under `rhema_app_login`: **$0 / 0 rows** — RLS deny-by-default.
- Real CLI run: `rhema-journeys --stage prod --paid --steps B16` →
  `spend guard refused: weekly metered spend $58.08 has reached the $5 cap`
  → exit 3, before Playwright launches.
- **Per-leg status:** B16 · B17 · B18A · B18B · B19A · B19B →
  refused-not-run; B19C → drop stands (moot under the refusal).
- **Spend: $0 metered.** The $58.08 is pre-existing flagged-tenant spend
  from earlier tickets (CITE.1/ECON.2 measured the same figure) — not
  STB.5b's.

## Defects / findings filed (not fixed — the ticket's defect rule)

- **D-STB.5b-1** — the weekly spend guard is DSN-sensitive: bound to the
  app-serving role it reads $0 through RLS and would silently pass any
  week. Verified live both ways ($58.08 system / $0 app). Needs a
  documented system-scoped binding or a refuse-when-empty tripwire.
- **D-STB.5b-2** — `ITERATION_CAPS.{audit,gapCheck}` are declared
  (`packages/mirror/src/attestation.ts`) but have no consumer — only
  `.replan` is enforced. BL-17a's 4th-audit-iteration → `completed_partial`
  outcome is unreachable by construction (it's a run state, not a step
  state); B17's assert carries the finding verbatim.
- **D-STB.5b-3** — `fetchViaFetcher` is granted only to the
  `holdout-calibrator` role; a Full-board review's Editor fetch rides the
  server-side web_fetch/egress-proxy path. BL-18a's "through
  `fetchViaFetcher`" half needs the profile-voice/hold-out run shape; the
  `fetch_log`-join half stays leg-shaped in B18A.

Source rows stay OPEN with dated carry-forward notes: D-P0.03-2,
D-P0.08b-2, D-P0.09-3, D-P0.15-3, D-P0.15c-3, D-PRB.02-3, D-P1.10-1,
D-P1.12-1, D-P1.14-1, D-P1.21-2.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 tasks green.
- `pnpm test` — 448 files / 4,546 pass / 4 skipped / 0 fail.
- `pnpm check:licenses` — 745 packages. `pnpm check:protocol-markers` — 54 clean.
- `check-build-memory.sh` — 0 violations.
- Journeys-focused: `pnpm --filter @rhema/journeys typecheck|lint` green;
  `registry.test.ts` + `stb5b.test.ts` 41 tests green.
