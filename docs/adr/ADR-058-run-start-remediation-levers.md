# ADR-058: run-start latency is remediated with queue wakeups, a warm image cache, and a costed warm-pool deferral

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** SLO.1
- **Requirement ids:** §13.5 `p95 run start ≤ 45 s`; REQ-ARCH-34

## Context

STB.3 measured first-start p95 ≈ 57 s against the §13.5 target of 45 s. Once the probe was
corrected (ADR-056 — first `queued→running` event pair), the composition is: pg-boss claim latency
(worker was `expireInSeconds`-polled on a 2-second floor), admission + credential minting, Job
create + schedule, the FIRST `ghcr`-pull of a multi-hundred-MB run-task image per digest per node,
and `/work` materialization + engine boot before the first `provisioning→running` heartbeat. Which
stage dominated was previously unknowable — there was no attribution.

## Decision — levers shipped in this PR

1. **Stage attribution first.** `provisionRun` samples `run_start_stage_ms` (`admit_mint`,
   `job_launch`) into `slo_samples` so the remaining gap decomposes into queue vs. admit vs. launch
   rather than being guessed.
2. **`IfNotPresent` on the run-task image.** The launcher previously inherited registry-default pull
   behavior on a digest-pinned image; now the pod spec pins `imagePullPolicy: IfNotPresent` so a warm
   node cache skips the pull entirely — a pull is never *needed* for a digest the node holds.
3. **pg-boss wakeup.** The worker enables LISTEN/NOTIFY plus a 0.5 s poll floor on the
   latency-critical queues (`apps/worker/src/main.ts`), removing the poll-interval slice of the
   queue→claim stage.
4. **Image-prewarm DaemonSet** (`infra/k8s/40-image-prepull-daemonset.yaml`, wired into `apply.sh`):
   one sleeper pod per sandbox node holding the *current* digest under `/bin/sleep`, requests
   5 mCPU/16 Mi, no SA token, no egress need. It keeps every node's containerd cache warm for the
   digest the Jobs pin — the cheap half of a warm pool (warm image, cold pod).

## Cost

- `IfNotPresent` + prewarm DaemonSet: $0 (one sleeping 5 mCPU/16 Mi pod per sandbox node).
- pg-boss poll floor: $0.
- A second always-on sandbox node (the rejected warm-pool alternative): an additional `e2-standard-2`
  on-demand ≈ **$49/mo** us-central1 — over the $15/mo auto-approve threshold → deferred for operator
  approval if stage attribution shows boot/pull still dominating after the shipped levers.
- A dedicated warm `run-task` pod pool that pre-creates Jobs: rejected outright — it defeats the
  one-shot-Job lifecycle + credential-mint ordering.

## Deferred work (operator approval / evidence needed)

- **D-SLO.1-<n> (warm pool)**: if post-deploy stage samples still show image-pull or kubelet-admit
  dominating p95 beyond 45 s, the next lever is scaling `run-task-pool` to 2 nodes *or* enabling GKE
  image streaming on the pool — both exceed the $15/mo cap and/or touch pool config → explicit
  operator sign-off required. Evidence required: the `run_start_stage_ms` decomposition from the
  first post-deploy weekly review.

## Consequences

- The dominant lever (warm image cache) is free and additive; nothing shipped raises the floor cost.
- Stage samples mean the next decision is evidence-driven, not another blind lever.
- §13.5 45 s target is unchanged; if the levers don't land it, the deferral names the costed path.

## Revisit trigger

First post-deploy weekly review's stage decomposition (or a fresh STB first-start re-measure):
if `job_launch`+pull stage still exceeds ~15 s at p95, pursue the deferred warm-pool/image-streaming
lever with the measured numbers attached.
