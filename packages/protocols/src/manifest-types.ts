import type { Rigor, AgentTypeKey, WorkflowKey } from "@rhema/contracts";

// Phase-manifest types (§12.2). The public stub (`packages/protocols-stub`) declares the same shape;
// this private package is the authority for the field vocabulary (ticket P0.03 "owns the manifest
// field vocabulary"). The types here are a superset of the stub's: the stub is what a public clone and
// the `public-safe` job build against, so every field a consumer (engine/run-task) reads must also
// exist in the stub — the extra `completionPredicates`/`skill`/`defaultInputs`/`workflowKey` are only
// read by the private orchestrator, so they live here without breaking the stub build.

/** Phase class routing category (§12.2 / §12.3). Research phases fan out subagents; the rest do not. */
export type PhaseClass = "research" | "judge" | "generate" | "package";

/**
 * The per-artifact completion predicate as DATA the orchestrator evaluates (REQ-ARCH-6; REQ-SPEC-13's
 * data half) — the (c) leg of the completion oracle (§12.2). Each phase's `predicates` carries the
 * human-readable labels (the stub-parity field the manifest↔SKILL contract test extracts in P0.04);
 * `completionPredicates` carries the machine-evaluable form.
 */
export type CompletionPredicate =
  | { kind: "artifact_present"; artifact: string }
  | { kind: "artifact_nonempty"; artifact: string }
  /** claim-ledger rows ≥ the Phase-0 claim inventory count (or an explicit "N of N checked" footer). */
  | { kind: "claim_rows_gte_inventory"; artifact: string }
  /** the editor's letter has every required section. */
  | { kind: "letter_sections_complete"; artifact: string }
  /** the rubric scores all eight dimensions (never an aggregate — REQ-IDE-30). */
  | { kind: "rubric_dimensions_complete"; artifact: string; count: number }
  /** the second read is non-empty and produced by the orchestrator-launched input-scoped query. */
  | { kind: "second_read_producer_checked"; artifact: string }
  /** the response ledger has one disposition row per review finding. */
  | { kind: "response_ledger_one_row_per_finding"; artifact: string }
  /** the draft's section count equals the plan's section count. */
  | { kind: "draft_sections_eq_plan"; artifact: string }
  /** the structure plan's spine has at least `min` claims. */
  | { kind: "spine_min"; artifact: string; min: number }
  /** P1.12 — the outline sidecar's spine holds `min`–`max` claim ids (§12.2's 5–12 bound). */
  | { kind: "outline_spine_bound"; artifact: string; min: number; max: number }
  /** the thesis and the claim inventory are both present (Phase-0 piece brief). */
  | { kind: "thesis_and_inventory_present"; artifact: string }
  /** the sidecar validates against its P0.02 zod schema (`sidecar: true` runs). */
  | { kind: "sidecar_validates"; sidecar: string };

/** A single phase in a workflow manifest (the §12.2 shape). */
export interface PhaseManifest {
  key: string;
  /** execution order; equals the skill's own fallback order (AC2). */
  index: number;
  label: string;
  /** the skill's native phase number (Review's fallback maps index→skillPhase 0,4,1,2,5,3,6). */
  skillPhase: string;
  seat: AgentTypeKey;
  artifacts: string[];
  /** human-readable predicate labels (stub-parity; P0.04's contract test extracts these). */
  predicates: string[];
  sidecars: string[];
  gateAfter?: string;
  /** the declared artifact (vN templates allowed) whose produced version a `gateAfter` gate binds
   *  (`gates.artifact_version_id`) — the gate card + write-back overlay read it (PRB.16b F19). */
  gateArtifact?: string;
  optional?: Rigor;
  /** the SKILL.md frontmatter opt-out flag that disables this phase (REQ-SPEC-22 contract test extracts
   *  these and asserts equality with the skill's `Default true. Run Phase …` inputs). */
  optOutFlag?: string;
  phaseClass: PhaseClass;
  parallelGroup?: string;
  maxIterations?: number;
  budgetShare: number;
  backEdges?: string[];
  allowsSubagents: boolean;
  /** machine-evaluable completion predicates (REQ-ARCH-6; REQ-SPEC-13 data half). */
  completionPredicates?: CompletionPredicate[];
}

/** A workflow's ordered phases plus which ported skill runs them and its default harness inputs. */
export interface WorkflowManifest {
  workflow: WorkflowKey;
  /** the ported skill this workflow drives — its `SKILL.md` directory name. */
  skill: string;
  /** default harness inputs the orchestrator passes (e.g. Fact-check's `scope`; REQ-WF-13). */
  defaultInputs?: Record<string, string | number | boolean>;
  phases: PhaseManifest[];
}
