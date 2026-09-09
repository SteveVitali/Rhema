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

import type { AgentTypeKey, ClaimLedgerSidecar, FindingsSidecar, RubricSidecar } from "@rhema/contracts";
import type { ResultSubtype, UsageSnapshot } from "@rhema/engine";
import type { DeliveryArgs, NewVersion, SidecarInput, VerdictSourceContext } from "@rhema/mirror";
import {
  createFactsEvaluator,
  decideCommitNext,
  evaluateOracle,
  retryPolicyFor,
  type CommitNext,
  type DeliveryFacts,
  type ErrorClass,
  type EvaluatedPredicate,
  type GatePolicyContext,
  type HarnessRunSpec,
  type PhaseResultFile,
  type PredicateFacts,
} from "@rhema/orchestrator";

/** Error classes whose remedy is re-running the same phase once (guided for artifact_missing) — mirrors runPhase. */
const RERUN_CLASSES: ReadonlySet<ErrorClass> = new Set(["artifact_missing", "infra", "provider_transient"]);

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
export type RunPhaseFn = (spec: HarnessRunSpec, opts: { readonly guidance?: string }) => Promise<PhaseRunOutputs>;

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
  readonly result: { readonly status: "done"; readonly sdkSubtype: string; readonly predicatesPassed: boolean; readonly compactions: number };
  readonly next: CommitNext;
}
export interface FailCall {
  readonly stepKey: string;
  readonly ordinal: number;
  readonly errorClass: string;
  readonly reason?: string;
}

/** The token-authed internal-api client the harness calls (a `fetch` in prod; the real routes in the G21 test). */
export interface HarnessApiClient {
  /** first beat: take `provisioning → running` (§12.4 step 5) + refresh the token; returns cancel state. */
  heartbeat?(): Promise<{ ok: boolean; cancelRequested?: boolean; state?: string }>;
  fetchRunSpec(): Promise<HarnessRunSpec>;
  harvest(args: HarvestCall): Promise<HarvestReply>;
  commit(args: CommitCall): Promise<{ ok: boolean; state?: string; code?: string }>;
  failStep(args: FailCall): Promise<void>;
  deliver(args: { delivery: DeliveryArgs }): Promise<{ ok: boolean; state?: string }>;
  /** finalize WITHOUT a dossier (a pinned `phase:N` run, or a no-draft workflow) → `finalizing → completed`. */
  finalize(): Promise<{ ok: boolean; state?: string }>;
}

export interface CommitLoopDeps {
  readonly client: HarnessApiClient;
  readonly runPhase: RunPhaseFn;
  /** the run's workspace id (from WORKSPACE_ID) — folded into the delivery dossier. */
  readonly workspaceId: string;
  /** gate-policy context for a `gateAfter` gate; default: named policy, informational approve_scope. */
  gateContext?(now: Date): GatePolicyContext;
  now?(): Date;
}

export type LoopResult =
  | { readonly kind: "delivered"; readonly phasesCommitted: number; readonly state: string }
  | { readonly kind: "completed"; readonly phasesCommitted: number } //   finalized without a dossier
  | { readonly kind: "gated"; readonly phasesCommitted: number } //       a gate opened; the pod exits, worker resumes
  | { readonly kind: "stopped"; readonly phasesCommitted: number } //     a pinned phase:N run committed + stopped
  | { readonly kind: "failed"; readonly phasesCommitted: number; readonly errorClass: string; readonly reason: string };

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
  if (deps.client.heartbeat) await deps.client.heartbeat();

  for (;;) {
    const spec = await deps.client.fetchRunSpec();
    const phase = spec.request.phase;
    const predicates = phase.completionPredicates ?? [];

    // run the phase; re-run ONCE (guided) on a re-runnable incomplete verdict (mirror runPhase).
    let outputs = await deps.runPhase(spec, {});
    let verdict = evaluateOracle(
      { sdkSubtype: outputs.subtype, phaseResult: outputs.phaseResult, predicates },
      createFactsEvaluator(outputs.facts),
    );
    if (verdict.outcome === "incomplete" && RERUN_CLASSES.has(verdict.errorClass)) {
      const policy = retryPolicyFor(verdict.errorClass);
      if (policy.maxRetries > 0) {
        const guidance = policy.guided
          ? `Previous attempt incomplete: ${verdict.reason}. Complete every declared artifact.`
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
      await deps.client.failStep({ stepKey: phase.key, ordinal: phase.index, errorClass, reason });
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
    const gateCtx = deps.gateContext ? deps.gateContext(now()) : { policy: "named" as const, now: now() };
    // a pinned phase:N run finalizes after this one phase; otherwise the manifest decides advance/gate/finalize.
    const next: CommitNext = spec.stopAfterPhase ? { kind: "finalize" } : decideCommitNext({ phase, isLastPhase, gate: gateCtx });

    const committed = await deps.client.commit({
      stepKey: phase.key,
      ordinal: phase.index,
      of: spec.request.of,
      producedVersionIds: harvested.producedVersionIds,
      credits: harvested.provisionalCredits,
      result: { status: "done", sdkSubtype: outputs.subtype, predicatesPassed: true, compactions: 0 },
      next,
    });
    if (!committed.ok) {
      return { kind: "failed", phasesCommitted, errorClass: "infra", reason: `commit rejected: ${committed.code ?? "unknown"}` };
    }
    phasesCommitted++;

    // a pinned phase:N run: finalize with NO dossier and stop (the diagnostic single-phase path, REQ-SPEC-13).
    if (spec.stopAfterPhase) {
      await deps.client.finalize();
      return { kind: "stopped", phasesCommitted };
    }
    if (next.kind === "gate") return { kind: "gated", phasesCommitted }; //   the pod exits; the worker resumes
    if (next.kind === "finalize") {
      // deliver the assembled dossier when the run targets a draft and produced dossier content; else finalize bare.
      if (spec.delivery && outputs.delivery && outputs.delivery.deliveredPaths.length > 0) {
        const delivery = assembleDeliveryArgs(spec, deps.workspaceId, harvested.byPath, outputs.delivery);
        const del = await deps.client.deliver({ delivery });
        return { kind: "delivered", phasesCommitted, state: del.state ?? "completed" };
      }
      await deps.client.finalize();
      return { kind: "completed", phasesCommitted };
    }
    // next.kind === "advance": loop; the next runspec fetch returns the next uncommitted phase.
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
    ...(content.secondReadProducerQueryId !== undefined ? { secondReadProducerQueryId: content.secondReadProducerQueryId } : {}),
    verdictContext: buildVerdictContext(content.claimLedger),
    ...(content.coversAllObligations !== undefined ? { coversAllObligations: content.coversAllObligations } : {}),
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
  return { citationDomains, reputableDomains: new Set<string>(), searchResultDomains: new Set<string>() };
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
