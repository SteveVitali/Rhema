// @rhema/protocols — the §12.6 input-scoped SECOND READ contract text (DEF.1 / D-P0.15h-5).
//
// The review manifest's `second_read` phase is produced by an orchestrator-launched scoped query that
// sees ONLY the draft (a private mount namespace — no brief, no findings, no persona). The prompt below
// is the skill's Phase-5 instruction verbatim (editorial-review/SKILL.md, "Where the harness supports
// subagents"); the harness-side wrapper (`scoped-query`) runs it with `tools: ["Read"]` and returns the
// answer as text, which the harness persists as `05-second-read.md` stamped with the launch's
// `producerQueryId`. Keeping the instruction HERE (not re-typed in the orchestrator) keeps the protocol
// text single-sourced beside the skill it was ported from.

/**
 * The Phase-5 independent-second-read instruction (editorial-review, verbatim). The scoped query's
 * working directory holds exactly the enumerated input file(s); the preamble names them and fixes the
 * output contract (the answer is the final message text — the scoped query has no Write tool).
 */
export const SECOND_READ_PROMPT = `Your working directory contains exactly one file — the draft under review. This read is input-scoped: you see the draft ONLY — no editor's brief, no findings, no persona — by construction, so the reading stays uncontaminated. Read it with the Read tool, then produce your assessment as your final message text (you have no Write tool; the harness persists your answer as the phase artifact).

Read this draft as a senior editor at an elite publication doing a first assessment. Produce: (1) the thesis as you understand it, in two sentences; (2) your five most serious objections or concerns, each anchored to a specific passage; (3) the three strongest things about the piece, anchored likewise; (4) your verdict — accept / minor revisions / major revisions / reject and rework — with one paragraph of justification. Be exacting and specific; do not summarize the piece back.`;
