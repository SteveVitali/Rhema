# Phase-1 exit readout — §17, criterion by criterion (P1.22 Stage A)

> **Status (P1.22 Stage A, build-evidence only):** this is a *readout* — it reports what the build
> measured and honestly marks what only a live environment can measure. **No number in this document is
> fabricated.** Every §17 Phase-1 criterion is reported below; live-only rows are labelled
> **UNMEASURED — Stage B** and carried as named deferrals, not silently skipped.
>
> Produced by **P1.22** (`docs/tickets/50_P1.22__security-hardening-and-launch-checks.md`), branch
> `stevevitali/p1-22-launch-checks`, stacked on `stevevitali/p1-21-protocols-2-4`. Stage B (deploy +
> live legs) is operator-gated — see `docs/tickets/DEFERRALS.md` § P1.22.

---

## The §17 Phase-1 exit criterion, line by line

The row's text (§17, "1 — Web MVP, the full IDE"):

> *the §3.5 activation metrics are measurable; a new user reaches a first finding in ≤4 minutes;
> nightly golden runs green on all four protocols; the instrumented cost runs replace every
> provisional credit figure and rigor multiplier; (v0.3) benchmark wave 1 (or a later wave) is
> dispositioned, and no superiority claim appears on any launch surface unless a pre-registered wave
> met its criteria (REQ-EVAL-19)*

| # | Criterion | Build evidence | Verdict |
|---|---|---|---|
| 1 | §3.5 activation metrics **measurable** | The full event catalogue is a zod-whitelisted contract (`packages/contracts/src/analytics.ts` — activation events `showcase.finding_anchor_viewed`, the Assistant funnel, the scratch-cohort events, per-event prop schemas); the api mints only whitelisted events (`POST /analytics/events` rejects unknown names); `analytics_events` is a real table (migration 0020); the web `emit()` seam is bound on every instrumented surface. The metrics are *measurable* — the instrumentation is the claim. | **MET (build)** — measurable ≠ measured; the numbers themselves are row 2. |
| 2 | New user reaches first finding in ≤4 min | Requires prod telemetry over real signups; no live leg has run this phase. The instrumentation to measure it exists (row 1). | **UNMEASURED — Stage B** (D-P1.22-2). |
| 3 | Nightly golden runs green on all four protocols | The runner + promotion gate exist and are unit-tested (`scripts/nightly-golden.mjs` — `gateFixtures`/`formatReport`, floor assertions via `@rhema/benchmark`, parser-corpus growth hook). The *live runs* themselves cost ~$150–300/night of paid inference and need a live engine + proxy — the deferred leg since Phase 0 (D-P0.15-4). | **UNMEASURED — Stage B** (D-P0.15-4 stays OPEN; machinery proven, no live nightly has run). |
| 4 | Instrumented cost runs replace every provisional credit figure and rigor multiplier | PRB.17 (2026-09-18, prod) folded all four Phase-0 workflow estimators live — `estimatorsAreProvisional()=false` over them with real calibration scales (review 2.34×, fact_check 7.12×, revise 48.2×, profile_voice 11.9×, `instrumented@2026-09-18`). **Honest residue:** (a) the folded constants ride `INSTRUMENTED_OVERRIDES` — process-local, no durable replay store (noted in the PRB.17 run ledger); (b) the P1.21 protocols (2–4) ship modeled estimators — no instrumented run has folded them; (c) `RIGOR_MULTIPLIERS` itself remains modeled; (d) the ±2% proxy-vs-SDK cross-check is **out of tolerance live (18.23%)** — an open accounting finding awaiting the operator's authoritative-figure ruling (D-PRB.16-5), not a pass. | **PARTIAL** — the instrumented-run machinery is proven live and four specs flipped; the committed spec still ships `provisional: true`, protocols 2–4 and rigor multipliers remain modeled, and the cross-check divergence is unresolved (D-P0.15-2 stays PARTIAL). |
| 5 | Benchmark wave 1 (or later) dispositioned | No wave has run — corpus commissioning + human adjudication are operator-side (§18 machinery exists in `@rhema/benchmark` + the evals harness). | **NOT RUN** — G2-scoped (the benchmark gates launch claims, not the code). |
| 6 | No superiority claim on any launch surface unless a pre-registered wave met its criteria (REQ-EVAL-19) | `COMPARATIVE_WAVE_MET = false` is pinned; `lintGrowthCopy` sweeps every collected web-copy string + pricing/compare/client-entry/email/export surfaces — **26 assertions, all green** (`packages/security-checks/src/launch-surface.test.ts`); `pnpm check:licenses` + the canonical-vocabulary lints ride the same gate. Since no wave has run, *no* superiority claim may appear — and the lint proves none does. | **MET (deterministic)** |

## The P1.22 security deliverables, as evidence

| Deliverable | Evidence | State |
|---|---|---|
| §12.8 injection controls (a)–(f), executable, full surface | `packages/security-checks/src/injection-controls.test.ts` — fetcher-only routing at Full board, untrusted-document wrapping across surfaces (incl. chat attachments, figure sources, memo `user_sources`), commit-time `suspicious_source` downgrade + schema validation, proxy outbound limits (query-length, domain cap, ≥12-word n-gram) against planted exfiltration fixtures, second-read mount-manifest isolation, two-uid privilege separation | **landed, deterministic** |
| REQ-ARCH-32 egress-denied pause, end-to-end | migration `0041_pause_signals.sql` + `SqlSignalSink` + `drainPauseSignals` + worker pause sweep; `pause-signals.test.ts` exercises the transport; `user_source_fetch` pause reason | **landed; live leg Stage B** |
| Tenancy/RLS at full surface | `rls-catalog.test.ts` — `pg_catalog` enumeration classifies every migrated table (enforced / exempt / FK-inherited / non-tenant) + the pooled two-tenant probe | **landed, deterministic** |
| usercontent + CSP audit | `docs/security/usercontent-csp-audit.md` (written) + `usercontent-csp.test.ts` (10) — no Set-Cookie, allowlist-or-attachment serving, `__Host-` posture, per-response CSP on api + web, quarantine-key tenant binding, 25 MB bound | **landed; live header leg Stage B** |
| Secrets sweep + harness-uid posture | gitleaks clean on the committed tree (the 4 working-tree `.env` findings are ignored local dev values, never committed); `secrets-manifests.test.ts` (11) — 0600/0400 harness-secret files, scrubbed agent env, no provider key in web/collab/model process, per-run credential never in agent env | **landed, deterministic** |
| Retention/backup posture | `retention-backup.test.ts` — §13.4 retention table, prod Cloud SQL backup/PITR/deletion-protection assertions, GCS versioning/lifecycle, tombstone→purge, 14-day account grace | **landed; live config leg Stage B** |
| D-P0.01-5 (IAM as code) | explicit per-service grants were already in `infra/pulumi/iam.ts`; P1.22 added the `runs`-namespace launcher RBAC (`infra/k8s/30-worker-job-rbac.yaml`) AND narrowed the GCP half — the worker's `roles/container.developer` is replaced by a custom role carrying only `container.clusters.get`/`list` | **resolved in code; applies at next `pulumi up` (Stage B)** |
| D-P0.06-3 (distroless run-task image) | not resolved — the slim image remains the tested Phase-0 stand-in; the distroless rebuild + vendored static applets + ambient-capability model needs image work + a live `privsep-check` | **re-deferred → D-P0.06-3 stays OPEN (P1.22 annotation)** |
| D-P0.15f-1 (two-uid capability model) | the ambient-caps construction landed P0.15g and is proven by `privsep-check.sh` + `privsep.docker.test.ts` locally; live pod-log confirmation (`agent` as uid 10002, no `setresgid` EPERM) is a Stage-B leg | **code-proven; live verify Stage B** |
| D-P0.01-4 (self-hosted Turbo remote cache) | remains deferred — CI cache perf is not launch-blocking; local cache carries correctness | **re-deferred** |
| SLO dashboard + alerts + playbooks (REQ-ARCH-34) | `packages/orchestrator/src/slo.ts` probe (9 DB-backed signals + named `unmeasured` rows), worker `slo.probe` sweep, `infra/pulumi/monitoring.ts` (log-based `rhema_slo_violations` metric, one AlertPolicy per probed signal, the api-availability `gcp.monitoring.Slo`, webhook channel when configured), `docs/ops/slo-review.md` + five playbooks under `docs/ops/playbooks/` | **landed in IaC; live delivery + drill Stage B** |
| §13.5 signals with no data path | `event_delivery_latency_p95_s` (no client-ack timestamp) and `autosave_roundtrip_p95_ms` (no server-visible per-save timing) read `unmeasured` — never fabricated | **instrumentation row → D-P1.22-1** |
| Launch-surface lint (REQ-EVAL-19) | 26 green assertions (above, criterion 6) | **MET** |
| External pen test | scope document written — `docs/security/pen-test-scope.md` (surface map, controls list, verbatim residual-risk statement, triage protocol) | **procurement + triage operator-owned → D-P1.22-3** |
| `projects.protocol_overrides` consumption (P1.21 loose end) | stored overrides now resolve server-side at run launch (`phaseDefaults` between rigor defaults and client toggles; `stage`/`length` frozen into `runs.inputs`) and prefill the run sheet — `run-routes.test.ts` P1.22 block, 4 tests | **landed, deterministic** |

## What this readout does NOT claim

- No live latency, success-rate, or availability number appears here — none has been measured this phase.
- The pen test has not been procured; the scope doc exists so procurement needs no design deep-dive.
- The benchmark wave is unrun; REQ-EVAL-19's rule therefore reads "no superiority claims" — the lint
  enforces exactly that.
- `.env` holds ignored local dev secrets — flagged by the sweep, never committed, documented not
  allowlisted.

---

## Corrections (append-only)

- **2026-09-26 (CAPSTONE):** Row 4's citation of **D-PRB.16-5** as "awaiting the operator's
  authoritative-figure ruling" is stale — the ruling landed 2026-09-22 (cap-meter-only: uncommitted
  burn does not debit; the ~18 % proxy-list-vs-committed gap is the platform rate card working as
  designed). The still-open residue for row 4 is `sdk_estimate` rows unpopulated live (D-P0.08-2) and
  the un-instrumented protocols 2–4 + `RIGOR_MULTIPLIERS` (D-P0.15-2 PARTIAL). The PARTIAL verdict
  is unchanged; the citation was wrong, not the verdict. See `docs/build/readouts/CAPSTONE.md` §2.
- **2026-10-04 (DOC.1 repo-docs refresh):** this readout's "UNMEASURED — Stage B" framing predates
  the round-3 live legs — **prod exists now** (`rhema.tools`; the Stage-B legs ran on prod, not the
  `dev` deploy the readout anticipated). Honest per-row state, from `docs/tickets/DEFERRALS.md` and
  `docs/build/LEDGER.md` rather than re-measurement:
  - **Row 2 (first finding ≤ 4 min):** still **unmeasured** — needs real-signup telemetry; the trial
    audience is `test_tenants` (ADR-014), so there is no organic funnel to read yet.
  - **Row 3 (nightly golden runs):** still **OPEN** (D-P0.15-4; operator-budget-gated ~$150–300/night).
    What does run on a schedule is the *user-journey* suite (`.github/workflows/journeys.yml` — nightly
    $0 legs + a weekly paid leg, REQ-SPEC-29), not the golden-run scorer gate.
  - **Row 4 (provisional cost figures):** still **PARTIAL**, now sharper — ECON.1/EST.1/ACT.1 landed
    the one calibrated estimator every surface reads (REQ-SPEC-32), the durable calibration store
    (migration `0049_cost_calibration`, ADR-032) and metered-mode debits behind the `debitMode` flag
    (still `committed` on every stage — operator-paused flip, `docs/ops/debit-mode-flip.md`); the
    P1.21 protocols 2–4 and `RIGOR_MULTIPLIERS` remain modeled (D-P0.15-2).
  - **Row 5 (benchmark wave):** still **not run** — G2 stays deferred by the operator's 2026-09-15
    decision (ADR-104); H2/H5 corpus work is unscheduled.
  - **Row 6 (no superiority claims):** still **MET** — `lintGrowthCopy` sweeps the surfaces every
    commit; with G2 deferred the ban is total, docs included.
  - **Security deliverables table:** the "live leg Stage B" stubs have since been exercised on prod —
    the SEC.1 user-serving role switch (`rhema_app_login`, cannot bypass RLS — REQ-SPEC-30 landed
    since this readout), the SEC.2 shared Redis throttle, the SEC.3 distroless/AppArmor run-task
    image, and the P1.22 IAM/RBAC program all deployed and verified (their run ledgers + DEFERRALS
    rows); the external pen test remains unprocured (D-P1.22-3 — the vendor package exists,
    `docs/security/pen-test-vendor-package.md`).
  - **New since this readout (honest):** four named SLO breaches are open on prod
    (D-SLO.1-5…8), the measured prod bill is ~$285/mo vs the ~$50 target (OPS.2, ADR-082), the
    trial runs interim terms on `test_tenants` only, purchases stay `closed` (ADR-028), and the
    refund window serves `test_tenants` only pending BL-30 (ADR-071). None of these change a row
    verdict above; they are the current state a reader should carry forward.
