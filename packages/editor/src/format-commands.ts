import { toggleMark, setBlockType, wrapIn, lift } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { Command } from "prosemirror-state";
import { pageSchema } from "./schema.js";

// REQ-WRITE-1 — the format bubble's item → command mapping (R7WRITE.1a). PURE ProseMirror
// commands over the committed schema: the bubble (the IDE chrome's `data-format-bubble`) and the
// contextual ⌘K link path both dispatch these through the live `EditorView` — PM-state tests pin
// every row, so removing a behaviour fails a test. No item POSTs; every action is a local doc
// transaction the autosave transport carries (REQ-CHAT-25 unaffected).
//
// The reserved first slot is 238's `Comment` — `formatBubbleSlots` names the item ids so the
// item model in `packages/ide/src/menus.ts` and the command table here cannot drift apart.

/** The format actions the bubble's group 1 carries. */
export type FormatAction =
  | "bold"
  | "italic"
  | "link"
  | "h2"
  | "h3"
  | "quote"
  | "bulleted"
  | "numbered";

export const FORMAT_ACTIONS: readonly FormatAction[] = [
  "bold",
  "italic",
  "link",
  "h2",
  "h3",
  "quote",
  "bulleted",
  "numbered",
];

const s = pageSchema;

/** A heading toggle: same level reverts to paragraph (the input rule's inverse). */
function headingToggle(level: 2 | 3): Command {
  return (state, dispatch, view) => {
    const $from = state.selection.$from;
    const inHeading = $from.parent.type === s.nodes.heading && $from.parent.attrs["level"] === level;
    return setBlockType(inHeading ? s.nodes.paragraph! : s.nodes.heading!, inHeading ? {} : { level })(
      state,
      dispatch,
      view,
    );
  };
}

/** Wrap the selected blocks in a blockquote; inside one, lift back out (the Markdown `> ` toggle). */
function quoteToggle(): Command {
  return (state, dispatch, view) => {
    const inQuote = state.selection.$from.depth > 0 && state.selection.$from.node(-1).type === s.nodes.blockquote;
    if (inQuote) return lift(state, dispatch, view);
    return wrapIn(s.nodes.blockquote!)(state, dispatch, view);
  };
}

/** Wrap in a list of the given kind; inside the same kind, lift back out; inside the OTHER kind,
 *  convert the surrounding list's `ordered` attr in place (bulleted ⇄ numbered, never nesting). */
function listToggle(ordered: boolean): Command {
  return (state, dispatch, view) => {
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type === s.nodes.list) {
        if (n.attrs["ordered"] === ordered) return lift(state, dispatch, view);
        if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(d), s.nodes.list!, { ...n.attrs, ordered }));
        return true;
      }
    }
    return wrapInList(s.nodes.list!, { ordered })(state, dispatch, view);
  };
}

/** Apply the inline link mark over the selection with `href`; an empty href removes the mark. */
export function linkCommand(href: string): Command {
  return (state, dispatch, view) => {
    if (href === "") return toggleMark(s.marks.link!)(state, dispatch, view);
    const mark = s.marks.link!.create({ href });
    if (dispatch) dispatch(state.tr.addMark(state.selection.from, state.selection.to, mark));
    return true;
  };
}

/**
 * The command a format action dispatches. `link` needs the href — call `linkCommand` directly,
 * or this with `href` set (empty href = unlink).
 */
export function formatCommand(action: FormatAction, href?: string): Command {
  switch (action) {
    case "bold":
      return toggleMark(s.marks.strong!);
    case "italic":
      return toggleMark(s.marks.em!);
    case "link":
      return linkCommand(href ?? "");
    case "h2":
      return headingToggle(2);
    case "h3":
      return headingToggle(3);
    case "quote":
      return quoteToggle();
    case "bulleted":
      return listToggle(false);
    case "numbered":
      return listToggle(true);
  }
}
