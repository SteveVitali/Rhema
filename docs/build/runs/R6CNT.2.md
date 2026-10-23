# R6CNT.2 — Showcase build / H4 stamps / sample dossier / legal flags / exposure notice (run ledger)

- **Spec:** `docs/tickets/194_R6CNT.2__showcase-build.md` (manifest row 194, round 6; REQ-LCH-3/-4,
  halves REQ-LCH-1 + REQ-FOR-4; REQ-POS-3 proof)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.2; `docs/tickets/DEFERRALS.md` rows
  D-P1.17-1/-2, D-P1.21-1, D-PRB.01-2; `docs/build/readouts/HUMAN-H11.md` (A1–A5 verbatim);
  `docs/build/reports/2026-10-21_R6CNT.1/` (h4-venue-evidence, h5-showcase-shortlist,
  sample-dossier-proposal); LEDGER GATE DECISIONS `GD-DEPLOY.R6`, `GD-EXPOSURE-NOTICE.R6`,
  `GD-CONTENT.R6`, `GD-SHOWCASE.R6`, `GD-LEGAL.R6`, `GD-LEGAL-DETAILS.R6`, `GD-R6B.R6`;
  `docs/build/reports/2026-10-21_R6FOR.2/` (verdict YES + approved draft);
  `docs/build/runs/R6DEP.1.md` (the deploy recipe this run reuses).
- **Base:** `stevevitali/r6post-2-posture-stages` @ `97e2a88` (chain tip at branch cut)
- **Branch:** `stevevitali/r6cnt-2-showcase-build` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-LCH-3 REQ-LCH-4 · halves: REQ-LCH-1 REQ-FOR-4 · REQ-POS-3
- **Started:** 2026-10-23T03:53Z · **Closed:** 2026-10-23T05:21Z — all in-scope deliverables
  landed + live-verified; PR #212 open unmerged (OPERATOR); GATE-LAUNCH staged, never signed.
- **Live stage:** prod — the ticket's named mutations only.
- **Production mutations (ticket header, verbatim):**
  - one paid Full-board run;
  - a redeploy of the tip under `GD-DEPLOY.R6`, carrying the new seed bundle + H4 stamps;
  - the showcase seed applied (`seedShowcaseProject` idempotent) and `venue_table_verified_at` set
    by `seedProtocols`;
  - the exposure notice send (only if R6FOR.2's verdict is yes, after HUMAN-H11 approves the text
    verbatim).

  Rollback = `git revert` + redeploy.

## Funding gate — the PAID FULL-BOARD RUN PAUSES (recorded BEFORE any dispatch)

**Gate cell (verbatim):** "the paid run spends the headroom GATE-R6B reserved for it; if its
estimate now exceeds the remaining headroom → PAUSE." Chain of authority: contract cell →
`GD-R6B.R6` **STAYS CLOSED** (2026-10-23; reserved headroom **$0**; re-open needs a fresh operator
ruling) → the operator's standing directive "**proceed as you see fit**" bounded at **≤ $15**
declared cap.

**The estimate (the estimator itself, `resolveEstimation` — `estimator_cells` on prod is EMPTY,
verified over the system-role DSN 2026-10-23T04:0xZ ⇒ the modeled estimators govern):**

| config | estimate | declared cap (`ceil(1.5×est)`) | cap USD | verdict |
|---|---|---|---|---|
| review · `full_board` · **frontier** (§6.5 default tier) | 10,043 cr | 15,065 cr | **$150.65** | > $15 |
| review · `full_board` · **base** (the cheapest legal tier) | 2,232 cr | 3,348 cr | **$33.48** | > $15 |

Inputs: `words: 1640` (Wells, measured in R6CNT.1), density-derived `claims: 7`, `phases: 7`
(intake, craft, verification, discourse, second_read, argument, letter — all active at full_board),
`meteredCoverage 1.25`, rigor `full_board ×1.2`. The declared cap is editable **upward only**
(REQ-BILL-7), so **$33.48 is the floor for ANY legal Full-board dispatch** — the bound is
unsatisfiable, not merely exceeded on one config. (A 0-word essay still caps ≈ $26 at base — the
per-phase churn + research intercepts dominate; no essay choice could fit.)

**Verdict: PAUSE.** The estimator-derived declared cap ($33.48 min / $150.65 at the §6.5 default)
exceeds every bound in the chain ($0 remaining headroom; ≤ $15 authorization). **Zero spend.**
The paid run + the SHOWCASE_FIXTURE bundle export it was to produce are deferred (new row
`D-R6CNT.2-1`; `D-P1.17-1`/`-2` carry dated notes). Everything else the ticket names is spend-free
and proceeds: H4 stamps, sample dossier, legal flags, `seedProtocols`/`seedShowcaseProject` apply,
the redeploy, the fresh-account Showcase leg, the notice send, the GATE-LAUNCH staging.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-P1.17-1** (real Showcase essay seed) — unblocked only while the paid run can dispatch; the
  funding gate above keeps it OPEN → dated note.
- **D-P1.17-2** (Stage-B Showcase verification) — the fresh-account Showcase leg runs this ticket
  (against the stand-in fixture — the leg proves the provisioning → dossier-open path, which is
  content-agnostic; the real-essay half stays owed under D-P1.17-1's funding pause) → dated note.
- **D-P1.21-1** (H4 venue stamps) — discharged THIS RUN for the rows the approved evidence covers
  (PLOS ONE + the 3 fetch-confirmed outlets); the 3 fetch-blocked rows stay stale by the evidence's
  own condition → dated note; flip evaluated at close.
- **D-PRB.01-2** (sample-dossier sign-off) — H11 A3 approved the proposal verbatim; landing it this
  run → flip to DONE at close if the row's criterion is met.

## Progress

- 2026-10-23T04:1xZ — implementation landed (commit `6fda1f1`): Wells `SHOWCASE_FIXTURE_*` bundle
  (outline/v1/letters/6 claims/6 findings/rubric/run card/triage+revision/v2; contradicted Tier-1
  `Paradoxides` claim w/ two fetched URLs; Apply-capable first finding anchored `b7` exact),
  `apps/web/src/sample-dossier.ts` swapped to the approved Wells proposal, `LEGAL_DETAILS` filled
  (Rhema Labs / NY, NY / contact@rhema.tools; `CONTACT_ADDRESS: null` — no postal address approved)
  + all five pages `approved: true` + the unsupported `⟦CONTACT_ADDRESS⟧` token removed from
  privacy/contact copy, H4 `VENUE_VERIFIED_AT = 2026-10-21T00:00:00.000Z` on the four
  directly-verified rows only (PLOS ONE, NYT, LAT, Globe — WaPo/WSJ/USA Today stay stale: re-fetch
  blocked 403/401/402 on 2026-10-23), test updates across server/marketing/journeys/contracts/
  protocols/db. Focused suites green: contracts-legal 9 · protocols 13 · sample-dossier 2 ·
  legal-pages 19 · api dossier 8 · server 113 · db showcase tests green (`b7` exact anchor).
- 2026-10-23T04:2xZ — exposure-notice send tool landed (commit `ba66c4b`):
  `packages/ledger/exposure-notice.ts` (recipients = holders of real workspaces with a session
  overlapping the 2026-09-17→10-01T02:09Z window; body = the H11-approved draft VERBATIM —
  normalized byte-equal verified against `notice-draft.md`; collapse-key + dedup-key delivery
  mirroring deliverMeteredNotice) + 4-test suite + `integration/src/exposure-notice.ts` +
  `scripts/live/send-exposure-notice.mjs` (--dry-run default; counts-only). The SEND itself is the
  named mutation — not performed by the commit.
- 2026-10-23T04:2xZ — PR **#212** opened (base `stevevitali/r6post-2-posture-stages`). Prod
  pre-state captured: web+api `/healthz` = `dc7fb15a0aa7caa5d47734656d06514d5b75b127`; prod
  `_migrations` max `0058` (zero new files → additive lint PASS); workspaces 357 (8 real);
  showcase projects 31 (5 real, 26 test); `protocols.academic.venue_table_verified_at` = NULL
  (seedProtocols apply owed); IAP tunnel `rhema-prod-proxy-vxdt` → 10.46.0.3:5432 up on :15433.
- 2026-10-23T04:2xZ — **GD-DEPLOY.R6 preflight leg 1**: Cloud Build `b05636b5` submitted — the full
  10-image set at the deploy SHA `ba66c4b` into `rhema-prod` AR (`_TAG=prod`). `billing-read`
  baseline ≈ $225.63/mo (whole-stack inventory; the deploy delta is image rolls only ⇒ $0).
- 2026-10-23T04:4xZ — fresh-account leg probe committed (`565bb6e`,
  `packages/journeys/src/showcase-fresh-leg.ts`): real magic-link signup into the test mailbox →
  signed-in `/showcase` → first `[data-finding]` card; prints the landing→finding ms vs the 60 s
  budget + Wells-content + findings-count assertions as one JSON line.

## Live evidence — the prod deploy + mutations (2026-10-23)

- **Deploy `dc7fb15` → `ba66c4b`** (GD-DEPLOY.R6; Cloud Build `b05636b5`, all 10 images ~11m39s,
  `_TAG=prod` into `rhema-prod` AR; digests pinned in `Pulumi.prod.yaml` w/ dated comment).
  Four-condition preflight committed (`prod-preflight/preview-classification.md`):
  `pulumi preview --diff` = **10u + 1r + 161same** — the single replace is the STATELESS
  `rhema-prod-proxy-tmpl` InstanceTemplate (image roll → MIG re-rolled `vxdt`→`kdnj`); zero
  replace/delete on any stateful resource; additive lint PASS (zero migrations > `0058`);
  cost delta **$0** ≤ $15 (image rolls only; billing-read baseline ≈ $225.63/mo whole-stack).
  `pulumi up` clean (1m45s); **`check-deploy-provenance` all-PASS** on `rhema.tools` +
  `api.rhema.tools` at `ba66c4bcbf4a7e7d76dfc421445ba89d866bb753`; `record-deployment` wrote
  `prod:ba66c4b…` (protocols `0.4.0+ec61156725a895ab`, ten digests) over the SSH-tunnel DSN.
- **Post-deploy smoke**: all six public routes 200 + SSR markers; `/showcase` renders the Wells
  dossier live ("The Extinction of Man" + `Paradoxides`); `/terms` → "Rhema Labs"+"NY, NY",
  `/privacy` → "Rhema Labs"+"contact@rhema.tools" (zero `⟦…⟧` marks); worker consuming
  (`run.walkthrough` jobs observed processing).
- **`prod-migrate-seed` applied** — additive lint PASS in-band, `applyMigrations` no-op (58/58),
  `seedProtocols` upserted all four → `protocols.academic.venue_table_verified_at =
  2026-10-21` (read-back over the tunnel).
- **Showcase seed sweep applied** (`integration/src/showcase-seed-sweep.ts`, committed): dry-run
  found exactly **2 membered workspaces missing a showcase** (the other 324 missing workspaces
  are memberless); `--seed` wrote both (`seedShowcaseProject` + the prod GCS content-store so
  letter bytes render). Read-back: each carries the review corr (6 claims / **1 contradicted** /
  6 findings) + response corr. Showcase projects 31 → 33. **Residual honestly recorded:** the 31
  pre-existing showcase rows (5 real, 26 test) keep the prior stand-in fixture — replacing them
  is a delete+reseed beyond the named `seedShowcaseProject` mutation; flagged to the operator in
  the GATE-LAUNCH readout (threshold 4 note) rather than executed unilaterally.
- **Fresh-account Showcase leg GREEN** (`packages/journeys/src/showcase-fresh-leg.ts`):
  real magic-link signup (test mailbox) → signed-in `/showcase` → first `[data-finding]` card —
  **landing→finding 1,700 ms / 1,737 ms over two runs** (budget 60,000), 12 finding rows, Wells
  content rendered, dossier anchored `#finding-<id>` — `fresh-showcase-leg/runs.jsonl`.
- **Exposure notice SENT** (GD-EXPOSURE-NOTICE.R6; R6FOR.2 verdict YES; "Approve as drafted"):
  dry-run scope = **4 recipients** — every address staff-controlled (internal `rhema.tools`
  mailboxes incl. the SEC.1 probe tenants + the operator's consumer account — identical to the
  approval basis). `--send` → **4 emails + 4 inbox rows**, post-state re-read confirms
  `notification_deliveries` 4×`sent` + `inbox_items` 4× (`security_notice` /
  `rls-exposure-notice:v1`). Counts-only log: `exposure-notice/send-log.md`.
- **F-R6CNT.2-1 (live-found):** `run.walkthrough` jobs fired by the leg's dossier reads land
  `{status:'failed'}` — root cause verified live: `rhema-prod-anthropic-api-key` v3 (latest
  enabled) returns **401** on `GET /v1/models` — the shared model-path key rejects upstream.
  Pre-existing posture (the deploy touched no secret); by-design nicety failure (the dossier
  tolerates it, Retry covers) BUT the same secret feeds `INGEST_MODEL_KEY_SECRET` +
  `WALKTHROUGH_MODEL_KEY_SECRET` — any paid model call would fail the same way →
  **launch-relevant**, recorded in LEDGER OPEN FINDINGS + flagged FIRST-LINE to the operator.
- **GATE-LAUNCH staged** — `docs/build/readouts/GATE-LAUNCH.md` opened: the 13 §6 thresholds
  tabulated with evidence pointers + honest states (3/4/9/10/11/12 met-or-dispositioned by this
  run + prior records; 2/5/6/7/8/13 owed with named blockers; threshold-1 recount is the
  orchestrator's). Status STAGED — the go is the operator's verbatim, never the agent's.

## Verify — deterministic suite at head `0ccbb18` + closeout (2026-10-23 ~05:20Z)

- `pnpm turbo build lint typecheck` — **135/135 tasks successful** (89 cached).
- `pnpm test` — **515 files passed | 1 skipped; 6,073 tests passed | 4 skipped | 0 failed**.
- Six `check:*` gates all green: `licenses` (822 pkgs), `protocol-markers` (251 files, no
  leaks), `no-cookies` (257 files), `spa-budget` (all ceilings), `spa-env` (115 client/146
  artifacts), `dom-contract` (836 entries, 18 surfaces — journeys ⊆ manifest ⊆ emitted ⊆
  asserted).
- `check-build-memory.sh` — **0 violations**, 9 warnings (all pre-existing legacy classes:
  manifest banner rows, nextTicket-order parse, legacy PHASE-LOG budget, BUILD_INDEX legacy
  status tokens, pre-guard readouts, old run ledgers' Harness header). `docs/adr/README.md`
  regenerated for ADR-121.
- `check-append-only.mjs --base 97e2a88f6c4677c66816e40c3863857576b6b6c4` — **OK**.
- **Incident honestly recorded:** `adr-index.sh` invoked without the `docs/adr` arg wrote the
  ADR index over the repo-root `README.md`; restored via `git checkout README.md` and
  regenerated correctly against `docs/adr` — zero content loss.

## Closeout state

- PR #212 OPEN, head `0ccbb18` + this closeout commit — merge is the operator's (OPERATOR).
- `deployments` row `prod:ba66c4b…` is the current live deployment; `check-deploy-provenance`
  all-PASS at `ba66c4bcbf4a7e7d76dfc421445ba89d866bb753` on both public origins.
- OPEN carried forward: `D-R6CNT.2-1` (paid Full-board regeneration, PL), `F-R6CNT.2-1`
  (prod model-path key 401 — launch-relevant; operator key decision owed), the 31
  pre-existing showcase rows' prior-fixture residual (operator call recorded in GATE-LAUNCH
  threshold 4), and the GATE-LAUNCH signature itself (the operator's verbatim go).

## CI boundary

- `gh run list` on the final head `d53c70a`: run **39905403884** — **all jobs PASS**
  (`typecheck / lint / unit` 25m58s incl. full `pnpm test` + `check:dom-contract` +
  `check-upstream-diff`; `contracts`; `public-safe` gitleaks/markers/licence/cookies/budget/env;
  `integration` FakeEngine + privsep kernel legs; `images` build+scan+provenance; `ci-pass`
  anchor written). Earlier runs on intermediate heads were superseded-cancelled.
- Stack check: PR #212 is unmerged (OPERATOR policy); the agent's boundary is "CI green at the
  recorded head" — met.
- Head `eef50c1` (boundary-amend commits): run **39909299224 — PASS** via the same-tree
  fast-path reusing the `d53c70a` anchor (`delta all-eligible`, docs-only). Every PR head
  carries a green verdict; the anchor run at `d53c70a` is the full-suite pass.
