import type { SqlExecutor } from "@rhema/mirror";
import { collectStatementFacts, type StatementFacts } from "./facts.js";
import {
  generatedSentences,
  templateDef,
  templateForProtocol,
  type StatementTemplate,
} from "./statement.js";
import { listAdditions, type AiUseAddition } from "./additions.js";

// The composed AI-use statement (§8.4 REQ-VIS-10): generated sentences (recomputed from run rows on every
// read — there is nothing to edit or delete) plus the author's append-only additions, rendered either as the
// standalone document (own heading) or as a section appended to a manuscript export.

/** The full statement the api/web hand around. */
export interface AiUseStatement {
  readonly template: StatementTemplate;
  /** the generated sentences — always recomputed from run rows; never user-editable. */
  readonly generated: readonly string[];
  /** the author's append-only sentences (addition rows, oldest first). */
  readonly additions: readonly AiUseAddition[];
  /** obligation counts at generation time (the generated obligation sentence is present iff open > 0). */
  readonly openObligations: number;
  readonly blockingOpen: number;
  readonly generatedAt: Date;
  readonly facts: StatementFacts;
}

/**
 * Load + compose the project's statement. `counts` are the caller's post-sweep obligation counts (the api
 * runs `sweepArrivedDeferrals(pre_export)` then `exportDialogObligations` before calling, so the generated
 * obligation sentence reflects the horizon arrival — §11.7).
 */
export async function loadStatement(
  exec: SqlExecutor,
  args: {
    projectId: string;
    openObligations: number;
    blockingOpen: number;
    now: Date;
  },
): Promise<AiUseStatement | null> {
  const facts = await collectStatementFacts(exec, args.projectId);
  if (!facts) return null;
  const additions = await listAdditions(exec, args.projectId);
  const template = templateForProtocol(facts.protocolId);
  const generate = templateDef(template).sentences ?? generatedSentences;
  return {
    template,
    generated: generate(facts, {
      openObligations: args.openObligations,
      blockingOpen: args.blockingOpen,
    }),
    additions,
    openObligations: args.openObligations,
    blockingOpen: args.blockingOpen,
    generatedAt: args.now,
    facts,
  };
}

/**
 * Render the statement to markdown. `standalone` ⇒ its own `# AI-use statement` document (the standalone
 * download); otherwise a `## AI-use statement` section appended to a manuscript export (the attach toggle).
 * Additions render under "The author adds:" — legible that these sentences are the human's own.
 */
export function statementMarkdown(statement: AiUseStatement, opts: { standalone: boolean }): string {
  const h = templateDef(statement.template).heading;
  const heading = `${opts.standalone ? "#" : "##"} ${h}`;
  const parts: string[] = [heading, "", statement.generated.join(" ")];
  if (statement.additions.length > 0) {
    parts.push("", `The author adds: ${statement.additions.map((a) => a.sentence).join(" ")}`);
  }
  if (opts.standalone) {
    const day = statement.generatedAt.toISOString().slice(0, 10);
    parts.push("", `*Generated from this project's Rhēma run record on ${day}.*`);
  }
  return `${parts.join("\n")}\n`;
}

/** The markdown appended to a manuscript when the attach toggle is on (md export; docx converts the same
 *  section — the statement rides inside the file). */
export function attachmentSection(statement: AiUseStatement): string {
  return `\n\n---\n\n${statementMarkdown(statement, { standalone: false }).trimEnd()}\n`;
}
