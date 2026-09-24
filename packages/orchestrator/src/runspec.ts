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
import type { MirrorManifest } from "@rhema/mirror";
import { EMPTY_URL_POLICY, resolveSeatRoots, type PhasePolicy, type UrlPolicy } from "@rhema/hooks";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { OrchestratorDeps } from "./internal-api.js";
import { hydration } from "./internal-api.js";
import { consumeGuidance } from "./guidance.js";
import { loadGatePolicyFacts, type GatePolicyFacts } from "./gate-policy.js";

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
  readonly roots?: { readonly project?: string; readonly persona?: string };
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
}

/** The server-side delivery facts the harness folds into the final `DeliveryArgs` (P0.15e). */
export interface DeliveryFacts {
  readonly projectId: string;
  readonly draftId: string;
  readonly correspondenceKind: CorrespondenceKind;
  /** the reviewed draft's promoted head version to freeze at (a frozen draft requires a promoted version). */
  readonly draftPromotedVersionId: string;
  readonly protocolId?: string;
  readonly protocolVersion?: number;
  /** PRB.06: the review a `response`/re-review answers (`prior_review_id`) — from the run's frozen inputs. */
  readonly priorReviewId?: string;
  /** PRB.06: the v(N+1) draft row a `response` delivery creates (the run's reserved `nextDraftId`). */
  readonly newDraftId?: string;
}

/** The correspondence kind each workflow delivers (drives `correspondence_items.kind`); default `review`. */
const CORRESPONDENCE_KIND_BY_WORKFLOW: Partial<Record<WorkflowKey, CorrespondenceKind>> = {
  review: "review",
  fact_check: "review",
  revise: "response",
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The hook's URL policy (§12.6: persona hold-outs, user exclusions, the calibrator allow-after-prediction) is a
// DIFFERENT concern from the proxy's domain allowlist (`proxy_allowlists.url_policy`, a `ProxyUrlPolicyData` of
// blocked/known domains — the proxy is the enforcer of record, defense-in-depth). Deriving the real hook URL
// policy (a run's persona hold-out URLs + user exclusions) is a §12.6 concern the first green phase-0 Review does
// not exercise (intake is judge-class — no fetch). Use the empty policy here; wiring the real hold-out policy is
// a follow-on (it belongs with the persona-holdout / calibrator subagent path, not this assembler).
const HOOK_URL_POLICY: UrlPolicy = EMPTY_URL_POLICY;

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
    const runRow = (await tx.query("select model_tier, project_id from runs where id = $1", [args.runId])).rows[0] as
      | { model_tier: string; project_id: string | null }
      | undefined;
    if (!runRow) throw new Error(`buildHarnessRunSpec: run ${args.runId} not found`);
    const at = (await tx.query("select tools from agent_types where key = $1", [seat])).rows[0] as
      | { tools: string[] }
      | undefined;
    const done = (
      await tx.query("select count(distinct ordinal)::int as n from steps where run_id = $1 and state = 'done'", [args.runId])
    ).rows[0] as { n: number };
    return {
      modelTier: runRow.model_tier,
      tools: at?.tools ?? [],
      committedPhases: done.n,
      projectId: runRow.project_id,
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
    // delivered guidance lands FIRST (highest precedence), then any frozen `inputs.guidance` seed.
    ...(delivered.rendered
      ? {
          guidance:
            delivered.rendered + (typeof hyd.inputs.guidance === "string" ? `\n${hyd.inputs.guidance}` : ""),
        }
      : {}),
    ...(phase.artifacts.length > 0 ? { phase_output: phase.artifacts.join(", ") } : {}),
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
    // the oracle's non-blocked/non-replan fall-through saved leg (b). Pin the enum explicitly whenever the
    // `sidecar` input (manifest default or frozen override) is what makes the skill write the file.
    ...((hyd.inputs.sidecar ?? manifest.defaultInputs?.sidecar) === true
      ? {
          // PRB.19 (live F34) — pin the WRITABLE location too: the bare `.rhema/…` path resolves cwd-relative
          // to the project root, which the §12.6 seat table denies — the live Revise bootstrap agent's literal
          // `Write /work/project/.rhema/phase-result.json` was hook-denied and the phase failed on a missing
          // phase-result despite sdk=success (run 01M2VDHN… att-2). The seat dir `agents/<seat>/.rhema/` is
          // writable AND suffix-resolves for the oracle.
          phase_result_contract:
            `.rhema/phase-result.json must be {"status":"done"} when the phase completed its declared outputs — "done" exactly, not "success" ("blocked"|"replan" only for those self-reports). Write it under your writable seat directory as agents/${seat}/.rhema/phase-result.json (likewise agents/${seat}/.rhema/<sidecar>.json for sidecars) — the project root is read-only for your seat.`,
        }
      : {}),
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
  };

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
    urlPolicy: HOOK_URL_POLICY,
  };

  const hookPolicyInput: HookPolicyInput = {
    seat,
    ...(hyd.personaId ? { personaId: hyd.personaId } : {}),
    tools: facts.tools,
    urlPolicy: HOOK_URL_POLICY,
    phase: { key: phase.key, phaseClass: phase.phaseClass, allowsSubagents: phase.allowsSubagents },
    runId: args.runId,
    agentLabel: seat,
    ...(hyd.writablePaths.length > 0 ? { writableArtifacts: hyd.writablePaths } : {}),
  };

  // delivery facts — for a draft-targeting run whose RESOLVED base has a promoted head to freeze at. The base
  // is server-resolved in `hydration` (PRB.19 / F26a): a Review's `inputs.draftId`, a Revise's
  // `manualRevision.baseDraftId` → working head → `priorReviewId`'s reviewed draft. A run with no draft (or an
  // un-promoted draft) delivers nothing here; the loop finalizes without a dossier POST.
  const delivery: DeliveryFacts | undefined =
    facts.projectId && hyd.deliveryBase?.promotedVersionId
      ? {
          projectId: facts.projectId,
          draftId: hyd.deliveryBase.id,
          correspondenceKind: CORRESPONDENCE_KIND_BY_WORKFLOW[workflow] ?? "review",
          draftPromotedVersionId: hyd.deliveryBase.promotedVersionId,
          // PRB.06: the re-review/response links are frozen inputs the server seeded at creation — the
          // harness folds them verbatim; the api's deliver route re-resolves them as the attestation fact.
          ...(typeof hyd.inputs.priorReviewId === "string" ? { priorReviewId: hyd.inputs.priorReviewId } : {}),
          ...(typeof hyd.inputs.nextDraftId === "string" ? { newDraftId: hyd.inputs.nextDraftId } : {}),
        }
      : undefined;

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
  };
}
