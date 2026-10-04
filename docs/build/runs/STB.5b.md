# STB.5b — Bounded paid live legs (run ledger)

Harness: `@rhema/journeys` (Playwright session-cookie apiFetch + `JOURNEY_DATABASE_URL` stage Postgres, Base tier)

- **Ticket:** `docs/tickets/85_STB.5b__bounded-paid-live-legs.md` — close the BL-16–BL-19 paid
  live-verification rows on prod, cheapest-first, ≤ $25 metered combined (aim ≈ $12).
- **Branch:** `stevevitali/stb-5b-bounded-paid-legs` (stacked on `stevevitali/stb-5a-headless-live-legs` @ `0465c66`).
- **Merge policy:** OPERATOR — never merged from the build env.
- **Source rows:** `docs/build/BACKLOG.csv` BL-16/17/18/19 → DEFERRALS `D-P0.03-2`, `D-P0.03-3`
  (mid-phase residual), `D-P0.15b-2`/`D-P0.15c-2` (carried pin asserts), `D-P0.09-3`, `D-P0.08b-2`,
  `D-PRB.02-3`, `D-P1.21-2`, `D-P0.15-3`, `D-P0.15c-3`, `D-P1.10-1`, `D-P1.12-1`, `D-P1.14-1`.

## 0. Stage A plan ($0) — harness before spend

One registered paid journey step per leg (cheapest-first), per-leg caps declared in advance
(`STB5B_CAPS` in `packages/journeys/src/stb5b-helpers.ts`):

| Step | Leg | Cap | Live shape |
|---|---|---|---|
| B16 | BL-16a+BL-16b — sidecar-absent dry run + mid-phase pin | $1.00 | upload fixture → `POST /projects/:id/runs {workflow:'review', inputs:{phase:'4'}}` (no `sidecar` key) → assert `runs.inputs->>'sidecar' IS NULL`, `phase='4'`, exactly one `done` step (craft), `phase-result.json` artifact, run `completed` |
| B17 | BL-17b high-water publish (+BL-17a audit-cap observation) | $1.50 | pinned review `phase:'4'`; subscriber A tails `GET /runs/:id/events` live through the commit; after terminal, subscriber B replays `?poll=1` → asserts B sees the post-commit high-water seq; `run_events` row join (D-P0.08b-2). BL-17a (D-P0.09-3): `ITERATION_CAPS.{audit,gapCheck}` have **no consumer** (only `.replan` is enforced, `internal-api.ts:1336`) → the 4th-iteration→`completed_partial` outcome is unreachable by construction — recorded as a defect row, not a paid leg |
| B18A | BL-18a — Full-board Editor fetch leg | $3.00 | `rigor:'full_board'` review pinned `phase:'1'` (verification, `allowsSubagents:true`) → assert `fetch_log` `kind='fetch'` `decision='allow'` rows joined to the run. `fetchViaFetcher` is bound only inside the fetcher service, reached solely via the `fetcher` client granted to `holdout-calibrator` (`engine/scoped-subagent.ts:196–200`) → a full_board review's fetch rides the server-tool path; the "through fetchViaFetcher" assert is unreachable on this leg → defect row + the fetch_log-join half is what the leg can truthfully prove |
| B18B | BL-18b — Memo user-source fetch denied pre-forward | $4.00 | memo-protocol project + baited `user_sources[]` (source text carries a URL on its own frozen domain) → review pinned `phase:'1'` → assert frozen `inputs.urlPolicy{fetchUserDataForbidden,userSourceDomains}`; `pause_signals{reason:'user_source_fetch'}` + `fetch_log{decision:'deny',deny_reason:'user_source'}` = the deny-on-attempt leg (owed if the agent honors policy upstream, per STB.3 L9) |
| B19A | BL-19a — `approve_plan` structured edit lands in the next phase's file | $4.00 | outline-shaped draft upload → Quick **non-preview** draft run (preview pre-resolves the gate `by:'trial'`) → poll `waiting_gate` → `POST /projects/:id/gates/:gid/decide {action:'edit', edits:{newClaims:[{text:marker}],note}}` — the card's real delta seam (`applyGateEdits` → `serializeGateOverlay`) → assert `decisions{action:'edit',overlay_version_ids,changes≥1}`, user-authored `02-structure-plan.{md,json}` versions, the grounding/draft phase committed on them, run `completed` |
| B19B | BL-19b — `approve_outline` structured edit + finalize + promotion | $5.00 | chat_turn seeds the research index → `POST /projects/:id/outline/promotions {scope:'research'}` → outline run → `approve_outline` gate → the same `/decide` edit seam w/ marker → assert overlay versions on `agents/author/outline/<slug>.{md,json}`, run `completed`, the promoted artifact + `analytics_events{event:'outline.approved'}` consistency (the event is approve-only by design — an `edit` decision must NOT emit it) |
| B19C | BL-19 tail — profile `approve_sample` + hold-out/leak legs (D-P1.14-1) | $15.00 | full-tier `profile_voice` build — **pre-registered DROP**: exceeds the ≈$12 aim and consumes 60 % of the cap alone; runs only if every earlier leg lands under cap |

Cheapest-first execution order = registry order (B16 → B17 → B18A → B18B → B19A → B19B → B19C).
`--steps B16,B17,B18A,B18B,B19A,B19B,B19C` scopes the run; `--paid` consults the weekly guard first.

## 1. Stage A — harness + tests

- `packages/journeys/src/stb5b-helpers.ts` — per-leg `STB5B_CAPS` (+ the $25 combined cap), the six
  run-body builders (absence properties ARE the legs: no `sidecar` on B16, no `preview` on B19A,
  `modelTier:'base'` on every body — the trial plan gate refuses an omitted tier), fixtures
  (`stb5bReviewDraft` with fetchable example.org claims, `stb5bOutlineDraft`, `baitUserSource`),
  `parseSseFrames`/`sseSeqs` (formatSse-shaped `id:`/`event:`/`data:` frames + `: ping` comments),
  `markerGateEdit` (the card's `GateStructuredEdits` delta), and the pure assert evaluators
  `evalB16Asserts`/`evalB17Asserts`/`evalB18aAsserts`/`evalB18bAsserts`/`evalB19Asserts` — each
  assert carries its own evidence string; two asserts (B17's audit-cap, B18A's fetcher-binding)
  encode the unreachable-by-construction defect findings by design.
- `packages/journeys/src/stb5b.ts` — the seven `StepFn`s on the session-cookie + tenant-scoped
  DB seams (`apiFetch`/`db` exported from `stb5a.ts`); `finishLeg` folds failed asserts into an
  `owed` outcome (red steps never fail the run; a landing leg reports `ready-to-flip`).
- `packages/journeys/src/registry.ts` — B16…B19C rows, `paid:true`, `expected:red`, `owner:STB.5b`,
  cheapest-first order; `impls.ts` spreads `STB5B_IMPLS` into `ALL_IMPLS`.
- `packages/journeys/src/stb5b.test.ts` — 34 tests: builder absence/tier properties, fixtures,
  SSE parsing, the edit delta, every evaluator's happy path AND each assert's negative,
  cap discipline (runnable legs ≤ $25), registry wiring + cheapest-first order.
- `registry.test.ts` updated for the new ids + paid set.

Route-shape verifications folded into the harness (all re-derived from source, not assumed):
timeline gate DTO is `rounds[].runs[]`/`ungrouped[]` keyed on `runId`; `POST /projects` returns
`{project:{id,slug,draftId}}`; `POST /chat/threads` returns `{thread:{id}}`; turns take
`{message,modelTier}`; `POST /import/presign` takes no body fields; `GET /runs/:id/report` carries
top-level `state`+`steps`; `GateEdit` on `/runs/:id/gates/:gid` is a single object — but the leg
uses the card's real `/projects/:id/gates/:gid/decide` + `edits` delta seam instead; the
`outline.approved` analytics event is `analytics_events` (never `run_events`) and fires only on
`action:'approve'`; `userSourceDomain` freezes the full hostname; `fetch_log` carries
`{kind,decision,deny_reason,url,bytes,status,agent_label,ts}`; `pause_signals.reason` ∈
`{suspicious_query,egress_denied_spike,user_source_fetch}`.

## 2. Stage B — live legs: **SPEND-REFUSED at the weekly guard (2026-10-04)**

- **Pre-flight measurement (system role, `postgres` DSN via IAP tunnel `127.0.0.1:15433` → prod
  `rhema`, composed from `rhema-prod-alloydb-password`):** the ISO-week metered spend by flagged
  test tenants is **$58.07792 across 1,675 `source='proxy'` usage_records rows** (week starting
  Mon 2026-09-28 UTC). Total `usage_records` on prod: 6,040.
- **Same query under the app-serving role (`rhema-prod-app-database-url` / `rhema_app_login`,
  NOBYPASSRLS):** reads **$0 / 0 rows** — `usage_records` is RLS deny-by-default and the app role
  sees nothing. This is the measurement caveat the ticket named: a spend guard bound to the app
  DSN silently passes any week. The system-role figure is the truth.
- **Guard outcome (real CLI, captured verbatim):**
  `rhema-journeys --stage prod --paid --steps B16 --out /tmp/stb5b-paid-attempt` with
  `JOURNEY_DATABASE_URL` bound to the system DSN →
  `spend guard refused: weekly metered spend $58.08 has reached the $5 cap` → exit 3, before the
  browser launches. Per the ticket (no cap raises; a refused leg stops and is recorded) **no Stage
  B leg was launched; $0 metered spend was incurred.**
- **Per-leg status:** B16 · B17 · B18A · B18B · B19A · B19B → **refused-not-run** (weekly guard;
  the week is 11.6× over cap before this ticket's first leg). B19C → pre-registered drop stands
  (moot under the refusal).
- **Cumulative:** ISO-week flagged-tenant metered $58.08; STB.5b Stage B metered $0.00;
  combined $58.08.
- **Reset/resume:** the guard re-measures on each run — a later ISO week under $5 re-admits
  `--paid`; the steps are committed and registry-wired, so the resume is the same command over a
  fresh week (`--steps B16,B17,B18A,B18B,B19A,B19B`, cheapest-first). `JOURNEY_DATABASE_URL` must
  be the system-scoped DSN — an app-role binding reads $0 through RLS and would bypass the guard
  (D-STB.5b-1).

## 3. Defects recorded

- **D-STB.5b-1 — the weekly paid-journey spend guard is DSN-sensitive: bound to the app-serving
  role it reads $0 through RLS (`usage_records` is deny-by-default) and silently passes any week.**
  Verified live 2026-10-04: system role reads $58.08/1,675 rows for the same ISO week the app
  role reports as $0. The guard needs a documented system-role binding (or a refuse-when-empty
  tripwire) — recorded in `docs/tickets/DEFERRALS.md`.
- **Two construction-level findings the Stage A audit produced (recorded in the step evidence,
  not paid legs):** `ITERATION_CAPS.{audit,gapCheck}` have no consumer (only `.replan` is
  enforced) — the BL-17a 4th-iteration→`completed_partial` outcome is unreachable by construction;
  `fetchViaFetcher` is reachable only through the `fetcher` client granted to the
  `holdout-calibrator` role — a full_board review's fetch rides the server-tool path, so BL-18a's
  "through fetchViaFetcher" half is unreachable on that leg.

## 4. Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — 4,546 pass / 4 skipped / 0 fail (448 files; incl. `stb5b.test.ts` 34 + updated
  `registry.test.ts` 7).
- `pnpm check:licenses` — 745 packages OK. `pnpm check:protocol-markers` — 54 files clean.
- `check-build-memory.sh` — 0 violations (7 pre-existing warnings).
- Stage B command line + refusal string captured above verbatim.
