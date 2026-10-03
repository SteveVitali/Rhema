import type { WorkflowManifest } from "../src/manifest-types.js";

// Chat turn (§7.1; P1.11) — one Assistant turn as a `chat_turn` run: one provenance, one cost meter,
// events on the project feed. A single `answer` phase on the assistant seat under the compiled seat
// policy: writes only agents/assistant/**, reads the shared record + preferences.md + frozen author
// ledgers, never drafts/correspondence. No gate — the plan card IS the consent (§7.1), and the run's
// per-turn budgets (40 cr / 5 searches / 10 fetches) are enforced on metered usage, not model text.
// The reply itself is a chat event, not an artifact — the phase's durable output is the
// `turn-result.json` sidecar (the typed outcome: status + replySummary + counters + refs).

export const chatTurn: WorkflowManifest = {
  workflow: "chat_turn",
  skill: "chat-turn",
  // `sidecar: true` (PRB.16b F15): the turn's oracle requires the `.rhema/` twin.
  defaultInputs: { sidecar: true },
  phases: [
    {
      key: "answer",
      index: 0,
      label: "Answering",
      skillPhase: "0",
      seat: "assistant",
      artifacts: [],
      predicates: ["turn-result.json validates", "within the consented per-turn budgets"],
      sidecars: ["turn-result.json"],
      phaseClass: "generate",
      budgetShare: 1,
      allowsSubagents: false,
      completionPredicates: [{ kind: "sidecar_validates", sidecar: "turn-result.json" }],
    },
  ],
};
