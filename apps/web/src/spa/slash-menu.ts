// REQ-WRITE-3 (329_R7UX.6; BL-97) — the slash menu's DOM half. `packages/editor` stays DOM-free:
// it owns the `/`-at-block-start match, the entry table, the filter, and the one-transaction
// insert. This mount reads `slashMenuKey` state after every transaction (the mount's
// `onTransaction` tap covers local commits AND remote ySync applies), scroll, and resize, and
// keeps a `.ui-menu` box — the shared ui-* primitive classes, no new stylesheet — positioned
// under the caret while the match is open. `[data-slash-menu]` is emitted only while open, so
// the hook's presence IS the menu-open contract; rows carry `[data-slash-item]` ids.

import type { EditorView } from "prosemirror-view";
import { applySlashEntry, filterSlashEntries, slashMenuKey } from "@rhema/editor";

export class SlashMenuMount {
  private readonly dom: HTMLElement;
  private readonly host: HTMLElement;
  private readonly onLayout = () => this.sync();

  constructor(private readonly view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.dom = doc.createElement("div");
    this.dom.className = "ui-menu";
    this.dom.setAttribute("data-slash-menu", "true");
    this.dom.setAttribute("role", "listbox");
    this.dom.style.position = "fixed";
    this.dom.style.maxHeight = "min(320px, 60vh)";
    this.dom.style.overflowY = "auto";
    // mousedown inside the menu must not collapse the PM selection — rows dispatch on click.
    this.dom.addEventListener("mousedown", (e) => e.preventDefault());
    this.host = doc.body;
    const win = doc.defaultView;
    win?.addEventListener("scroll", this.onLayout, true);
    win?.addEventListener("resize", this.onLayout);
    this.sync();
  }

  destroy(): void {
    const win = this.dom.ownerDocument.defaultView;
    win?.removeEventListener("scroll", this.onLayout, true);
    win?.removeEventListener("resize", this.onLayout);
    this.dom.remove();
  }

  /** Re-render from the current state — cheap enough to run on every transaction. */
  sync(): void {
    const st = slashMenuKey.getState(this.view.state);
    if (!st || st.from == null || !this.view.editable) {
      if (this.dom.isConnected) this.dom.remove();
      return;
    }
    const entries = filterSlashEntries(st.query);
    const active =
      entries.length === 0 ? -1 : ((st.active % entries.length) + entries.length) % entries.length;
    const doc = this.dom.ownerDocument;
    this.dom.replaceChildren();
    if (entries.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "ui-menu-label";
      empty.textContent = "No matching block";
      this.dom.appendChild(empty);
    }
    entries.forEach((entry, i) => {
      const item = doc.createElement("div");
      item.className = "ui-menu-item";
      item.setAttribute("data-slash-item", entry.id);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(i === active));
      if (i === active) item.setAttribute("data-highlighted", "");
      item.textContent = entry.label;
      item.addEventListener("mouseenter", () => {
        this.view.dispatch(this.view.state.tr.setMeta(slashMenuKey, { kind: "set", active: i }));
      });
      item.addEventListener("click", () => {
        applySlashEntry(this.view, entry);
      });
      this.dom.appendChild(item);
    });
    if (!this.dom.isConnected) this.host.appendChild(this.dom);
    // Fixed positioning at the caret's coords — below the caret line, flipped above when there
    // is no room (the same formula the IDE controller's floating chrome uses).
    const coords = this.view.coordsAtPos(this.view.state.selection.from);
    const win = doc.defaultView;
    const vw = win?.innerWidth ?? 1024;
    const vh = win?.innerHeight ?? 768;
    const w = this.dom.offsetWidth;
    const h = this.dom.offsetHeight;
    const left = Math.max(8, Math.min(coords.left, vw - w - 8));
    const top = coords.bottom + 4 + h <= vh ? coords.bottom + 4 : Math.max(8, coords.top - h - 4);
    this.dom.style.left = `${left}px`;
    this.dom.style.top = `${top}px`;
    this.dom.hidden = false;
  }
}
