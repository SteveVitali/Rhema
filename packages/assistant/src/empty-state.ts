// The §7.6 empty state + scratch path (REQ-CHAT-29/30's surface half). A fresh project opens a quiet
// Page, the Desk on Chat, the four starter chips, and exactly one next-step card on the Timeline.
// "Paste my notes" is the scratch entry: it writes `agents/author/notes.md` through the AUTHOR seat's
// normal write path (the assistant returns the write spec; the api performs it — the conduit rule
// keeps chat text out of the corpus, and notes.md is the author's own intake file, not a draft).

/** The four starter chips (§7.6 verbatim order). */
export const EMPTY_STATE_CHIPS = [
  { id: "research", label: "Research a question", verb: "/research" },
  { id: "thesis", label: "I have a thesis", verb: "chat" },
  { id: "interview", label: "Interview me", verb: "chat" },
  { id: "notes", label: "Paste my notes", verb: "notes" },
] as const;
export type EmptyStateChip = (typeof EMPTY_STATE_CHIPS)[number];

/** The scratch project's surface model (quiet Page + Desk on Chat + chips + one next-step card). */
export interface EmptyStateModel {
  /** the Page renders a quiet placeholder — no forced draft. */
  page: "quiet";
  /** the Desk opens on this tab. */
  deskTab: "chat";
  chips: readonly EmptyStateChip[];
  /** the Timeline's single next-step card (an outline-from-chat or a research run sheet). */
  nextStep: { kind: "chat_first_turn" | "sheet"; label: string; href?: string };
}

export function emptyProjectState(nextStepHref?: string): EmptyStateModel {
  return {
    page: "quiet",
    deskTab: "chat",
    chips: EMPTY_STATE_CHIPS,
    nextStep: {
      kind: "sheet",
      label: "Start with a research question or paste your notes",
      ...(nextStepHref ? { href: nextStepHref } : {}),
    },
  };
}

/**
 * The "Paste my notes" chip's write spec (REQ-CHAT-29): the pasted text lands at
 * `agents/author/notes.md` via the author seat's write path — a deliberate file in the author's
 * intake namespace, never a draft row and never under `agents/assistant/` (the assistant namespace
 * holds chat artifacts; the notes file is corpus-adjacent INPUT the author seat owns). Returns the
 * path + content for the api to persist as an artifact.
 */
export function pasteNotesWrite(args: { text: string }): {
  path: "agents/author/notes.md";
  content: string;
  kind: "note";
  namespace: "agent:author";
} {
  return {
    path: "agents/author/notes.md",
    content: args.text,
    kind: "note",
    namespace: "agent:author",
  };
}
