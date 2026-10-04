// The pod→server commit/deliver loop (P0.15e; D-P0.15d-4 — the load-bearing green-Review blocker). After the
// pod's `agent-entry` runs ONE phase (`engine.startPhase`, uid `agent`) and streams events, THIS loop — driven
// by the HARNESS (uid `harness`, the sole holder of the run token) — reads the phase's `/work` outputs, runs the
// orchestrator's PURE completion oracle, persists the produced versions, decides advance/gate/finalize, and
// calls the token-authed internal routes to COMMIT + (on the last phase) DELIVER. It mirrors the SERVER-side
// reference loop (`@rhema/orchestrator` `runPhase`) but keeps the SDK execution in the pod (the two-uid model)
// and the durable transition + attestation on the SERVER (the harness only reports facts; commit is server-side).
//
// The loop is engine-, transport-, and IO-agnostic — every side effect is an injected seam — so it is unit-
// tested with a `FakeEngine`-backed `runPhase` + an in-process api client + PGlite (the G21 composition), and
// the prod wiring (spawn `agent-entry`, read `/work`, fetch the api) lives in `harness-main.ts`. NO secret ever
// crosses into this module's inputs beyond the run token the client holds (REQ-SPEC-10/11).

import type {
  AgentTypeKey,
  ClaimLedgerSidecar,
  FindingsSidecar,
  RubricSidecar,
} from "@rhema/contracts";
import { normalizeUrl } from "@rhema/contracts";
import type { ResultSubtype, UsageSnapshot } from "@rhema/engine";
import type { DeliveryArgs, NewVersion, SidecarInput, VerdictSourceContext } from "@rhema/mirror";
import {
  createFactsEvaluator,
  decideCommitNext,
  evaluateOracle,
  HEARTBEAT_INTERVAL_MS,
  retryPolicyFor,
  type CommitNext,
  type DeliveryFacts,
  type ErrorClass,
  type EvaluatedPredicate,
  gatePolicyContextFromFacts,
  type GatePolicyContext,
  type HarnessRunSpec,
  type PhaseResultFile,
  type PredicateFacts,
} from "@rhema/orchestrator";
import { resolveProducedPath } from "./work-reader.js";
import { describePreflightFailures } from "./research-preflight.js";

/**
 * CITE.1 (ADR-085) — cap on the missed urls named in the backfill re-entry's instruction. The
 * dedicated `backfillFetchBudget` is the HARD bound server-side; this just keeps the guidance
 * short (a flood of misses is a deeper failure the re-entry cannot repair anyway).
 */
const BACKFILL_GUIDANCE_MAX_URLS = 24;

/**
 * CITE.1 mechanism A (ADR-085) — the pre-delivery cited⇒retrieved check + bounded re-entry. Runs
 * ONCE per pod, after the final phase commits and BEFORE `deliver`:
 *   1. read the run's retrieved-url set from the token-authed internal route (the SAME canonical
 *      identity the delivery guard applies — never pod-asserted);
 *   2. compute the cited urls the set does NOT cover;
 *   3. on any miss, re-enter the committed final-phase spec ONE extra time with guidance naming the
 *      missed urls, stamped `phaseClass: "backfill"` — the proxy admits those fetches on the run's
 *      dedicated `backfillFetchBudget` (never the research budget, never the floor share), meters
 *      them, and stamps `phase_class='backfill'` on the fetch_log/usage rows of record.
 * The re-entry's `/work` outputs are DISCARDED — its only effect is the fetch_log rows (the
 * delivered dossier stays the committed artifacts; the delivery tx then reads a fetch log where the
 * cited urls exist, so Path B does not strip them). Everything here is best-effort: an unbound seam,
 * a route failure, or a crashed re-entry degrades to exactly the pre-CITE.1 Path-B strip — never a
 * regression and never a delivery blocker.
 */
async function maybeBackfillCitations(
  deps: Pick<CommitLoopDeps, "client" | "runPhase">,
  spec: HarnessRunSpec,
  outputs: PhaseRunOutputs,
): Promise<void> {
  const claimLedger = outputs.delivery?.claimLedger;
  if (!claimLedger || !deps.client.retrievedUrls) return;
  const retrieved = await deps.client.retrievedUrls().catch(() => ({ ok: false as const, urls: [] as readonly string[] }));
  if (!retrieved.ok) return;
  const retrievedSet = new Set(retrieved.urls);
  const misses = new Set<string>();
  for (const claim of claimLedger.claims ?? []) {
    if (claim.url && !retrievedSet.has(normalizeUrl(claim.url))) misses.add(claim.url);
    for (const s of claim.sources ?? []) {
      if (s.url && !retrievedSet.has(normalizeUrl(s.url))) misses.add(s.url);
    }
  }
  if (misses.size === 0) return;
  const urls = [...misses].slice(0, BACKFILL_GUIDANCE_MAX_URLS);
  await Promise.resolve()
    .then(() =>
      deps.runPhase(spec, {
        phaseClass: "backfill",
        guidance:
          `Cite-completeness check: your claim ledger cites ${misses.size} source URL(s) that were never ` +
          `retrieved, so they cannot appear in the delivered review. Fetch each of these URLs now with ` +
          `the fetch tool — one call per URL, no searching: ${urls.join(", ")}. ` +
          `Do not modify any dossier files.`,
      }),
    )
    .then(() => undefined)
    .catch(() => undefined);
}

/** The server-authored preflight manifest (`HarnessRunSpec.researchPreflight`) — RES.1. */
export type ResearchPreflightSpec = NonNullable<HarnessRunSpec["researchPreflight"]>;

/** A failed pair for the failStep reason — model/tool ids + status only, never content. */
export interface PreflightFailure {
  readonly model: string;
  readonly tool: string;
  readonly status?: number;
  readonly reason?: string;
}
export type PreflightOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly PreflightFailure[] };

/**
 * RES.1 (REQ-SPEC-31(3)) — the research-preflight seam the deploy binds to `runResearchPreflight`
 * (research-preflight.ts). The loop invokes it ONCE per pod when the spec carries a non-empty pair set —
 * a resume is a fresh pod, so re-preflight is automatic. An UNBOUND seam fails closed: a spec that
 * demands preflight gets `research_preflight_failed` rather than a silently-skipped guard.
 */
export type PreflightFn = (spec: ResearchPreflightSpec) => Promise<PreflightOutcome>;

/** Error classes whose remedy is re-running the same phase once (guided for artifact_missing) — mirrors runPhase. */
const RERUN_CLASSES: ReadonlySet<ErrorClass> = new Set([
  "artifact_missing",
  "infra",
  "provider_transient",
]);

/**
 * Render each failed completion predicate as `<kind>:<artifact-or-sidecar> (<detail>)` for the failStep reason
 * (residue 1 observability). The bare `verdict.reason` only names the predicate KINDS; this adds the exact
 * artifact/sidecar the phase was missing plus the evaluator's detail — so a non-committing phase's `engine.error`
 * event names the file that was absent (the live craft case: `artifact_nonempty:04-craft-notes.md (nonempty)`).
 */
function describePredicateFailures(failed: readonly EvaluatedPredicate[]): string {
  if (failed.length === 0) return "";
  const parts = failed.map((e) => {
    const p = e.predicate;
    const target = "artifact" in p ? p.artifact : "sidecar" in p ? p.sidecar : "";
    return `${p.kind}${target ? `:${target}` : ""}${e.detail ? ` (${e.detail})` : ""}`;
  });
  return ` — ${parts.join("; ")}`;
}

// ---------------------------------------------------------------------------- seams

/** The `/work` outputs of one phase the loop reads to judge + commit it. */
export interface PhaseRunOutputs {
  /** the SDK result subtype (the completion oracle's leg a). */
  readonly subtype: ResultSubtype;
  /** the SDK usage snapshot (priced provisionally at harvest — the proxy stays the meter of record). */
  readonly usage: UsageSnapshot;
  /** the committed `.rhema/phase-result.json` (leg b); null when missing/unparseable. */
  readonly phaseResult: PhaseResultFile | null;
  /** the harvested writable versions (bytes) to persist (produced-version-ids for commit). */
  readonly versions: readonly NewVersion[];
  /** the predicate facts read from `/work` for the oracle (leg c). */
  readonly facts: PredicateFacts;
  /** the `/work`-derived dossier content — read on the FINAL phase (absent otherwise). */
  readonly delivery?: WorkDeliveryContent;
  /**
   * A thrown SDK/engine error the agent captured into `.rhema/agent-result.json` (D-P0.15e-4 observability
   * sink). Present only when the agent's phase crashed; folded into the `failStep` reason so the error CLASS +
   * message reaches `run_events`/`steps` without pod exec. Never carries a secret or user content.
   */
  readonly agentError?: { readonly class: string; readonly message: string };
}

/** The dossier content the harness reads from `/work` for the final delivery (the server supplies the facts). */
export interface WorkDeliveryContent {
  /** mirror paths of the delivered dossier artifacts (letter, notes, …); mapped to version ids via harvest. */
  readonly deliveredPaths: readonly string[];
  readonly sidecars: readonly SidecarInput[];
  readonly claimLedger?: ClaimLedgerSidecar;
  readonly findings?: FindingsSidecar;
  readonly rubric?: RubricSidecar;
  readonly secondReadProducerQueryId?: string | null;
  readonly coversAllObligations?: boolean;
}

/** Runs ONE phase to its terminal result. Prod: spawn `agent-entry` (uid agent) + read `/work`; test: FakeEngine. */
export type RunPhaseFn = (
  spec: HarnessRunSpec,
  opts: {
    readonly guidance?: string;
    /**
     * CITE.1 (ADR-085) — stamp `x-rhema-phase-class` with this class instead of the spec's own
     * (`"backfill"` for the bounded pre-delivery fetch re-entry, whose fetches admit only on the
     * dedicated allowance and are metered/stamped `phase_class='backfill'`).
     */
    readonly phaseClass?: string;
  },
) => Promise<PhaseRunOutputs>;

export interface HarvestCall {
  readonly stepKey: string;
  readonly ordinal: number;
  readonly seat: AgentTypeKey;
  readonly projectId?: string | null;
  readonly personaId?: string | null;
  readonly versions: readonly NewVersion[];
  readonly usage: UsageSnapshot;
}
export interface HarvestReply {
  readonly producedVersionIds: string[];
  readonly byPath: Record<string, string>;
  readonly provisionalCredits: number;
}
export interface CommitCall {
  readonly stepKey: string;
  readonly ordinal: number;
  readonly of: number;
  readonly producedVersionIds: readonly string[];
  readonly credits: number;
  /** RPT.1 — the pod-measured phase wall-clock span (begin→commit); the begin row's `started_at`
   *  wins when present, this is the fallback for a step that committed without one. */
  readonly durationMs?: number;
  readonly result: {
    readonly status: "done";
    readonly sdkSubtype: string;
    readonly predicatesPassed: boolean;
    readonly compactions: number;
  };
  readonly next: CommitNext;
}
export interface FailCall {
  readonly stepKey: string;
  readonly ordinal: number;
  readonly errorClass: string;
  readonly reason?: string;
}
/** The `/steps/:key/fail` reply — `backEdge` when the failure self-report routed a bounded re-plan (the run
 *  stays `running`; the loop re-fetches the spec and re-runs the reset phase), `gateId` when it escalated to a
 *  blocking Approval (the run parks `waiting_gate`; the pod exits like any other gate). */
export interface FailStepResult {
  readonly ok: boolean;
  readonly backEdge?: { readonly to: readonly string[]; readonly replans: number };
  readonly gateId?: string;
  readonly code?: string;
}

/** The token-authed internal-api client the harness calls (a `fetch` in prod; the real routes in the G21 test). */
export interface HarnessApiClient {
  /** first beat: take `provisioning → running` (§12.4 step 5) + refresh the token; returns cancel state. */
  heartbeat?(): Promise<{ ok: boolean; cancelRequested?: boolean; state?: string }>;
  fetchRunSpec(): Promise<HarnessRunSpec>;
  /**
   * CITE.1 (ADR-085) — the run's retrieved-url set (the delivery guard's join set, canonicalized
   * server-side). Optional: a client without the seam disables the pre-delivery backfill check —
   * Path B then runs as before (never a regression).
   */
  retrievedUrls?(): Promise<{ ok: boolean; urls: readonly string[] }>;
  /** RPT.1 — stamp the phase's real start (steps.state='running' + `step.started`); absent ⇒ the
   *  old wiring (a client that predates the seam) — the commit's measured durationMs then carries
   *  the timing fallback. */
  beginStep?(args: { stepKey: string; ordinal: number; of: number }): Promise<{ ok: boolean }>;
  harvest(args: HarvestCall): Promise<HarvestReply>;
  commit(args: CommitCall): Promise<{ ok: boolean; state?: string; code?: string }>;
  failStep(args: FailCall): Promise<FailStepResult>;
  deliver(args: { delivery: DeliveryArgs }): Promise<{ ok: boolean; state?: string }>;
  /** finalize WITHOUT a dossier (a pinned `phase:N` run, or a no-draft workflow) → `finalizing → completed`. */
  finalize(): Promise<{ ok: boolean; state?: string }>;
}

export interface CommitLoopDeps {
  readonly client: HarnessApiClient;
  readonly runPhase: RunPhaseFn;
  /** the run's workspace id (from WORKSPACE_ID) — folded into the delivery dossier. */
  readonly workspaceId: string;
  /** RES.1 — the research-preflight probe seam (see `PreflightFn`); unbound ⇒ fail closed. */
  readonly preflight?: PreflightFn;
  /** gate-policy context for a `gateAfter` gate; default: named policy, informational approve_scope. */
  gateContext?(now: Date): GatePolicyContext;
  now?(): Date;
}

export type LoopResult =
  | { readonly kind: "delivered"; readonly phasesCommitted: number; readonly state: string }
  | { readonly kind: "completed"; readonly phasesCommitted: number } //   finalized without a dossier
  | { readonly kind: "gated"; readonly phasesCommitted: number } //       a gate opened; the pod exits, worker resumes
  | { readonly kind: "stopped"; readonly phasesCommitted: number } //     a pinned phase:N run committed + stopped
  | {
      readonly kind: "failed";
      readonly phasesCommitted: number;
      readonly errorClass: string;
      readonly reason: string;
    };

// ---------------------------------------------------------------------------- the loop

/**
 * Drive the run to a terminal outcome from the pod (§12.4 steps 6–8). Per phase: fetch the server-authored run
 * spec, run the phase (once more with guidance on a re-runnable incomplete class), evaluate the oracle, and —
 * on `complete` — harvest+persist the produced versions, decide advance/gate/finalize, and commit. On `advance`
 * it re-fetches the spec for the next uncommitted phase (the server increments it) and loops; on `gate` the pod
 * exits (the worker resumes on resolution); on `finalize` it assembles the `DeliveryArgs` from `/work` and
 * delivers (or finalizes with no dossier). A pinned `phase:N` run commits exactly its one phase then stops.
 */
export async function runCommitLoop(deps: CommitLoopDeps): Promise<LoopResult> {
  const now = deps.now ?? (() => new Date());
  let phasesCommitted = 0;

  // first beat: take the run `provisioning → running` before any commit (§12.4 step 5). Without it the commit
  // route's `running → …` transition is invalid and the run is stuck provisioning (surfaced live P0.15e).
  // Then KEEP beating every HEARTBEAT_INTERVAL_MS (§12.4: the task beats every 20 s): a phase's agent runs
  // minutes-long, so a one-shot beat ages past HEARTBEAT_STALE_MS mid-phase and the reaper orphans a LIVE
  // pod — the PRB.16 prod crash-loop (attempt fence then rejects the phase's commit as `stale_task`). The
  // interval beat also carries `cancelRequested` back: honored between phases (the pod exits; the reaper
  // completes `cancelling → cancelled` once the beats stop).
  let cancelRequested = false;
  let beatTimer: ReturnType<typeof setInterval> | undefined;
  if (deps.client.heartbeat) {
    const beat = deps.client.heartbeat.bind(deps.client);
    const first = await beat();
    cancelRequested = first.cancelRequested === true;
    beatTimer = setInterval(() => {
      void beat()
        .then((res) => {
          if (res.cancelRequested) cancelRequested = true;
        })
        .catch(() => {
          /* best-effort liveness: a transient beat failure must not kill the loop (the next beat retries). */
        });
    }, HEARTBEAT_INTERVAL_MS);
    beatTimer.unref?.();
  }

  // RES.1 — the research preflight runs ONCE per pod lifetime (each resume launches a fresh pod → a fresh
  // loop → a fresh probe). It must precede the FIRST phase's model traffic — and any subsequent phases in
  // this pod ride the already-proven pairs.
  let preflighted = false;

  try {
    for (;;) {
      if (cancelRequested) {
        return {
          kind: "failed",
          phasesCommitted,
          errorClass: "infra",
          reason: "cancel requested via heartbeat",
        };
      }

      const spec = await deps.client.fetchRunSpec();
      const phase = spec.request.phase;
      const predicates = phase.completionPredicates ?? [];

      // RES.1 (REQ-SPEC-31(3)) — before the first phase's model traffic, prove every server-authored
      // model × server-tool pair through the run's OWN proxy. A refused pair terminalizes the run
      // (`research_preflight_failed`: zero user debit, hold released, probe burn absorbed); a run whose
      // spec demands preflight but whose deploy left the seam unbound fails CLOSED, never silently skips.
      if (!preflighted && spec.researchPreflight && spec.researchPreflight.pairs.length > 0) {
        preflighted = true;
        const outcome: PreflightOutcome = deps.preflight
          ? await deps.preflight(spec.researchPreflight)
          : { ok: false, failures: [{ model: "*", tool: "*", reason: "preflight seam unbound" }] };
        if (!outcome.ok) {
          const reason = `research preflight failed — ${describePreflightFailures(outcome.failures)}`;
          // failStep terminalizes the run in one tx (step row + engine.error + running→failed + settle).
          await deps.client.failStep({
            stepKey: phase.key,
            ordinal: phase.index,
            errorClass: "research_preflight_failed",
            reason,
          });
          return { kind: "failed", phasesCommitted, errorClass: "research_preflight_failed", reason };
        }
      }

      // RPT.1 — stamp the phase's real start before its model traffic: the server's beginStep upsert
      // marks the step `running` (card phase flips live) and fixes `started_at`, so the committed row's
      // ended−started is the true phase duration. Best-effort: a transient failure must not block the
      // phase (the commit's measured durationMs then carries the timing).
      const phaseStartedMs = now().getTime();
      await (deps.client.beginStep?.({ stepKey: phase.key, ordinal: phase.index, of: spec.request.of }) ??
        Promise.resolve()).catch(() => undefined);

      // run the phase; re-run ONCE (guided) on a re-runnable incomplete verdict (mirror runPhase).
      let outputs = await deps.runPhase(spec, {});
      let verdict = evaluateOracle(
        { sdkSubtype: outputs.subtype, phaseResult: outputs.phaseResult, predicates },
        createFactsEvaluator(outputs.facts),
      );
      if (verdict.outcome === "incomplete" && RERUN_CLASSES.has(verdict.errorClass)) {
        const policy = retryPolicyFor(verdict.errorClass);
        if (policy.maxRetries > 0) {
          // PRB.16b F15 — fold each failed predicate's TARGET + detail (incl. sidecar schema issues)
          // into the guidance: the bare reason named only predicate KINDS, so a retry re-guessed the
          // same contract violation (live: `rows` written for the required `entries` array ×3).
          const guidance = policy.guided
            ? `Previous attempt incomplete: ${verdict.reason}${describePredicateFailures(verdict.failedPredicates)}. Complete every declared artifact.`
            : undefined;
          outputs = await deps.runPhase(spec, guidance ? { guidance } : {});
          verdict = evaluateOracle(
            { sdkSubtype: outputs.subtype, phaseResult: outputs.phaseResult, predicates },
            createFactsEvaluator(outputs.facts),
          );
        }
      }

      // a non-complete verdict fails the step and stops the pod (the caller/reaper decides escalation vs quarantine).
      if (verdict.outcome !== "complete") {
        const errorClass = verdict.outcome === "incomplete" ? verdict.errorClass : verdict.outcome;
        // Build a REAL diagnostic (residue 1): the plain `verdict.reason` only names the failed predicate KINDS,
        // so a phase that exited clean but wrote no artifact (the live craft case — `04-craft-notes.md` absent)
        // reached `run_events` as an opaque "1 completion predicate(s) failed". Fold in the SDK subtype, the
        // failed leg, and each failed predicate's TARGET + evaluated detail so the non-committing phase is
        // diagnosable from the `engine.error` event alone, without pod exec.
        const baseReason =
          verdict.outcome === "incomplete"
            ? `${verdict.reason} [sdk=${outputs.subtype}, leg=${verdict.failedLeg}]${describePredicateFailures(verdict.failedPredicates)}`
            : `phase-result ${verdict.outcome} [sdk=${outputs.subtype}]`;
        // fold the agent-reported error (if any) into the reason so its CLASS + message reaches run_events/steps
        // via failStep — the observability sink (D-P0.15e-4) makes an agent crash diagnosable without pod exec.
        const reason = outputs.agentError
          ? `${baseReason} — agent error [${outputs.agentError.class}]: ${outputs.agentError.message}`
          : baseReason;
        const failed = await deps.client.failStep({
          stepKey: phase.key,
          ordinal: phase.index,
          errorClass,
          reason,
        });
        // P1.10 / REQ-WF-5 — a `replan` self-report that fit inside ITERATION_CAPS.replan reset the plan's
        // committed step server-side and kept the run `running`: the loop CONTINUES, and the next
        // fetchRunSpec hands back the reset phase (with the failure as `inputs.replan` context). At the cap
        // the server parked `waiting_gate` on a `refusal` Approval — the pod exits like any other gate.
        if (failed.ok && failed.backEdge) continue;
        if (failed.ok && failed.gateId) return { kind: "gated", phasesCommitted };
        return { kind: "failed", phasesCommitted, errorClass, reason };
      }

      // complete: harvest+persist the produced versions (→ version ids + provisional credits), then commit.
      const harvested = await deps.client.harvest({
        stepKey: phase.key,
        ordinal: phase.index,
        seat: spec.request.seat as AgentTypeKey,
        projectId: spec.delivery?.projectId ?? null,
        versions: outputs.versions,
        usage: outputs.usage,
      });

      const isLastPhase = phase.index === spec.request.of - 1;
      // P1.09 — the server-authored gate-policy facts on the spec are the default context (project
      // policy + per-kind overrides + the per-run override + gatesOff). `deps.gateContext` still wins
      // when bound (tests/one-off drivers); the bare "named" default is the last resort only.
      const gateCtx = deps.gateContext
        ? deps.gateContext(now())
        : spec.gatePolicy
          ? gatePolicyContextFromFacts(spec.gatePolicy, now())
          : { policy: "named" as const, now: now() };
      // a pinned phase:N run finalizes after this one phase; otherwise the manifest decides advance/gate/finalize.
      let next: CommitNext = spec.stopAfterPhase
        ? { kind: "finalize" }
        : decideCommitNext({ phase, isLastPhase, gate: gateCtx });
      // PRB.16b F19 — bind the gate to the produced version of the phase's declared `gateArtifact`:
      // `gates.artifact_version_id` is what the approve_triage card and the write-back overlay merge
      // (mergedTriageLedger → serializeGateOverlay) read — `decideCommitNext` never supplied it, so
      // every gate opened with NULL and the overlay path was dead code.
      if (next.kind === "gate" && phase.gateArtifact) {
        const produced = resolveProducedPath(Object.keys(harvested.byPath), phase.gateArtifact);
        const versionId = produced ? harvested.byPath[produced] : undefined;
        if (versionId) next = { ...next, artifactVersionId: versionId };
      }

      const committed = await deps.client.commit({
        stepKey: phase.key,
        ordinal: phase.index,
        of: spec.request.of,
        producedVersionIds: harvested.producedVersionIds,
        credits: harvested.provisionalCredits,
        // RPT.1 — the pod-measured phase span; the begin row's `started_at` wins when it exists.
        durationMs: Math.max(0, now().getTime() - phaseStartedMs),
        result: {
          status: "done",
          sdkSubtype: outputs.subtype,
          predicatesPassed: true,
          compactions: 0,
        },
        next,
      });
      if (!committed.ok) {
        // PRB.16b F17: a non-stale commit rejection must still leave a DB trace — previously the pod just
        // exited, the run stayed `running`, and the orphan/reaper loop parked it on `resume_partial` with NO
        // step row and NO engine.error (the live 01M2SH38 attempt-5 case: a `gates_step_id_fkey` rollback
        // surfaced only in api logs). `stale_task` is the exception — a genuinely-stale attempt's failStep
        // would be stale-fenced too, and the live attempt owns the write.
        const reason = `commit rejected: ${committed.code ?? "unknown"}`;
        if (committed.code !== "stale_task") {
          await deps.client
            .failStep({ stepKey: phase.key, ordinal: phase.index, errorClass: "infra", reason })
            .catch(() => undefined); // best-effort diagnostics; the pod still exits failed either way
        }
        return { kind: "failed", phasesCommitted, errorClass: "infra", reason };
      }
      phasesCommitted++;

      // a pinned phase:N run: finalize with NO dossier and stop (the diagnostic single-phase path, REQ-SPEC-13).
      if (spec.stopAfterPhase) {
        await deps.client.finalize();
        return { kind: "stopped", phasesCommitted };
      }
      if (next.kind === "gate" && next.blocking !== false) return { kind: "gated", phasesCommitted }; // the pod exits; the worker resumes
      // RUN.1 — an informational gate (blocking:false): the card opened server-side; the run keeps
      // moving. The pod takes `next.then` — advance continues the phase loop; finalize falls into the
      // delivery leg below exactly like a last-phase commit.
      if (next.kind === "gate") next = { kind: next.then === "finalize" ? "finalize" : "advance" };
      if (next.kind === "finalize") {
        // deliver the assembled dossier when the run targets a draft and produced dossier content; else finalize bare.
        if (spec.delivery && outputs.delivery && outputs.delivery.deliveredPaths.length > 0) {
          // CITE.1 — the pre-delivery cited⇒retrieved check + bounded backfill re-entry (ADR-085);
          // a miss-free ledger (or an unbound seam) skips straight to delivery at zero cost.
          await maybeBackfillCitations(deps, spec, outputs);
          const delivery = assembleDeliveryArgs(
            spec,
            deps.workspaceId,
            harvested.byPath,
            outputs.delivery,
          );
          const del = await deps.client.deliver({ delivery });
          return { kind: "delivered", phasesCommitted, state: del.state ?? "completed" };
        }
        await deps.client.finalize();
        return { kind: "completed", phasesCommitted };
      }
      // next.kind === "advance": loop; the next runspec fetch returns the next uncommitted phase.
    }
  } finally {
    if (beatTimer) clearInterval(beatTimer);
  }
}

// ---------------------------------------------------------------------------- delivery assembly

/**
 * Assemble the final `DeliveryArgs` from the SERVER-side delivery facts (in the run spec) + the `/work`-derived
 * dossier content + the harvest's path→version-id map (§12.6: the harness supplies the content, the server the
 * attestation facts). `verdictContext` is built conservatively from the claim ledger's own citation domains
 * (reputable/search domains empty ⇒ downgrade-only, never a hard fail — §12.8(c)); the fuller domain provenance
 * from the live fetch log is a live refinement (D-P0.15-2). The delivery route overrides runId/workspaceId from
 * the token, so those are authoritative regardless of what is placed here.
 */
export function assembleDeliveryArgs(
  spec: HarnessRunSpec,
  workspaceId: string,
  byPath: Record<string, string>,
  content: WorkDeliveryContent,
): DeliveryArgs {
  const facts = spec.delivery as DeliveryFacts; // present (the caller guards on spec.delivery)
  const deliveredVersionIds = content.deliveredPaths
    .map((p) => byPath[p])
    .filter((id): id is string => typeof id === "string");
  return {
    runId: spec.request.runId,
    attempt: spec.request.attempt,
    workspaceId,
    projectId: facts.projectId,
    draftId: facts.draftId,
    correspondenceKind: facts.correspondenceKind,
    ...(facts.protocolId ? { protocolId: facts.protocolId } : {}),
    ...(facts.protocolVersion != null ? { protocolVersion: facts.protocolVersion } : {}),
    deliveredVersionIds,
    draftPromotedVersionId: facts.draftPromotedVersionId,
    sidecars: content.sidecars,
    ...(content.claimLedger ? { claimLedger: content.claimLedger } : {}),
    ...(content.findings ? { findings: content.findings } : {}),
    ...(content.rubric ? { rubric: content.rubric } : {}),
    ...(content.secondReadProducerQueryId !== undefined
      ? { secondReadProducerQueryId: content.secondReadProducerQueryId }
      : {}),
    verdictContext: buildVerdictContext(content.claimLedger),
    ...(content.coversAllObligations !== undefined
      ? { coversAllObligations: content.coversAllObligations }
      : {}),
  };
}

/** A conservative verdict-source context: the claim ledger's own citation hostnames; no reputable/search set. */
function buildVerdictContext(claimLedger?: ClaimLedgerSidecar): VerdictSourceContext {
  const citationDomains = new Set<string>();
  for (const claim of claimLedger?.claims ?? []) {
    const host = hostnameOf(claim.url);
    if (host) citationDomains.add(host);
    for (const s of claim.sources ?? []) {
      const sh = hostnameOf(s.url);
      if (sh) citationDomains.add(sh);
    }
  }
  return {
    citationDomains,
    reputableDomains: new Set<string>(),
    searchResultDomains: new Set<string>(),
  };
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
