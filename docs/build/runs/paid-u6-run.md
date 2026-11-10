# paid-u6-run — ruling arm (b): `admin-cli house-grant` on jrn-a + the ONE re-authorized paid U6 dispatch (run ledger)

- **Ticket:** run-time insert (no ticket file — the R6DEP.2/3/4 + R7DEP.3 precedent): the paid-U6
  re-dispatch leg under `D-R7DEP.2-1`, authorized by the operator's verbatim 2026-11-08 ruling
  recorded in `docs/build/LEDGER.md` PHASE LOG: *"…And what do you mean 'fund jrn-a'? I just need
  to approve the cost to you? … Please proceed with everything and keep me updated"* — disposition
  (b): **`house-grant` authorized** (fund `test+jrn-a@rhema.tools` via `admin-cli house-grant`,
  then the ONE authorized paid run at the deployed SHA under `GD-UX-PAIDLEG.R7`'s cap).
- **Branch:** `stevevitali/paid-u6-run` (records-only), PR base `stevevitali/r7deploy-tip`
  (chain tip `dc1ba197`).
- **Deployed SHA:** `b8307a401ba21a08cd15a7abcab2eb7c5743a506` (prod, provenance all-PASS at
  dispatch — report.json `provenance.match=true` on web + api).
- **Harness:** devin-desktop/swe-2-high/subagent.
- **`GD-UX-PAIDLEG.R7` verbatim cap:** *"if we do a manual paid run, we must keep it under $10"* —
  items: exactly one manual paid U6.chat run (Base tier); conditions: `capUsd` hard ceiling < $10
  (target ≤ $0.50), declared `--headroom`, never nightly, cost recorded in the run ledger;
  voided-by: any measured spend ≥ $10, a second paid run, or operator revocation.
- **Production mutations (ruling scope):** ONE `admin-cli house-grant` on the bounded is_test
  tenant (the authorized prod write) + ONE `--paid` journey dispatch. Nothing else mutated.
- **Not authorized / not done:** a second grant, a second paid dispatch (the authority is consumed
  — the leg's FAIL verdict does not reopen it), merges (`mergePolicy: OPERATOR`), any change to
  the funded identity's guards or the leg's asserts to force a green, funded-window arms
  (`funded-tenant.mjs --execute` not needed — the tenant was FRESH inside the 26 h sweep window).

## Setup (operator-local, the recorded pattern)

- Operator `gcloud` ADC `14stevevitali@gmail.com` on `rhema-507501`.
- **IAP tunnel:** `gcloud compute ssh rhema-prod-proxy-czpk --zone us-central1-b
  --tunnel-through-iap -- -NL 15433:10.46.0.3:5432` → `127.0.0.1:15433→10.46.0.3:5432`
  (the R7DEP.2/R7DEP.3 pattern; `journeys.yml` documents the same shape for CI).
- **System DSN:** `rhema-prod-proxy-database-url` (Secret Manager, the prod system-role
  container) → host rewritten to `127.0.0.1:15433`, `sslmode=disable` (the workflow's exact
  rewrite). Never printed, never committed. Role probe: `pg_roles` `bypass=true`
  (`postgres` — the spend guard's trusted meter role).

## 1. Unfunded-identity precheck (read-only arms, before the grant)

- `node scripts/live/funded-tenant.mjs` (dry-run — no writes): stable identity
  `test+jrn-a@rhema.tools` resolves to user `01M707G9F8QJMA0DBWGNKZ5306` (created
  2026-11-09T13:21Z), workspace `01M707G9FDAAJ1WJ8RYJCD359X` (`is_test=true`, age 4.7 h —
  FRESH inside the 26 h purge window), billing `01M707G9FDM3GKWX2MCKY1TFVC`,
  **balance: no credit_balances row**.
- `funded-query.mjs` (BEGIN READ ONLY…ROLLBACK): `credit_ledger` on the billing account = **0
  rows**; `credit_balances` = **0 rows**. The unfunded state that produced R7DEP.2's 402.
- **The ruling's named workspace `01M6X4ZCSA4XV2ZGM3KFJZ79ZE` is reaped** — it still exists
  (billing `01M6X4ZCSAJSSXNMPVGFMJMAME`) but carries **0 members**; its user was swept by the
  ~26 h test-tenant purge and a fresh `test+jrn-a` identity was re-provisioned 2026-11-09T13:21Z
  (the nightly's sign-in). Funding the reaped row would strand credits on a memberless
  workspace — the documented failure mode (`runs/FUNDED-2026-10-06-A.md` §4). The ruling's
  named identity (`test+jrn-a@rhema.tools`) resolves to the live tenant above; the workspace
  id was a ruling-time locator. Recorded, not silently swapped.

## 2. The ONE authorized prod write — `admin-cli house-grant`

```
cd apps/api
SYSTEM_DATABASE_URL=<system dsn via 127.0.0.1:15433> RHEMA_OPERATOR_ID=stevevitali \
node dist/admin-cli.js house-grant \
  --billing-account 01M707G9FDM3GKWX2MCKY1TFVC \
  --workspace      01M707G9FDAAJ1WJ8RYJCD359X \
  --credits 10000 --expires 2027-02-07 \
  --note "paid-u6 re-dispatch funding — operator ruling 2026-11-08 (GD-UX-PAIDLEG.R7 arm; D-R7DEP.2-1); live jrn-a tenant (ruling-named ws reaped)"
→ granted 10000 house credits → 01M707G9FDM3GKWX2MCKY1TFVC
  (ledger 01M70QMMRQJMVK1PXG2Y5SS1FM, audit 01M70QMMXGVART75CAPGMCEW40)
```

- Sizing: the funded-tenant fixture's printed envelope (`FUNDED_GRANT_CREDITS` default
  10,000 ≈ $60 list-COGS at the proxy meter) — the committed convention, matching the prior
  funded-window grants (8,000 window B; 2,000 JOURNEY.1; 1,000 R6CNT.3). One grant only.
- Re-verified funded state with the same read-only arms:
  - `funded-tenant.mjs` dry-run: **balance 10,000 cr available (0 held)**.
  - `credit_ledger`: `grant`/`promo`/10,000, expires 2027-02-07, key
    `admin:house-grant:01M70QMMCQMGQ7ZQ0YAPDMDZ86`, at 2026-11-09T18:03:01Z.
  - `credit_balances`: promo 10,000 available / 0 held.
  - `admin_actions`: `house_credit_grant` by `stevevitali`, audit `01M70QMMXGVART75CAPGMCEW40`.
- **Funded-state verdict: FUNDED** — zero→non-zero on both read-only arms.

## 3. The ONE authorized paid dispatch — R4 `--paid` at `b8307a40`

```
JOURNEY_DATABASE_URL=<system dsn via 127.0.0.1:15433> \
node packages/journeys/dist/cli.js \
  --stage prod --steps R4 --paid --headroom 0.5 \
  --expect-sha b8307a401ba21a08cd15a7abcab2eb7c5743a506 \
  --out docs/build/reports/2026-11-09_paid-u6-R4
```

- Registry row: `R4` paid, `capUsd` $0.50 ∈ [$0.50,$10) at the ≤$0.50 target,
  `cogsLevers {testCheapRoute:false}` (REQ-ECON-11 — applied by the leg's `pinCogsLevers`).
- Preflight: system-role DSN bound (bypass ✓); spend guard measured ISO-week **$0.00** <
  $5 (`WEEKLY_PAID_CAP_USD`); declared `--headroom 0.5` covers the leg's `capUsd`.
- **Leg verdict: FAIL — `turn-status poll never returned the turn optimistic`** (160 s bounded
  wait; report `docs/build/reports/2026-11-09_paid-u6-R4/report.json` + `R4.png`).
- **Root cause — leg-side, NOT the funding seam:** the R7b chat panel
  (`packages/ui/src/chat-panel.tsx:434`, landed R7TALK.1a `4ed2f7a3`) renders the pending
  bubble as `<li class="chat-turn" data-chat-turn="optimistic">`. The leg's
  `page.locator("[data-chat-turn]").last()` picked that placeholder row and read the literal
  string `optimistic` as the turn id → polled `/p/untitled-5/chat/turns/optimistic?thread=…`
  → 404 every cycle → deadline → fail. New finding **F-PAIDU6-1** (carried on D-PAIDU6-1);
  owner fix = key the extraction on the real turn row / the `[data-chat-thread]`-stamped
  response, never the marker row. Leg asserts unchanged here (no forced green).
- **The funded path itself is fully proven — backend ran the turn end-to-end:**

| fact | evidence (system-role reads, `funded-query.mjs` BEGIN READ ONLY…ROLLBACK) |
|---|---|
| turn POST succeeded | `runs` row `01M70QP0XCS5BZ9TPPCYYVA0J8` (`workflow=chat_turn`, created 18:03:46.988Z — no 402; the report's `failedRequests` carry no POST failure) |
| streamed events | `run_events` seq 1–19: `run.state_changed` ×5 (created→queued→provisioning→running→finalizing→completed), `chat.plan_card` (base, cap 40), `step.started`, `usage.tick` ×2 (11→13 cr), `step.finished` (answer, 13 cr, 30.3 s), `cost.final` (spentCredits 14). The page's own SSE polls appear in the report as `GET …/r/01M70QP0XCS5BZ9TPPCYYVA0J8/events?after=3`/`?after=5` (ERR_ABORTED = the client stream cycles, not errors) |
| rendered reply | `steps` row `answer` state `done`, `result {status:"done", sdkSubtype:"success", predicatesPassed:true}`; produced version `01M70QRA2SJMNEQ726JZGQ36DY` (artifact `01M70QR9YT2CG3SB37XMGVHK3F`, kind `sidecar`, `agents/assistant/.rhema/turn-result.json`, 207 B). The transcript carried the `[data-chat-turn]` rows the leg read; end-state screenshot `R4.png` committed. The leg's explicit rendered-reply/footnote assert is the unfinished half — recorded on D-PAIDU6-1 |
| run terminal state | `completed` 18:05:02.085Z (started 18:04:31.501Z — ~31 s answer) |
| debited footnote | `credit_ledger`: hold 40 → **debit 14** (`debit:01M70QP0XCS5BZ9TPPCYYVA0J8:answer:1#promo`) → release 26; `cost.final` event spentCredits 14; `credit_balances` now promo **9,986 available / 0 held** |
| metered USD (measure, never estimate) | `usage_records` `source='proxy'` on the run: **8 rows, Σ list_cost_usd = $0.092175**; Σ credits 14 — **debits == proxy-metered credits == spent_credits** (REQ-SPEC-32; ≤ cap 40). `source='sdk_estimate'` shadow row $0.121756 recorded for honesty (the committed/metered activation class — not the meter of record); `source='sdk_stream'` $0.000 / 13 cr |
| caps | leg capUsd $0.50: measured $0.0922 ✓ · ruling bound <$10 ✓ · ISO-week flagged-tenant proxy total post-run **$0.092175** < $5 (the dispatch was the week's only flagged spend — guard read $0.00 at 18:03:40Z) |

- **Ruling accounting:** one dispatch, $0.0922 measured — voided-by conditions NOT met (no ≥$10
  spend, no second run, no revocation). The single authorized dispatch is **consumed**; a re-run
  for the leg's green verdict would be a second paid run — not dispatched. `funded-pause.json`:
  none exists and none was created (outcome `fail`, not `cap_overrun`).
- **F-R7DEP.2-17 discharged by evidence:** the funding seam works — the promo bucket carried
  hold→debit→release end-to-end; the identity had a credit path and the turn ran. The seam
  defect's owner fix (jrn-a fundable) is exercised, not merely authored.

## 4. Dispositions

- **D-R7DEP.2-1 → DONE** (dated tail appended): the re-dispatch ran per the fresh ruling and the
  row's named verification facts are all evidenced — POST succeeded (no 402), streamed events,
  completed reply turn persisted to the transcript, debited footnote (14 promo cr), metered USD
  recorded, debits == metered burn. The leg-verdict FAIL is a separate harness finding, not an
  unmet verification fact.
- **D-PAIDU6-1 opened** (new row): F-PAIDU6-1 — R4's `[data-chat-turn]` `.last()` extraction
  collides with R7b's `data-chat-turn="optimistic"` placeholder; owner leg fix + the leg's green
  re-proof rides the Monday `journeys.yml` paid arm (standing headroom $3, scheduled authority —
  no new manual ruling needed) once the fix lands.
- `nextTicket`/`lastCompleted` **UNCHANGED** (`200_R6WATCH.1`, clock-bound ≥ 2026-11-11; the
  inserts are chain work, not a manifest-order advance).

## 5. Spend + records

- Metered provider spend this leg: **$0.092175** (8 proxy `usage_records`, is_test tenant,
  `jrn-a` workspace `01M707G9FDAAJ1WJ8RYJCD359X`). The house-grant is a promo credit mint —
  no provider cost; the $60 list-COGS envelope is a ceiling, not a burn (14 cr consumed ≈ $0.10
  list at the proxy meter).
- Weekly journey guard (ISO week 2026-11-09): $0.00 → $0.092175 < $5.
- Report/screenshot: `docs/build/reports/2026-11-09_paid-u6-R4/` (committed).
- Checks: `check-append-only.mjs --base stevevitali/r7deploy-tip`; `check-build-memory.sh`;
  `ci-boundary.sh --pr <n>` at the pushed head.
