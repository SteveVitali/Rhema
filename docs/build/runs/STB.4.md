# STB.4 — Real-money + external legs (run ledger, append-only per leg)

- **Ticket:** `docs/tickets/58_STB.4__real-money-and-external-legs.md` — the ops ticket for the legs
  that cost real money or external coordination.
- **Branch:** `stevevitali/stb-4-real-money-external`, stacked on the DEF.3 tip `351177c`
  (`stevevitali/def-3-live-noise-and-polish`, PR #79 — the deployed prod tree). **Nothing merged.**
- **Spend:** **$0.** Leg A (live Stripe) is held for the operator's mode decision — untouched.
  Legs B (pen-test facilitation) and C (admin-key usage reconciliation) are the $0 legs run here.
- **Session:** live prod evidence over `gcloud`, the IAP tunnel (`127.0.0.1:15433` → Cloud SQL
  `10.46.0.3`, bastion `rhema-prod-proxy-qdvf`), Cloud Logging, and read-only DB queries
  (`integration/.scratch/` — untracked). Secrets never printed (values checked by
  length/prefix/placeholder-pattern only).

## Leg A — live Stripe billing round-trip (HELD — operator gate)

Not run. The ticket's own AC2 ("the ticket stops at each gate rather than proceeding on inferred
consent") + the run instruction hold this leg for the operator's live-vs-test-mode decision.
D-P1.16-1 stays as-is; no Stripe surface was touched.

## Leg B — pen-test facilitation (D-P1.22-3) — vendor package READY, $0

Procurement is the operator's action. This leg's work ends at "everything a vendor needs exists in
the repo". Delivered two docs (name-free — no invented vendors, prices, or dates):

| artifact | path | contents |
|---|---|---|
| Vendor package index | `docs/security/pen-test-vendor-package.md` | The single index: package contents table (scope doc + architecture summary + env/test-accounts + ROE + findings format + repo-access terms); a condensed architecture summary (deployed topology + the six trust boundaries); test-account provisioning mechanics (two paid tenants `PT-PAID-A/B` + one trial `PT-TRIAL`, seeded by audited `house-grant` promo credits; account ids + budget kept OUT of git); the expanded rules-of-engagement checklist (scope discipline / data handling / comms / safe-harbor); and what the engagement returns. |
| Findings triage runbook | `docs/security/pen-test-findings-triage.md` | The tickets-from-findings path: the `PT-NN` finding-record template; the severity rubric verbatim from the scope doc (critical = launch-blocking, ≤24h secure-channel report); the intake workflow (receive → `docs/build/readouts/` → dedupe vs the deterministic suite → confirm → fix ticket / `D-PT-NN` DEFERRALS row / backlog → launch-gate list → verify+close); standing rules (no silent drops, no secrets, compensating controls named). |

**Gap-fill vs `pen-test-scope.md`:** the scope doc already carried the surface map, controls list,
residual-risk statement, engagement shape, and a one-paragraph triage protocol. What it lacked for a
vendor to start: an architecture summary (delivered §1 of the package), concrete test-account/env
mechanics (§2), an expanded ROE checklist (§3), and the per-finding record + intake workflow
(the triage doc). `D-P1.22-3` amended accordingly: **vendor-package ready; procurement + engagement
remain the operator's.**

## Leg C — admin-key usage reconciliation (D-PRB.08-1b) — wired to the REAL contract; window reconciled one-sided; provider pull BLOCKED on the key value

### C.1 The seam + the live discovery

The worker binding existed (`main.ts`: `ANTHROPIC_ADMIN_KEY_SECRET` env → Secret Manager →
`AnthropicAdminReportSource` → nightly `usage.reconcile`, placeholder-guarded). But the source's
fetch was written against a **guessed report shape** — `group_by[]=request_id` with per-request
`cost_usd` rows. Verified against the published Usage & Cost API reference (STB.4):

- `GET /v1/organizations/cost_report` — **daily buckets only**; `amount` is a decimal string in
  **lowest currency units (cents)**; `group_by[] ⊆ {description, workspace_id}`; **no api-key filter**
  (org-wide).
- `GET /v1/organizations/usage_report/messages` — token counts only (`uncached_input_tokens`,
  `cache_creation.{ephemeral_1h,ephemeral_5m}_input_tokens`, `cache_read_input_tokens`,
  `output_tokens`, `server_tool_use.web_search_requests`); `group_by ⊆ {account_id, api_key_id,
  context_window, inference_geo, model, service_account_id, service_tier, speed, workspace_id}` —
  **`request_id` is not a group_by** (the deployed code would 400 on the real API).
- **No request-level granularity exists at all** → the `provider_request_id` join (100% populated on
  prod proxy rows — verified below) can never join Anthropic-side. Reconciliation for Anthropic is
  **window-level** by construction.

### C.2 Code landed (STB.4)

| file | change |
|---|---|
| `apps/worker/src/provider-report.ts` | Rewritten to the real contract: paginated `cost_report` (cents→USD) + `usage_report/messages` (`bucket_width=1d`, `group_by[]=model`) for the report day; emits `rows:[]` + a `window` payload `{start,end,usd,tokensByModel}`; defensive normalizers `normalizeCostReport`/`normalizeUsageBuckets`; non-USD rows throw loudly; the dead `group_by[]=request_id` is gone. |
| `packages/ledger/src/reconcile.ts` | `ProviderUsageReport.window?` added; `reconcileProviderWindow` — compares provider window totals (USD + per-model tokens) vs Σ `usage_records(source='proxy')` over the window bounds; `usage_drift` alert >2% with per-model detail; **no ledger writes** (an aggregate carries no run attribution — refund smearing would be an unexplained write; divergence pages for an operator-driven adjustment instead). |
| `apps/worker/src/billing-jobs.ts` | `handleUsageReconcile` runs the window arm when the report carries `window`, the request-id arm when it carries `rows`; `UsageReconcileResult.window` added. |
| `apps/worker/src/main.ts` | nightly log line now reports the window compare (`report $X vs proxy $Y drift N%`). |

Tests: `provider-report.test.ts` (new — real-envelope fixtures, cents→USD, per-model token sums,
pagination, 401 loud-fail), `reconcile.test.ts` `reconcileProviderWindow` block (in-tolerance /
planted 3% drift alert / report-only & meter-only models / empty window; asserts **zero**
`provider_report` rows + zero refunds), `billing-jobs.test.ts` window-arm case. Gates: §G below.

### C.3 Live state (2026-09-26 evidence)

- **`rhema-prod-anthropic-admin-key` v1 = still a placeholder** (`sk-ant-admin_placeholder_…` shape —
  47 bytes, self-marked; never printed). It is the ONLY admin-key-named secret in the project.
- **No usable admin/org-scoped key exists:** all three real keys (`anthropic-api-key`,
  `rhema-dev-anthropic-api-key`, `rhema-prod-anthropic-api-key`) are `sk-ant-api03-…` inference keys;
  live probes → `401 {"type":"authentication_error","message":"The Admin API requires an Admin API
  key or an organization-scoped API key."}` on both admin endpoints ($0).
- **The deployed worker behaves exactly as designed:** nightly `usage.reconcile` logs
  `report=skipped` (placeholder guard) + runs the balances assertion every night — Cloud Logging
  2026-09-18→26. Standing note: the assertion currently reports **1 balance divergence** nightly
  (pre-existing; the DEF.2 repair's D-DEF.2-1 class, alert path verified working in PRB.17).
- **Meter-of-record join readiness: 100%.** Every prod `usage_records{source='proxy'}` row carries a
  `provider_request_id` (verified per-day counts below).

### C.4 The reconciliation window — OUR side (read-only, prod rows)

Window: **2026-09-26 UTC** (the STB.3/DEF run day — the heaviest recent window). Metered sums:

| side | value |
|---|---|
| proxy `usage_records` | **1001 rows · Σ list_cost_usd = $24.228135 · Σ credits = 3363** |
| by model | `claude-sonnet-5`: 987 rows · in 6,472 / cache-write 2,406,570 / cache-read 35,196,086 / out 1,082,803 / searches 2 · $23.916656 — `claude-haiku-4-5-20251001`: 14 rows · in 41,591 / cw 120,901 / cr 66,963 / out 4,413 / searches 9 · $0.311479 |
| `provider_request_id` coverage | 1001/1001 (100%) |
| `credit_ledger` same day | debits `run` ×31 = 1,605cr · holds 8,684 · releases 7,079 · `hold source=reconcile` 180 · grants 2,010 · adjustment 16 |

**Provider side: UNAVAILABLE** — the admin-key value is still a placeholder, so the Anthropic-reported
cost for the window could not be pulled. Divergence: **not computable this leg.**

### C.5 What the operator unblocks (exact steps, no code left)

1. Seed the real Anthropic **Admin API key** (`sk-ant-admin-…` or an org-scoped key):
   `gcloud secrets versions add rhema-prod-anthropic-admin-key --data-file=-` (project `rhema-507501`).
2. The worker reads the secret at boot — a Cloud Run revision restart (or the next deploy) picks it
   up; the placeholder guard then binds `AnthropicAdminReportSource`.
3. Next nightly `usage.reconcile` (03:15 UTC) runs the window arm for the prior day; the log line
   carries `window=report $X vs proxy $Y drift N%`; >2% pages the ops webhook.
4. One-off verification of THIS window: re-run the arm for 2026-09-26 (source `day` override) and
   compare against the C.4 metered numbers. Honest caveat recorded in code: `cost_report` is
   **org-wide** — non-Rhema consumption (Console/other keys) inflates the provider side; the
   per-model token compare is the cleaner parity check.

### C.6 Worker image deployed to prod (2026-09-26, the Stage-B pattern)

- `git diff 351177c..86441d6` — worker + `@rhema/ledger` only; api also consumes the ledger package but
  the change is additive (optional `window` field + a new export) → **worker image only**.
- Cloud Build `e291b5c3-21cb-4b3e-8251-b2adaa6822ee` — SUCCESS (tag `stb4`; scratch
  `cloudbuild-stb4.yaml`, E2_HIGHCPU_8). Worker digest
  `sha256:a60b450483ec3decadb0ed3071faa4faef6fd3f7c2a21ce0b863288c3495850b`.
- Pinned into `Pulumi.prod.yaml` `rhema:serviceImages.worker` (dated comment; other images unchanged).
- `pulumi preview` (prod): **6 update / 134 unchanged — 0 creates, 0 destroys, 0 replaces** (worker
  `~template` swap + the known cosmetic `-scaling` readback drift on the other five — identical to the
  STB.2 preview shape; the stop condition never fired).
- `pulumi up` — **update 91 converged (59s)**; `gcloud run services describe` confirms
  `rhema-prod-worker-cbdaf0f` serves `…worker@sha256:a60b450483ec…`.
- Provenance: `scripts/live/record-deployment.mjs` → **`prod:86441d6c38c1901d1ae7d5586638358bed0f2ad2`**,
  `protocols_version=0.4.0+ec61156725a895ab`, all nine digests on the row.
- Post-deploy boot (Cloud Logging 18:47:30Z): clean startup — health server → keys loaded →
  **"ANTHROPIC admin key is a placeholder — Usage & Cost report pull unconfigured"** (the guard intact
  on the new image; prod behavior unchanged until the operator seeds v2) → pg-boss → consumers+crons
  registered. Zero crashes.

## G. Gates

- `pnpm turbo build lint typecheck` — **132/132 green**.
- `pnpm test` — **3600 pass / 380 files**; the single failure is `run-sheet` `lever-matrix`'s
  timing-sensitive `<100ms` assertion (133ms under suite load — **flaky, unrelated to this diff; green
  in isolation at 16ms**; run-sheet untouched).
- `pnpm check:licenses` — 607 packages OK · `pnpm check:protocol-markers` — 45 files OK ·
  `check-upstream-diff.mjs` — 22 files reconcile · `check-build-memory.sh` — **0 violations**.

## Still owed (explicit)

- **Leg A** — operator's mode decision (live vs test Stripe), then the (a)–(i) legs in D-P1.16-1.
- **Leg B remainder** — operator procurement of the engagement itself; findings file into
  `pen-test-findings-triage.md`.
- **Leg C remainder** — operator seeds `rhema-prod-anthropic-admin-key` v2 → window reconcile runs
  itself nightly; the 2026-09-26 one-off compare is one command away (C.5.4).
