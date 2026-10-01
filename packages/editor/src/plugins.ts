import { EditorState, Plugin, type Command, type Transaction } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import type * as Y from "yjs";
import { ySyncPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from "y-prosemirror";
import {
  baseKeymap, toggleMark, chainCommands, deleteSelection, joinBackward, selectNodeBackward,
  newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock,
} from "prosemirror-commands";
import { splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { inputRules, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules";
import { pageSchema } from "./schema.js";
import { decorationsPlugin } from "./decorations.js";
import { provenancePlugin, ORIGIN_META, type BlockSource } from "./provenance.js";

// The Page's PM wiring (§5.4): the schema-first doc, the keymaps (editing + markdown-flavoured input
// rules), undo history, and the two sidecar plugins (findings/proposal/authorship decorations +
// provenance capture). History's undo never sees agent transactions — every agent tr carries
// `addToHistory: false` (REQ-DATA-28 amended).

/** Marks a transaction as human-origin for provenance capture (`ORIGIN_META`). */
export function humanTr(tr: Transaction, kind: "human" | "pasted" | "human-mobile" = "human"): Transaction {
  return tr.setMeta(ORIGIN_META, kind);
}

const inList: Command = (state) => state.selection.$from.parent.type.name === "list_item";

/**
 * The Page's plugin set. `initSources` seeds the provenance map from the stored version row.
 * `collab.fragment` (P1.03) swaps the local `history()` for the Yjs binding — `ySyncPlugin` renders +
 * syncs the shared `Y.XmlFragment` and `yUndoPlugin` scopes undo to THIS client's own changes — the
 * right pair once the document is a CRDT (a peer's edits must never enter the local undo stack).
 */
export function pagePlugins(
  initSources?: ReadonlyMap<string, BlockSource>,
  collab?: { fragment: Y.XmlFragment },
): Plugin[] {
  const s = pageSchema;
  const listItem = s.nodes.list_item!;
  return [
    inputRules({
      rules: [
        // ATX headings
        textblockTypeInputRule(/^(#{1,6})\s$/, s.nodes.heading!, (m: RegExpMatchArray) => ({ level: m[1]!.length })),
        // blockquote
        wrappingInputRule(/^\s*>\s$/, s.nodes.blockquote!),
        // bullet list "- " / "* "
        wrappingInputRule(/^\s*[-*]\s$/, s.nodes.list!, { ordered: false }),
        // ordered list "1. "
        wrappingInputRule(/^(\d+)[.)]\s$/, s.nodes.list!, (m: RegExpMatchArray) => ({ ordered: true, start: Number(m[1]) })),
        // code fence ```
        textblockTypeInputRule(/^```$/, s.nodes.code_block!),
      ],
    }),
    keymap({
      "Mod-z": collab ? yUndo : undo,
      "Mod-y": collab ? yRedo : redo,
      "Shift-Mod-z": collab ? yRedo : redo,
      "Mod-b": toggleMark(s.marks.strong!),
      "Mod-i": toggleMark(s.marks.em!),
      "Mod-`": toggleMark(s.marks.code!),
      "Mod-Shift-s": toggleMark(s.marks.strike!),
      Enter: chainCommands(
        (st, d) => (inList(st) ? splitListItem(listItem)(st, d) : false),
        newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock,
      ),
      Backspace: chainCommands(deleteSelection, joinBackward, selectNodeBackward),
      "Mod-Backspace": deleteSelection,
      Tab: (st, d) => (inList(st) ? sinkListItem(listItem)(st, d) : false),
      "Shift-Tab": (st, d) => (inList(st) ? liftListItem(listItem)(st, d) : false),
    }),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
    ...(collab ? [ySyncPlugin(collab.fragment), yUndoPlugin()] : [history()]),
    decorationsPlugin(),
    provenancePlugin(initSources),
  ];
}

export function createPageState(
  docJson: unknown,
  initSources?: ReadonlyMap<string, BlockSource>,
): EditorState {
  return EditorState.create({
    doc: pageSchema.nodeFromJSON(docJson),
    plugins: pagePlugins(initSources),
  });
}

/**
 * The collab-bound Page state (P1.03): no `doc` — the ySyncPlugin's binding renders the Y.XmlFragment's
 * synced content into the view on bind (the seed comes from the y-indexeddb record + the server's
 * live_docs.y_state merge, never from a markdown POST round-trip).
 */
export function createCollabPageState(
  fragment: Y.XmlFragment,
  initSources?: ReadonlyMap<string, BlockSource>,
): EditorState {
  return EditorState.create({
    schema: pageSchema,
    plugins: pagePlugins(initSources, { fragment }),
  });
}
