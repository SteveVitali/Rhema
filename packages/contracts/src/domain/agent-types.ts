import type { AgentTypeKey } from "../vocab.js";
import type { ModelTier } from "../vocab.js";
import type { WorkflowKey } from "../enums.js";

// Agent-type configuration (§7.1; ticket P1.11). The `agent_types` DB row is the seeded half (namespace
// tokens + tool list + model profile); this is the typed config a seat's rows are checked against —
// reads/writes/denies at the path-glob granularity the §7.1 table speaks, the tool vocabulary, the
// thread default tier, and the hard per-turn budgets. `ASSISTANT_AGENT_TYPE` is the §7.1 Assistant row
// verbatim; the code-seed `agent_types` row and the seat-policy contract tests key off it, so the spec
// numbers (≤40 cr / ≤5 searches / ≤10 fetches per turn; Base thread default) live in exactly one place.

/** A per-seat tool + mount + budget configuration (§7.1's row shape). */
export interface AgentTypeConfig {
  /** The seat key (`agent_types.key`). */
  readonly key: AgentTypeKey;
  /** Project/persona path globs the seat may read (§12.6 table granularity). */
  readonly reads: readonly string[];
  /** Path globs the seat may write. */
  readonly writes: readonly string[];
  /** Paths the seat may NEVER reach (the §7.1 Denies column) — checked even when a broader read would match. */
  readonly denies: readonly string[];
  /** The seat's permitted tool tokens (§7.1 Tools column; the `agent_types.tools` row). */
  readonly tools: readonly string[];
  /** Workflows this seat runs (`SEAT_BY_WORKFLOW` in the orchestrator mirrors this). */
  readonly workflows: readonly WorkflowKey[];
  /** The model tier a thread/run on this seat defaults to (§7.1: Assistant threads default Base). */
  readonly defaultThreadTier: ModelTier;
  /** Hard per-turn budgets (§7.1: "Hard per-turn budgets: ≤40 credits, ≤5 searches, ≤10 fetches"). */
  readonly perTurnCredits: number;
  readonly perTurnSearches: number;
  readonly perTurnFetches: number;
}

// ---- §7.1 Assistant row, verbatim values ----

/** The Assistant's tool list (§7.1): preparatory tools return run sheets, never create runs (REQ-CHAT-6). */
export const ASSISTANT_TOOLS = [
  "search",
  "fetch",
  "read_artifact",
  "start_workflow",
  "propose_outline",
  "visualize",
  "elicit",
  "measure",
  "attach",
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];

/**
 * The preparatory-tool subset (REQ-CHAT-6): these tools produce a run SHEET (the payload the user
 * approves in the P1.06 sheet) — they never create a run themselves. `search`/`fetch`/`read_artifact`/
 * `attach` act in-turn; the rest are sheet-producing or run-spawning-through-the-sheet.
 */
export const ASSISTANT_PREPARATORY_TOOLS = [
  "start_workflow",
  "propose_outline",
  "visualize",
  "elicit",
  "measure",
] as const;

/** The §7.1 per-turn hard budgets. */
export const ASSISTANT_TURN_BUDGET = {
  credits: 40,
  searches: 5,
  fetches: 10,
} as const;

/** §7.1: every project carries an undeletable default thread named exactly this. */
export const DEFAULT_THREAD_NAME = "Project chat";

/** §7.1: pins per thread are capped; each pin carries a ≤300-token summary. */
export const PINS_MAX_PER_THREAD = 12;
export const PIN_SUMMARY_TOKEN_CAP = 300;

/** §7.1: the compaction brief is capped at 600 words and re-injected after compact. */
export const BRIEF_MAX_WORDS = 600;

/** The §7.1 Assistant row as an `AgentTypeConfig` — the single source for the seed row + contract tests. */
export const ASSISTANT_AGENT_TYPE: AgentTypeConfig = {
  key: "assistant",
  // §7.1 Reads: shared project records, preferences.md (REQ-OBJ-10's Assistant clause), the assistant
  // namespace, the author seat's FROZEN ledgers only (the narrowed Assistant↔Drafter departure), the
  // persona profile subset the seat table grants.
  reads: [
    "manifest.md",
    "drafts/**",
    "assets/**",
    "correspondence/**",
    "preferences.md",
    "agents/assistant/**",
    "agents/author/ledgers/**",
  ],
  // §7.1 Writes: the assistant namespace only — threads, source notes, research output.
  writes: ["agents/assistant/**"],
  // §7.1 Denies (read): the assistant never reaches the Editor's or persona builder's namespaces, the
  // author seat outside its frozen ledgers (`agents/author/ledgers/**` is the declared read exception —
  // a deny glob must not swallow it), or the persona hold-out. Drafts/correspondence are SHARED reads,
  // never denied; the write boundary is `writes` alone.
  denies: [
    "agents/author/**",
    "!agents/author/ledgers/**",
    "agents/editor/**",
    "agents/persona_builder/**",
    "HOLDOUT-*",
  ],
  tools: ASSISTANT_TOOLS,
  workflows: ["chat_turn", "research_burst", "outline"],
  defaultThreadTier: "base",
  perTurnCredits: ASSISTANT_TURN_BUDGET.credits,
  perTurnSearches: ASSISTANT_TURN_BUDGET.searches,
  perTurnFetches: ASSISTANT_TURN_BUDGET.fetches,
};
