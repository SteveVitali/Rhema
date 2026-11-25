import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { pageSchema } from "./schema.js";

// REQ-WRITE-3 (329_R7UX.6; BL-97) — the slash menu, deliberately minimal per the ticket's design
// ruling: `/` at a block start opens a small menu of the block-level constructs the schema
// actually has; typed text filters it; ArrowUp/Down + Enter insert the chosen construct at the
// caret (the typed `/`+query is consumed — it lives inside the replaced paragraph); Escape
// dismisses. Mouse hover/click works; there is no palette, no AI entries, no toolbar.
//
// Shape follows the package's conventions: a PM plugin like `decorationsPlugin` — a derived
// plugin state (the caret's textblock match) and a `handleKeyDown` claim that fires only while
// open. The package stays DOM-free (decorations.ts's ruling): the `.ui-menu` box renders in the
// client — `apps/web/src/spa/slash-menu.ts` rides the mount's `onTransaction` tap, reads
// `slashMenuKey` state, and appends the positioned div to `document.body`. Wired in
// `pagePlugins` BEFORE the editing keymap so Enter/Escape/arrows are claimed before `split`
// while open; a claimed key calls preventDefault, which also keeps the chrome's layered-Esc
// handler out (its `e.defaultPrevented` guard).

/** The plugin's public key — tests + the mount read the state through it. */
export const slashMenuKey = new PluginKey<SlashMenuState>("rhema:slash-menu");

export interface SlashMenuState {
  /** doc position of the `/` that opened the menu; `null` = closed. */
  readonly from: number | null;
  /** the typed filter text after `/` (no whitespace). */
  readonly query: string;
  /** a `from` the user Escape-dismissed — the same match never re-opens on its own. */
  readonly dismissedFrom: number | null;
  /** index into the filtered entries (unbounded; clamped where used). */
  readonly active: number;
}

const CLOSED: SlashMenuState = { from: null, query: "", dismissedFrom: null, active: 0 };

/**
 * The `/`-at-block-start match: a collapsed caret at the END of a `paragraph`'s text where the
 * block's text is `/` followed by non-whitespace. Paragraph-only parents mean code blocks,
 * headings and table cells (whose caret parent is the cell itself) can never open it, and the
 * end-of-block rule means Enter only ever replaces `/`+query — never user text after the caret.
 */
export function slashMatch(state: EditorState): { from: number; query: string } | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const parent = $from.parent;
  if (parent.type !== pageSchema.nodes.paragraph) return null;
  if ($from.parentOffset !== parent.content.size) return null;
  if (parent.firstChild == null || !parent.firstChild.isText) return null;
  const m = /^\/(\S*)$/.exec(parent.textBetween(0, $from.parentOffset, "", ""));
  if (!m) return null;
  return { from: $from.start(), query: m[1] ?? "" };
}

export interface SlashEntry {
  readonly id: string;
  readonly label: string;
  /** extra filter tokens (lowercase substring match alongside the label). */
  readonly keywords: readonly string[];
  /** schema node names the entry constructs — tests assert each is a `group: "block"` node. */
  readonly nodes: readonly string[];
  /** the node(s) replacing the `/`-paragraph: the construct, plus a trailing empty paragraph for
   *  atomic blocks so the caret has somewhere to keep typing. */
  readonly make: () => PMNode | readonly PMNode[];
}

const s = pageSchema;
const para = () => s.nodes.paragraph!.create();
const listItem = (checked: boolean | null = null) => s.nodes.list_item!.create({ checked }, para());
const tableCell = () => s.nodes.table_cell!.create();
const tableRow = () => s.nodes.table_row!.create(null, [tableCell(), tableCell()]);

/**
 * The menu's entries — every construct the schema's block set has that a user inserts at the
 * caret. Heading levels mirror the format bubble's vocabulary (H2/H3; the front-matter owns the
 * title). `front_matter`, `footnote_definition`, `link_definition` and `html_block` are
 * canonical-serialization constructs, not caret-insertable blocks — deliberately absent.
 */
export const SLASH_ENTRIES: readonly SlashEntry[] = [
  { id: "h2", label: "Heading 2", keywords: ["h2", "heading", "section", "title"], nodes: ["heading"], make: () => s.nodes.heading!.create({ level: 2 }) },
  { id: "h3", label: "Heading 3", keywords: ["h3", "heading", "subsection"], nodes: ["heading"], make: () => s.nodes.heading!.create({ level: 3 }) },
  { id: "quote", label: "Quote", keywords: ["blockquote", "quote", "q"], nodes: ["blockquote"], make: () => s.nodes.blockquote!.create(null, para()) },
  { id: "code", label: "Code block", keywords: ["code", "pre", "fence"], nodes: ["code_block"], make: () => s.nodes.code_block!.create() },
  { id: "bullets", label: "Bulleted list", keywords: ["list", "bullet", "ul"], nodes: ["list", "list_item"], make: () => s.nodes.list!.create({ ordered: false }, listItem()) },
  { id: "numbered", label: "Numbered list", keywords: ["list", "ordered", "ol", "numbered"], nodes: ["list", "list_item"], make: () => s.nodes.list!.create({ ordered: true }, listItem()) },
  { id: "tasks", label: "Task list", keywords: ["task", "todo", "checklist", "checkbox"], nodes: ["list", "list_item"], make: () => s.nodes.list!.create({ ordered: false }, listItem(false)) },
  { id: "divider", label: "Divider", keywords: ["hr", "divider", "rule", "break", "thematic"], nodes: ["thematic_break"], make: () => [s.nodes.thematic_break!.create(), para()] },
  { id: "figure", label: "Figure", keywords: ["figure", "image", "img"], nodes: ["figure"], make: () => [s.nodes.figure!.create({ alt: "" }), para()] },
  { id: "table", label: "Table", keywords: ["table", "grid"], nodes: ["table", "table_row", "table_cell"], make: () => [s.nodes.table!.create(null, [tableRow(), tableRow()]), para()] },
  { id: "math", label: "Math block", keywords: ["math", "tex", "equation"], nodes: ["math_block"], make: () => [s.nodes.math_block!.create({ value: "" }), para()] },
];

const QUERY_RE = /\S+/;

/** Filter the entries by the typed query — case-insensitive substring over label + keywords. */
export function filterSlashEntries(query: string): readonly SlashEntry[] {
  const q = query.toLowerCase();
  if (!QUERY_RE.test(q)) return SLASH_ENTRIES;
  return SLASH_ENTRIES.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.id.includes(q) ||
      e.keywords.some((k) => k.includes(q)),
  );
}

type SlashMeta = { kind: "dismiss" } | { kind: "move"; delta: number } | { kind: "set"; active: number };

function derive(prev: SlashMenuState, state: EditorState): SlashMenuState {
  const m = slashMatch(state);
  if (!m) return CLOSED;
  if (m.from === prev.dismissedFrom) {
    // Escape stays dismissed while the same `/`-block match continues — typing more does not
    // re-open it; the match ending (caret leaves, the `/` goes) re-arms the trigger.
    return { from: null, query: m.query, dismissedFrom: prev.dismissedFrom, active: 0 };
  }
  return { from: m.from, query: m.query, dismissedFrom: null, active: prev.from === m.from ? prev.active : 0 };
}

/**
 * Insert the entry at the caret in ONE transaction: the paragraph carrying `/`+query is
 * replaced by the entry's node(s), so the typed `/` is consumed and one undo restores it.
 * The selection lands inside the inserted construct's first textblock (or the trailing empty
 * paragraph after an atomic block).
 */
export function applySlashEntry(view: EditorView, entry: SlashEntry): boolean {
  const st = slashMenuKey.getState(view.state);
  if (!st || st.from == null) return false;
  const $pos = view.state.doc.resolve(st.from);
  if ($pos.depth === 0) return false;
  const blockFrom = $pos.before($pos.depth);
  const block = $pos.node($pos.depth);
  const made = entry.make();
  const tr: Transaction = view.state.tr.replaceWith(blockFrom, blockFrom + block.nodeSize, made);
  tr.setSelection(TextSelection.near(tr.doc.resolve(blockFrom + 1), 1)).scrollIntoView();
  view.dispatch(tr);
  view.focus();
  return true;
}

/**
 * The `/`-menu plugin — mounted inside `pagePlugins` before the editing keymap. While open it
 * claims ArrowUp/ArrowDown (move the active row), Enter (insert the active construct) and Escape
 * (dismiss without touching the typed text); every other key falls through to the keymaps and
 * the resulting transaction re-derives `query`/`active`. The menu DOM itself is client-side —
 * this package stays DOM-free.
 */
export function slashMenuPlugin(): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,
    state: {
      init: (): SlashMenuState => CLOSED,
      apply: (tr, prev, _old, state): SlashMenuState => {
        const meta = tr.getMeta(slashMenuKey) as SlashMeta | undefined;
        if (meta?.kind === "dismiss") {
          const m = slashMatch(state);
          return { from: null, query: m?.query ?? "", dismissedFrom: m?.from ?? prev.from, active: 0 };
        }
        if (meta?.kind === "move") return { ...prev, active: prev.active + meta.delta };
        if (meta?.kind === "set") return { ...prev, active: meta.active };
        return derive(prev, state);
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = slashMenuKey.getState(view.state);
        if (!st || st.from == null) return false;
        // an IME composition's Enter/keys are the composition's — never the menu's.
        if (event.isComposing || view.composing) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          view.dispatch(
            view.state.tr.setMeta(slashMenuKey, {
              kind: "move",
              delta: event.key === "ArrowDown" ? 1 : -1,
            } satisfies SlashMeta),
          );
          return true;
        }
        if (event.key === "Enter") {
          const entries = filterSlashEntries(st.query);
          if (entries.length > 0) {
            const active = ((st.active % entries.length) + entries.length) % entries.length;
            applySlashEntry(view, entries[active]!);
          }
          return true;
        }
        if (event.key === "Escape") {
          view.dispatch(view.state.tr.setMeta(slashMenuKey, { kind: "dismiss" } satisfies SlashMeta));
          return true;
        }
        return false;
      },
    },
  });
}
