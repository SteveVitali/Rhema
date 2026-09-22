# Phase-0 exit readout — the input to milestone gate G1

> **Status: composition proven deterministically; the live-`dev` half is H0-blocked. G1 is NOT yet
> passable.** This document is produced by ticket **P0.15** (`16_P0.15__phase0-integration-and-exit.md`)
> and is the operator's input to **GATE G1** (`docs/tickets/16a_GATE-G1__phase0-exit.md`). It maps each
> §17 Phase-0 exit criterion to its measured result, states which half is demonstrated in-process and
> which awaits the live `dev` deploy, and gives the first characterization of start latency.

Generated at commit on branch `stevevitali/p0-15-phase0-integration-and-exit` (stacked on the P0.14 tip).

---

## The criterion (spec §17 Phase-0 row, verbatim; quoted in `00_MANIFEST.md` § Milestone gates)

> "a Review of each of the three real projects runs end-to-end in `dev` with `boundary.attested
> violations = 0`, the attestation derived from the hydration manifest and proxy log, cited ⇒ fetched
> passing against the proxy log, **every sidecar validating (`parseStatus = ok`) on all three
> projects**, a gate edit round-tripping through the serializer into the next phase's file,
> **proxy-metered cost = SDK-reported cost ± 2%**, and (v0.3) the **evaluation pilot wave** run
> end-to-end on the dev set — all six arms executable, normalization and matching protocols exercised
> with trained matchers, all deterministic scorers green, σ_d estimated and benchmark n fixed
> (REQ-EVAL-5)."

Two things are true at once, and the honest readout keeps them distinct:

- **The composition is proven.** Every mechanism the criterion names is implemented and demonstrated
  end-to-end *in one process* against a real Postgres (PGlite / native PG16) with the `FakeEngine`
  replaying recorded fixtures — no mechanism is asserted on faith.
- **The live `dev` runs have not happened.** Every prior P0.x ticket deferred its *live* leg on **H0**
  (no deployed GCP `dev`, no running egress-proxy/AlloyDB/GKE, no metered Anthropic API in the build
  env — see `docs/tickets/DEFERRALS.md`). The exit criterion is written about **`dev`**; until the
  `dev` deploy exists (the Pulumi/GCP rewrite, **D-P0.01-7**, and the service deploy, D-P0.06-1 /
  D-P0.07-1 / D-P0.08-1 / D-P0.09-1), the three real Review runs — and the instrumented cost runs —
  cannot be executed.

---

## Criterion-by-criterion result

| # | Exit criterion | Deterministic (in-process) result | Live-`dev` status | Evidence |
|---|---|---|---|---|
| 1 | Review of each of the 3 projects e2e in `dev`, `boundary.attested violations = 0` | **Demonstrated**: the run lifecycle composes create→provision→run(FakeEngine)→commit→gate→resume→deliver through the **real api + worker**; the attestation is built from `run_mounts` + `fetch_log` + `subagent_launches`; `assessPhase0ExitForRun` reads `violations` and asserts `= 0` on a delivered run. | **Deferred (H0)** — needs the live 3-project Review runs on deployed `dev`. | `integration/src/g21.test.ts`; `packages/mirror` `attestation.ts`/`attestation.test.ts` |
| 2 | cited ⇒ fetched passes against the proxy log | **Demonstrated**: `validateCitedFetched` runs at delivery (a miss ⇒ `failed(validation)`); the post-run asserter re-checks every persisted `claim.url` + `claim.sources[].url` against the `fetch_log` and fails on a miss. | Deferred (H0) — over the live proxy log. | `packages/mirror/validation.ts`; `assessPhase0ExitForRun` (miss test) |
| 3 | every sidecar validates (`parseStatus = ok`) on all three | **Demonstrated**: `validateSidecars`/`parseSidecar` (ok\|failed only) at delivery; the asserter reads persisted `artifact_versions.parse_status` and fails on any `failed`. | Deferred (H0) — over live-delivered sidecars (D-P0.03-1). | `packages/mirror/validation.ts`; `assessPhase0ExitForRun` (failed-sidecar test) |
| 4 | a gate edit round-trips through the serializer into the next phase's file | **Demonstrated (serializer half)**: the write-back serializers round-trip `parse(serialize(rows)) ≡ rows` on all three projects; the gate resolves through the **real api route** and resumes the run. | Deferred (H0) — the write into the next phase's *file* on live `dev`. | `packages/protocols/serializers/roundtrip.test.ts`; `packages/orchestrator/gate-overlay.ts`; `g21.test.ts` (gate scenario) |
| 5 | proxy-metered cost = SDK-reported cost ± 2% | **Demonstrated (comparator)**: `proxyVsSdkCrossCheck` sums `usage_records{source:'proxy'}` vs the SDK's `sdk_estimate` figure and flags > 2% / alerts > 5%. The SDK dollar figure is the `sdk_estimate` row (populated live by D-P0.08-2); the 0-dollar `sdk_stream` usage.tick rows are excluded, so a run without `sdk_estimate` reads as **not-yet-comparable** — never a false pass nor a false 100%-divergence failure. | **Deferred (H0)** — a metered live run populates the SDK-cost row (D-P0.08-2). | `packages/orchestrator/usage-crosscheck.ts` + tests; `g21.test.ts` (divergence test) |
| 6 | pilot wave e2e on the dev set: 6 arms, matchers trained, scorers green, σ_d estimated, n fixed | **MET (deterministic)**: the pilot wave runs end-to-end over the dev set with the six arms via `fakeExecutor`, human-recorded match decisions, all deterministic scorers green (report renders ⇒ C-a…C-g passed), σ_d estimated from the report's per-draft paired recalls, n fixed and recorded on the wave. | Machinery met; **real paired-difference variance** still needs live pilot runs (D-P0.13-4). | `packages/benchmark-runner/pilot.ts` + `pilot.test.ts` + `pilot-wave.e2e.test.ts`; migration `0015` |
| — | Integration suite (gates, orphan resume, cancel, cap exhaustion, stale task) green in CI | **MET**: the `FakeEngine` suite composes api + worker + PGlite for all five G21 scenarios; wired into the CI `integration` job. | — | `integration/src/g21.test.ts`; `.github/workflows/ci.yml` |
| — | Instrumented constants merged; estimator no longer provisional for ported workflows | **Machinery MET**: `estimateCredits` consumer + §6.1 `RIGOR_MULTIPLIERS` + `foldInstrumentedRun` (measured→calibrated, `provisional:false`). **Values still provisional** — a real proxy-metered run per workflow is H0-deferred. | Deferred (H0) — the measured values (§16.3 #1). | `packages/protocols/estimator.ts` + tests |

**Deterministic verdict:** every criterion's *mechanism* is demonstrated; criterion 6 (the pilot wave)
and the integration suite are **fully met**; criteria 1–5 and the instrumented constants are met at the
composition level with their **live `dev` half explicitly deferred on H0**.

---

## The three riskiest bets — *demonstrated, not asserted* (§17 closing note)

1. **Phase-split port with completion oracles + write-back + structured output.** A phase runs through
   `runPhase` (the completion oracle: SDK subtype + `phase-result.json` + predicate facts), commits with
   a gate, the gate resolves through the api, the run resumes as a fresh attempt, and delivery emits
   validated sidecars (structured output) + write-back overlays. Demonstrated end-to-end in
   `g21.test.ts` (gate scenario) + the mirror delivery + the serializer round-trip suites.
2. **A sandbox that cannot reach the token or the key.** The two-uid privilege-separation image denies
   uid `agent` the secrets file and scopes the mount namespace at the kernel; the egress-proxy presents
   the provider key only for a valid per-run credential inside its allowlist. The kernel legs run under
   `docker run --cap-add SYS_ADMIN` in the CI `integration` job (D-P0.06-2); the proxy credential/cap
   pipeline is deterministically tested in `apps/egress-proxy`.
3. **Estimate-and-cap, metered at the wire.** The proxy is the meter of record (`usage_records
   {source:'proxy'}`) and the cap enforcer (402 at Σ ≥ cap → `budget` → `resume_partial`); the
   `budget-stop` fixture drives exactly that path in `g21.test.ts` (cap-exhaustion scenario), and
   `proxyVsSdkCrossCheck` wires §12.7 cross-check 1 (against the SDK's `sdk_estimate` figure). The
   *live* wire metering is the H0 leg.

## G1 linkage

This readout is referenced from `docs/tickets/16a_GATE-G1__phase0-exit.md` (the gate the operator
reads out) and from the P0.15 section of `docs/tickets/DEFERRALS.md` (the live-leg rows that gate it).

---

## First start-latency characterization (informs the warm-pool / G19 decision)

The SLO target is **queued → running p95 ≤ 45 s** (§13.5; the G19 warm-pool/microVM spike triggers if
p95 misses 45 s). **No p95 is measured yet** — start latency is dominated by the GKE Job pod cold-start
+ two-uid image pull + `/work` materialization, none of which exist without the live `dev` deploy. What
*is* characterized deterministically: the provision path (admit → `queued→provisioning` → mint
token/credential/allowlist → launch) and the first-heartbeat transition (`provisioning→running`) are
single-transaction operations with no polling; the materialization manifest is server-generated and
mounted read-only. **The first real p95 must be captured on the live `dev` deploy** (a new DEFERRAL,
below); it is the empirical input to G19, and this readout flags it as unmeasured rather than estimated.

---

## Stage A complete (P0.15b) — the deployable artifacts exist and are validated offline

`16_P0.15b` splits the live bring-up into **Stage A** (offline, no spend: write + validate every
deployable artifact) and **Stage B** (operator-gated: the live deploy + the exit runs). **Stage A is
done** — the following are written, build/lint/typecheck green, and unit-tested where a fake can stand
in; none require a live deploy to validate:

- **GCP/Pulumi IaC** (`infra/pulumi/`, D-P0.01-1/2/5/6/7): the full Pulumi (TypeScript) program — VPC
  with the no-egress sandbox subnet (no Cloud NAT / no default route; egress firewall → proxy only),
  AlloyDB, versioned+isolated GCS with the §13.3 retention lifecycle + the access-logged enclave
  bucket, Memorystore, Secret Manager, per-service Workload-Identity SAs with explicit least-privilege
  bindings, a GKE Standard cluster for run-task, the egress-proxy MIG, seven Cloud Run services, and the
  HTTPS LB + Cloud CDN. **Typechecks clean against the real `@pulumi/gcp@8.41.1`.** The pure stage facts
  (`infra/config/stages.ts`) are re-expressed for GCP and unit-tested.
- **Live SDK adapter** (`apps/run-task/src/sdk-adapter.ts`, D-P0.06-4): binds the engine's `QueryFn`
  seam to the vendored `@anthropic-ai/claude-agent-sdk`; the Dockerfile vendors it (guarded).
- **Live arm executors + workshop CLI** (`packages/benchmark-runner/src/executors.ts` +
  `workshop-cli.ts`, D-P0.14-1/2): A1/A2/A4/A5/A6 runners + the blind match/adjudication CLI.
- **Live-exit driver** (`integration/src/live-exit-driver.ts`, item 6): `driveLiveExit` orchestrates the
  three Reviews + Revise/Fact-check/Quick Voice + instrumented runs + the pilot wave, runs the built
  asserters over the live rows, measures start-latency p95, and rolls up G1 readiness — fail-closed
  without an authorized dev target.
- **RS256 run-token signer** (`packages/orchestrator/src/token.ts`, D-P0.08-1): the deploy signer behind
  the `RunTokenService` seam.
- **Real `protocols_version` provenance** (D-P0.04-2): the CI `images` job now stamps the real version.

**Live-verified this session (2026-09-03, pr-test on `rhema-507501`, then destroyed):** a real
`pulumi preview` validated the whole program (61 resources, 0 errors) against the live GCP API — catching
and fixing four bugs the offline typecheck could not (Pulumi.yaml config namespacing, `.js` import
extensions, the CDN `cacheKeyPolicy`, and the AlloyDB/Redis private-services-access peering gap). The
**network layer was then deployed live and asserted off the real VPC**: the sandbox subnet is absent from
the Cloud NAT source list and its egress firewalls are a deny-all beaten only by an allow-to-the-proxy
rule — a one-way street to the proxy (REQ-ARCH-2). `pulumi up` + `pulumi destroy` both clean; zero
orphaned resources. This closes the live half of AC3 (**D-P0.01-2 DONE**).

What is **NOT** yet done (Stage B, operator-gated): the full-stack `pulumi up` (AlloyDB/GKE/LB — real
spend), the paid engine bring-up, the three live Reviews, the instrumented cost runs, the pilot spend,
the start-latency measurement, and therefore the **measured** results and the G1 flag. Those run against
a deployed `dev` under the [OPERATOR GATE]s in the ticket.

## G1 readiness — the honest recommendation

**G1 cannot be flagged "ready to pass" yet**, and the gate rule is explicit: a phase-exit gate must not
pass while any `OPEN` DEFERRALS row scoped to that phase remains (`DEFERRALS.md` rule 4;
`00_MANIFEST.md`). Stage A wrote the deploy artifacts but did **not** execute them; the live-`dev` half
of the exit criterion is still a set of open rows (the `dev` deploy + exit runs: D-P0.01-1/7, D-P0.06-1,
D-P0.07-1, D-P0.08-1, D-P0.09-1, and the P0.15/P0.15b live rows).

What the operator has in hand for the G1 decision:

- **A fully-composed Phase-0 system**, proven end-to-end in-process: the review-revision loop, gates,
  obligations, ledger, mirror, egress metering, and the benchmark pilot wave all compose without a
  live deploy — the point of Phase 0 (validate the composition before a pixel of the IDE).
- **The pilot wave met** on the dev set (σ_d estimated, n fixed) — the one §17 criterion that is a pure
  machinery check is done.
- **A precise remaining checklist, now with the artifacts to run it**: `pulumi up` the `pr-test` + `dev`
  stacks (`infra/pulumi/README.md` has the runbook), vendor the SDK into the run-task image, then run
  `driveLiveExit` (the built driver) against `dev` — it launches the three Reviews + the instrumented
  cost runs + the pilot wave and runs `assessPhase0ExitForRun` over the live rows. Every asserter and
  every deployable artifact already exists and is tested here; Stage B is execution, not construction.

**Recommended disposition:** treat G1 as **blocked pending the Stage-B `dev` deploy + exit runs**. Stage
A removed the construction risk (the IaC typechecks against the real provider; the driver + adapters +
executors are built and tested); authorize the operator-gated Stage-B steps (starting `pulumi up` on
`pr-test`), then re-read G1 once `driveLiveExit` reports `ready` on `dev`. The marketing claims of
§1.4/§15.1 remain unshippable until then (§16.4), which this readout does not relax.

---

## Pointers

- **Stage-A deploy artifacts (P0.15b):** Pulumi/GCP IaC `infra/pulumi/` (+ `README.md` runbook); live SDK
  adapter `apps/run-task/src/sdk-adapter.ts`; arm executors + workshop CLI
  `packages/benchmark-runner/src/{executors,workshop-cli}.ts`; live-exit driver
  `integration/src/live-exit-driver.ts`; RS256 signer `packages/orchestrator/src/token.ts`.
- Integration suite + asserters: `integration/` (`@rhema/integration-tests`).
- Cost cross-check: `packages/orchestrator/src/usage-crosscheck.ts`.
- Pilot power: `packages/benchmark-runner/src/pilot.ts`; migration `0015_phase0_pilot_power.sql`.
- Instrumented-cost machinery: `packages/protocols/src/estimator.ts`.
- Nightly golden runner + floor gate: `scripts/nightly-golden.mjs`, `packages/benchmark/src/fixture-floors.ts`, `scripts/lib/parser-fixture-growth.mjs`.
- Deferred live legs: `docs/tickets/DEFERRALS.md` (P0.15 section).
