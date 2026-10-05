// @rhema/ai-use — the AI-use statement (PRB.11; §8.4 REQ-VIS-10, REQ-POS-6, REQ-GENRE-5). The generated
// sentences are recomputed from run rows on every read (workflows, model tiers, dates, phases, approvals,
// human-revision versions, the open-obligation count); the author's additions live in `ai_use_additions`
// and are append-only. P1.21 registers the per-protocol templates (Academic's ICMJE-shaped variant,
// Op-ed, Memo) — the side-effect import below is what binds them; an unregistered protocol still
// renders 'general' (a service, never a gate).

import "./templates.js";

export { collectStatementFacts } from "./facts.js";
export type { StatementFacts, RunFact, ApprovalFact } from "./facts.js";
export {
  generatedSentences,
  registerStatementTemplate,
  templateDef,
  templateForProtocol,
} from "./statement.js";
export type { StatementTemplate, StatementTemplateDef } from "./statement.js";
export { listAdditions, appendAddition, AdditionError } from "./additions.js";
export type { AiUseAddition } from "./additions.js";
export { loadStatement, statementMarkdown, attachmentSection } from "./compose.js";
export type { AiUseStatement } from "./compose.js";
