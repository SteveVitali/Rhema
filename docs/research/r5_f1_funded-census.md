# f1_funded-census — Paid-leg inventory for the funded window
**Stream:** F · **Researched:** 2026-10-14 · **Ledger rows covered:** F1 · **Confidence:** high

### F1.1 — The paid-flag census is exactly 21 steps (D-CAP.2-1's count holds)
`STEP_REGISTRY` carries exactly 21 `paid:true` steps — T9, N5, N6, N11, R4, R6, R9, T10–T16, B16, B17, B18A, B18B, B19A, B19B, B19C. `paid` = "needs the funded weekly leg"; runner skips without `--paid` (`runner.ts:166-170`). Two spend classes: **(a) 12 run-launching legs** — N5, N6, N11, R4, R6, B16, B17, B18A, B18B, B19A, B19B, B19C; **(b) 9 riders** — T9, T10–T14, T15, T16, R9 ($0 of their own; need artifacts a funded run produces). State post-window-B: **12 green, 9 red/owed** (N6, T15, T16, B17, B18A, B18B, B19A, B19B, B19C).

### F1.2 — Per-leg caps live in `STB5B_CAPS`; measured costs already exceed several nominal caps
`stb5b-helpers.ts:16-27`: B16 $1.00 · B17 $1.50 · B18A $3.00 · B18B $4.00 · B19A $4.00 · B19B $5.00 · B19C $15.00; ticket cap $25. Measured: B16 $0.34, B17 ≈$0.86, B18A $0.499, B18B $0.00, B19A $2.47, B19B $0.93, N5 $8.09 list/$5.30 proxy, CITE Leg-1a $8.45, Leg-3 $5.72 — window total ≈$20.64. **Cap-vs-cost gaps are measured, not estimated:** probe caps $1.50/$2 < $3.31–$8.45 actual; Leg-3 $4 < $5.72 → `X-cite1-leg-cap-recon` (BL-67) is an operator/gate item. **N5's "Included" trial run still writes `source='proxy'` usage rows ($5.30 metered)** — entitlement runs are credit-free but not spend-free to the guard; one N5 can consume the entire $5 weekly envelope.

### F1.3 — Guard stack: weekly $5 ISO cap (system-role only) → funded window's $150 cumulative + per-leg headroom → tenant funding
1. **Weekly guard** (`spend-guard.ts:25-78`): `WEEKLY_PAID_CAP_USD = 5` over `source='proxy'` flagged-tenant usage for the ISO week; post-ADR-093 probes `pg_roles rolsuper OR rolbypassrls` first — app-login DSN fails closed. `cli.ts:145-155` adds `weeklyMetered + 3 > 5` headroom refusal, exit 3.
2. **Funded-window guard** (`funded-window.mjs:54-108`): `sum(list_cost_usd)` since `FUNDED_ROUND3_SINCE` (2026-10-01) vs `FUNDED_ROUND3_CAP_USD = 150` + `--headroom` pre-flight; system-role `JOURNEY_DATABASE_URL` required. Run doc names a $83 reassessment line.
3. **Tenant funding:** fresh flagged tenants carry only the 10-cr daily allowance → launches 402. The window needs `JOURNEY_FUNDED_STABLE_TAG` + `admin-cli house-grant` on the live billing account + a ~26h-purge exemption for the evidence window.

**Round-3 cumulative stood at $145.95/$150 → ~$4.05 headroom — the envelope is effectively exhausted** until reset/re-authorization (feeds Q-6).

### Census table (key rows)

| Leg | id | Verifies | Spend class | Est. spend | Blocker | BL row |
|---|---|---|---|---|---|---|
| T9 quiet-hours arm | registry:72 | quiet hours persist | ui $0 | $0 | none — PASS | BL-22 |
| N5 Trial Review e2e | registry | `Included` cap run delivers | model-run | ~$5.3–8.09 | entitlement runs still meter; 40-min poll | BL-71/D-CAP.2-1 |
| N6 planted-error | steps:1001 | dossier fetch-✓ + Contradicted planted LoC error (1,029w fixture) | model-run | ~$4.5–5.2 | spend + fresh-project req + funded tenant | BL-56→D-RES.1-2; BL-66 rides |
| N11 citation chips | registry | zero chip-less cited URLs | model-run | $5.72 vs $4 nominal | DONE; entitlement defect → D-MAINT.3-1 | BL-67 |
| R4 chat turn | registry | chat answers, actionable | model-run | ~16cr | none | BL-71 |
| R6 meter/report | registry | meter moves in-phase; report=Σ debits | model-run | ~$2–4 | none; R6F twin owes preview | BL-71 |
| R9 refund window | registry | refund CTA → exactly +N | ui+db | ~$0 | needs 2 eligible delivered runs | BL-30 → DONE |
| T10–T14 dossier family | registry | delivered-Review surfaces, dispositions, Apply+bulk, badge/quiet/Decisions | ui/db riders | $0 | need the window's delivered Review | BL-21/22 → DONE |
| T15 gate deep-link | registry:316 | `?gate=` lands focused card w/ decide controls | ui w/ **run prereq** | prereq ~$2–4 | **no open gate exists** | BL-22/70 |
| T16 stale voice | registry:325 | fact change → group-3 row + digest | ui w/ **prereq** | prereq ~$15 | no `persona_profiles` on test tenants | BL-22 |
| B16 sidecar/pin | registry:562 | sidecar-absent + phase pin commits craft | model-run | cap $1; $0.34 | none — DONE | BL-16 |
| B17 high-water | registry | live tail + post-commit replay reach max seq | model-run | cap $1.50; ≈$0.86 | audit-cap leg unreachable-by-construction (D-CAP.3-2 signed) | BL-17 |
| B18A fetch log | registry | `fetch_log` allow rows attributed | model-run | cap $3; $0.499 | fetcher half = holdout-only grant (ADR-095) rides B19C-class | BL-18 |
| B18B memo deny | registry | frozen urlPolicy, deny pre-forward | model-run | cap $4; $0.00 | verdict-emit leg owed (D-P1.21-2) | BL-18 |
| B19A approve_plan edit | registry | structured edit → overlays → next phase | model-run | cap $4; $2.47 | content-level marker carry unobserved → D-P0.15-3 PARTIAL | BL-19 |
| B19B approve_outline | registry | promotion gate edit → finalize | model-run | cap $5; $0.93 | D-STB.5b-5 code-fixed; live re-leg owed | BL-19/78 |
| B19C profile_voice+leak | registry | `approve_sample` + calibration/leak audit | model-run | cap $15 — **pre-registered DROP** | never run; also gates B18A residual + T16 prereq | BL-19 → D-P1.14-1 |
| CITE.1 probes ×5 | res1-probe.mjs | searches/fetches billed, Contradicted, completeness | model-run probe | nominal ≤$1.50/≤$2; actual $3.31–8.45 | 1a ran — functionally failed (retry-drain → BL-79); rest skipped on cap | BL-67/56 → D-RES.1-1 |
| ADR-086 rate read | runs.citation_completeness | ≥0.95 aggregate, none <0.80 | db-only | $0 | interim 1.00 (n=1); definitive rides probes | BL-67 → D-CITE.1-5 |
| RES.1 excerpt leg | non-registry | Standard/Base ≤300w excerpt coverage | model-run | ≤$5 | never ran (RES.1 ≤$10 cap) | BL-56 → D-RES.1-3 |
| research_burst + chat | **no step/driver** | research_burst deliver + plan-card/turn-result | model-run | ≤$5 | **HUMAN-H7 ruling** may moot; no driver exists | BL-20 |
| ECON.2 pairs L5/L1/L2/L3 | econ2-accounting.mjs | OFF/ON verification-pinned pairs | model-run pairs | ≤$3/$4/$4/$5 | **no OFF/ON driver built** — prerequisite ticket | BL-69 → D-ECON.2-2/-3 |
| ECON.2 ON-arm + N4/C1 | same | adopted arms non-regression | model-run + $0 | ≤$12 | gated on adopt verdicts | BL-69 → D-ECON.2-4 |
| Cost-card refit + restore | durable store | admissible refit; wordCap:6000 staged | db-only + ruling | $0 | zero admissible obs; restore NOT MET; operator-paused | BL-68/69 |
| Full paid sweep at tip | `--paid` registry | D-CAP.2-1's 21 steps + visitor journey | mixed | cumulative-bound | ~$145.95/$150 exhausted | BL-71 → D-CAP.2-1/-2 |
| Guard integrity | two-role re-read | system meters real; app role fails closed | db-only | $0 | live re-read PASS 10-06; residual = documented DSN convention | BL-72 → D-STB.5b-1 |
| BL-78 legs ×3 | T14-class + B19B + browser | 409-on-mooted; empty-success retry; entitlement suppression | ui $0 + paid launch | varies | code-fixed; ride next window/deploy | BL-78 |
| T8 export-token expiry | T8 | 410 expired-link arm | db-only | $0 | clock/ruling (Q-2 backdated mint) | BL-22 |
| RES.3 retry-drain fix | protocol+orchestrator | `research_budget_exhausted` gate + ledger-skeleton-first | fix + verify leg | ~$3–5 | product change first (BL-79) | BL-79 → D-RES.3-1 |

Adjacent-not-paid: free twins R6F/T12F/T13F/T17/P1.* are blocked on the nonprod Resend secret (BL-80), not the guard; BL-24/33 are operator-money rows.

## Open questions
1. **Envelope semantics:** weekly guard measures already-metered spend — N5 alone metered $5.30–$8.09. Should per-leg estimates enter pre-flight (generalize `--headroom`)?
2. **Cap-vs-cost reconciliation** (X-cite1-leg-cap-recon): raise caps with justification or reshape probes?
3. Does the ≤300-word bound survive B3 as anything more than a claims-count bound?
4. **Round-3 cumulative $145.95/$150** — next window = fresh envelope, extension, or new bound? → Q-6.
5. **One B19C run discharges three owed legs** (B19C, T16 prereq, B18A fetcher residual) — sequence it first next window?
6. **ECON.2 pairs have no committed OFF/ON driver** — build-the-driver is a prerequisite ticket.
7. **BL-20 research_burst** — needs a driver or the HUMAN-H7 ruling.
8. **Tenant-funding timing:** purge-exemption + same-day grant as the documented convention (BL-72 residual), or a durable funded tenant under B3?
9. N5 40-min delivery poll vs window queue saturation — leg ordering or poll-budget amendment?

## Spec requirements emitted
- **REQ-FND-1** — Guard composition = ISO-week flagged-tenant proxy spend (reported) AND cumulative `sum(list_cost_usd)` since round epoch vs hard cap, with per-leg `--headroom` pre-flight; a window-opening ticket MUST declare cap+headroom in advance.
- **REQ-FND-2** — Spend accounting MUST read `usage_records` under a system role; app-role DSN MUST fail closed (ADR-093 probe).
- **REQ-FND-3** — Paid legs MUST carry declared per-leg USD caps; a leg exceeding nominal MUST record divergence + route reconciliation to the operator.
- **REQ-FND-4** — Entitlement/trial runs are credit-free but not spend-free — `source='proxy'` rows count against the envelope; any exemption must be explicit.
- **REQ-FND-5** — A window requires a funded flagged tenant (`JOURNEY_FUNDED_STABLE_TAG` + same-window `house-grant` + purge exemption); the convention SHOULD be documented (BL-72 residual).
- **REQ-FND-6** — Prerequisite-scarce legs (T15 open gate, T16 persona_profiles, B18A fetcher, T8 expired token) SHOULD be consolidated so one bounded run discharges multiple legs.
- **REQ-FND-7** — Non-registry legs MUST ship a committed driver or be ticketed as driver-build prerequisites first.
- **REQ-FND-8** — Red steps report `owed`, never gate; `ready-to-flip` flips `expected` in the owning ticket's PR with evidence.
