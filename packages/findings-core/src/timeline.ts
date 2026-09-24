// The Timeline round log (§5.5): a vertical list, newest at top, of ROUND CARDS —
// `vN` chip → the runs that consumed vN → the `v(N+1)` chip the round produced — above the next-step
// card and the Outline/"Imported draft" chip. This module is the PURE grouping: the api feeds it the
// project's draft + run rows (with each run's subject draft resolved server-side), and it returns the
// rounds in display order. No prose is generated here — collapsed summaries are PARTS the caller's copy
// table renders (the count joins the workflow label at render time, REQ-SPEC-2 vocabulary stays verbatim).

import type { RunState } from "@rhema/contracts";
import type { RunCardView } from "./run-card.js";

/** A draft version row the timeline needs (the `vN` chips + round anchors). */
export interface TimelineDraft {
  readonly draftId: string;
  readonly n: number;
  readonly origin: string;
  readonly wordCount?: number | null;
}

/**
 * A run row after the api resolved its subject. `subjectN` is the draft ordinal the run consumed:
 * review/revise key on `inputs.draftId` (the reviewed/base draft); a draft run keys on the version it
 * produced (`inputs.nextDraftId`); runs with neither land in the ungrouped tail.
 */
export interface TimelineRun {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  readonly createdAt: string;
  readonly subjectN: number | null;
  /** the draft ordinal the run PRODUCED (a draft/revise run's `nextDraftId`), when known. */
  readonly producedN: number | null;
  /** the run's card view, already built from whitelisted facts (REQ-IDE-11). */
  readonly card: RunCardView;
}

/** One round: its subject `vN` chip plus the runs that consumed vN (oldest → newest, top → bottom). */
export interface TimelineRound {
  readonly n: number;
  /** the subject version chip rendered at the round's bottom edge (the `● vN` row). */
  readonly anchor: TimelineDraft | null;
  readonly runs: readonly TimelineRun[];
  /** the version the round produced (the NEXT round's anchor — v(N+1) ends the narrative). */
  readonly producedN: number | null;
}

/**
 * Group runs into rounds keyed on the subject draft ordinal (§5.5). Rounds sort newest-first; within a
 * round, runs list oldest→newest (the "review → revise" narrative reads downward to the vN chip). Runs
 * with no resolvable subject (`subjectN === null` — e.g. a workflow with no draft input) collect in a
 * trailing ungrouped list the caller renders after the oldest round.
 */
export function groupRounds(
  drafts: readonly TimelineDraft[],
  runs: readonly TimelineRun[],
): { rounds: TimelineRound[]; ungrouped: TimelineRun[] } {
  const draftByN = new Map(drafts.map((d) => [d.n, d]));
  const byRound = new Map<number, TimelineRun[]>();
  const ungrouped: TimelineRun[] = [];
  for (const run of runs) {
    if (run.subjectN == null) {
      ungrouped.push(run);
      continue;
    }
    const list = byRound.get(run.subjectN) ?? [];
    list.push(run);
    byRound.set(run.subjectN, list);
  }
  const ns = [...byRound.keys()].sort((a, b) => b - a); // newest round first
  const rounds: TimelineRound[] = ns.map((n) => {
    const roundRuns = (byRound.get(n) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.runId.localeCompare(b.runId));
    const produced = roundRuns.map((r) => r.producedN).find((p): p is number => p != null) ?? null;
    return { n, anchor: draftByN.get(n) ?? null, runs: roundRuns, producedN: produced };
  });
  return { rounds, ungrouped };
}

/**
 * The collapsed round summary as PARTS (§5.5: "v1 → review (49 findings) → revise (14 moves) → v2").
 * Each part is a controlled token — `{kind:'version'}` renders `vN`, `{kind:'run'}` renders the workflow
 * label plus its numeric detail; the caller joins them with the arrow glyph. Numeric details only —
 * findings/moves counts come from rows, never from agent text.
 */
export type RoundSummaryPart =
  | { readonly kind: "version"; readonly n: number }
  | { readonly kind: "run"; readonly workflow: string; readonly count?: number };

export function collapsedRoundParts(round: TimelineRound): RoundSummaryPart[] {
  const parts: RoundSummaryPart[] = [{ kind: "version", n: round.n }];
  for (const run of round.runs) {
    const chip = run.card.deliverables.find((d) => d.key === "findings" || d.key === "moves");
    parts.push({ kind: "run", workflow: run.workflow, ...(chip?.count != null ? { count: chip.count } : {}) });
  }
  if (round.producedN != null) parts.push({ kind: "version", n: round.producedN });
  return parts;
}

/**
 * The next-step card (§5.5 "NEXT Review v3 · est. 1,240 cr · Standard" — the §6.3 state function's verb
 * plus its estimate). The caller supplies the state function's `suggestedNext` key; this maps it to the
 * card's controlled verb. `run`/`approval` yield a next-step card pointing at the live surface instead of
 * a launcher.
 */
export type NextStepVerb = "draft" | "review" | "revise" | "read_letter" | "outline" | "export" | "archive" | "run" | "approval" | "start" | "none";

export function nextStepVerb(suggestedNext: string): NextStepVerb {
  switch (suggestedNext) {
    case "draft":
      return "draft";
    case "review":
      return "review";
    case "revise":
      return "revise";
    case "read_letter":
      return "read_letter";
    case "outline":
      return "outline";
    case "export":
      return "export";
    case "archive":
      return "archive";
    case "run":
      return "run";
    case "approval":
      return "approval";
    case "start":
      return "start";
    default:
      return "none";
  }
}

/**
 * The queued run's position among the workspace's live queue (§5.5 "position; starts when …"). Position
 * = 1 + the number of still-non-terminal runs created earlier. The api computes `ahead` with one count
 * query; this is the pure arithmetic (1-based).
 */
export function queuePosition(ahead: number): number {
  return ahead + 1;
}
