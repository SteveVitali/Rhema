# BACKLOG — human-readable view

**Reconciled 2026-10-04 by REC.1** (`stevevitali/rec-1-backlog-and-readiness`). The machine form is
`BACKLOG.csv`; every gathered source id (DEFERRALS `OPEN`/`PARTIAL` rows, coverage-matrix
`PARTIAL`/`MISSING` rows, and every live ADR revisit trigger) appears in exactly one `sources` cell.
`check-backlog.sh` result: **357 expected sources — complete + non-duplicating + verdict-consistent**.

## Matrix sums (recomputed 2026-10-04, 474 rows)

| Measure | Count |
|---|---|
| Engineering closed (MET + MET-DIFFERENTLY + MET-ENGINEERED) | **327 / 474** |
| Requirement satisfied (MET + MET-DIFFERENTLY only) | **326 / 474** |
| PARTIAL | 114 |
| MISSING | 33 |
| AT-RISK-INTEGRATION | 0 |

**Finding (recorded, not silently corrected):** CAP.3's headline reported 327 requirement-satisfied.
REC.1 re-verdicted `REQ-SPEC-31` `MET` → `MET-ENGINEERED(D-RES.1-2)` per BM-VERDICT-01 — the row was
marked MET while citing an OPEN leg (the N6 planted-error dossier-evidence run). The sums above are
the honest 2026-10-04 reads; the one-point gap is the still-owed live leg, carried on BL-56.

## Status-parse audit (stricter rule applied)

The upstream checker tokenizes each DEFERRALS status cell on `[^A-Z-]` and reads the *first canonical
keyword anywhere* — a `RE-DEFERRED` cell (not in its keyword set) falls through to a mid-cell `OPEN`,
and a `**DONE … Prior OPEN record:**` cell reads OPEN. REC.1 re-read every row with the stricter
*first recognized keyword* rule (strip non-alphanumerics, accept `RE-DEFERRED`/`ACCEPTED-SKELETON`):
220 rows → DONE 112, OPEN 74, PARTIAL 32, RE-DEFERRED 1, ACCEPTED-SKELETON 1. Owed rows (106
OPEN/PARTIAL + 1 RE-DEFERRED = the checker's 107) are all on open backlog rows; none on a closed row.
`D-DEF.3-2` flipped OPEN → DONE 2026-10-04 (evidence was already in-cell: EST.1 deterministic fix +
Stage-B live 400 read). `D-P0.06-3`/`D-P0.08b-3` stay carried on BL-02 — their cells hold mid-text
`open` tokens the validator can never move past (dated status-hygiene notes appended).

---

## Rows by landing

### Operator rulings & operator-held deploys (the binding constraints on launch)

| Row | Owes | Sources of note |
|---|---|---|
| BL-01 | Integrate 33 round-2 + round-3 stacked PRs; diff deployed tree vs merged main (prod runs unmerged code) | X-prs-48-80-unmerged; X-prod-tree-vs-main-diff — landing **REC.3** |
| BL-13 | Unit-economics/pricing ruling: ~$7–10 metered per quick review vs $20/mo plan; metered-flip + paid-account notice | D-PRB.21-1, ADR-038, X-unit-economics |
| BL-29 | Billed-actuals export confirm (D-OPS.2-1) + warm-floor/HA lever execution (D-OPS.2-2); measured $285.80 list vs ~$50 target | ADR-010, ADR-082 |
| BL-30 | Refund-window go-live ruling (D-DEF.4-3) + R9 refund journey leg (D-DEF.4-1); window deployed `test_tenants`-gated | ADR-024/071/072 |
| BL-50 | `GD-ACT.1-1` everyone-flip ruling (D-ACT.1-3) + ASN/IP risk-scorer binding (D-ACT.1-1) | ADR-019/042/043, REQ-GROWTH-10/-15 |
| BL-51 | `GD-BILL.3-1` re-open ruling + real-money/hosted Portal/pending-email legs (D-BILL.3-1/-2) + OBS.1 fixture re-point | ADR-027/028/029, REQ-BILL-14, REQ-BETA-15 |
| BL-67 | `pulumi up` CITE.1 pins (D-CITE.1-1) → probe legs L1/L2/N11 + ADR-086 rate read (D-CITE.1-2..5); leg-cap reconciliation | REQ-IDE-25, ADR-006/083–086 |
| BL-68 | Metered-debit flip + notice; cap calibration on durable store (D-ECON.1-3); unmeasured cells (D-ECON.1-4); Quick findings cap (D-ECON.1-2) | REQ-BILL-7, REQ-SPEC-32, ADR-005/014/031–036/038 |
| BL-69 | `pulumi up` ECON.2 (D-ECON.2-1) → lever pairs L5/L1/L2/L3 + refit (D-ECON.2-6) + REQ-SPEC-8 restore re-check (D-ECON.2-7) | OF-econ2-restore-read, ADR-087 |
| BL-71 | `pulumi up` → 21 paid registry steps + paid new-visitor journey (D-CAP.2-1), full JOURNEY.1 suite (D-CAP.2-2), CAP.3 live legs (D-CAP.3-1, carries D-STB.5a-1..3), completed_partial ruling (D-CAP.3-2), phone-44px re-proof (D-CAP.2-3); the 72 CAP.2-routed PARTIAL matrix rows | REQ-ACCT-3, REQ-DATA-20, ADR-020/088/089 |
| BL-75 | `GD-RES.2-1` retro refund/relabel ruling + zero-coverage scan (D-RES.2-2) + fact_check label extension (D-RES.2-3) | ADR-025/026 |

### Round-4 funded window (weekly guard resets 2026-10-05 00:00 UTC; $58.08 ≥ $5 recorded)

| Row | Owes |
|---|---|
| BL-07 | Named SLO breaches D-SLO.1-5/-6/-7/-8 (success 80 %/wk, delivery-tail p95 2 238 ms, proxy-vs-SDK divergence, egress_denied semantics); REQ-ARCH-34 pauses owning-surface feature work |
| BL-16 | Skill-input pin legs B16 (D-P0.03-2/-3, D-P0.15b-2, D-P0.15c-2) |
| BL-17 | Engine-invariant legs B17 (D-P0.09-3, D-P0.08b-2, D-STB.5b-2 — caps-at-launch fix live, step-state decision is D-CAP.3-2's) + ADR-094 |
| BL-18 | Fetch-policy legs B18A/B (D-PRB.02-3, D-P1.21-2, D-STB.5b-3; fetcher grant stays holdout-only per ADR-095) + REQ-ARCH-21/REQ-SPEC-25 |
| BL-19 | Workflow-gate/finalize legs B19A/B (D-P0.15-3, D-P0.15c-3, D-P1.10-1, D-P1.12-1, D-P1.14-1) |
| BL-21 | Dossier headless legs T11–T13 (D-P1.07-1, D-PRB.04-1) — ride D-CAP.2-1's window |
| BL-22 | Residual account/export legs: citeproc + T8 7-day expiry clock leg + quiet hours + Decisions + T7 purge probe (D-P1.18-1/-19-1/-15-1/-04-2; probe bounded per ADR-092) + ADR-103 |
| BL-25 | D-OPS.1-1 (non-prod signed-in legs — needs mail/session path per ADR-080), D-OPS.1-2 (paused-AlloyDB leg), D-OPS.1-3 (billing export) + ADR-077–080 |
| BL-31 | Matcher-3 floor tuning + rubric conjunct (needs H2 adjudication data) + REQ-PROD-12/REQ-WF-15 |
| BL-56 | RES.1 residual legs (D-RES.1-1), N6 planted-error leg (D-RES.1-2 — gates REQ-SPEC-31), Standard/Base excerpt leg (D-RES.1-3) + ADR-021/022/023 |
| BL-66 | Stale claim-ledger mount live re-verify (RES.2 fix code-landed; rides D-RES.1-2) |
| BL-72 | Spend-guard integrity: fail-closed tripwire landed CAP.3; live re-proof + system-role binding convention (D-STB.5b-1, ADR-093) |

### HUMAN gates (operator-held prerequisites — mostly $0, all paused on the operator)

| Row | Needs |
|---|---|
| BL-20 | Thread-local question-routing product ruling + research_burst delivered leg (D-DEF.1-1, D-P1.11-1) — **H7 ruling + ≤$5** |
| BL-23 | Real prod invite consumed by a live signup (D-SEC.2-1); shared-throttle store proven live SEC.2 — **H7** |
| BL-24 | Canary-injection pause smoke, alert-channel page, usercontent CDN signed-URL headers, first-finding ≤4 min — **H7** (CDN key: not provided) |
| BL-32 | Interactive browser/device legs + Safari/WebKit N8 CSP walk (D-EDIT.1-2) — **H7, $0** |
| BL-33 | Live-mode Stripe re-verify (real objects, 3DS, Tax, test clocks, v2 rate) + credential hygiene — **H7, ≤$50 real money** |
| BL-34 | Real admin/org-scoped key → usage.reconcile report + window arms (D-ECON.1-1, D-PRB.08-1) — **H7** |
| BL-35 | External pen-test procurement + triage — **H7, money** |
| BL-36 | Nightly golden run + score-floor gate + phase-0 readout refresh — **H7, ~$150–300/night** |
| BL-37 | Cross-tenant exposure-window access review + disclosure decision + `rls-exposure-since-0026.md` census (D-SEC.1-2) — **H7** |
| BL-38 | Prod test-data residue cleanup — **H7** |
| BL-39 | H3 partner-program deferred scope + REQ-BETA-2 north-star (defined, unmeasured — no partners) — **H7** |
| BL-40 | H2 corpus: ≥24 drafts, two editors + adjudicator, six real PDFs, written provider no-training — **H2, ~$100 k** |
| BL-41 | H4 venue-table real `verified_at` stamps — **H4** |
| BL-42 | H5 showcase essay + dossier content sign-off — **H5** |

### GATE-G2 (hard gate before public launch / §16.4 claims)

| Row | Owes |
|---|---|
| BL-43 | Live eval-program bindings: enclave bucket, real `@rhema/evals` import, live arm executors, live cross-family judge, workshop matching UI (D-P0.13-1/-5, D-P0.14-1/-2/-3) |
| BL-44 | Pilot wave on real variance (D-P0.13-4, D-P0.15c-4, D-P0.15b-3) |
| BL-45 | G2 wave-1 LIFT read — the 14 G2-routed REQ-EVAL-* PARTIAL rows + OF-g2-deferred |

### Reconcile / docs tail (this chain's remaining tickets)

| Row | Landing |
|---|---|
| BL-02 | round-4 (MAINT.3) + upstream `agent-skills` patch — validator-stuck status cells (D-P0.06-3, D-P0.08b-3), check-backlog parser, GATE-ACCEPT false-positive, PHASE-LOG rotation |
| BL-05 | **REC.2** — fold G2/G3/H3 overrides + ADR deviations into the spec; ADR-007 vs ADR-012 shell lineage |
| BL-06 | **DOC.1 + DOC.2** — repo/agent docs refresh incl. stale phase readouts |

### Watch rows (per-trigger, evaluated at each REC.1 sweep)

| Row | Scope |
|---|---|
| BL-47 | GATE-ACCEPT signed 2026-10-04 (13/13 ACCEPTED); its standing ADR triggers (ADR-001/002/003/011/013/015/016/017) ride as watch |
| BL-76 | Product/UX-surface triggers (ADR-044–052, 059–061, 063–070, 099, 102) |
| BL-77 | Infra/security/process triggers (ADR-040, 073–076, 081, 090–092, 098, 100) |

### Accepted / time-based / spec-scheduled

| Row | Note |
|---|---|
| BL-46 | G3 early read on zero partner data — ACCEPTED 2026-09-23 (REQ-BETA-18 thresholds never evaluated) |
| BL-74 | OBS.1 evidence windows: 24 h zero-MaxListenersWarning soak (D-OBS.1-2, clean since 06:46Z) + first nightly JOURNEY.1 on merged SHA (D-OBS.1-3) + N4 selector-drift fix (X-obs1-n4-selector-drift) + ADR-053 |
| BL-73 | 33 MISSING spec-scheduled 1.x/Later rows + REQ-OBJ-9/-14 — no work owed this chain; REC.2 confirms the schedule |

### Closed (landed — record only)

BL-03 (CAP.1 matrix), BL-04 (this run), BL-08 (SEC.1 rhema_app_login), BL-09 (BILL.3 Stripe fixes
deployed), BL-10 (DEF.4 ledger integrity), BL-11 (EST.1/DEF.4 nits — D-DEF.3-2 flipped 2026-10-04),
BL-12 (EST.1 lever-matrix flake), BL-14 (ECON.1 durable store), BL-15 (CITE.1 citation completeness
mechanism), BL-26 (SEC.3 distroless+AppArmor), BL-27/28 (OPS.2 IaC/runbook + turbo-cache),
BL-48 (resolved findings record), BL-49 (DONE deferral rows), BL-52 (HOT.1/RUN.1 dossier+walkthrough),
BL-53 (EDIT.1), BL-54 (HOT.1 quiet affordance), BL-55 (RUN.1 chat+Send occlusion), BL-57 (EST.1+RPT.1),
BL-58 (EST.1 tier control), BL-59 (RUN.1 scope gate), BL-60 (ONB.1 import), BL-61/63 (UX.1 copy+brand),
BL-62 (UX.2+ACT.1 layout/pricing), BL-64 (ONB.1 fidelity), BL-65 (HOT.1+OBS.1 ops).

---

## Themes

1. **The live legs are one funded window.** Every guard-refused leg (B16–B19, T-residuals, N6,
   L-lever pairs, the CAP.2/CAP.3 paid steps) converges on the same 2026-10-05 weekly reset +
   `pulumi up` + operator walk — BL-67/69/71 are the deploy spine, BL-16..19/21/22/56/66 the payload.
2. **Operator rulings gate money surfaces.** GD-ACT.1-1 (trial everyone-flip), GD-BILL.3-1
   (re-open purchase), GD-RES.2-1 (retro refund/relabel), the metered-debit flip + notice, and the
   refund-window go-live are all operator-held; the code is shipped closed-mode.
3. **The guard itself was the finding.** D-STB.5b-1's $0-through-RLS read means the spend cap could
   silently pass; the fail-closed tripwire is landed, the convention binding is owed (BL-72).
4. **SLOs are honestly named, not green.** Four named breaches (D-SLO.1-5..8) carry their own rows;
   under REQ-ARCH-34 they pause feature work on the owning surfaces.
5. **Build-memory hygiene is real debt.** Validator-stuck status cells and the upstream parser
   blind spots are tracked on BL-02 rather than rewritten under append-only rules.
6. **Spec-deferred ≠ dropped.** The 33 MISSING rows are 1.x/Later scope the spec itself schedules —
   parked on BL-73 for REC.2 to confirm, not silently closed.

## ADR revisit-trigger sweep — 2026-10-04

Read: every `docs/adr/ADR-*.md` `## Revisit trigger` section. Statuses: **quiet** (condition not
met), **fired-answered** (condition met, answered by a landed change or an open row), **dormant**
(trigger is spec-deferred/1.x scope). No **fired-unanswered** triggers — every live trigger rides a
backlog row above. No **superseded** ADRs.

| ADR | State | Evidence read |
|---|---|---|
| ADR-001 | quiet | No server-side web tools on a cloud-native channel; API terms unchanged (run evidence: direct-API path live all round 3) |
| ADR-002 | quiet | Repo still private; stub swap verified green in `public-safe` CI |
| ADR-003 | quiet | No cloud change; pinned Pulumi providers building clean |
| ADR-004 | quiet | `docs/build/` within validator bounds; rotation is a watch item (BL-02, not a trigger fire) |
| ADR-005 | fired-answered | ECON.1 landed the durable `cost_card_cells`/`cap_calibration_reports` store (BL-14 closed; refit on BL-68) |
| ADR-006 | fired-answered | CITE.1 mechanism-A backfill + canonical cited⇒retrieved join shipped; measured-rate read owed → D-CITE.1-5 (BL-67) |
| ADR-007 | fired-answered | P1 surfaces shipped on the ADR-012 Hono-SSR shell — the stopgap was discarded; lineage reconciliation → BL-05 |
| ADR-008 | quiet | Test-mode persists by operator pause (ADR-028/BL-51), not past the point revenue matters — purchase is closed |
| ADR-009 | fired-answered | Multi-instance bypass was proven live and fixed: shared Redis throttle store bound + verified cross-instance 429 (SEC.2; D-SEC.2-1 on BL-23) |
| ADR-010 | quiet | `db-g1-small` not shown outgrown; bill posture measured $285.80 list (BL-29 carries the levers) |
| ADR-011 | quiet | No undeclared-path write need observed; per-run grant held |
| ADR-012 | quiet | No shipped surface needed client-owned `hydrateRoot`; N8 walks green (D-EDIT.1-2 carries the Safari half) |
| ADR-013 | quiet | Round-3 scope pause list stands; each clause is operator-held on its row (BL-29/50/51/68/69) |
| ADR-014 | quiet | ECON.2 restore read NOT MET (≈$14.25 gap) → interim terms stand (BL-69); no $50/day absorbed-COGS week |
| ADR-015 | quiet | Unverified-delivery rate not observed >1 %/wk; monitored via weekly review |
| ADR-016 | quiet | JOURNEY.1 flake <5 %; the defects it missed are all landed (BL-52..65) |
| ADR-017 | quiet | Zero cross-tenant rows on the 8-route probe post-SEC.1 |
| ADR-018 | quiet | No user-serving DDL need; `rhema_app_login` single-membership (census owed → D-SEC.1-2, BL-37) |
| ADR-019 | fired-answered | ACT.1 flag + EST.1 re-derived `plans.whatItCovers` both live; claims config updated |
| ADR-020 | quiet | Mailbox still Gmail DWD; nonce contract unchanged |
| ADR-021 | quiet | No verification need > floor observed; two eligibility classes hold |
| ADR-022 | quiet | Pair set still `models × {search, fetch}`; probe latency acceptable (RES.1 probes $7.49) |
| ADR-023 | quiet | `fact_check` shape unchanged; no fetch-log attribution landed |
| ADR-024 | quiet | One run-level fault label (`platform_fault`) only |
| ADR-025 | fired-answered | Second workflow label question = the fact_check extension → D-RES.2-3 on BL-75 |
| ADR-026 | quiet | One forcing flag; floors inside `webTools` bound |
| ADR-027 | quiet | Stripe hosted surface still the three documented origins |
| ADR-028 | dormant | Re-open pause stands pending `GD-BILL.3-1` (BL-51) — purchase deliberately closed-mode |
| ADR-029 | quiet | No Stripe-hosted completion emails enabled; no server-pushed return channel |
| ADR-030 | quiet | Tax not activated; Checkout API contract unchanged |
| ADR-031 | quiet | No `metered_over_debit` refunds observed (flagged-tenant legs only, $0) |
| ADR-032 | quiet | First weekly refit reported zero admissible samples — one window; watch continues via D-ECON.1-3 |
| ADR-033 | quiet | Upstream `editorial-review` still lacks `findings_cap` → D-ECON.1-2 (BL-68) |
| ADR-034 | quiet | No new pre-run surface outside `surfaceEstimate`/`surfacePricer` |
| ADR-035 | quiet | No fourth tier level / per-workflow entitlement landed |
| ADR-036 | quiet | Refit has no admissible samples yet → real percentiles not in ETA leg (D-ECON.1-3) |
| ADR-037 | quiet | SLO.1's corrected probes did not need sub-20 s meter freshness |
| ADR-038 | quiet | No new burn classification / DEBT row kind landed |
| ADR-039 | quiet | Memorystore fallback not flapping; beta abuse economics not measured (H7 real-invite leg owed) |
| ADR-040 | quiet | Single first-party caller; web still on Cloud Run |
| ADR-041 | quiet | No third send surface; refused-send latency unremarkable |
| ADR-042 | quiet | ECON.2 restore NOT MET → entitlement stays test_tenants (GD-ACT.1-1 on BL-50) |
| ADR-043 | quiet | Operator go-live ruling owed — that IS GD-ACT.1-1 (BL-50) |
| ADR-044 | quiet | ONB.1 measured p95 736–922 ms within budget; not warm-capacity-bound |
| ADR-045 | quiet | No converter producing non-title leading H1 |
| ADR-046 | quiet | Figure upload/management (P1.13 lane) not landed — inerting stands |
| ADR-047 | quiet | Holds stay per-browser by design; `?hc=` handshake verified live (ONB.1) |
| ADR-048 | quiet | No frozen-directly-editable draft kind; `/v/working` head resolution green (EDIT.1) |
| ADR-049 | quiet | Single persistent save-state surface; no reauth in collab protocol |
| ADR-050 | quiet | Only `approve_scope` uses informational-default; R7 invariant held live (RUN.1) |
| ADR-051 | quiet | `chat_turn` still writes artifacts; no queue-behind-run ask |
| ADR-052 | quiet | Provider-key governance unchanged; walkthrough model on worker key |
| ADR-053 | quiet | No user-text-in-log leak demonstrated; allowlist holding (BL-74 carries soak evidence) |
| ADR-054 | quiet | OR-combined policy incidents acceptable; provocation leg proven (OBS.1) |
| ADR-055 | quiet | No sanctioned fault-injection surface added; the single provocation leg executed |
| ADR-056 | quiet | §13.5 table unamended; corrected probes read honest on prod (SLO.1 Stage B) |
| ADR-057 | quiet | Retention adequate for now; weekly series live (15 `rhema_slo_weekly` rows) |
| ADR-058 | quiet | First post-fix weekly review pending the 10-05 window — watch continues |
| ADR-059 | quiet | No surface rendering strings outside COPY/INBOX_COPY |
| ADR-060 | quiet | No per-locale/experiment lede divergence needed |
| ADR-061 | dormant | No `one_x` workflow shipped — spec-scheduled (BL-73) |
| ADR-062 | quiet | H5 sign-off not yet granted (BL-42); `getShowcaseEntry` fallback correct |
| ADR-063 | quiet | No new collapsed event class needing repeat-badge behavior |
| ADR-064 | quiet | One transactional template family (magic link) — verified through real mailbox |
| ADR-065 | quiet | New-project flow still global; shells distinct by design |
| ADR-066 | quiet | Pricing matrix ≤6 columns |
| ADR-067 | quiet | Phone-legal action set ≤2 items (44 px rule re-proof → D-CAP.2-3) |
| ADR-068 | quiet | Axe licence fine; expressible violations green; harness runs in CI-with-browser leg |
| ADR-069 | quiet | No persistent status channel on Page; sync pill in-flow |
| ADR-070 | quiet | Faint tier still real text; AA contrast holds |
| ADR-071 | quiet | No user-refunded-resume ruling — refund window runs `test_tenants` (BL-30) |
| ADR-072 | quiet | reconcile write-order single-caller; no second bypass need |
| ADR-073 | quiet | Scoped launch shape has no `inputs` object yet (spec §12.6 unchanged) |
| ADR-074 | quiet | No fourth util-linux applet needed; distroless image live |
| ADR-075 | quiet | Single AppArmor profile; SPO re-eval unwarranted |
| ADR-076 | quiet | `apparmor.test.ts` tripwire green — no unnamed mount argv |
| ADR-077 | quiet | Dev standing projection within $15/mo window (OPS.1 measured) |
| ADR-078 | quiet | Prod stays out-of-VPC migrate; <900 s migrations |
| ADR-079 | quiet | No exfil concern; previews carry generated secrets only |
| ADR-080 | quiet | Non-prod mail path / `is_test` session fixture not yet built → D-OPS.1-1 (BL-25) |
| ADR-081 | quiet | Shared Bearer adequate at current team size |
| ADR-082 | quiet | Billed actuals not yet exported → D-OPS.2-1 (BL-29); $285.80 recompute stands |
| ADR-083 | quiet | No query-sensitive cited-URL class observed; `fetch_log` kinds stable |
| ADR-084 | quiet | Completeness rate is a reported signal; SLO row decision awaits Stage-B evidence (D-CITE.1-5) |
| ADR-085 | quiet | Stage-B measured rate owed → D-CITE.1-5; `trulyUnretrieved` baseline = 0 |
| ADR-086 | fired-answered | Canonical baseline measured **1.0** vs legacy 0.675 (13 misses all `normalizationOnly`) — the pre-registered 0.95 bar reads trivially met; per ADR-086(b) the mechanism's value rests on the parity fix, which is exactly what shipped. Stage-B probe read still owed → D-CITE.1-5 (BL-67) |
| ADR-087 | quiet | Deploy + weekly-guard blocks not yet cleared → D-ECON.2-1..4 legs owed (BL-69) |
| ADR-088 | quiet | Clock legs still owed (T8 7-day, T7 purge) → BL-22; no test-tenant purge exemption granted |
| ADR-089 | quiet | CAP.2 composed re-verification not run → D-CAP.2-2 (BL-71) |
| ADR-090 | quiet | System-pool hash-lookup+stamp sufficient; allowlist unchanged |
| ADR-091 | quiet | Deterministic deconflict correct UX so far; slug rules stable |
| ADR-092 | quiet | pg-boss schema pinned; bounded probe is the convention (carries T7 on BL-22) |
| ADR-093 | quiet | Live re-proof of the fail-closed guard owed → D-STB.5b-1 (BL-72) |
| ADR-094 | quiet | Reopens with D-CAP.3-2's step-state decision (BL-71) |
| ADR-095 | quiet | Server-side `web_fetch` keeps egress-proxy coverage; grant stays holdout-only (BL-18) |
| ADR-096 | quiet | Exercised-surface leg awaits D-CAP.2-2's suite (BL-71) |
| ADR-097 | quiet | Sharing semantics unchanged; single named layout |
| ADR-098 | quiet | Reserved REQ-SPEC ids not reused; matrix annotation stands |
| ADR-099 | dormant | 1.x collaboration scope — spec-scheduled (BL-73) |
| ADR-100 | quiet | No run shape bypasses hydration/launch; retention guarantees hold |
| ADR-101 | quiet | No `Domain=` cookie; subdomain isolation holds (CDN signed-URL headers owed → BL-24) |
| ADR-102 | dormant | Mobile app is spec-scheduled 1.x (BL-73) |
| ADR-103 | dormant | Richer notification actions are 1.x scope; signed-email actions adequate for beta |

## Risk-register review — 2026-10-04

The project maintains **no standalone risk register**; the live risk surfaces are the LEDGER **OPEN
FINDINGS** list and `docs/security/` (tenancy-audit, rls-exposure-since-0026, pen-test package,
usercontent-csp-audit). Reviewed this sweep — every open item maps to a row:

| Open finding / risk surface | Home |
|---|---|
| G2 deferred — hard gate before launch/§16.4 claims | BL-45 (GATE-G2) |
| STB.3 F8 — prod SLOs honestly red | BL-07 (named D-SLO.1-5..8) |
| DEF.1 research leg `blocked` | BL-20 |
| OBS.1 N4 selector drift (journey substrate vs ACT.1 variant) | BL-74 |
| OBS.1 BILL.3 fixture drift (one-off prod write, paused) | BL-51 |
| Upstream `agent-skills` parser/rotation findings | BL-02 |
| Citation-completeness Stage-B rate read | BL-67 |
| ECON.2 restore read NOT MET + rate-table caveat | BL-69 |
| Weekly spend-guard RLS blindness | BL-72 |
| Cross-tenant exposure-window review (`rls-exposure-since-0026.md`) | BL-37 (+D-SEC.1-2) |
| Pen-test package awaiting procurement | BL-35 |
| Prod test-data residue | BL-38 |
| Deployed tree ≠ merged main | BL-01 (REC.3) |

Spec-register deferred rows: the 33 `MISSING` matrix rows are all spec-scheduled 1.x/Later scope —
parked on BL-73; REC.2 confirms the schedule during spec reconciliation.
