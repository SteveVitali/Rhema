import { BRIEF_MAX_WORDS } from "@rhema/contracts";
import type { PinsFile } from "./pins.js";

// The compaction brief (§7.1; REQ-CHAT-12): when a thread's session transcript compacts, the
// PreCompact hook writes `brief.md` — ≤600 words covering the standing question, decisions, open
// threads, sources read, and the pinned facts — and the PostCompact step re-injects it so the next
// turn continues from the brief, not the void. "What the assistant remembers" renders the brief +
// pins read-only; a correction writes through as a Guidance-class note (`chat_promote`-adjacent —
// the `correction` source the remembers editor appends).

/** The brief's inputs (assembled from the turn ledger + pins at PreCompact time). */
export interface BriefInput {
  /** the thread's standing question (one line). */
  standingQuestion?: string;
  /** decisions taken across the thread's turns. */
  decisions?: readonly string[];
  /** open questions / unresolved threads. */
  openThreads?: readonly string[];
  /** source-note paths the thread has read. */
  sourcesRead?: readonly string[];
  /** the pin set (survives compaction verbatim). */
  pins?: PinsFile;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function section(title: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  return `## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n\n`;
}

/**
 * Render the compaction brief (≤600 words enforced). Sections land in fixed order — standing
 * question, decisions, open threads, sources read, pins — and the render TRUNCATES from the tail
 * (sources first, then open threads) with an explicit marker when the cap binds, so an oversized
 * thread compresses rather than fails. Returns `{markdown, words, truncated}`.
 */
export function buildCompactionBrief(input: BriefInput): {
  markdown: string;
  words: number;
  truncated: boolean;
} {
  const pins = input.pins?.pins ?? [];
  const parts: { title: string; body: string; droppable: boolean }[] = [];
  if (input.standingQuestion) {
    parts.push({ title: "Standing question", body: `${input.standingQuestion}\n\n`, droppable: false });
  }
  parts.push({
    title: "Decisions",
    body: sectionBody("Decisions", input.decisions ?? []),
    droppable: false,
  });
  parts.push({
    title: "Open threads",
    body: sectionBody("Open threads", input.openThreads ?? []),
    droppable: true,
  });
  parts.push({
    title: "Sources read",
    body: sectionBody("Sources read", input.sourcesRead ?? []),
    droppable: true,
  });
  parts.push({
    title: "Pinned",
    body: sectionBody(
      "Pinned",
      pins.map((p) => p.summary),
    ),
    droppable: false, // pins survive compaction verbatim — never truncated away
  });

  const render = (list: typeof parts) =>
    `# Thread brief\n\n` + list.map((p) => p.body).join("").trimEnd() + "\n";

  let markdown = render(parts);
  if (countWords(markdown) <= BRIEF_MAX_WORDS) {
    return { markdown, words: countWords(markdown), truncated: false };
  }
  // Drop droppable sections from the tail until the cap holds; if the pin/decision core still
  // exceeds 600 words, truncate the rendered text at the cap with a marker line.
  const kept = parts.filter((p) => !p.droppable);
  markdown = render(kept);
  if (countWords(markdown) <= BRIEF_MAX_WORDS) {
    return { markdown, words: countWords(markdown), truncated: true };
  }
  const tokens = markdown.split(/\s+/);
  markdown = tokens.slice(0, BRIEF_MAX_WORDS).join(" ") + "\n\n[truncated — see the transcript]\n";
  return { markdown, words: BRIEF_MAX_WORDS, truncated: true };
}

function sectionBody(title: string, items: readonly string[]): string {
  return section(title, items);
}

/** The text the PostCompact step re-injects into the resumed session (REQ-CHAT-12). */
export function postCompactInjection(briefMarkdown: string, pins: PinsFile): string {
  const pinLines = pins.pins.map((p) => `- ${p.summary}`).join("\n");
  return [
    "The conversation compacted. This is the thread's standing brief — continue from it:",
    "",
    briefMarkdown.trim(),
    ...(pins.pins.length > 0 ? ["", "Pinned facts:", pinLines] : []),
  ].join("\n");
}

/** The "What the assistant remembers" read-only view: the brief + the pin list. */
export function remembersView(briefMarkdown: string | null, pins: PinsFile): {
  brief: string | null;
  pins: PinsFile;
} {
  return { brief: briefMarkdown, pins };
}

/**
 * A correction to what the assistant remembers — itself a Guidance-class note (§7.1: "a correction
 * is itself a Guidance-class note"). Returns the capture payload the api hands to `captureGuidance`
 * (`source:'chat_promote'`, project scope, the corrected text verbatim).
 */
export function correctionGuidance(args: {
  threadId: string;
  text: string;
}): { source: "chat_promote"; standing: true; body: string; anchors: { threadId: string } } {
  return {
    source: "chat_promote",
    standing: true,
    body: args.text,
    anchors: { threadId: args.threadId },
  };
}
