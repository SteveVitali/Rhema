# R6FOR.1 — Production forensics read (2026-10-21)

**Access:** IAP tunnel (`rhema-prod-proxy-3ms6`, us-central1-c) → `postgres` (system role) DSN on
`127.0.0.1:15433` → prod `rhema` DB. Read-only; tunnel closed after the session. No writes, no
`--send`, $0 spend incurred by this read. All figures below are aggregates and run IDs — no
user content, no PII.

---

## D-SLO.1-5 — the two named `run_success_rate` failures

**Verdict: both are by-design terminal outcomes, not platform defects.** A proposed
denominator re-attribution is drafted as **ADR-119 (Proposed, approved: no)** — operator
decision owed; `slo.ts` semantics unchanged.

### `01M3EGS55XHHFBT6CNS7Z3F5N9` — research_burst, `phase_blocked` (2026-09-26)

- Terminal `failed` at ~85 s; the Plan phase wrote `.rhema/phase-result.json
  {"status":"blocked"}` — the skill contract's own verdict ("a burst that cannot decompose
  the question … reports `blocked` — it never silently proceeds",
  `packages/protocols/skills/research-burst/SKILL.md:63`).
- SDK finished cleanly; 49 proxied inference calls (~25 cr metered) preceded the block — the
  agent explored, judged the question undecomposable, and honestly declined.
- Ledger: `hold 765` → `release 765`; no debit. User charged **0**.
- Classification: contract-correct agent domain verdict counted as a platform failure under
  today's denominator. → ADR-119 `phase_blocked` row.

### `01M3EW0EQJ3ZSNCW3TQ140NGBE` — chat_turn, `cap_reached` (2026-09-26)

- `inputs.budget.credits = 5` — requester-set **below** the §7.1 40-cr ceiling
  (`effectiveBudget` only ever shrinks; `packages/assistant/src/turn.ts:46`). Plan card
  consented at cap 5.
- The turn metered 16 cr; the proxy denied 3 `/v1/messages?beta=true` calls with `cap` (402).
- Ledger: `hold 5` (promo) → `release 5` → `adjustment 16, absorbed`. User charged **0**; the
  platform absorbed the overrun exactly per REQ-SPEC-32's clamp.
- Classification: a **user-consented cap death** — the bound did its job. → ADR-119
  `cap_reached` (consented-budget) row.

## D-SLO.1-7 — the four >5% proxy-vs-SDK divergence attempts

**Verdict: model-call/tool-call shape, not a metering defect.** Token sums are identical
between `source='proxy'` rows and the `sdk_estimate` roll-ups on every attempt; the >5% cost
gap is the search/fetch surcharge counted at different granularity.

| run | attempt | proxy $ | sdk_estimate $ | shape delta |
|---|---|---|---|---|
| 01M3EAAZG2AQ289B6ZFEP5XYN2 | 1 | 0.400210 | 0.466795 | same tokens; tool counts differ |
| 01M3EAAZG2AQ289B6ZFEP5XYN2 | 2 | 1.379823 | 1.623206 | proxy metered 8 searches, estimate counted 1 |
| 01M3EAAZG2AQ289B6ZFEP5XYN2 | 7 | 1.434470 | 1.657477 | proxy fetch vs phase-level estimate split |
| 01M3EVPYKJ9W3KBGDCPBZEXDV7 | 1 | 0.189514 | 0.230838 | same tokens |
| 01M3SK62YZST272B35CG12K6TW | 1–2 | 4.137161 (att.2) | 3.440535 | proxy metered 28 searches + 28 fetches over 123 calls; phase estimates counted 2 fetches, 0 searches |

- Proxy is the metering source of record; `sdk_estimate` is a per-phase projection. The
  `usage_divergence_rate` signal exists to watch exactly this gap — it is working as designed.
  No missing usage, no double-count.

## D-SLO.1-8 — egress canary (`api/hello` / `?beta=true`)

**Verdict: `api/hello` is the intentional SDK connectivity probe; its 128 allowlist denials
were a real gap, fixed by the F7 allowlist entry deployed 2026-09-26 ~12:38Z (`fafab458`).**

- `/api/hello` is explicitly allowlisted (`ANTHROPIC_PROBE_ENDPOINT`,
  `packages/orchestrator/src/allowlist.ts`) for the vendored SDK's HEAD probe.
- `fetch_log` (since 2026-09-20): **128** `endpoint … /api/hello is not on the run allowlist`
  denials, first 2026-09-22 16:48Z, last 2026-09-26 **09:29Z** — ~3 h before the fix deploy;
  **zero** endpoint-allowlist denies of `api/hello` after 12:38Z (the single post-fix
  `api/hello` deny row is a `cap` reason — a different check, correctly applied).
- `/v1/messages?beta=true` was never denied on the endpoint check — `?beta=true` stays inside
  the `/v1/` prefix (`path.startsWith("/v1/")`). Its 29 denials were `cap` (21 messages +
  8 count_tokens) and 4 were `model … not on the run allowlist`.
- **Secondary defect found (fixed this branch):** `isModelAllowed` did exact `includes`
  against allowlists built from `MODELS_BY_TIER` family names (`claude-haiku-4-5`) while seats
  send dated ids (`claude-haiku-4-5-20251001`) — 4 denies across 3 base-tier `review` runs
  (editor seat), incl. one post-F7. Now family-prefix matched on a `-` boundary +
  regression test (`apps/egress-proxy/src/credential.ts`, `credential.test.ts`).

## `balance_divergence` — six included-bucket accounts

**Verdict: REAL DEFECT (was launch-blocking) — the SPA.22 delivered-run-report seed wrote an
invalid ledger chain. Fixed this branch.**

- All six accounts: `is_test` workspaces, `bucket='included'`, expected avail **3860** / held
  **−3860**, actual 0/0. Each ledger shows the same `grant 3860` + `debit 3860` pair
  (`journey-report-seed`) with **no `hold`**.
- `balanceEffect("debit")` consumes `held` only — a bare grant+debit folds to
  avail=+3860/held=−3860 while `credit_balances` stays 0/0 → the nightly `assertBalances`
  divergence. The runtime hold→debit path is sound; the seed omitted the hold.
- Fix: `seedDeliveredRunReport` now writes grant→hold→debit; the test asserts the three-row
  shape AND the fold invariant (avail=0, held=0). `packages/db/src/seed/showcase.ts`,
  `showcase.test.ts`.
- The six prod rows are **fixture contamination on test tenants** — explained by the old seed;
  no user funds affected. They will clear on the next reconcile after a corrected deploy, or
  by an operator cleanup; no prod write was made by this ticket.

## D-STB.5b-1 (REQ-FOR-3) — live system-role guard half

**Verdict: PASS.** The `JOURNEY_DATABASE_URL` system-role probe succeeds and the meter reads
**$0** in the guard's own shape.

- `pg_roles` probe (spend-guard's exact query shape): `postgres` → `rolsuper=false`,
  **`rolbypassrls=true`** — the bound-role check passes; the pool is not RLS-blind.
- Weekly meter in the guard's shape (`source='proxy'`, `is_test` workspaces,
  `provider_request_id not like 'req_jrn_%'`, 7-day window): **0 rows, $0.0000**.
- All 30 proxy rows in the window ($73.98 total) carry `req_jrn_` ids — prior
  journey-observatory rows excluded by REQ-ECON-6's design. The guard would compute
  `withinCap: true`, `weeklyMeteredUsd: $0`.

## Window context (7-day, non-test tenants)

- 2 terminal runs: 1 failed (the `cap_reached` above is outside the window — it is dated
  2026-09-26), 1 cancelled. The product is pre-launch; volumes are minimal.

## Production writes

None. All queries above are SELECT-only; the tunnel was opened for this session and closed
after.
