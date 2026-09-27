import type { StatementFacts } from "./facts.js";

// The generated half of the AI-use statement (§8.4 REQ-VIS-10; REQ-POS-6 general template; REQ-GENRE-5's
// per-protocol generator — the Academic ICMJE template is P1.21, so every beta protocol renders 'general').
// Every sentence is derived verbatim from StatementFacts rows — the statement never invents, rounds, or
// summarizes beyond the record. Authorship-legibility framing only (REQ-POS-13): it says what ran and what
// the human did, never anything about "detection".

/** The template the project renders under. Beta: 'general' for every protocol (Essay's template per
 *  REQ-POS-6); the Academic ICMJE template is a P1.21 deliverable. */
export type StatementTemplate = "general";

export function templateForProtocol(protocolId: string | null): StatementTemplate {
  // 'academic' will select the ICMJE variant at P1.21; at beta every protocol renders the general template.
  void protocolId;
  return "general";
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** "2 review, 1 revise" — workflow keys verbatim, count first, in first-seen order. */
function workflowCounts(facts: StatementFacts): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const r of facts.runs) {
    if (!counts.has(r.workflow)) order.push(r.workflow);
    counts.set(r.workflow, (counts.get(r.workflow) ?? 0) + 1);
  }
  return order.map((w) => `${counts.get(w)} ${w}`).join(", ");
}

/**
 * The generated sentences for the facts (general template). Each element is one complete sentence; the
 * caller composes them into the statement document. Order is fixed: intro → runs → tiers → phases →
 * approvals → human revisions → obligations.
 */
export function generatedSentences(
  facts: StatementFacts,
  counts: { openObligations: number; blockingOpen: number },
): string[] {
  const sentences: string[] = [
    "This manuscript was prepared in Rhēma, an editorial-review environment that runs editorial workflows on the text.",
  ];

  if (facts.runs.length > 0) {
    const first = day(facts.runs[0]!.createdAt);
    const last = day(facts.runs[facts.runs.length - 1]!.createdAt);
    const span = first === last ? `on ${first}` : `between ${first} and ${last}`;
    sentences.push(
      `Rhēma ran ${facts.runs.length} ${plural(facts.runs.length, "editorial workflow", "editorial workflows")} on the manuscript ${span}: ${workflowCounts(facts)}.`,
    );

    const tiers = [...new Set(facts.runs.map((r) => r.modelTier))];
    sentences.push(
      `The ${plural(tiers.length, "workflow")} used the ${tiers.join(" and ")} model ${plural(tiers.length, "tier")}.`,
    );

    if (facts.phases.length > 0) {
      sentences.push(`Workflow phases on record: ${facts.phases.join(", ")}.`);
    }
  } else {
    sentences.push("No Rhēma workflows ran on this manuscript.");
  }

  const humanDecisions = facts.approvals.filter((a) => a.byKind === "user");
  if (humanDecisions.length > 0) {
    const actions = [...new Set(humanDecisions.map((a) => a.action))].join(", ");
    sentences.push(
      `The author made ${humanDecisions.length} recorded ${plural(humanDecisions.length, "decision")} at the workflows' approval points (${actions}).`,
    );
  }

  if (facts.humanRevisionNs.length > 0) {
    const vs = facts.humanRevisionNs.map((n) => `v${n}`).join(", ");
    sentences.push(
      `The author revised the manuscript directly, outside any workflow (${plural(facts.humanRevisionNs.length, "version")} ${vs}).`,
    );
  }

  if (counts.openObligations > 0) {
    const blocking =
      counts.blockingOpen > 0
        ? `, ${counts.blockingOpen} of them blocking`
        : "";
    sentences.push(
      `At the time this statement was generated, ${counts.openObligations} review ${plural(counts.openObligations, "obligation")} remained open${blocking}.`,
    );
  }

  return sentences;
}
