import type { StatementFacts } from "./facts.js";
import { generatedSentences, registerStatementTemplate } from "./statement.js";

// P1.21 (§8.4/§13.4; REQ-GENRE-5) — the per-protocol AI-use templates. Each registers at import time
// (this module is side-effect-imported from the package index); an unregistered protocol still
// renders 'general' — the statement is a service, never a gate (the compose path already degrades).
// Every sentence derives from the run record; the protocol-specific sentences state the §6.7
// integrity row in first person for the author to stand behind — they assert the run's OWN shape
// (phases off, user sources mounted), never a fact the record does not show.

/** The ICMJE-shaped Academic template (§8.4: "ICMJE-shaped" — disclosure of AI-assisted technology
 *  with the author-responsibility clause; ICMJE requires exactly this posture: the tool is named,
 *  the extent of its use described, and the human authors accept responsibility for the content). */
function academicSentences(
  facts: StatementFacts,
  counts: { openObligations: number; blockingOpen: number },
): string[] {
  const sentences = generatedSentences(facts, counts);
  return [
    // ICMJE frame: name the tool + describe the role it played (assistance, not authorship).
    "In the preparation of this work the author used Rhēma, an editorial-review environment, for the editorial workflows listed below; the tool did not originate results, data, or first-person methodological claims.",
    ...sentences.slice(1),
    // ICMJE's responsibility clause — the disclosure closes on the human standing behind the content.
    "The author reviewed and edited all output and takes full responsibility for the integrity and accuracy of the content of this work.",
  ];
}

/** The Op-ed template — outlets care about authorship + timeliness; the disclosure names the venue
 *  the run targeted and closes on the exclusivity reminder the §6.7 row requires at export. */
function opEdSentences(
  facts: StatementFacts,
  counts: { openObligations: number; blockingOpen: number },
): string[] {
  const sentences = generatedSentences(facts, counts);
  if (facts.venue) {
    sentences.push(`This piece was prepared for submission to ${facts.venue}.`);
  }
  sentences.push(
    "The author confirms the facts and the news peg cited in this piece were checked against the cited sources, and that this submission is exclusive to its target outlet.",
  );
  return sentences;
}

/** The Memo template — the confidentiality row (§16.4) in the author's own words: internal figures
 *  came from user-supplied sources, were never fetched over the web, and the recommendation is the
 *  author's own (the machine may not supply it). */
function memoSentences(
  facts: StatementFacts,
  counts: { openObligations: number; blockingOpen: number },
): string[] {
  const sentences = generatedSentences(facts, counts);
  sentences.push(
    "Internal figures and user-supplied sources were checked against the supplied materials only — they were never fetched or searched over the web. The recommendation and the numbers in this memo are the author's own.",
  );
  return sentences;
}

registerStatementTemplate("academic", {
  key: "icmje",
  heading: "Declaration of AI-assisted technology",
  sentences: academicSentences,
});
registerStatementTemplate("op-ed", {
  key: "op-ed",
  heading: "AI-use disclosure",
  sentences: opEdSentences,
});
registerStatementTemplate("memo", {
  key: "memo",
  heading: "AI-use disclosure",
  sentences: memoSentences,
});
