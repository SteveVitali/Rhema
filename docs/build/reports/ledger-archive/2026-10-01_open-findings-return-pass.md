# LEDGER archive — 2026-10-01 (MAINT.2)

Dated, append-only archive for `docs/build/LEDGER.md` (base `a2bf831`, JOURNEY.1 chain tip).
MAINT.2 collapsed resolved OPEN FINDINGS entries to one-line `RESOLVED → pointer` stubs, pruned
the done RETURN PASS rows, and re-worded the line-3 provenance comment (the `.agents/scratch`
path is retired). Every block below was **moved verbatim** — nothing was rewritten or deleted.
Corrections to anything here are new dated entries, never edits.

## Superseded head line (LEDGER line 3 at base — the stale `.agents/scratch` token; BM-LEDGER-08 living-archived)

  Reconstructed by MAINT.1 (build-memory v2 migration) from the legacy .agents/scratch/rhema-build-ledger.md

## From `## OPEN FINDINGS` (LEDGER lines 42–163 at base)

### G1 CORE criterion MET live (resolved 2026-09-11)

- **G1 CORE criterion MET live (2026-09-11, P0.15k Stage B, PR #28).** The `cited⇒fetched` wall ([[D-P0.15i-2]])
  was confirmed unconverged live (a proj_pv review fetched 224 URLs but still cited 18 from training knowledge);
  the **operator ruled Path B** ([[ADR-006]]: delivery strips unfetched citations + downgrades the claim, rather
  than hard-failing — `validateCitedFetched` unchanged), and **all three real Reviews then DELIVERED green** on
  `dev` (`assessPhase0ExitForRun` PASSED: violations=0, sidecars ok, cited⇒fetched 0-miss). Closes **D-P0.15-1**
  and **D-P0.15i-2**. See `docs/phase0-exit-readout.md` § "P0.15k Stage B".

### GATE G1 dispositioned PASSED (resolved 2026-09-15)

- **GATE G1 dispositioned PASSED (2026-09-15, with accepted exceptions) — Phase 0 EXITED.** The Phase-0
  deferrals were reconciled against the P0.15k live evidence (`DEFERRALS.md` § "Reconciliation — G1 clear"):
  the live deploy/agent/proxy/mirror/orchestrator rows are DONE; the §18-eval rows belong to GATE G2; the
  beta/IDE/CI/ops rows to later phases. Accepted-exception follow-ups (tracked, not blocking): the ±2% cost
  cross-check ([[D-P0.08-2]]/[[D-P0.15-2]]), the live structured gate-EDIT ([[D-P0.15-3]]/[[D-P0.15k-2]]), the
  estimator fold for revise/profile_voice ([[D-P0.15k-1]]). See `readouts/GATE-G1.md`.

### REQ coverage (informational — kept open; original text)

- **REQ coverage (informational).** With `req_id_pattern` now set, `check-build-memory.sh` runs REQ→ticket
  coverage against `docs/rhema-design-spec.md`; any warning it emits is recorded here, not fixed by this ticket
  (RH.1 scope). None were violations (warnings only) at MAINT.1 close.

### STB.2 finding — cross-tenant dossier read (resolved 2026-09-25)

- **STB.2 finding (RESOLVED — DEPLOYED + VERIFIED 2026-09-25 ~22:14Z) — cross-tenant dossier read on prod.**
  `GET /projects/:id/review/:runId/dossier` returned a foreign workspace's full dossier DTO (letter,
  findings, claims, access report) to an authenticated user outside that workspace: the anchor query
  relied on RLS, but `correspondence_items`/`findings`/`claims`/`revision_obligations` are not
  RLS-enforced tables and the deployed api connects as `postgres` (`rolbypassrls=true`). Fixed in source
  (`apps/api/src/dossier-routes.ts` explicit `workspace_id` predicate + regression test), **deployed in
  `pulumi up` update 78** (api `ef986d13`, web `658143d5`, worker `98e86c68` on `f3c7e13`), and
  **verified closed live**: the same foreign pair that returned 200 + 56 KB pre-roll now returns
  **404 `not_found`**; `deployments` row `prod:f3c7e13…`. Exposure window: route deploy → 2026-09-25
  ~22:14Z. See `runs/STB.2.md` §3 + §9.

### D-PRB.21-1 — review uncompletable at derived caps (resolved 2026-09-23)

- **D-PRB.21-1 (OPEN) — the review workflow is uncompletable at derived caps (2026-09-22, day-one live).**
  Five consecutive `cap_reached` deaths on `my-first-project` across quick/standard and two docs:
  `01M3508M` (est 364/cap 546 → 622), `01M35CEQ…` (est 1657/cap 2486 → 2629), `01M35FR9…` (73/110 → 119),
  `01M35HHJ6…` (73/operator-raised 400 → 407), `01M35KCFA…` (73/400 → 466 on a 701-word draft with ZERO
  in-doc URLs — `verification` still ran 128 fetches + 13 searches of its own research; 6.65M cache-read
  tokens / 41 calls). Committed debits stayed modest (≈ $11.7 total across the day) — the cap meters
  proxy burn, the estimate models committed-debit rates, and research volume is unbounded. Quick's
  honest floor (cap ~86–110) is below minimum viable burn (~146). Routed to `28m_PRB.22` (bound the
  research + model the residual; ≤$5 live verify). Also logged: the beta project page has no
  run-history/delivered-review links (P1.05 concern — dossiers reachable only by URL).

### STB.3 live findings (still open — F8 only; original text)

- **STB.3 live findings (2026-09-26, prod `f3c7e13` — runs/STB.3.md §4).** The bounded legs surfaced
  ten concrete defects, all recorded unfixed per OPS scope: **F1** missing/unparseable
  `.rhema/phase-result.json` killed outline/research_burst/profile_voice (~511cr metered, 0
  committed); **F2** `second_read_producer_checked` is unsatisfiable on the deployed build — the
  hook denies `Agent` in the judge-class phase while `expectedProducerQueryId` is null (memo review
  dead-ends, 438cr across retries); **F3** draft emits `structure-plan.json` without
  `anchor.{blockId,startOffset,endOffset}` (`sidecar_validates:structure`); **F4**
  `credit_balances.held=-897` on `topup` — denormalized counter drift vs a clean append-only ledger;
  **F5** cancelled/failed runs commit only completed-phase debits (451cr committed vs 1,304cr
  metered tonight) → drives `proxy_vs_sdk_cost_runs_over5pct_1h`; **F6** `estimateCache` +
  `claimPrePass` never bound in `buildApiDeps` → `estimate_cache` can never fill; **F7** SDK
  `/api/hello` probe not on run allowlists → `egress_denied_10m` trips on healthy traffic; **F8**
  live SLOs honestly red (start p95 3080s, gate-resume p95 443s, success 66.7%, event-delivery p95
  105.9s); **F9** `/api/action` deep-link 404; **F10** chat cap overshoot 43/40cr. Each needs a
  defect ticket; none was repaired-and-rerun inside STB.3.

### DEF.1 Stage B landing (resolved 2026-09-26)

- **DEF.1 Stage B executed on prod (2026-09-26, `6a36dde`, `runs/DEF.1.md` §7).** F1–F3 repaired,
  deployed (migration 0043 + def1a–h image rolls, provenance stamped per deploy), and re-run at
  the original committed caps: outline `01M3E2EC…` 127/947, profile_voice `01M3E8CX…` 408/420,
  draft `01M3E8F8…` 1,027/1,068, review `01M3EAAZ…` 447/1,083 — all **COMPLETED**; research
  `01M3EGS5…` **failed at `plan` on an honest `{"status":"blocked"}` model verdict** (the thread
  question decomposes into zero external fetches — a product/routing question, not a pipeline
  defect; fetch/distill still unexercised → **D-DEF.1-1 OPEN**). **D-P0.15h-5 → DONE live**: the
  scoped second-reader ran its private mount namespace inside the paid run — launch row
  `explicit_files:["drafts/v1.md"]`, marker `producerQueryId===expectedProducerQueryId===
  01M3EGB57986KDQVE7AA2Q82W8`, committed `05-second-read.md` carrying that `producer_query_id`,
  `second_read_producer_checked` green, `correspondence/review/1/` dossier delivered,
  `boundary.attested` violations=0. Stage B surfaced + fixed four defects the deterministic
  suite cannot see: persona-root tree chmod, `/app/skills` + staged skills-dir read grant (draft
  could not read `draft-ledger.md`), AppArmor denying `unshare` despite `SYS_ADMIN`, and
  util-linux `mount` checking the REAL uid (ambient `CAP_SYS_ADMIN` insufficient — `setpriv
  --reuid 0` wrapper). Committed spend 2,053cr total; every leg under its cap.

### DEF.2 landing (resolved 2026-09-26)

- **DEF.2 landed on `stevevitali/def-2-ledger-metering-integrity` (2026-09-26, runs/DEF.2.md) —
  STB.3 findings F4/F5/F6 repaired in code + a read-only prod reconcile leg executed.** F4: the
  worker sampling meter bypassed the canonical ledger (direct `credit_ledger`+counter writes, no
  account lock) — now routed through `@rhema/ledger`; migration 0044 adds `credit_balances`
  `CHECK (held>=0) NOT VALID` + `admin_actions` `'balance_recompute'`; `reconcileBalances` /
  `recompute-balances` folds the ledger, backfills `reconcile`-source holds, rewrites counters
  (dry-run default; `--apply` operator-gated). F5: `commitStep` debits incremental proxy-metered
  usage per attempt (`args.credits` fallback); cancel = release-only + absorbed-COGS rows, fail =
  refund committed debits by default; `runs.spent_credits` reconciles monotonically. F6:
  `SqlEstimateCacheStore` + `createProxyClaimPrePass` bound in `buildApiDeps` — the pre-pass mints
  a 90 s synthetic proxy credential per refine (no provider key in api; REQ-ARCH-30), gated on
  `EGRESS_PROXY_URL`+`SYSTEM_DATABASE_URL`; same-workspace check added (the shared cache made it a
  cross-tenant probe oracle); Pulumi wires the api env + private-app→proxy firewall. **Prod
  reconcile (read-only, IAP tunnel):** `assertBalances` — 1 divergence
  (`01M2V3PM1133TPH4M8H0T8CSEE`/topup: ledger-derived available 1518/held −180 vs counter
  2235/−897); `recompute-balances` dry-run plans a 180cr `reconcile` backfill + rewrite to
  available 1338/held 0 — **verified zero writes** (counter unchanged, no `balance_recompute`
  audit rows). Owed operator legs: `--apply` + `NOT VALID`→validated, F6 api deploy + a live
  estimate refine filling `estimate_cache`. F7–F10 → DEF.3.

### DEF.3 Stage A landing (resolved 2026-09-26)

- **DEF.3 Stage A landed on `stevevitali/def-3-live-noise-and-polish` (2026-09-26, runs/DEF.3.md) —
  STB.3 findings F7/F9/F10 repaired in code ($0; Stage B owed → D-DEF.3-1).** F7: the vendored
  SDK's `HEAD api.anthropic.com/api/hello` CLI-init preconnect transits the run's proxy but the
  authored allowlist admitted only `/v1/` — a credentialed 403 + deny row + `egress.denied` event
  per run, counted against §13.5 `egress_denied_10m`. Fixed by admission, not suppression:
  `ANTHROPIC_PROBE_ENDPOINT` is authored on every run allowlist (same provider host; `/v1/` +
  `/api/hello` only; nothing else widened). F9: `mintEmailAction` mints
  `<apiBaseUrl>/api/action/<token>` but the api registered the consume handler at `/action/:token`
  — every emailed link was a dead 404 (the live leg exercised the unprefixed path). Fixed by
  mounting the handler on `/api/action/:token` as well. F10: `streamProxyRequest` delivered the
  full stream + `end()` before `prep.meter` committed — a cap-crossing response could be
  consumed-but-unmetered, and a meter refusal would have served a complete-but-unmetered response
  (I2). Fixed by withholding the terminal chunk until the usage row commits: stream end ⇒
  metered; a meter refusal truncates. §12.4's residual bound stays one in-flight request — now a
  hard ordering; committed debits still clamp at cap per REQ-BILL-3. Regression tests per finding,
  gates green. **Owed (D-DEF.3-1):** deploy api+proxy images + one bounded chat_turn ≤$5 re-verify
  (probe allow row + cap-boundary 402 + minted-link round trip).

### 2026-09-30 prod design review / round-3 planning (open; original text)

- **2026-09-30 — prod design review (browser-driven; `reports/2026-09-30_prod-design-review.md`) → ROUND 3.**
  A new user's journey on rhema.tools is broken at almost every load-bearing step, invisible to the 3,496-test suite:
  - **Security:** a live cross-tenant read on `/voices` (PR-S1).
  - **Dossiers:** a 500 on `evidence.urls` absent, including the Showcase (PR-J3).
  - **Editing:** `/assets/page.js` never routed, and Edit source → `/v/working` 404 (PR-J4).
  - **Money:** the free first review is absent (PR-J1), and purchase is dead: CSP + no checkout URL (PR-J2).
  - **Chat:** a 502 (PR-J6).
  - **Core value:** a paid Quick/Base Review did **zero web research**, 16/16 Unverifiable (PR-Q1).
  - **Pricing:** 632 cr debited vs 1,625 cr metered (PR-E5); estimates disagree 10–20× (PR-E1).
  - **SLOs:** still red after DEF.1–3 (PR-R2).

  Consolidated with every owed item into `BACKLOG.csv` (65 rows) and planned as round 3 (ADR-013; planning ledger
  `planning/2026-09-30_planning-ledger.md`).

## From `## RETURN PASS` (LEDGER lines 213–215 at base)

| P0.15j | ~~AC3 (live deliver)~~ **DONE 2026-09-11 (PR #28) via Path B** — the proj_pv Review DELIVERS on `dev`; D-P0.15i-2 closed. No re-run owed. | — | — |
| P0.15k | ~~AC1~~ **DONE** (3/3 reviews green live). Remaining are gate-pending DEFERRALS, not a ticket re-run: D-P0.15-2 (fold revise/profile_voice — needs richer fixtures, D-P0.15k-1), D-P0.08-2 (±2% cross-check — sdk_estimate not live), D-P0.15-3/D-P0.15k-2 (live gate-EDIT). | for the narrow legs: seed a revise-target + author corpus; populate `sdk_estimate`; drive a structured gate-edit | (optional) run revise/profile_voice instrumented + fold; drive a gate-edit → close D-P0.15-2/-3, D-P0.15k-1/-2 |
| PRB.18 | operator legs — four remain after the worker half ran live (2026-09-18): Google sign-in click-through (gated on one Google-Console add), magic-link delivery+click (gated on Resend DNS), Stripe-originated purchase (operator's card — real money), browser SSE run-card + CodeMirror legs. Everything else on prod verified. | (1) Google Cloud Console → OAuth client → Authorized redirect URIs: add `https://rhema.tools/api/auth/callback/google` → sign in at `https://rhema.tools`. (2) Publish the 4 Resend DNS records in `runs/PRB.18.md` → verify the domain → request + click a magic link. (3) Open the Payment Link with `?client_reference_id=01M2V3PM1133TPH4M8H0T8CSEE` → complete the $25 checkout. (4) With verified email + credits: create a project, run a quick/base review, watch the run card live; open the editor, edit, save. | Assert `session`/`account`+`email_verified` rows, `auth.mail` job `completed`, `stripe_events`+`credit_ledger grant(topup,stripe,+12mo)`+`credit_balances`+`topup.purchased`/`wtp.recorded`, run-card `run_events` stream + `artifact_versions` fork rows → then close D-P0.01-3, D-PRB.17-1, D-PRB.04-2a, D-PRB.07-1a, D-PRB.13-2. |
