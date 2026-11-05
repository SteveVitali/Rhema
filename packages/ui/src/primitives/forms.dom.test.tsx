// @vitest-environment happy-dom
//
// 225a_R7KIT.2b (REQ-KIT-2; ADR-129) — the form/menu primitives' DOM contract. Per primitive:
// render, keyboard operation, `ref`/`data-*`/ARIA forwarding, and the `.ui-*` theme classes.
// Plus the pinned special cases: a static Chip has NO interactive role/tabindex/pointer
// affordance (C6) and existing Chip call sites render byte-identical (before/after snapshot);
// TextArea auto-grows; Select, Popover and ContextMenu are keyboard-operable; the Combobox
// filters and selects by keyboard.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { Command } from "cmdk";
import { Popover, PopoverClose } from "./popover.js";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "./context-menu.js";
import { Select } from "./select.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs.js";
import { Checkbox, RadioGroup, RadioGroupItem, Switch } from "./toggles.js";
import { Combobox, PaletteList } from "./combobox.js";
import { TextField, TextArea, RadioCards } from "./fields.js";
import { EmptyState, Accordion } from "./surfaces.js";
import { Chip } from "./chips.js";
import { uiCss } from "../ui-css.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Popover (Radix)", () => {
  it("opens on the trigger button, closes on Escape/close, forwards ref/data-* on content", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <Popover
        trigger={<button>More</button>}
        onOpenChange={onOpenChange}
        data-kit-probe="pop"
        ref={ref}
      >
        <p>popover body</p>
        <PopoverClose>
          <button>Done</button>
        </PopoverClose>
      </Popover>,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const pop = await screen.findByText("popover body");
    const content = pop.closest(".ui-popover")!;
    expect(content).not.toBeNull();
    expect(content).toHaveAttribute("data-kit-probe", "pop");
    expect(ref.current).toBe(content);
    // Keyboard path: Escape closes.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe("ContextMenu (Radix)", () => {
  it("opens on contextmenu, arrows rows, Enter selects, Escape closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ContextMenu
        trigger={
          <div data-kit-probe="ctx-area" tabIndex={0}>
            Row
          </div>
        }
      >
        <ContextMenuLabel>Actions</ContextMenuLabel>
        <ContextMenuItem onSelect={onSelect}>Rename</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Delete</ContextMenuItem>
      </ContextMenu>,
    );
    const area = screen.getByText("Row");
    fireEvent.contextMenu(area);
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("ui-menu");
    const item = screen.getByRole("menuitem", { name: "Rename" });
    expect(item.className).toContain("ui-menu-item");
    // Keyboard navigation + selection.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(item).toHaveAttribute("data-highlighted"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });
});

describe("Select (Radix)", () => {
  it("opens from the trigger, selects by keyboard alone, forwards ref/data-*/ARIA", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Select
        items={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        placeholder="Pick one"
        aria-label="Group by"
        data-kit-probe="sel"
        ref={ref}
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Group by" });
    expect(trigger.className).toContain("ui-select-trigger");
    expect(trigger).toHaveAttribute("data-kit-probe", "sel");
    expect(ref.current).toBe(trigger);
    // Keyboard-only: focus → Enter opens (first item highlighted) → Enter selects it.
    act(() => trigger.focus());
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest(".ui-select-content")).not.toBeNull();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("a"));
    // The selected label renders in the trigger.
    await waitFor(() => expect(trigger.textContent).toContain("Alpha"));
  });
});

describe("Tabs (Radix)", () => {
  it("renders the tab chrome and arrow-keys between triggers", async () => {
    const user = userEvent.setup();
    const listRef = createRef<HTMLDivElement>();
    render(
      <Tabs defaultValue="one" data-kit-probe="tabs">
        <TabsList aria-label="Sections" ref={listRef}>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
        <TabsContent value="two">second panel</TabsContent>
      </Tabs>,
    );
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    expect(one.className).toContain("ui-tabs-trigger");
    expect(one).toHaveAttribute("aria-selected", "true");
    expect(listRef.current!.className).toContain("ui-tabs-list");
    expect(screen.getByText("first panel").closest(".ui-tabs-content")).not.toBeNull();
    // Arrow-key roving focus activates the next tab (default automatic activation).
    act(() => one.focus());
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(two).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("second panel").closest(".ui-tabs-content")).not.toBeNull();
  });
});

describe("Checkbox / RadioGroup / Switch (Radix)", () => {
  it("Checkbox toggles on click + Space, forwards ref/data-*", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Checkbox
        aria-label="Opt in"
        data-kit-probe="cb"
        ref={ref}
        onCheckedChange={onCheckedChange}
      />,
    );
    const cb = screen.getByRole("checkbox", { name: "Opt in" });
    expect(cb.className).toContain("ui-checkbox");
    expect(cb).toHaveAttribute("data-kit-probe", "cb");
    expect(ref.current).toBe(cb);
    await user.click(cb);
    await waitFor(() => expect(cb).toHaveAttribute("data-state", "checked"));
    act(() => cb.focus());
    await user.keyboard(" ");
    await waitFor(() => expect(cb).toHaveAttribute("data-state", "unchecked"));
  });

  it("RadioGroup selects by arrow keys", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="Mode" defaultValue="x" onValueChange={onValueChange}>
        <RadioGroupItem value="x" aria-label="X" />
        <RadioGroupItem value="y" aria-label="Y" />
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Mode" });
    expect(group.className).toContain("ui-radio-group");
    const x = screen.getByRole("radio", { name: "X" });
    const y = screen.getByRole("radio", { name: "Y" });
    expect(x.className).toContain("ui-radio-item");
    expect(x).toHaveAttribute("data-state", "checked");
    act(() => x.focus());
    fireEvent.keyDown(x, { key: "ArrowDown" });
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("y"));
    await waitFor(() => expect(y).toHaveAttribute("data-state", "checked"));
  });

  it("Switch toggles on click + Space", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Notify" onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole("switch", { name: "Notify" });
    expect(sw.className).toContain("ui-switch");
    await user.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("data-state", "checked"));
    act(() => sw.focus());
    await user.keyboard(" ");
    await waitFor(() => expect(sw).toHaveAttribute("data-state", "unchecked"));
  });
});

describe("Combobox (cmdk)", () => {
  it("filters by typing and selects by keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Combobox
        inputLabel="Jump to"
        inputPlaceholder="Type a name"
        emptyLabel="No matches"
        onSelect={onSelect}
        items={[
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
          { value: "gamma", label: "Gamma" },
        ]}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Jump to" });
    expect(input.className).toContain("ui-command-input");
    expect(document.querySelector(".ui-combobox")).not.toBeNull();
    // Filter: "alp" leaves only Alpha.
    await user.type(input, "alp");
    await waitFor(() => expect(screen.queryByRole("option", { name: "Beta" })).toBeNull());
    expect(screen.getByRole("option", { name: "Alpha" })).not.toBeNull();
    // Keyboard selection: ArrowDown + Enter emits the value.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("alpha"));
  });

  it("shows the empty label when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        inputLabel="Search"
        emptyLabel="No matches"
        items={[{ value: "a", label: "Alpha" }]}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: "Search" }), "zzz");
    await waitFor(() => expect(screen.getByText("No matches")).not.toBeNull());
  });

  it("PaletteList renders groups + headings inside a Command root", async () => {
    const onSelect = vi.fn();
    const listRef = createRef<HTMLDivElement>();
    render(
      <Command label="palette">
        <Command.Input />
        <PaletteList
          ref={listRef}
          emptyLabel="Nothing"
          onSelect={onSelect}
          groups={[
            {
              heading: "Project",
              items: [
                { value: "open", label: "Open draft" },
                { value: "run", label: "Run review" },
              ],
            },
            { items: [{ value: "help", label: "Help" }] },
          ]}
        />
      </Command>,
    );
    expect(listRef.current!.className).toContain("ui-command-list");
    expect(screen.getByText("Project")).not.toBeNull();
    const item = screen.getByRole("option", { name: "Run review" });
    expect(item.className).toContain("ui-command-item");
  });
});

describe("TextField / TextArea", () => {
  it("TextField renders .ui-field, carries invalid, forwards ref/data-*/ARIA", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <TextField
        aria-label="Project name"
        invalid
        data-kit-probe="tf"
        ref={ref}
        defaultValue="Wells"
      />,
    );
    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input.className).toContain("ui-field");
    expect(input.className).toContain("ui-field--invalid");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("data-kit-probe", "tf");
    expect(ref.current).toBe(input);
  });

  it("TextArea auto-grows: height follows scrollHeight on input", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<TextArea aria-label="Notes" ref={ref} />);
    const ta = screen.getByRole("textbox", { name: "Notes" });
    expect(ta.className).toContain("ui-field--area");
    // happy-dom reports scrollHeight 0 — stub it and type.
    Object.defineProperty(ta, "scrollHeight", { value: 96, configurable: true });
    fireEvent.input(ta, { target: { value: "line one\nline two\nline three" } });
    expect(ta.style.height).toBe("96px");
  });

  it("TextArea with autoGrow={false} leaves height alone", () => {
    render(<TextArea aria-label="Fixed" autoGrow={false} />);
    const ta = screen.getByRole("textbox", { name: "Fixed" });
    Object.defineProperty(ta, "scrollHeight", { value: 96, configurable: true });
    fireEvent.input(ta, { target: { value: "x" } });
    expect(ta.style.height).toBe("");
  });
});

describe("RadioCards (in-house)", () => {
  it("radiogroup semantics, click + arrow-key selection, hidden form input, ref/data-*", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <RadioCards
        aria-label="Cadence"
        name="cadence"
        value="weekly"
        onValueChange={onValueChange}
        data-kit-probe="cards"
        ref={ref}
        options={[
          { value: "daily", label: "Daily", description: "every day" },
          { value: "weekly", label: "Weekly" },
          { value: "never", label: "Never", disabled: true },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Cadence" });
    expect(group.className).toContain("ui-radio-cards");
    expect(group).toHaveAttribute("data-kit-probe", "cards");
    expect(ref.current).toBe(group);
    const hidden = group.querySelector("input[type='hidden']")!;
    expect(hidden).toHaveAttribute("name", "cadence");
    expect(hidden).toHaveAttribute("value", "weekly");
    const daily = screen.getByRole("radio", { name: /Daily/ });
    const weekly = screen.getByRole("radio", { name: "Weekly" });
    expect(weekly).toHaveAttribute("aria-checked", "true");
    // Click selects.
    await user.click(daily);
    expect(onValueChange).toHaveBeenCalledWith("daily");
    // Arrow keys move + select (roving tabindex, skips disabled).
    render(
      <RadioCards
        aria-label="Cadence2"
        value="daily"
        onValueChange={onValueChange}
        options={[
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
        ]}
      />,
    );
    const d2 = screen.getByRole("radio", { name: "Daily" });
    act(() => (d2 as HTMLElement).focus());
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("weekly"));
  });
});

describe("Chip — the two variants (C6)", () => {
  it("static chip: a <span> with no interactive role, tabindex or pointer affordance", () => {
    render(<Chip label="Letter" title="static" />);
    const chip = screen.getByText("Letter");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.getAttribute("role")).toBeNull();
    expect(chip.getAttribute("tabindex")).toBeNull();
    // `.ui-chip` carries no cursor — only `button.ui-chip` does.
    const chipRule = uiCss()
      .split("\n")
      .find((r) => r.startsWith(".ui-chip {"))!;
    expect(chipRule).not.toContain("cursor");
    expect(uiCss()).toContain("button.ui-chip { cursor: pointer;");
  });

  it("action variant: a real control — link for href, button for onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<Chip label="Open" href="/p/x" />);
    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toHaveAttribute("href", "/p/x");
    rerender(<Chip label="Pick" onSelect={onSelect} />);
    const btn = screen.getByRole("button", { name: "Pick" });
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("existing call sites render byte-identical (before/after snapshot)", () => {
    const { container, rerender } = render(<Chip label="tag" title="hint" />);
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<span title="hint" style="--ui-chip-fg: var(--shell-fg-muted);" class="ui-chip">tag</span>"`,
    );
    rerender(<Chip label="link" href="https://x.test" />);
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<a href="https://x.test" title="https://x.test" style="--ui-chip-fg: var(--shell-fg-muted);" class="ui-chip" rel="noreferrer">link</a>"`,
    );
  });
});

describe("EmptyState", () => {
  it("renders icon/title/body/action, icon aria-hidden, forwards ref/data-*", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <EmptyState
        icon={<svg data-kit-probe="ico" />}
        title="No findings"
        body="Run a review to fill this."
        action={<button>Run</button>}
        data-kit-probe="empty"
        ref={ref}
      />,
    );
    const el = screen.getByText("No findings").closest(".ui-empty")!;
    expect(el).toHaveAttribute("data-kit-probe", "empty");
    expect(ref.current).toBe(el);
    expect(screen.getByText("No findings").className).toContain("ui-empty-title");
    expect(screen.getByText("Run a review to fill this.").className).toContain("ui-empty-body");
    const iconWrap = document.querySelector(".ui-empty-icon")!;
    expect(iconWrap).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Run" })).not.toBeNull();
  });
});

describe("Accordion (in-house)", () => {
  const items = [
    { id: "a", title: "Alpha", body: "alpha body" },
    { id: "b", title: "Beta", body: "beta body" },
    { id: "c", title: "Gamma", body: "gamma body", disabled: true },
  ];

  it("toggles panels with aria-expanded/region, multiple by default", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <Accordion items={items} onOpenChange={onOpenChange} data-kit-probe="acc" ref={ref} />,
    );
    const root = ref.current!;
    expect(root.className).toContain("ui-accordion");
    const trigger = screen.getByRole("button", { name: /Alpha/ });
    expect(trigger.className).toContain("ui-accordion-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    const panel = screen.getByText("alpha body");
    expect(panel.closest("[role='region']")).not.toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(onOpenChange).toHaveBeenCalledWith(["a"]);
    // Multiple open by default.
    await user.click(screen.getByRole("button", { name: /Beta/ }));
    expect(onOpenChange).toHaveBeenLastCalledWith(["a", "b"]);
    // Disabled item does not toggle.
    const gamma = screen.getByRole("button", { name: /Gamma/ });
    expect(gamma).toBeDisabled();
  });

  it("single-open mode closes siblings; arrows rove focus", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items.slice(0, 2)} multiple={false} defaultOpenIds={["a"]} />);
    const alpha = screen.getByRole("button", { name: /Alpha/ });
    const beta = screen.getByRole("button", { name: /Beta/ });
    expect(alpha).toHaveAttribute("aria-expanded", "true");
    await user.click(beta);
    await waitFor(() => expect(beta).toHaveAttribute("aria-expanded", "true"));
    expect(alpha).toHaveAttribute("aria-expanded", "false");
    // ArrowDown roves trigger focus.
    act(() => alpha.focus());
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(beta);
  });
});
