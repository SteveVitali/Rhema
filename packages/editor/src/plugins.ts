import { EditorState, Plugin, type Command, type Transaction } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import type * as Y from "yjs";
import { UndoManager } from "yjs";
import {
  ySyncPlugin,
  yUndoPlugin,
  undo as yUndo,
  redo as yRedo,
  ySyncPluginKey,
  yUndoPluginKey,
  getRelativeSelection,
  defaultProtectedNodes,
  defaultDeleteFilter,
  type UndoPluginState,
} from "y-prosemirror";
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

// ---- the keep-alive undo manager (R6FIX.1 / F-R6POST.2-2; REQ-NAVC-22/23) --------------------
//
// Upstream `yUndoPlugin` mints its `Y.UndoManager` inside the plugin STATE — but its plugin VIEW's
// `destroy` calls `undoManager.destroy()` on every `EditorView` teardown. On the keep-alive Page
// the view dies on every route leave while the registry-held session (Y.Doc + EditorState)
// survives — and `UndoManager.destroy()` removes the doc's `afterTransaction` capture handler and
// wipes the manager's observers permanently: pre-leave stack items still pop once, but nothing is
// ever captured again, so the remounted editor's undo is dead (`canUndo()` goes false on the next
// edit — the live F-R6POST.2-2 symptom). The fix splits the lifecycle the way the session already
// splits the Y.Doc: the manager is CALLER-OWNED by the registry-held collab wire (created once per
// session, destroyed only on true session teardown) and this plugin's view attaches/detaches only
// the two per-view selection-bookkeeping listeners — a view teardown never touches the manager.
//
// The plugin state keeps the upstream `UndoPluginState` shape on the SAME `yUndoPluginKey`, so
// `yUndo`/`yRedo`/`undoCommand`/`redoCommand` and anything reading the key behave verbatim.

/**
 * Build the Page's `Y.UndoManager` with the options upstream `yUndoPlugin` would use — local edits
 * only in `trackedOrigins` (a peer's edits never enter this client's undo stack, REQ-ED-10), the
 * paragraph-protecting delete filter, and `addToHistory:false` honored for agent transactions.
 */
export function createPageUndoManager(fragment: Y.XmlFragment): UndoManager {
  return new UndoManager(fragment, {
    trackedOrigins: new Set([ySyncPluginKey]),
    deleteFilter: (item) => defaultDeleteFilter(item, defaultProtectedNodes),
    captureTransaction: (tr) => tr.meta.get("addToHistory") !== false,
  });
}

/**
 * `yUndoPlugin` with keep-alive lifecycle semantics: `undoManager` is caller-owned, so this
 * plugin's `view` attaches the two selection-bookkeeping listeners per mount and detaches ONLY
 * them on view destroy — the stack and its capture survive unmount/remount cycles.
 */
export function yPersistentUndoPlugin(undoManager: UndoManager): Plugin<UndoPluginState> {
  return new Plugin<UndoPluginState>({
    key: yUndoPluginKey,
    state: {
      init: (): UndoPluginState => ({
        undoManager,
        prevSel: null,
        hasUndoOps: undoManager.undoStack.length > 0,
        hasRedoOps: undoManager.redoStack.length > 0,
      }),
      apply: (_tr, val, oldState, state): UndoPluginState => {
        const binding = ySyncPluginKey.getState(state).binding;
        const hasUndoOps = val.undoManager.undoStack.length > 0;
        const hasRedoOps = val.undoManager.redoStack.length > 0;
        if (binding) {
          return {
            undoManager: val.undoManager,
            prevSel: getRelativeSelection(binding, oldState),
            hasUndoOps,
            hasRedoOps,
          };
        }
        if (hasUndoOps !== val.hasUndoOps || hasRedoOps !== val.hasRedoOps) {
          return { ...val, hasUndoOps, hasRedoOps };
        }
        return val;
      },
    },
    view: (view) => {
      const ystate = ySyncPluginKey.getState(view.state);
      // `StackItem` isn't a top-level yjs export — the event arg's `meta` map is all we touch.
      const onAdded = ({ stackItem }: { stackItem: { meta: Map<unknown, unknown> } }) => {
        const binding = ystate.binding;
        if (binding) {
          stackItem.meta.set(binding, yUndoPluginKey.getState(view.state)?.prevSel ?? null);
        }
      };
      const onPopped = ({ stackItem }: { stackItem: { meta: Map<unknown, unknown> } }) => {
        const binding = ystate.binding;
        if (binding) {
          binding.beforeTransactionSelection =
            stackItem.meta.get(binding) || binding.beforeTransactionSelection;
        }
      };
      undoManager.on("stack-item-added", onAdded);
      undoManager.on("stack-item-popped", onPopped);
      return {
        // Keep-alive semantics (F-R6POST.2-2): detach ONLY this view's listeners — the shared
        // manager's stacks + capture outlive the view. Its owner destroys it on session teardown.
        destroy: () => {
          undoManager.off("stack-item-added", onAdded);
          undoManager.off("stack-item-popped", onPopped);
        },
      };
    },
  });
}

/**
 * The Page's plugin set. `initSources` seeds the provenance map from the stored version row.
 * `collab.fragment` (P1.03) swaps the local `history()` for the Yjs binding — `ySyncPlugin` renders +
 * syncs the shared `Y.XmlFragment` and `yUndoPlugin` scopes undo to THIS client's own changes — the
 * right pair once the document is a CRDT (a peer's edits must never enter the local undo stack).
 * `collab.undoManager` (R6FIX.1) swaps the stock `yUndoPlugin` for the keep-alive variant — the
 * caller owns the manager's lifecycle across view teardowns.
 */
export function pagePlugins(
  initSources?: ReadonlyMap<string, BlockSource>,
  collab?: { fragment: Y.XmlFragment; undoManager?: UndoManager },
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
    ...(collab
      ? [
          ySyncPlugin(collab.fragment),
          collab.undoManager ? yPersistentUndoPlugin(collab.undoManager) : yUndoPlugin(),
        ]
      : [history()]),
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
 * live_docs.y_state merge, never from a markdown POST round-trip). `undoManager` (R6FIX.1) is the
 * keep-alive arm: a session-owned manager the SPA registry hands in so ⌘Z survives view teardowns;
 * omitting it keeps upstream `yUndoPlugin` semantics (the SSR island's single-mount lifecycle).
 */
export function createCollabPageState(
  fragment: Y.XmlFragment,
  initSources?: ReadonlyMap<string, BlockSource>,
  undoManager?: UndoManager,
): EditorState {
  return EditorState.create({
    schema: pageSchema,
    plugins: pagePlugins(initSources, { fragment, undoManager }),
  });
}
