// The server-authored harness run spec (D-P0.15c-6; §12.2/§12.6; REQ-SPEC-10/11/13; REQ-ARCH-17). The load-
// bearing orchestration piece the P0.15c live run was missing: the harness (`apps/run-task/harness-main.ts`)
// executes a `HarnessRunSpec` — the agent's phase `request`, the `skillsDir`, the hydration `manifest` + its
// derived `serverFiles`, and the §12.6 hook policy — but NOTHING assembled it. This builds it from SERVER-SIDE
// facts only (the attestation rests on server facts, §12.6) so the api can serve it token-authed and the
// harness fetches it (never constructs it): the manifest is already the server attestation fact, and a fetch
// avoids mounting a large spec as a Secret. NO secret is ever in the spec (REQ-SPEC-10/11) — the run token and
// the proxy credential reach only the harness uid via the 0400 Secret mount, never this JSON.

import type { AgentTypeKey, CorrespondenceKind, ModelTier, SidecarFilename, WorkflowKey } from "@rhema/contracts";
import { MODEL_TIERS, SIDECAR_CONTRACT_HINTS } from "@rhema/contracts";
import type { PhaseRequest } from "@rhema/engine";
import { mainModelForTier } from "@rhema/engine";
import type { MirrorManifest } from "@rhema/mirror";
import { recordSubagentLaunch } from "@rhema/mirror";
import { EMPTY_URL_POLICY, resolveSeatRoots, type PhasePolicy, type UrlPolicy } from "@rhema/hooks";
import { WORKFLOW_MANIFESTS, SECOND_READ_PROMPT } from "@rhema/protocols";
import type { OrchestratorDeps } from "./internal-api.js";
import { hydration } from "./internal-api.js";
import { consumeGuidance } from "./guidance.js";
import { loadGatePolicyFacts, type GatePolicyFacts } from "./gate-policy.js";
import { userSourceMounts } from "./user-sources.js";

/** Where the ported skills are baked in the run-task image (`apps/run-task/Dockerfile` COPYs them here). */
export const DEFAULT_SKILLS_DIR = "/app/skills";
/** The per-run USD ceiling the phase's `budgetShare` is taken against for the SDK inner brake (dev `max_usd`). */
export const DEFAULT_MAX_USD_PER_RUN = 10;
/** The SDK `maxTurns` ceiling for one phase (the outer wall-clock/reaper brakes are the orchestrator's). */
export const DEFAULT_MAX_TURNS = 40;

/**
 * JSON-safe seat-policy inputs (a `@rhema/hooks` `CompileInput` with `tools` as an array). The compiled
 * `SeatPolicy` carries a `Set` (tools) and the paired `DenialState` a `Map`, neither of which survives JSON —
 * so the SERVER authors these inputs (from server-side facts) and the HARNESS compiles the live policy locally
 * with the SAME `@rhema/hooks` code + a fresh `newDenialState()`. That keeps policy server-authored (REQ-ARCH-17)
 * without shipping an unserializable object over the wire.
 */
export interface HookPolicyInput {
  readonly seat: AgentTypeKey;
  readonly personaId?: string;
  readonly roots?: {
    readonly project?: string;
    readonly persona?: string;
    readonly skills?: string;
    /** Harness-injected (the staged `<CLAUDE_CONFIG_DIR>/skills`) — never set server-side. */
    readonly config?: string;
  };
  /** the seat's permitted tool tokens (from the `agent_types` row); `web_fetch` gating is in `urlPolicy`. */
  readonly tools: readonly string[];
  readonly urlPolicy: UrlPolicy;
  readonly phase: PhasePolicy;
  readonly runId: string;
  readonly agentLabel?: string;
  /**
   * PRB.19 (F26b) — the run's declared phase-output paths granted writable for THIS run (server-computed by
   * `declaredWritableArtifacts`; e.g. `drafts/v3.md`, `correspondence/v1-response.md`). The harness folds them
   * into `compileSeatPolicy` — each becomes a `readwrite` project rule the classifier prefers over the seat's
   * `read` glob.
   */
  readonly writableArtifacts?: readonly string[];
}

/**
 * The spec the harness executes for one phase (fetched token-authed from `GET /internal/runs/:id/runspec`). It
 * is entirely server-authored data: no secret, no client construction. `manifest` + `serverFiles` materialize
 * `/work`; `request` drives the engine's one phase; `hookPolicyInput` compiles the §12.6 boundary policy.
 */
export interface HarnessRunSpec {
  readonly request: PhaseRequest;
  readonly skillsDir: string;
  readonly tier?: ModelTier;
  /** the server-generated hydration manifest (§12.6 attestation) — the harness fetches bytes per entry. */
  readonly manifest: MirrorManifest;
  /** derived (non-artifact) mount-file bytes by path, utf8 (`manifest.md`, `obligations.json`). */
  readonly serverFiles: Record<string, string>;
  /** the §12.6 boundary policy inputs (the harness compiles the live `SeatPolicy` + fresh `DenialState`). */
  readonly hookPolicyInput: HookPolicyInput;
  /** true when the run pins an explicit `phase` in its frozen inputs (REQ-SPEC-13): the pod commits this one
   *  phase then STOPS — it does not advance/gate/finalize. The commit loop reads this to end after one phase. */
  readonly stopAfterPhase?: boolean;
  /** server-side facts the harness needs to assemble the final `DeliveryArgs` from /work (§12.6: the harness
   *  supplies the /work-derived dossier content, the server supplies these attestation facts). Present only for
   *  a draft-targeting run (a Review); absent ⇒ the loop finalizes WITHOUT delivering (a no-draft/scoped run). */
  readonly delivery?: DeliveryFacts;
  /**
   * PRB.19 (F26b) — the run's declared phase-output paths granted writable for this run (the same list folded
   * into `hookPolicyInput.writableArtifacts`). The harness passes it to `harvest` so a NEW file at a granted
   * shared path (e.g. `drafts/v(N+1).md`) persists instead of dropping as `out_of_allowlist`.
   */
  readonly writablePaths: readonly string[];
  /**
   * P1.09 (§6.4 item 3; REQ-SPEC-1) — the run's resolved gate-policy facts: the project's approval
   * policy + per-kind overrides, the per-run override (`runs.gate_overrides`, "this run only"), the
   * autonomous flag, and the scope/rounds context. The commit loop turns this into the
   * `GatePolicyContext` `decideCommitNext` consults — server-authored, so the pod can never mint a
   * weaker policy than the project/run carries.
   */
  readonly gatePolicy?: GatePolicyFacts;
  /**
   * DEF.1 / D-P0.15h-5 — the §12.6 input-scoped second read. Present ONLY on the phase that declares
   * `second_read_producer_checked`: the server mints `producerQueryId`, records the launch in
   * `subagent_launches` (`inputs_kind:'explicit_files'`, the delivery producer check's row), and the
   * harness executes the phase AS the scoped query — `tools:["Read"]`, a private mount namespace holding
   * `files` only — then writes the produced artifact + the `.rhema/second-read.json` marker itself. The
   * judge-phase `Agent` deny stays in force: the parent model never spawns the read.
   */
  readonly scopedLaunch?: ScopedPhaseLaunch;
}

/**
 * The server-authored launch order for one input-scoped producer query (§12.6). The harness executes it
 * verbatim: `files` are the ONLY paths the private namespace mounts; `producerQueryId` is the id the
 * `subagent_launches` row + the `.rhema/second-read.json` marker + the delivery producer check agree on.
 */
export interface ScopedPhaseLaunch {
  readonly role: "second-reader";
  /** server-minted at spec build; recorded in `subagent_launches.producer_query_id`. */
  readonly producerQueryId: string;
  /** absolute /work paths the scoped query may read — input-scoped, nothing else exists in its namespace. */
  readonly files: readonly string[];
  /** the scoped query's prompt (the protocol's second-read instruction). */
  readonly prompt: string;
  /** the project-root-relative path the harness writes the read's output to (e.g. `agents/editor/05-second-read.md`). */
  readonly outputPath: string;
  /** the project-root-relative marker path carrying `{producerQueryId, expectedProducerQueryId}`. */
  readonly markerPath: string;
  /** the judge-tier model for the scoped query (the run's tier). */
  readonly model: string;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
}

/** The server-side delivery facts the harness folds into the final `DeliveryArgs` (P0.15e). */
export interface DeliveryFacts {
  readonly projectId: string;
  readonly draftId: string;
  readonly correspondenceKind: CorrespondenceKind;
  /** the reviewed draft's promoted head version to freeze at (a frozen draft requires a promoted version).
   *  Absent on a Draft delivery: the run's own `drafts/v(N+1).md` is born frozen — there is no base. */
  readonly draftPromotedVersionId?: string;
  readonly protocolId?: string;
  readonly protocolVersion?: number;
  /** PRB.06: the review a `response`/re-review answers (`prior_review_id`) — from the run's frozen inputs. */
  readonly priorReviewId?: string;
  /** PRB.06: the v(N+1) draft row a `response` delivery creates (the run's reserved `nextDraftId`). */
  readonly newDraftId?: string;
  /** P1.10: the draft ordinal (`v(N+1)`) a Draft run's born-frozen row + `drafts/vN.md` path resolve to. */
  readonly newDraftN?: number;
}

/** The correspondence kind each workflow delivers (drives `correspondence_items.kind`); default `review`. */
const CORRESPONDENCE_KIND_BY_WORKFLOW: Partial<Record<WorkflowKey, CorrespondenceKind>> = {
  review: "review",
  fact_check: "review",
  revise: "response",
  // P1.10 — a Draft run delivers `correspondence/v(N+1)-drafting-note.md` (kind 'drafting_note').
  draft: "drafting_note",
};

export interface BuildRunSpecArgs {
  readonly runId: string;
  readonly attempt: number;
  readonly workspaceId: string;
  /** the image path the ported skills are baked at (defaults to `/app/skills`). */
  readonly skillsDir?: string;
  /** the per-run USD ceiling the phase budget share is taken against (defaults to the dev `max_usd`, $10). */
  readonly maxUsdPerRun?: number;
}

/** Run-level facts read alongside the hydration manifest to assemble the phase request + hook policy. */
interface RunSpecFacts {
  readonly modelTier: string;
  readonly tools: string[];
  /** distinct committed (`done`) phases so far → the index of the phase to run next (0 on a fresh run). */
  readonly committedPhases: number;
  readonly projectId: string | null;
  /** `runs.replans` — the back-edge count (REQ-WF-5), folded into a re-run plan phase's `replan` input. */
  readonly replans: number;
  /** P1.21 (REQ-GENRE-3) — the run's resolved `protocol@version` for the delivery stamp. */
  readonly protocolId?: string;
  readonly protocolVersion?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The hook's URL policy (§12.6: persona hold-outs, user exclusions, the calibrator allow-after-prediction) is a
// DIFFERENT concern from the proxy's domain allowlist (`proxy_allowlists.url_policy`, a `ProxyUrlPolicyData` of
// blocked/known domains — the proxy is the enforcer of record, defense-in-depth). P1.14: persona runs freeze
// their real policy into `inputs.urlPolicy` at creation (the hold-out URL is denied to every non-calibrator
// and opened to the input-scoped calibrator only after its prediction file exists — the hook daemon flips
// `predictionFileWritten` when it observes that write); every fetch rides the client `fetcher`
// (`serverFetchDisabled` — there is no credentialed path). Non-persona runs keep the empty policy.

/** Validate + adopt the run's frozen `inputs.urlPolicy` (P1.14); malformed/missing ⇒ EMPTY. */
function urlPolicyForRun(inputs: Record<string, unknown>): UrlPolicy {
  const raw = inputs.urlPolicy;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_URL_POLICY;
  const p = raw as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    holdouts: list(p.holdouts),
    userExclusions: list(p.userExclusions),
    calibratorAllow: list(p.calibratorAllow),
    // always frozen false — the hook daemon flips it when the calibrator's prediction file lands
    // (§12.6 "hold-out allowed only after the prediction file exists"); a stale true would void
    // the ordering guarantee.
    predictionFileWritten: false,
    serverFetchDisabled: p.serverFetchDisabled === true,
    blockedDomains: list(p.blockedDomains),
    // P1.21 — the memo run's user-source domains (REQ-WF-8): the pod-side hook denies every fetch to
    // them the same way the proxy does.
    userSourceDomains: list(p.userSourceDomains),
  };
}

/**
 * Assemble the run spec the harness executes for its current phase (D-P0.15c-6). Uses `hydration()` for the
 * server-generated manifest + derived server files + frozen inputs + seat (it also persists `run_mounts` and
 * applies resume overlays), then reads the run's model tier, the seat's tool set, the committed-phase count
 * (which phase to run), and the run's URL policy — and builds the `PhaseRequest` from the workflow manifest.
 * Everything here is a server-side fact; no secret is read or emitted (REQ-SPEC-10/11).
 */
export async function buildHarnessRunSpec(deps: OrchestratorDeps, args: BuildRunSpecArgs): Promise<HarnessRunSpec> {
  // 1) hydration: manifest + derived serverFiles + frozen inputs + seat + workflow + persona (persists run_mounts).
  const hyd = await hydration(deps, { runId: args.runId, attempt: args.attempt, workspaceId: args.workspaceId });
  const workflow = hyd.workflow as WorkflowKey;
  const manifest = WORKFLOW_MANIFESTS[workflow];
  if (!manifest) throw new Error(`buildHarnessRunSpec: no workflow manifest for '${hyd.workflow}'`);
  const seat = hyd.seat as AgentTypeKey;

  // 2) run-level facts: model tier, the seat's tool set, the committed-phase count, the run's URL policy.
  const facts = await deps.txRunner.run(args.workspaceId, async (tx): Promise<RunSpecFacts> => {
    const runRow = (await tx.query("select model_tier, project_id, replans from runs where id = $1", [args.runId])).rows[0] as
      | { model_tier: string; project_id: string | null; replans: number }
      | undefined;
    if (!runRow) throw new Error(`buildHarnessRunSpec: run ${args.runId} not found`);
    const at = (await tx.query("select tools from agent_types where key = $1", [seat])).rows[0] as
      | { tools: string[] }
      | undefined;
    const done = (
      await tx.query("select count(distinct ordinal)::int as n from steps where run_id = $1 and state = 'done'", [args.runId])
    ).rows[0] as { n: number };
    // P1.21 (REQ-GENRE-3) — resolve the run's `protocol@version` for the delivered dossier's stamp.
    // The project's pinned `(protocol_id, protocol_version)` is the base; a frozen `inputs.protocol`
    // override names a DIFFERENT protocol id and resolves to its current seed version.
    const project = runRow.project_id
      ? ((await tx.query("select protocol_id, protocol_version from projects where id = $1", [runRow.project_id]))
          .rows[0] as { protocol_id: string | null; protocol_version: number | null } | undefined)
      : undefined;
    const override = typeof hyd.inputs.protocol === "string" && hyd.inputs.protocol !== "" ? hyd.inputs.protocol : null;
    const protocolId = override ?? project?.protocol_id ?? undefined;
    let protocolVersion = project?.protocol_version ?? undefined;
    if (override != null && override !== project?.protocol_id) {
      const v = (
        await tx.query("select max(version)::int as v from protocols where id = $1", [override])
      ).rows[0] as { v: number | null } | undefined;
      if (v?.v != null) protocolVersion = v.v;
    }
    return {
      modelTier: runRow.model_tier,
      tools: at?.tools ?? [],
      committedPhases: done.n,
      projectId: runRow.project_id,
      replans: runRow.replans,
      ...(protocolId != null ? { protocolId } : {}),
      ...(protocolVersion != null ? { protocolVersion } : {}),
    };
  });

  // P1.09 — the gate-policy facts (project policy + overrides, the per-run override, the autonomous
  // flag, scope/rounds context) ride the spec so `decideCommitNext` resolves from server truth.
  const gatePolicy =
    (await deps.txRunner.run(args.workspaceId, (tx) => loadGatePolicyFacts(tx, args.runId))) ??
    undefined;

  // 3) the phase to run. An explicit `phase` pin in the run's FROZEN inputs wins (REQ-SPEC-13: a run created
  //    to "run exactly phase N then stop" — the `phase:"N"` path); the pin names the skill's native phase
  //    number (`skillPhase`). Otherwise the next uncommitted phase in the run's ACTIVE phase set (0 on a fresh
  //    run; position === committed-phase count on resume). A phase is opted OUT when it declares an `optOutFlag`
  //    and the run's frozen inputs set that flag to `false` (§6.5); opted-out phases produce no committed step,
  //    so the committed-phase COUNT is exactly the position of the next active phase — selecting by position in
  //    `activePhases` skips them. `of` stays the full manifest length so the delivery trigger
  //    (`phase.index === of - 1`, keyed to the always-active final `letter` phase) is unaffected. Closes the
  //    D-P0.15d-1 limitation (reduced-rigor runs previously selected an opted-out phase over the full manifest).
  //    PRB.10 — a persona workflow's `optional: <tier>` phases are likewise omitted when the run's frozen
  //    `inputs.tier` matches: profile_voice{tier: quick} drops `substance` + `calibration` (§9.2 — Quick
  //    Voice = census + close reading + voice + package). `inputs.tier` is the PERSONA build tier; the
  //    sheet workflows never set it, so this rule cannot fire for review/revise (whose `optional` rigor
  //    notes are informational only, per the review manifest header).
  const isOptedOut = (p: (typeof manifest.phases)[number]): boolean =>
    (p.optOutFlag != null && hyd.inputs[p.optOutFlag] === false) ||
    (p.optional != null && hyd.inputs.tier === p.optional);
  const activePhases = manifest.phases.filter((p) => !isOptedOut(p));
  const pin = hyd.inputs.phase;
  const pinnedSkillPhase = typeof pin === "string" || typeof pin === "number" ? String(pin) : undefined;
  const phase = pinnedSkillPhase
    ? manifest.phases.find((p) => p.skillPhase === pinnedSkillPhase)
    : activePhases[facts.committedPhases];
  if (!phase) {
    throw new Error(
      pinnedSkillPhase
        ? `buildHarnessRunSpec: run ${args.runId} pins phase '${pinnedSkillPhase}', absent from workflow '${hyd.workflow}'`
        : `buildHarnessRunSpec: run ${args.runId} has committed ${facts.committedPhases} of ${activePhases.length} active phase(s) — no phase to run`,
    );
  }

  const tier = (MODEL_TIERS as readonly string[]).includes(facts.modelTier) ? (facts.modelTier as ModelTier) : undefined;
  const maxUsdPerRun = args.maxUsdPerRun ?? DEFAULT_MAX_USD_PER_RUN;
  const maxBudgetUsd = Math.max(0.5, round2(phase.budgetShare * maxUsdPerRun));

  // P1.10 / REQ-WF-5 — when this phase's step row was RESET by a back-edge (failStep marked it
  // `state='reset'` with `{reset:'replan', fromPhase, reason}`), the re-run gets the failing phase's
  // report as the `replan` input — the plan re-runs WITH the grounding failure as context, never a
  // blind retry. The marker clears on commit (the upsert overwrites the row).
  const resetStep = await deps.txRunner.run(args.workspaceId, async (tx) =>
    (
      await tx.query("select state, result from steps where run_id = $1 and ordinal = $2", [
        args.runId,
        phase.index,
      ])
    ).rows[0] as { state: string; result: { reset?: string; fromPhase?: string; reason?: string } | null } | undefined,
  );
  const replanInput =
    resetStep?.state === "reset" && resetStep.result?.reset === "replan"
      ? {
          replan: {
            fromPhase: resetStep.result.fromPhase ?? "",
            reason: resetStep.result.reason ?? "",
            count: facts.replans,
          },
        }
      : {};

  // Guidance delivery at the phase boundary (§6.5; REQ-GATE-9/10/11; REQ-RUN-7/18 — PRB.16b F16):
  // `consumeGuidance` renders the dated/sourced list AND marks `consumed_by` + emits
  // `guidance.delivered` — but it had NO caller, so standing/run-scope guidance (e.g. the pretriage
  // "actor:user rows are authoritative" note captured at run creation) was recorded yet never reached
  // the pod. The runspec is fetched once per phase boundary — the delivery point the contract names.
  // `context: phase.key` routes independence phases (`second_read`, `fidelity_audit`, `gap_check`,
  // `gap_analysis`) to the REQ-RUN-18 exclusion. Frozen `inputs.guidance` (creation-time seed) merges
  // AFTER the delivered list — delivery is the higher-precedence channel (§6.5).
  const delivered = facts.projectId != null
    ? await consumeGuidance(deps, {
        runId: args.runId,
        workspaceId: args.workspaceId,
        projectId: facts.projectId,
        workflow,
        phase: phase.key,
        context: phase.key,
      })
    : { rendered: "", delivered: [] };

  // frozen run inputs win over the manifest defaults; `phase` pins the one skill phase to run (REQ-SPEC-13).
  // `phase_output` names the exact artifact(s) this phase must write, taken from the manifest so the agent's
  // write target can never drift from the completion oracle's predicate (residue 1, diagnosed live P0.15g: the
  // single-phase craft invocation produced no `04-craft-notes.md`). Phase-derived, so it wins over any frozen
  // input, exactly as `phase` does.
  // `sidecar_output`/`sidecar_contract` do the same for the phase's DECLARED sidecars (PRB.16b F15): the
  // ported skills' docs only say a `sidecar: true` input "emits the structured-output twin to
  // `.rhema/<name>.json`" — the required envelope (`entries`, not `rows`, …) was never in the prompt, so a
  // live Revise agent guessed the shape and failed `sidecar_validates` on every attempt (run `01M2SH38…`).
  // The contract hint rides the `key=value` input lines straight into the phase prompt (attempt 1 sees it).
  const inputs: Record<string, unknown> = {
    ...(manifest.defaultInputs ?? {}),
    ...hyd.inputs,
    ...replanInput,
    phase: phase.skillPhase,
    // PRB.16b F23 — the ported skill's declared args are `persona` + `personas_dir` (SKILL.md
    // frontmatter); the frozen inputs only carried `personaId`, and `conventions/personas.md` — the
    // file that pins the sandbox layout — is NOT shipped in the pod's skillsDir (`/app/skills`
    // holds the three skill dirs only). The live Quick Voice census agent never resolved the corpus
    // and exited `success` twice with zero output (run 01M2T65W5PZ3174FPVFNQRVKZS attempt-1). Pin
    // the args the skill declares + the ABSOLUTE personas_dir the harness materializes into (the
    // same resolveSeatRoots derivation the hook policy + materializer use — never a parallel path).
    ...(hyd.personaId
      ? {
          persona: hyd.personaId,
          personas_dir: resolveSeatRoots({ personaId: hyd.personaId }).persona.replace(
            /\/[^/]+$/,
            "",
          ),
        }
      : {}),
    // P1.13 — the Figure skill's declared snake_case args bound from the run's frozen camelCase
    // inputs (the same explicit-mapping shape as the persona block): `figure_id`/`entry_point`/
    // `request`/`source_refs`/`prior_version` ride the frozen inputs verbatim; `figure_dir` +
    // `work_dir` are DERIVED server-side (the asset directory the grant covers + the seat's per-run
    // working dir) — the pod never names its own asset path.
    ...(hyd.workflow === "figure"
      ? {
          figure_id: hyd.inputs.figureId,
          figure_dir:
            typeof hyd.inputs.figureId === "string" ? `assets/figures/${hyd.inputs.figureId}/` : undefined,
          work_dir: `agents/author/figures/${args.runId}/`,
          entry_point: hyd.inputs.entryPoint,
          request: hyd.inputs.request,
          spec_kind: hyd.inputs.specKind,
          source_refs: hyd.inputs.sourceRefs,
          prior_version: hyd.inputs.priorVersion,
        }
      : {}),
    // delivered guidance lands FIRST (highest precedence), then any frozen `inputs.guidance` seed.
    ...(delivered.rendered
      ? {
          guidance:
            delivered.rendered + (typeof hyd.inputs.guidance === "string" ? `\n${hyd.inputs.guidance}` : ""),
        }
      : {}),
    ...(phase.artifacts.length > 0
      ? {
          // P1.11 — the `<run>` placeholder in a declared artifact (the assistant's per-run burst
          // directory `agents/assistant/research/burst-<runId>/`) resolves to THIS run's id so the
          // prompt names concrete paths, never a template the agent must guess. P1.12 — `<slug>`
          // resolves to the frozen `inputs.outlineSlug` (the same value `declaredWritableArtifacts`
          // expanded at hydration, so grant and prompt name the same concrete path).
          phase_output: phase.artifacts
            .map((a) =>
              a
                .replaceAll("<run>", args.runId)
                .replaceAll("<slug>", typeof hyd.inputs.outlineSlug === "string" ? hyd.inputs.outlineSlug : "outline")
                // P1.13 — `<fig>` resolves to the run's figure id (the same server-minted value
                // `declaredWritableArtifacts` expanded at hydration, so grant and prompt agree).
                .replaceAll("<fig>", typeof hyd.inputs.figureId === "string" ? hyd.inputs.figureId : "<fig>"),
            )
            .join(", "),
        }
      : {}),
    ...(phase.sidecars.length > 0
      ? {
          sidecar_output: phase.sidecars.join(", "),
          sidecar_contract: phase.sidecars
            .map((s) => `${s} must be: ${SIDECAR_CONTRACT_HINTS[s as SidecarFilename] ?? "the registered schema for this filename"}`)
            .join("\n"),
        }
      : {}),
    // F15 follow-on (live attempt 5): the SAME invisible-contract class hid `.rhema/phase-result.json`'s
    // status enum — the skill docs say `{status}` with no value, so the live agent wrote "success" and only
    // the oracle's non-blocked/non-replan fall-through saved leg (b). Pin the enum + the seat-aware location
    // explicitly. DEF.1 (F1): this is UNCONDITIONAL now — the oracle's leg (b) requires the file on EVERY
    // phase regardless of `sidecar`, and a run whose inputs lacked `sidecar: true` (profile_voice's
    // `defaultInputs` carry only `{mode}`) emitted no phase-result at all under the ported skill's
    // "sidecar gates the write" text — the STB.3 profile-voice F1 kill. The file is harness control-plane
    // contract, not a model option, so `sidecar` is pinned true like `phase` is (the skill's structured
    // `.json` twins remain gated on the phase's declared `sidecars`, unaffected).
    sidecar: true,
    // PRB.19 (live F34) — pin the WRITABLE location too: the bare `.rhema/…` path resolves cwd-relative
    // to the project root, which the §12.6 seat table denies — the live Revise bootstrap agent's literal
    // `Write /work/project/.rhema/phase-result.json` was hook-denied and the phase failed on a missing
    // phase-result despite sdk=success (run 01M2VDHN… att-2). The seat dir `agents/<seat>/.rhema/` is
    // writable AND suffix-resolves for the oracle.
    // DEF.1 (F1) — the persona builder has NO project mount (§12.6): `agents/persona_builder/.rhema/`
    // does not exist for it. Its `.rhema/` lives under the persona root (`/work/personas/<id>/.rhema/`),
    // the same derivation as the `personas_dir` input; that mount is readwrite for the seat. The live
    // profile-voice run's phase-result write was denied there before the mount row landed (STB.3).
    phase_result_contract:
      seat === "persona_builder"
        ? `.rhema/phase-result.json must be {"status":"done"} when the phase completed its declared outputs — "done" exactly, not "success" ("blocked"|"replan" only for those self-reports). Write it at the persona root as ${resolveSeatRoots({ personaId: hyd.personaId ?? undefined }).persona}/.rhema/phase-result.json — the persona root's .rhema/ is your writable harness-control area (profile/ is the deliverable tree; the project root is unmounted for your seat).`
        : `.rhema/phase-result.json must be {"status":"done"} when the phase completed its declared outputs — "done" exactly, not "success" ("blocked"|"replan" only for those self-reports). Write it under your writable seat directory as agents/${seat}/.rhema/phase-result.json (likewise agents/${seat}/.rhema/<sidecar>.json for sidecars) — the project root is read-only for your seat.`,
    // PRB.24 — the intra-phase transcript bound, shape layer. A research-class phase that fans out
    // (`allowsSubagents` — verification, discourse) otherwise runs the WHOLE per-claim loop inside ONE
    // session context: every Messages request resends the accumulated transcript, so cost is
    // super-linear in the number of items (the verify run measured ~40 requests averaging ~60K
    // cache-read tokens each — ~347 uncommitted credits — before `cap_reached`). Each Agent-tool
    // invocation IS a fresh isolated session, so this contract steers the seat to delegate research to
    // `researcher` subagents in bounded batches: each subagent verifies ONLY its assigned items, keeps
    // its own (bounded) context, and returns a COMPACT verdict list — the seat assembles the ledger
    // from returned verdicts and writes the dossier incrementally, so neither the seat's nor any
    // subagent's transcript can grow past one batch. `TRANSCRIPT_COMPACTION_WINDOW_TOKENS`
    // (`options.settings.autoCompactWindow`) is the hard ceiling underneath this instruction.
    ...(phase.allowsSubagents
      ? {
          research_fanout:
            "Context contract (PRB.24): do NOT run one long research session over the whole claim/topic inventory — every request resends the full session transcript. Fan research out to `researcher` subagents in bounded batches of at most 5 items each. A researcher verifies ONLY its assigned items and returns a compact verdict list (item → verdict → retrieved source URLs) — never pasted page text. Assemble the ledger/report rows yourself from the returned verdicts and write the dossier file incrementally as each batch returns; if a subagent's batch stalls, re-delegate the remaining items in a fresh batch rather than continuing in your own context.",
        }
      : {}),
    // DEF.1 Stage-B (live rerun 01M3E8F8…, draft attempts 1–5): the ported skill names the ledger's
    // canonical layout in `references/draft-ledger.md`, but that file lived at `/app/skills/…` —
    // outside every §12.6 mount root — so the model's Read escape-denied and it improvised a prose
    // ledger `draftedSectionCount` reads as ZERO (draft_sections_eq_plan failed on every attempt).
    // The skills mount grant makes the reference readable; this input line points the model at the
    // exact path up front so it never has to discover it, and names the parser's hard contract.
    ...(hyd.workflow === "draft" && phase.key === "draft"
      ? {
          draft_ledger_contract:
            "Before writing 04-draft-ledger.md, READ the canonical format at /app/skills/draft-from-outline/references/draft-ledger.md (readable; mounted for your seat). Its required shape is a `## Sections` table with these columns: | # | Section | Function (from plan) | Budget | Actual | Status | Claim rows used | Deviation | — one row per plan section, Status ∈ drafted|seams-read|verified. Prose headings/bullets do NOT parse and fail the phase predicate.",
        }
      : {}),
  };

  // P1.21 (REQ-WF-8/REQ-GENRE-6) — a Memo run's `user_sources[]` reach the prompt as a name→path index
  // ONLY: the text mounts as read-only `user_sources/NN-name.md` files at hydration; the bytes (and the
  // source URLs) never ride a prompt input line. Verdicts cite the source by NAME
  // (`verified_against_user_source`); fetches to the source domains are denied by the frozen URL policy.
  const mountedSources = userSourceMounts(hyd.inputs.user_sources);
  if (mountedSources.length > 0) {
    inputs.user_sources = mountedSources.map((s) => ({ name: s.name, path: s.path }));
  }

  // P1.14 — the run's REAL URL policy: persona builds carry hold-outs + the calibrator allow-list +
  // fetcher-only egress; everything else keeps the empty policy (§12.6).
  const runUrlPolicy = urlPolicyForRun(hyd.inputs);

  const request: PhaseRequest = {
    runId: args.runId,
    attempt: args.attempt,
    cwd: "/work/project",
    phase,
    ordinal: phase.index,
    of: manifest.phases.length,
    skill: manifest.skill,
    inputs,
    seat,
    maxBudgetUsd,
    maxTurns: DEFAULT_MAX_TURNS,
    urlPolicy: runUrlPolicy,
  };

  const hookPolicyInput: HookPolicyInput = {
    seat,
    ...(hyd.personaId ? { personaId: hyd.personaId } : {}),
    tools: facts.tools,
    urlPolicy: runUrlPolicy,
    phase: { key: phase.key, phaseClass: phase.phaseClass, allowsSubagents: phase.allowsSubagents },
    runId: args.runId,
    agentLabel: seat,
    ...(hyd.writablePaths.length > 0 ? { writableArtifacts: hyd.writablePaths } : {}),
  };

  // delivery facts — for a draft-targeting run whose RESOLVED base has a promoted head to freeze at. The base
  // is server-resolved in `hydration` (PRB.19 / F26a): a Review's `inputs.draftId`, a Revise's
  // `manualRevision.baseDraftId` → working head → `priorReviewId`'s reviewed draft. A run with no draft (or an
  // un-promoted draft) delivers nothing here; the loop finalizes without a dossier POST.
  // P1.10 — a Draft run is the exception: it has no base to freeze (it AUTHORS the draft), so the gate is the
  // frozen `nextDraftId`/`nextDraftN` the creation route reserved; the delivery transaction creates the
  // born-frozen `drafted_from_outline` row at `drafts/v{nextDraftN}.md`.
  const isDraftDelivery =
    workflow === "draft" &&
    facts.projectId != null &&
    typeof hyd.inputs.nextDraftId === "string" &&
    typeof hyd.inputs.nextDraftN === "number";
  const delivery: DeliveryFacts | undefined = isDraftDelivery
    ? {
        projectId: facts.projectId!,
        draftId: hyd.inputs.nextDraftId as string,
        correspondenceKind: "drafting_note",
        newDraftId: hyd.inputs.nextDraftId as string,
        newDraftN: hyd.inputs.nextDraftN as number,
        ...(facts.protocolId != null ? { protocolId: facts.protocolId } : {}),
        ...(facts.protocolVersion != null ? { protocolVersion: facts.protocolVersion } : {}),
      }
    : facts.projectId && hyd.deliveryBase?.promotedVersionId
      ? {
          projectId: facts.projectId,
          draftId: hyd.deliveryBase.id,
          correspondenceKind: CORRESPONDENCE_KIND_BY_WORKFLOW[workflow] ?? "review",
          ...(facts.protocolId != null ? { protocolId: facts.protocolId } : {}),
          ...(facts.protocolVersion != null ? { protocolVersion: facts.protocolVersion } : {}),
          draftPromotedVersionId: hyd.deliveryBase.promotedVersionId,
          // PRB.06: the re-review/response links are frozen inputs the server seeded at creation — the
          // harness folds them verbatim; the api's deliver route re-resolves them as the attestation fact.
          ...(typeof hyd.inputs.priorReviewId === "string" ? { priorReviewId: hyd.inputs.priorReviewId } : {}),
          ...(typeof hyd.inputs.nextDraftId === "string" ? { newDraftId: hyd.inputs.nextDraftId } : {}),
        }
      : undefined;

  // DEF.1 / D-P0.15h-5 — the `second_read_producer_checked` phase is produced by an orchestrator-launched
  // INPUT-SCOPED query (§12.6), never by the parent Editor (the hook's judge-class `Agent` deny is correct and
  // stays). Here the server mints the producer id, records the launch (`subagent_launches` — the delivery
  // `checkSecondReadProducer` row + the §12.6 attestation source), and ships the launch order on the spec; the
  // harness executes `scoped-query` against a private namespace holding ONLY the reviewed draft and stamps
  // `.rhema/second-read.json` itself. Enumerated files = the draft the run reviews — "the second read
  // received the draft only" (review 13 F13). No mounted draft ⇒ no launch order ⇒ the predicate still fails
  // honestly (a scoped read over nothing is a bug, not a phase).
  let scopedLaunch: ScopedPhaseLaunch | undefined;
  const secondReadPred = phase.completionPredicates?.find((p) => p.kind === "second_read_producer_checked");
  if (secondReadPred?.kind === "second_read_producer_checked") {
    // the reviewed draft's mount path: the delivery base's canonical `drafts/vN.md`, else the manifest's
    // `kind:'draft'` entry. The `entries.some` guard refuses a launch with nothing mounted (§12.6 — a
    // scoped read over an empty set is a bug, not a phase; the predicate then still fails honestly).
    const draftPath =
      (hyd.deliveryBase?.n != null ? `drafts/v${hyd.deliveryBase.n}.md` : undefined) ??
      hyd.manifest.entries.find((e) => e.kind === "draft")?.path;
    if (draftPath && hyd.manifest.entries.some((e) => e.path === draftPath)) {
      const producerQueryId = deps.ids("qry");
      // the manifest paths are project-root-relative; the scoped query reads them at their materialized
      // absolute location under the project root (the same root `request.cwd` names).
      const roots = resolveSeatRoots({ personaId: hyd.personaId ?? undefined });
      const model = mainModelForTier(tier ?? "base");
      await deps.txRunner.run(args.workspaceId, (tx) =>
        recordSubagentLaunch(tx, { ids: deps.ids, clock: deps.clock }, {
          runId: args.runId,
          attempt: args.attempt,
          label: "second-reader",
          model,
          inputsKind: "explicit_files",
          inputPaths: [draftPath],
          producerQueryId,
        }),
      );
      const artifactBase = secondReadPred.artifact;
      scopedLaunch = {
        role: "second-reader",
        producerQueryId,
        files: [`${roots.project}/${draftPath}`],
        prompt: SECOND_READ_PROMPT,
        outputPath: `agents/${seat}/${artifactBase}`,
        markerPath: `agents/${seat}/.rhema/second-read.json`,
        model,
        maxBudgetUsd,
        maxTurns: DEFAULT_MAX_TURNS,
      };
    }
  }

  return {
    request,
    skillsDir: args.skillsDir ?? DEFAULT_SKILLS_DIR,
    ...(tier ? { tier } : {}),
    manifest: hyd.manifest,
    serverFiles: hyd.serverFiles,
    hookPolicyInput,
    writablePaths: hyd.writablePaths,
    // a user-pinned phase (frozen input, before the merge above) makes this a one-phase run that stops after
    // committing (REQ-SPEC-13); a normal run has no pin and advances/gates/finalizes through the loop.
    ...(pinnedSkillPhase ? { stopAfterPhase: true } : {}),
    ...(delivery ? { delivery } : {}),
    ...(gatePolicy ? { gatePolicy } : {}),
    ...(scopedLaunch ? { scopedLaunch } : {}),
  };
}
