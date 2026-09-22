# PRB.22 — Review completion defect: verification research burn vs the cap model (run ledger)

- **Ticket:** `docs/tickets/28m_PRB.22__review-verification-burn-cap-model.md` (seq 28m — inserted
  2026-09-22, manifest § Plan extensions; defect-repair, G3 stays parked).
- **Branch:** `stevevitali/prb-22-verification-burn-cap` (stacked on
  `stevevitali/prb-21-live-use-defect-pass`, PR #50).
- **Targets:** **D-PRB.21-1** (estimator cap model cannot complete a real `review` run —
  verification-phase research burn unmodeled). **Stays OPEN** — Stage B evidence below.

Day-one real operator use: five consecutive `cap_reached` deaths across three rigor levels —
the verification/discourse phases run real web research (128 fetches + 13 searches on a 701-word
doc with zero in-document URLs; 6.65M cache-read tokens / 41 calls) that the estimator never
priced, while `cap = ceil(1.5×estimate)` is enforced on Σ proxy-metered burn per request.

## Requirements / acceptance criteria

1. Bound the research channel (the ticket's recommended fix (a)): per-run fetch/search budgets +
   fetched-page context discipline at the egress proxy — the proxy is the meter of record, so the
   bound lives where the metering lives.
2. Model the residual (fix (b)): a research addend in the estimator driven by claim count so the
   derived cap reflects bounded reality.
3. Do NOT change REQ-SPEC-11 meter semantics (option (c) — re-scope the cap — only via an explicit
   operator ruling + ADR; not taken).
4. Stage B: one bounded live `review/quick` run on a small real doc; assert `state=delivered`,
   `spent_credits ≤ cap_credits`, committed debits ≈ estimate, fetch/search counts within budget.
   One operator-style cap raise (cap + hold row) permitted once if the derived cap is implausibly
   small; spend ceiling $5; if the run dies `cap_reached` anyway — STOP, report, do not retry.
5. D-PRB.21-1 → DONE only with delivered-run evidence; build memory clean; PR stacked, unmerged.

## Fix shape ruling (in-ticket)

**(a) + (b)** — the ticket's recommendation, verbatim rationale: "The 6.65M cache-read-token figure
says fetched pages are entering context wholesale — bound that first, then teach the estimator the
residual." Option (c) rejected: the proxy stays the meter of record and users are invoiced on
committed debits (D-PRB.16-5 ruling) — no meter-semantics change, no ADR needed.

Root cause had TWO distinct legs, both fixed:

- **`max_uses` is per-request, not per-run.** The proxy already injected `max_uses:15` on server
  web tools, but the model issues many separate Messages requests across a run — the per-request
  limit never bounded cumulative use (hence 128 fetches).
- **Fetched pages entered context wholesale.** `web_fetch_20250910` accepts
  `max_content_tokens` — the page is truncated Anthropic-side before entering the model's context.

## Stage A — implementation

### Egress proxy (`apps/egress-proxy`)

- `context.ts` — `WebToolPolicy` extended: `fetchBudget`/`searchBudget` (per-run cumulative
  ceilings) + `fetchMaxContentTokens` (per-page truncation).
- `outbound-limits.ts` — `ResearchUsageTracker`: a per-run cumulative search/fetch counter the
  proxy's metered-usage path increments on every response (`server_tool_use` counts are read from
  the actual provider usage block, same as billing metering).
- `url-policy.ts` — `ensureServerWebTools` now clamps each tool's `max_uses` to the run's
  REMAINING budget (not a static default), sets `max_content_tokens` on `web_fetch_20250910`,
  strips the tool entirely once its run budget is exhausted, and strips sandbox-declared web
  tools when policy disables them. Adding/clamping fields marks the body changed (rewrite bug —
  an existing tool missing the fields was passed through unmodified).
- `handler.ts` — the tracker is resolved per run (`runId` from credential context) and threaded
  through request preparation; response metering feeds usage back into it.
- `main.ts` — the live proxy constructs a real `ResearchUsageTracker` (in-memory per proxy
  instance; a run's requests all traverse the same instance).

### Orchestrator (`packages/orchestrator`) + worker (`apps/worker`)

- `allowlist.ts` — `authorWebToolPolicy`: review workflows with the `fact_check` sheet toggle get
  `{fetch:true, search:true, fetchBudget:24, searchBudget:11, fetchMaxContentTokens:8000}`
  (RESEARCH_FLOOR-sized: ~10 baseline fetches + ~7 searches, doubled for headroom); toggled-off
  phases get `{fetch:false, search:false}`.
- `resolver.ts` / `provision.ts` — the policy is persisted on the proxy credential context and
  resolved fresh per request (same seam the cap raise uses).
- `run-jobs.ts` — run-start provisioning authors the policy from the run's profile toggles.

### Estimator (`packages/protocols/src/estimator.ts`, `@rhema/run-sheet`)

- `RESEARCH_FLOOR_CREDITS = 60` (~10 baseline fetches + ~7 searches a verification phase does
  regardless of claim count) and `RESEARCH_PER_CLAIM_CREDITS = 16` (3 fetches + 1 search/claim at
  ~5 cr/fetch truncated ≤8k tokens held ~10 turns).
- `review` gains a `verification` addend `{intercept:60, perClaim:16}` bound to the `fact_check`
  toggle; `fact_check` folds the same constants into its base. Quick rigor keeps
  `fact_check:true` → the floor prices in even with zero extracted claims.
- `profiles.ts` maps the toggle → `enabledAddends:["verification"]`.

### Verification (Stage A gate)

`pnpm install` clean · `turbo build lint typecheck` 111/111 · `pnpm test` 276 files / 2138 pass
(2 skipped; the lever-matrix <100 ms perf assert flaked once under parallel load — green isolated,
pre-existing) · `check:licenses` clean · `check:protocol-markers` 39 files clean ·
`check-upstream-diff.mjs` OK (drift gate covers the vendored skills, not estimator source).

## Stage B — prod deploy + the one live run

**Build:** Cloud Build `b7b8145c` (`integration/.scratch/cloudbuild-prb22.yaml`, tag `rhema:prb22`
— the three changed images only; web/run-task/fetcher/convert/export/collab untouched):
api `…@sha256:50f87736…`, worker `…@sha256:c38a3da2…`, egress-proxy `…@sha256:4938ae23…`.

**Deploy:** digests pinned in `infra/pulumi/Pulumi.prod.yaml` (`serviceImages.api`/`worker` +
`proxyImage`) → `pulumi preview` clean (api/worker template diffs + proxy instance-template
replacement + 4 pre-existing `-scaling` drift updates; the `alloydbCluster` output warning is
pre-existing) → `pulumi up` update **70** applied: api/worker new revisions serving, proxy MIG
rolled to `rhema-prod-proxy-mqvs` (internal IP `10.8.16.4` preserved — `proxyBaseUrl` unchanged);
`api.rhema.tools/healthz` 200.

**Live run `01M35Q8M2A9YRCE66HZZPSP2X2`** (`review`, `quick`, `base`; project
`01M34YDZ3SK525JYF74EEH44QR` / draft `01M35KC9K6N6R2P6EJD19T30E9`, 701 words, zero URLs — the
same doc that died twice on 2026-09-22, incl. at an operator-raised cap 400):

- Minted-session auth → `POST /projects/:id/runs` → 201 queued; server-derived
  **estimate 138 / cap 207** (research floor addend applied: quick keeps `fact_check:true` ⇒
  `enabledAddends:["verification"]`).
- Proxy credential context asserted: `webTools{fetch:true, search:true, fetchBudget:24,
  searchBudget:11, fetchMaxContentTokens:8000}` — the bound propagated end-to-end.
- `approve_scope` gate `01M35QFZM7D7X0MH54N89THJMX` approved headlessly at spent=106
  (`POST /runs/:id/gates/:gid {action:"approve"}` → resolved).
- **Terminal: `failed` / `cap_reached` at spent 211 > cap 207** (4 min into verification,
  attempt 2, `retryable:false`). Per ticket: STOPPED — no retry, no cap raise on a dead run.

**Numbers (prod `rhema` DB, 2026-09-22):**

| metric | value |
| --- | --- |
| Messages requests | 34 (4 top-level + 30 `editor` subagent, all one credential) |
| web_search / web_fetch | **0 / 0** — `usage_records.searches`/`fetches` Σ |
| cache-read tokens | 5.14M Σ |
| list cost | $2.70 Σ `usage_records` |
| spent_credits / cap | 211 / 207 |
| committed debits | 106 (intake) + 63 (craft) = 169; hold 207, release 38 |
| steps | intake done 106cr · craft done 63cr · verification failed at cap |

**Reading:** the research bound was live and propagated but **unexercised** — the model made zero
server-side research calls this run (stochastic path; no tool-schema errors in `run_events`, all
34 requests metered successfully through the policy-carrying credential). The burn that killed the
run is baseline multi-turn context accumulation (5.14M cache-read ≈ 151K/request avg), NOT
research. This sharpens the ticket's own §2 flag — the **quick-rigor floor**: the same doc died at
466 earlier today WITH research (cap 400) and now dies at 211 WITHOUT any (cap 207) — the minimum
viable burn for verification on this doc exceeds any honest quick cap. The fix shipped and is
correct for the research-burn leg; the residual is the estimator's non-research context model.

### Deviations

- **Acceptance not met** — the single sanctioned live run died `cap_reached`; `state=delivered`
  never reached. Per the ticket's stop clause, no retry was attempted and no cap raise was applied
  to a terminal run. D-PRB.21-1 stays **OPEN**, dated-annotated with this evidence (the deferral
  row already scopes the quick-floor problem the residual belongs to — no new deferral opened).
- The operator-cap-raise seam (`update runs set cap_credits` + hold row, effective next request)
  went unused — the run crossed the cap between 60–90 s polls; a raise on a `retryable:false`
  terminal row is meaningless anyway.
- Minted session row deleted after use; scratch DB helper removed; IAP tunnel closed. No secrets
  in any committed file.
- Spend: 169 committed credits (~$1.69–2.70) — under the $5 ceiling.

## Evidence report

- Stage A: commit `7029db5` — 25 files, +594/−59; turbo 111/111; vitest 2138 pass / 2 skip.
- Stage B deploy: Pulumi prod update 70; Cloud Build `b7b8145c` (tag `rhema:prb22`); digests above.
- Stage B run: `01M35Q8M2A9YRCE66HZZPSP2X2` — `failed`/`cap_reached` 211>207; usage + ledger rows
  quoted above; gate `01M35QFZM7D7X0MH54N89THJMX` resolved.
- `check-build-memory.sh .` — 0 violations (run after the memory update).
