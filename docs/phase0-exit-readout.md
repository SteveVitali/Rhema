# Phase-0 exit readout — the input to milestone gate G1

> **Status (updated 2026-09-11, P0.15k Stage B — EXECUTED LIVE): the CORE §17 criterion is MET — a Review of
> each of the THREE real projects delivered green on `dev` with real inference.** All three (`proj_pv`, `proj_sd`,
> `proj_cr`) ran end-to-end and DELIVERED (`assessPhase0ExitForRun` PASSED: `boundary.violations=0`, every
> sidecar validated at delivery, `cited⇒fetched` green with 0 misses on 22/36/26 cited URLs, one
> `correspondence_items` row each). This closes **D-P0.15-1** and was unblocked by the operator's **Path B ruling**
> (ADR-006: `cited⇒fetched` is a delivery downgrade+strip, not a run-fatal reject — the fetch-then-cite discipline
> did not converge live, so unfetched citations are stripped and their claims downgraded). **G1 is substantially
> ready; a few NARROW legs remain gate-pending** (not the core blocker): AC2's full 4-workflow estimator flip +
> the ±2% proxy-vs-SDK cross-check, and AC3's live structured gate-EDIT. See **"P0.15k Stage B (2026-09-11) —
> measured live results"** immediately below for the numbers; the older dated sections are superseded history.
>
> This document is produced by **P0.15** and updated by **P0.15c/e/f** and **P0.15k** (Stage B live execution);
> it is the operator's input to **GATE G1** (`docs/tickets/16a_GATE-G1__phase0-exit.md`).
>
> ⚠️ The dated Stage-B sections further below (2026-09-03 … 09-04) are append-only live-execution HISTORY and
> predate this milestone — read them as history, not the current state (the banner above + the P0.15k Stage B
> section are current).

Generated at commit on branch `stevevitali/p0-15-phase0-integration-and-exit` (stacked on the P0.14 tip).

---

## P0.15k Stage B (2026-09-11) — measured live results on `dev` (operator-authorized, ~$300 ceiling)

Executed live on `rhema-507501` with real inference. Rebuilt + rolled the run-task image (P0.15j hardened skill)
and, after the wall below, the api (Path B + a verdictContext fix). **Total spend: ~$207 list (~$290 platform)
across 12 runs.** The billable stack was left UP for follow-up and should be torn down when done (see the ledger).

### The `cited⇒fetched` wall (confirmed live) → the operator's Path B ruling

A full `second_read=false` Review of `proj_pv` ran all six phases and reached delivery having **fetched 224
distinct URLs**, yet delivery still rejected **18** cited URLs the model emitted from *training knowledge*
(snopes, forbes, brookings, scientificamerican, statista, deadline, epic.org, …) and never retrieved — the
D-P0.15i-2 wall, **unconverged** despite P0.15j's fetch-then-cite hardening + a raised per-phase budget. The
operator **ruled Path B** (relax `cited⇒fetched`): unfetched citations are now a per-claim **downgrade + strip**
at delivery (ADR-006), not a run-fatal reject — `validateCitedFetched` is unchanged; the delivered dossier cites
only fetch-verified sources.

### Criterion-by-criterion — MEASURED

| # | §17 criterion | Live result on `dev` | Verdict |
|---|---|---|---|
| 1 | Review of each of the 3 real projects delivers, `boundary.attested violations = 0` | `proj_pv` / `proj_sd` / `proj_cr` all `completed` + delivered; `assessPhase0ExitForRun` PASSED, `boundaryViolations=0` on each; one `correspondence_items` row each | **MET ✓ (D-P0.15-1)** |
| 2 | `cited ⇒ fetched` against the proxy log | 0 misses / 22 (pv), 36 (sd), 26 (cr) cited URLs on the persisted ledger (Path B strips the unfetched, ADR-006); the proxy logged 224+ fetched URLs/run | **MET ✓** (via Path B) |
| 3 | every sidecar validates (`parseStatus = ok`) | delivery ran `validateSidecars` — a failed sidecar hard-fails delivery, and all three delivered, so sidecars parsed ok at commit | **MET ✓** (at delivery; the post-hoc assessor counts 0 sidecars linked via `correspondence.artifact_ids` — a measurement nuance, not a failure) |
| 4 | a gate edit round-trips through the serializer into the next phase's file | gate **resolution** proven live (approve→resume→next phase, on every review's `approve_scope`); the structured **edit→overlay→next-phase-file** leg (overlay serializer proven offline: `gate-overlay.test.ts`) was **not driven live** | **PARTIAL — gate-pending (D-P0.15-3)** |
| 5 | proxy-metered cost = SDK-reported cost ± 2% | `proxyVsSdkCrossCheck` reports **not comparable** — no `sdk_estimate` rows are populated live (**D-P0.08-2**); proxy metered ~$21–34/review | **gate-pending (D-P0.08-2)** |
| 7 | estimators no longer provisional for the ported workflows | instrumented runs folded LIVE: **review** (calibrationScale **1.949**) + **fact_check** (**1.793**) → `provisional=false, source=instrumented` from real metered cost. `revise`/`profile_voice` BLOCKED at phase 1 on fixture inputs (revise needs its dossier/working-draft wiring; profile_voice needs an author body-of-work the dev seed lacks) | **PARTIAL — machinery proven; full 4-workflow flip gate-pending (fixtures)** |
| 9 | start-latency p95 (queued→running) ≤ 45 s | measured **~20–23 s** provision (queued→running) across the live runs — **under the 45 s SLO** | **MET ✓ (D-P0.15-5 data point)** |

### Path B consequence (honest)

Path B delivered the reviews but stripped many citations: of the persisted claims, most were downgraded to
`unverifiable` (pv 12/13, sd 13/16, cr 10/13) because the model cited unfetched sources; the fetched sources
(22/36/26) survived. cited⇒fetched is green *for what ships*, but the fetch-then-cite skill discipline (P0.15j)
still needs work — a real delivery-time backfill (fetch the cited urls) is ADR-006's revisit trigger.

### G1 readiness (honest)

**The core §17 criterion — a Review of each of the three real projects delivering green — is MET live.** This
was the blocker that held G1 across ~10 sessions. Remaining, all NARROW + gate-pending (none is the core
review-pipeline): the live gate-EDIT round-trip (D-P0.15-3; resolution is proven live), the full 4-workflow
estimator flip (revise/profile_voice need richer fixtures), and the ±2% cross-check (D-P0.08-2 — `sdk_estimate`
not populated live). **G1 is substantially ready; the operator dispositions it at `16a_GATE-G1` with these legs
noted.**

---

## UPDATE — P0.15h Stage B (2026-09-09): the live Review pipeline is PROVEN end-to-end; G1 blocked on ONE capability

The whole live Review pipeline now runs with **real inference**: two-uid agent launch → **all 6 required phases
commit green** (intake, craft, verification, discourse, argument, letter — `second_read` opted out, deferred
D-P0.15h-5) → the complete dossier is harvested to the mirror → the harness takes the **deliver** path. The
launcher cold-start (root-caused to Cloud Run CPU throttling), the sidecar-schema conformance, same-pod phase
advance, opt-out phase selection, and the delivered-dossier path resolution are all fixed + verified (PR #24,
commits `511f024`/`4f280c3`/`0514679`/`73a432a`/`f242ab8`).

**G1 is NOT yet passable — one capability remains:** the delivery transaction correctly refuses
`cited_not_fetched` because the fact-check agent does **no real, logged web fetches** (`usage_records.searches=0`)
— its SDK request never enables Anthropic's server-side web-search tool, so the claim-ledger citations are
model-knowledge, not fetch-backed. This is the `cited⇒fetched` half of the §17 criterion and is scoped to
**`docs/tickets/16_P0.15i__agent-web-research-in-sandbox.md`** (runs after P0.15h, before this gate). Once that
lands, a COMPLETE green Review delivers with a `correspondence_items` row and `assessPhase0ExitForRun` green. The
full §17 exit matrix (all three projects + Revise/Fact-check/Quick-Voice + a cap-402 run + the instrumented-cost
and pilot rows) is then the remaining live exercise for this gate.

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

**Stage A of `16_P0.15c` (PR #19) then wrote the LIVE CLIENT BINDINGS behind every DI seam** — the
"constructed at deploy" call-sites P0.15b's recorded deviation deferred, so Stage B is now execution, not
construction. New `@rhema/live-clients` package (`PgPoolTxRunner`, `RedisHeartbeatStore`, `RedisRunEventBus`,
`PgBossQueue`, `GkeJobLauncher` + the two-uid Job/Secret manifest, the Secret-Manager RS256 loader); the live
`apps/api`/`apps/worker`/`apps/egress-proxy` entrypoints (construct every seam, register the pg-boss consumers
+ crons, bind the DB run-context resolver + the SIGHUP-refreshable provider key); `GcsContentStore` +
`materializeWork`; the run-task `agent-entry` (drives one phase through `AgentSdkEngine`); the ledger/obligation
call-sites (resume re-debit, parked sweep, circuit-breaker cap sizing, the delivery obligation hook); SSE
server-tool logging; and real run-task + egress-proxy Dockerfiles. Pure logic unit-tested with fakes (~55
tests); `pnpm typecheck`/`lint`/`test` all green. See `DEFERRALS.md` § P0.15c.

## Stage B — live execution (2026-09-03, P0.15c)

Stage B was **executed live** on `rhema-507501` under explicit operator authorization (full `dev` deploy,
$300 ceiling, $10/run cap). The honest result: **the deploy + orchestration pipeline works end-to-end up to
the agent-execution boundary, but no live Review completed** — it is blocked by a genuine Stage-A
implementation gap. G1 is **not** ready.

**Proven live (evidence):**
- **Full `dev` deployed** via `pulumi up`: AlloyDB (PostgreSQL 17.9), GKE Standard + the run-task node pool,
  Memorystore Redis, versioned GCS, Secret Manager, seven Cloud Run services, the network. The sandbox subnet
  has **no Cloud NAT / no default route** (D-P0.01-2 extended to the full stack).
- **All three images built + pushed** (run-task, egress-proxy, api) to Artifact Registry via Cloud Build
  (digest-pinned, native amd64).
- **Migrations + seed on live AlloyDB:** `applyMigrations` (0001–0015) + `seedRealProjects` → 3 real projects
  (proj_cr/pv/sd) + 6 drafts + the Essay protocol body (**closes D-P0.02-1 live, D-P0.03-5**).
- **The live services ran:** the api + egress-proxy as in-VPC containers (healthz + `/pricing/rates` served,
  the proxy loaded `anthropic-api-key` from Secret Manager and listened); the worker minted an RS256 run token
  + credential and **launched the two-uid run-task Job onto GKE**; the pod scheduled, pulled the digest-pinned
  image, and the harness executed — reaching `/work` materialization.

**The blocker (D-P0.15c-6):** the run-task harness reads a `HarnessRunSpec` (the agent's phase `request` +
skills dir + the mirror hydration manifest + derived server files + the §12.6 hook policy/state) from
`RUN_SPEC_FILE` — and **nothing builds or delivers it.** The constituent pieces exist (`hydration()`, the
protocols manifests, the SeatPolicy builder) but the assembly `buildHarnessRunSpec(run)` + its delivery into
the pod is unbuilt. This is **core orchestration, not a "thin live shell,"** so it belongs in a reviewed PR,
not a live hack. Until it lands, the agent never runs — so the cap-402, the proxy-metered = SDK cross-check,
cited⇒fetched, sidecar validation, attestation, and the wire key-denial are **all still unverified live.**
**No paid Anthropic inference occurred** (the run never reached the SDK).

**~16 deploy-surfaced bugs** — every one invisible to the offline typecheck/`pulumi preview` that "passed
clean" in Stage A — were found and fixed (commit `10d1df9`). Notable structural ones: the api never enqueued
`run.start` for a queued run (so nothing provisioned); `OBJECTS_BUCKET` was never passed to the run-task Job;
the egress-proxy MIG used a **discontinued** GCP feature (COS container-via-metadata; D-P0.15c-7); the
run-task GKE **nodes couldn't bootstrap** in the no-egress sandbox subnet (fixed live via Private Google
Access; D-P0.15c-8); `api/Dockerfile` was still a P0.01 sleeper; the `.dockerignore` silently excluded the
vendored SDK; pnpm-v10 `deploy --legacy`; the Debian-reserved `proxy` group; the `.rhema.example` cert TLD;
the `pause:3.9` placeholder; servicenetworking/cloudbuild APIs disabled; the Pulumi stack-tag length limit.

**This overturns the ticket's "Stage B is execution, not construction" premise.** Completing the live Review
needs real new code (the RUN_SPEC assembly, D-P0.15c-6) plus infra re-platforming (proxy MIG D-P0.15c-7;
sandbox-node egress + pod NetworkPolicy D-P0.15c-8) — all reviewed-PR work, not deploy glue.

**The billable stack was torn down** after the run (cost-conscious mandate); re-deploy is a proven ~30-min
path (see the runbook pointers in `DEFERRALS.md § P0.15c` + the ledger). Total spend was minimal (~a few
dollars of idle infra; **$0 inference** — no run reached the model).

**Still deferred independent of the above:** the pilot wave (item 11) also requires the provider
no-training/retention verification (D-P0.13-2), which is **not recorded** — never fabricated; it stays OPEN.

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

**Recommended disposition (updated after Stage B ran live):** treat G1 as **blocked pending three
reviewed PRs, then a re-run of the live exit**. Stage B proved the deploy + orchestration substrate works
live (deploy, images, migrate/seed, api/proxy/worker, GKE two-uid Job launch) and removed the deployment
risk — but it also revealed that the ticket's "execution, not construction" premise is **false**: the live
Review is blocked by **unbuilt core orchestration** (the harness `RUN_SPEC` assembly, D-P0.15c-6) plus two
infra re-platforming needs (D-P0.15c-7 proxy MIG, D-P0.15c-8 sandbox-node egress + pod NetworkPolicy). The
precise path to G1: (1) land the `buildHarnessRunSpec` PR (worker builds + mounts the phase request +
hydration manifest + hook policy; set `RUN_SPEC_FILE`/`CLAUDE_CONFIG_DIR` on the Job); (2) land the two
infra PRs so `pulumi up` alone stands up a working stack (bake in the PGA node egress + `artifactregistry.reader`
+ the proxy re-platform + the api `run.start` enqueue, already fixed); (3) re-run the live bring-up and let
`driveLiveExit` report `ready` on `dev` — only then do the wire-level criteria (cap-402, proxy = SDK ±2%,
cited⇒fetched, sidecars, attestation, key-denial) get verified. The pilot (item 11) additionally needs the
provider no-training verification (D-P0.13-2), still unrecorded. The §1.4/§15.1 marketing claims remain
unshippable until this criterion holds (§16.4), which this readout does not relax.

## Stage A complete (P0.15e) — the last construction blockers are closed

**P0.15e (this PR) built the two remaining construction blockers P0.15d surfaced live**, so `pulumi up` +
the image build now stand up a stack that a live Review can actually run green:

1. **The pod→server commit/deliver loop (D-P0.15d-4 — the load-bearing blocker).** The harness now drives
   `runCommitLoop` (`apps/run-task/harness-loop.ts`): per phase it fetches the server-authored run spec, runs
   the phase (`agent-entry` writes `.rhema/agent-result.json`), reads `/work` (`work-reader.ts`), evaluates the
   orchestrator's PURE completion oracle (one guided retry), then calls the token-authed internal routes — a new
   `POST .../steps/:key/harvest` (persists the produced versions + the provisional `sdk_stream`/`usage.tick`
   row, D-P0.15d-3), `commit` with a `CommitNext` from the new pure `decideCommitNext` (advance / open the
   `gateAfter` gate via `resolveGatePolicy` / finalize), and, on the final phase, `deliver` a `DeliveryArgs`
   assembled from `/work` + the run spec's server-side delivery facts (a bare `finalize` for a pinned `phase:N`
   or a no-draft run). **Proven end-to-end through the REAL api routes + PGlite** (`integration/pod-loop.test.ts`:
   a run advances intake → opens the `approve_scope` gate; the letter phase → `deliver` → `completed`, and
   `assessPhase0ExitForRun` reads `boundary=0`, `citedFetched.ok`, `sidecars.allOk`). No secret crosses to the
   loop — the harness (uid `harness`) client is the sole token holder (REQ-SPEC-10/11).
2. **A deployable worker (closes the worker-deploy half of D-P0.15c-1).** `apps/worker/Dockerfile` mirrors the
   api image (`node dist/main.js`); `cloudbuild.yaml` builds `worker:dev`; `infra/pulumi/compute.ts` runs it
   always-on (`minInstanceCount:1`, `cpuIdle:false`) with a `node:http` health server for the Cloud Run startup
   probe; `infra/pulumi/iam.ts` grants the worker SA the RS256 signing key (it mints run tokens) + `container.developer`
   (GKE Job launch). `tsc --noEmit` clean vs `@pulumi/gcp@8.41.1`.

**What is NOT relaxed:** every live-`dev` row stays OPEN. Stage B is now a plain `pulumi up` + budgeted paid
re-run (no further construction is expected): the harness fetches the spec, the agent runs through the
SDK → proxy → Anthropic, the loop commits each phase + delivers, and the wire-level criteria (cap-402,
proxy = SDK ±2%, cited⇒fetched, sidecars, attestation, key-denial, start-latency p95) get verified for real.
The commit `credits` are provisional (SDK × the rate table) until the live proxy reconciliation (D-P0.15-2);
the reduced-rigor active-phase filter (D-P0.15d-1) and the `refundPhases` reduced-commit call-site (D-P0.15d-2)
stay OPEN (both need semantics/paths the pod loop's happy path does not yet exercise). See `DEFERRALS.md § P0.15e`.
G1 stays blocked pending the operator-gated Stage-B re-run.

## Stage B — live execution (2026-09-04, P0.15e; operator-authorized $300 / $10-per-run)

The full `dev` stack was re-deployed and the pod→server commit/deliver loop was driven LIVE. **The loop runs
live** — the harness reads the run token, heartbeats `provisioning → running`, fetches the server-authored run
spec over the wire, materializes `/work`, and launches the agent. **A green Review did NOT complete**: the run
blocks at the agent's live SDK call, so G1 is still NOT ready. **No paid inference occurred** (`usage_records`
and `fetch_log` are empty across all runs — the SDK never reached Anthropic through the proxy); spend was idle
infra only (~$3).

**Proven live:** `pulumi up` (54 resources) → AlloyDB/GKE/Redis/GCS/SecretMgr/Cloud Run/proxy MIG; `k8s apply`
(runs namespace + WI-bound KSA + NetworkPolicy); migrate + `seedRealProjects` on live AlloyDB (3 projects, 6
drafts); all four images built with the new commit-loop code; the api deployed + reachable by the pod; the
worker (run out-of-band — see the Cloud-Run-GKE gap below) provisioned a run and launched the two-uid GKE Job;
the pod ran the harness commit loop to the agent-execution boundary; the egress-proxy container came up, is
reachable from a sandbox pod (a probe got a correct `403`), and passes its health check.

**~10 live-only deploy bugs found + fixed this run** (invisible to the offline typecheck/preview — the value of
executing Stage B). Code fixes shipped in this PR: (1) the per-run Secret mount was `root:root 0400` so the
harness (uid 10001) got **EACCES** on the run token — now `fsGroup` + `0440` (`k8s-launcher.ts`); (2) the commit
loop dropped the **heartbeat** that takes `provisioning → running` — restored (`harness-loop.ts`); (3–5) the
proxy COS startup script couldn't pull its image (regional AR host missing from the docker auth; `docker login`
needed instead of the gcr helper; `DOCKER_CONFIG` on a writable tmpfs because COS `/` is read-only) and (6)
served on `--network host` which COS's host iptables drops — now `-p` port-publish (`proxy.ts`); (7) the proxy
`ANTHROPIC_KEY_SECRET` needed the full resource name, not the bare id (`index.ts`); (8) the egress-proxy SA
lacked `artifactregistry.reader` (`iam.ts`). Infra fixes baked into the IaC (`network.ts`): (9) a `run.app`
private DNS zone → the PGA VIP (the pod couldn't reach the internal Cloud Run api at its public frontend); (10)
a proxy-tier **ingress** firewall (sandbox + pod range on 8443/443; the health-check probers on 8443 — else
autohealing recreated the proxy in a loop). Runtime config: `ANTHROPIC_BASE_URL` is `http://` (the proxy serves
HTTP; proxy→Anthropic is HTTPS).

**The remaining blocker (G1-gating):** with the proxy healthy + reachable, a real run's agent still does not
reach the proxy (a root probe does), so no inference happens. The agent (uid `agent`) is either hanging before
its live SDK call (the vendored-SDK / `AgentSdkEngine` first live exercise — D-P0.06-1/4) or the proxy's
response-buffering is incompatible with the SDK's streaming (D-P0.07-5). It could not be diagnosed further this
session because the pod's logs are unreachable: `kubectl logs`/`exec` fail with konnectivity **"No agent
available"** (a P0.15c-noted cluster issue) and Cloud Logging is empty for long-running pods. This is
egress-proxy / run-task live bring-up (D-P0.06 / D-P0.07), NOT the P0.15e commit loop (proven live to this
boundary). See `DEFERRALS.md` § P0.15e.

**Two deploy-topology findings (recorded, not yet re-platformed):** (a) the Cloud Run worker cannot launch GKE
Jobs — `@kubernetes/client-node` `loadFromDefault()` finds no kubeconfig on Cloud Run; this session ran the
worker out-of-band against the live cluster to validate the path. The worker needs either a GKE Deployment
topology (in-cluster SA) or an injected kubeconfig. (b) konnectivity is down (no `kubectl logs`/`exec`), which
blocks pod-level debugging.

The billable stack was **torn down** after the run (cost-conscious mandate); a temporary AlloyDB public IP +
`allUsers` api invoker + IAP-SSH firewall added for the session were removed. G1 stays blocked pending a live
re-run that reaches a green Review.

---

## Stage A complete (2026-09-04, P0.15f) — the diagnosis + fix enablers for the last live blocker

**P0.15f (this PR) is diagnosis-first and offline: it builds the three enablers P0.15e's live run needed to turn
its one remaining green-Review blocker (the agent never reaches the proxy, `$0` metered) from *undiagnosable*
into *diagnosable-and-likely-fixed* — without any spend.** The paid live re-run that confirms the fix + runs the
§17 exit criterion is **Stage B, still [OPERATOR GATE]d** (a stated budget + ADC/Pulumi/Docker; none authorized
this session — surfaced, not guessed past).

1. **Readable agent-error observability sink (D-P0.15e-4 / D-P0.06-1).** The run-task pod is now debuggable even
   with konnectivity down: `agent-entry` captures a thrown SDK/engine error into `.rhema/agent-result.json`
   (`sanitizeAgentError` — error class + a bounded, redacted, single-line message; no secret/user content),
   `work-reader` threads it out, the commit loop folds it into the `failStep` reason, and `@rhema/orchestrator`
   `failStep` emits an INTERNAL `engine.error` run event **in the same tx as the step-fail row**. So an agent
   hang/crash surfaces in `run_events`/`steps` (queryable from the DB) with no `kubectl logs`/`exec`.
2. **Worker GKE-Job launcher without an out-of-band step (D-P0.15e-3).** Chose **option (b)** to keep the proven
   Cloud Run worker topology: `MetadataTokenGkeJobLauncher` builds the `KubeConfig` from the GKE endpoint + CA
   (`buildGkeKubeConfigOptions`) + a FRESH GCE metadata OAuth token fetched per launch
   (`fetchGceMetadataAccessToken`) — sidestepping token expiry with no refresh machinery — and delegates to the
   existing `GkeJobLauncher`. Wired through `apps/worker` env/main + `infra/pulumi/compute.ts`
   (`GKE_ENDPOINT`/`GKE_CA_DATA` from `gke.endpoint` + `masterAuth.clusterCaCertificate`; the worker SA already
   has `roles/container.developer`). `pulumi tsc --noEmit` clean.
3. **Proxy SSE/streaming pass (D-P0.07-5).** The proxy now STREAMS the upstream response through incrementally
   (`streamProxyRequest` + `undiciStreamForwarder`; the live server uses them) instead of buffering the whole
   body — the P0.15e agent→proxy-hang suspect — while metering the ACCUMULATED body ONCE. The pipeline split
   (`prepareProxyRequest` → forward → `meter`) keeps the buffered `handleProxyRequest` byte-identical (all 63
   existing proxy tests green). This defensively closes the *buffering* branch of the D-P0.15e-2 hypothesis;
   **whether pre-SDK-hang (D-P0.06-1/4) or buffering is THE cause is confirmed live in Stage B** with the sink's
   error in hand.

**Konnectivity (item 4) is NOT an offline IaC gap.** `infra/pulumi/network.ts` `sandbox-allow-gke-master`
already allows sandbox→master `443`+`10250` (konnectivity/kubelet), pri 900 > deny-all 1000. So restoring
`kubectl logs` is a cluster-config/ops matter to diagnose live; the item-1 sink is the mechanism the run relies
on meanwhile (the ticket permits this). **All Stage-A work is unit + integration-tested; typecheck/lint/pulumi-tsc
green.** See `DEFERRALS.md § P0.15f`.

> **CORRECTION (Stage B, below): konnectivity WAS an IaC gap after all** — the sandbox→master firewall was
> missing the konnectivity port 8132 (+ node→node kubelet 10250). Fixed live + in `network.ts`; pod logs restored.

---

## Stage B — live execution (2026-09-04, P0.15f; operator-authorized $50 / $10-per-run; pilot SKIPPED)

The full `dev` stack was re-deployed and a Review run driven to the agent-execution boundary — this time **WITH
POD LOGS in hand** (the P0.15e blind spot is gone). **$0 inference** (no run reached the model; spend was idle
infra only). Deploy churn: transient GCP failures (an http2 wait-drop, then a `us-central1-f` e2 STOCKOUT on the
cluster + proxy MIG) — dodged by pinning dev `nodeLocations`/`distributionPolicyZones` to `a`+`c` and recovering
with `pulumi refresh` + `--continue-on-error`.

**What the live run proved (and corrected):**
- **D-P0.15e-3 CLOSED LIVE** — the Cloud Run worker launched the two-uid GKE Job via the metadata-token
  `KubeConfig` launcher, NO out-of-band step.
- **D-P0.15e-4 pod logs RESTORED** — two real IaC gaps found + fixed: the konnectivity-agent dials
  `<master>:8132` (firewall was missing 8132 → "No agent available"), and `kubectl logs` needs node→node kubelet
  `10250` egress (blocked by the deny-all). Both baked into `network.ts` + applied live; `kubectl logs`/`exec`
  now work on `dev`.
- **D-P0.15e-2 TRUE ROOT CAUSE — a CHAIN, not a single hang, overturning the P0.15e "SDK hang / proxy-buffering"
  hypothesis.** With logs, the pod fails `spawn … ENOENT`: **the agent was never spawned.** (1) bare
  `setpriv`/`node` are unresolvable in the PATH-less scrubbed env → FIXED (absolute `/usr/bin/setpriv` +
  `process.execPath`); (2) the agent cwd `/work/project` was never created (`materializeWork` writes `/work`
  root) → FIXED (cwd = workDir + mkdir). The agent process then SPAWNS live, revealing the next links:
  `setpriv: setresgid failed: Operation not permitted` (the non-root harness lacks ambient CAP_SETUID/SETGID to
  drop to the agent uid — **D-P0.15f-1**), and behind it the per-run proxy credential is never injected into the
  agent's request (**D-P0.15f-2**). Also fixed: the pod NetworkPolicy blocked the WI metadata server
  (169.254.169.254) the harness needs for GCS auth.

**Net:** the agent→proxy hang is now precisely understood — three fixes landed (spawn/cwd/konnectivity + the
NetworkPolicy), two new construction blockers (D-P0.15f-1 harness ambient caps, D-P0.15f-2 credential injector)
+ the untested first live SDK exercise (D-P0.06-1) remain before a green phase. The billable stack was torn down
after the run (cost mandate). **G1 stays blocked**, now with a precise remaining checklist rather than an
undiagnosable hang.

---

## P0.15k Stage A (2026-09-11) — the three-project + instrumented-cost machinery is wired; the live matrix is gate-pending

**P0.15k is the LAST live G1 leg (three-project Reviews + instrumented cost → rewrite this readout → flag G1
ready).** It is mostly a live-execution ticket → **[OPERATOR GATE]d** (real infra + paid inference), and its
Stage B additionally depends on **16_P0.15j**'s own live AC3 (a Review must DELIVER `cited⇒fetched`-green
first — still a RETURN PASS). This session had **no operator authorization, no stated spend budget, and no
confirmed deployed `dev`**, so Stage B was **not** run and no pass was fabricated (BM-DEFER-02). What Stage A
built + verified offline, no spend:

- **Multi-project fixture (AC1).** `integration/src/live-prepare-fixture.ts` now repoints **all three** real
  drafts (`proj_pv` / `proj_sd` / `proj_cr`) to real ~800–900-word prose (was `proj_pv`-only). The seed writes
  each `<proj>_av1` head with a placeholder sha + no GCS bytes; the fixup uploads real bytes + repoints each so
  `/work` materialization does not dangle for any of the three. `run-live-exit.ts` wires `draftIdFor` so each
  project reviews its seeded `<proj>_d1`, and the launcher opts `second_read` **out** for review runs (the G1
  delivery mode, D-P0.15h-5).
- **The instrumented-fold call-site (AC2 / D-P0.15-2), previously missing.** `foldInstrumentedRun` is pure and
  was never applied in the live path, and `estimatorsAreProvisional()` read a hardcoded const — so nothing could
  ever flip it, and AC2 could not pass even on a perfect live run. Now: a process-local **instrumented-override
  registry** (`@rhema/protocols` `recordInstrumentedFold` / `estimatorSpec` / `resetInstrumentedOverrides`;
  `estimatorsAreProvisional()` reads override-first), the driver **folds each instrumented run** through an
  injectable `InstrumentedFolder` and surfaces the folds (`estimatorFolds`), and the live binding
  (`integration/src/instrumented-folder.ts` `createDbInstrumentedFolder`) reads the run's measured proxy cost
  (`proxyVsSdkCrossCheck`) → `platformCredits` and records the fold. Design + the process-local-vs-durable
  tradeoff: **ADR-005**. `proxyVsSdkCrossCheck` (±2%, AC2) and `assessPhase0ExitForRun` (AC1) already read the
  live rows and handle all three projects.
- **Credit renderer (D-P0.15d-3) verified wired live.** The pod harvest route already defaults its
  `renderCredits` to `rateTableCreditRenderer` (`apps/api/src/run-routes.ts`), so a live phase emits a
  provisional `usage.tick` / `sdk_stream` row; the "emits live" leg rides Stage B.

**Verify (offline):** `pnpm turbo build lint typecheck` 102/102; the affected suites (protocols + integration +
mirror + orchestrator) 394 pass / 1 skip (server-postgres, needs `DATABASE_URL`); the new estimator-registry,
driver-fold, folder, and launcher tests green; upstream-diff OK; `protocols_version` unchanged
(`0.4.0+5b08d37da59aad92` — the estimator is outside the hashed trio). **No spend.**

**The exact remaining live checklist (Stage B, operator-gated):** on a deployed `dev` (redeploy via the
P0.15f/g runbook; populate the workspace-scoped `anthropic-api-key`), after 16_P0.15j's live AC3 delivers:
`node scripts/live/prepare-fixture.mjs` (funds `bill_seed` + repoints all three drafts) → `RHEMA_LIVE_EXIT=1
PROJECT_IDS=proj_pv,proj_sd,proj_cr … tsx integration/src/run-live-exit.ts` — it drives the three Reviews +
Revise/Fact-check/Quick-Voice + the instrumented cost runs (folding each), a gate round-trip, and runs
`assessPhase0ExitForRun` over the live rows, then prints the readout. **Then** the criterion-by-criterion table
above gets rewritten with the MEASURED values, D-P0.15-1/-2/-3 close with evidence, and G1 is flagged ready.
**G1 remains the operator's gate** (this ticket does not run or disposition it).

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
