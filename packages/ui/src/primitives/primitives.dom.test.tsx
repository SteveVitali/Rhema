// @vitest-environment happy-dom
//
// R7KIT.2 (REQ-KIT-2; ADR-129) — the shell-critical primitives' DOM contract. Per primitive:
// render, keyboard operation, `ref`/`data-*`/ARIA forwarding, and the `.ui-*` theme classes
// (resolved against `uiCss()` — never inline literals, see no-inline-literals.test.ts). Plus the
// pinned special cases: the non-modal Sheet leaves outside content focusable (REQ-IDE-41 kept)
// and the moved `primitives.tsx` exports render unchanged (structure + attributes; the declaration
// equivalence is pinned in ui-css.test.ts).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import type { ReactNode } from "react";
import { Button, IconButton } from "./button.js";
import { Badge, Kbd, Skeleton } from "./status.js";
import { Pill, Chip, FetchedUrlChip, ActionLink } from "./chips.js";
import { Tooltip, TooltipProvider } from "./tooltip.js";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./menu.js";
import { Dialog, DialogClose, Sheet } from "./dialog.js";
import { ToastProvider, useToast, type ToastInput } from "./toast.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Button / IconButton", () => {
  it("renders variant+size theme classes, forwards ref/data-*/ARIA, and clicks", () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <Button
        ref={ref}
        variant="primary"
        size="sm"
        data-kit-probe="yes"
        aria-describedby="hint"
        onClick={onClick}
      >
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("ui-btn");
    expect(btn.className).toContain("ui-btn--primary");
    expect(btn.className).toContain("ui-btn--sm");
    expect(btn).toHaveAttribute("data-kit-probe", "yes");
    expect(btn).toHaveAttribute("aria-describedby", "hint");
    expect(ref.current).toBe(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("IconButton carries its required aria-label and icon variant classes", () => {
    render(
      <IconButton aria-label="Close panel" variant="ghost">
        ×
      </IconButton>,
    );
    const btn = screen.getByRole("button", { name: "Close panel" });
    expect(btn.className).toContain("ui-btn--icon");
    expect(btn.className).toContain("ui-btn--ghost");
    expect(btn).toHaveAttribute("type", "button");
  });
});

describe("Badge / Kbd / Skeleton", () => {
  it("Badge renders its tone class and forwards props", () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <Badge ref={ref} tone="ok" data-kit-probe="badge" aria-label="state ok">
        Done
      </Badge>,
    );
    const el = screen.getByText("Done");
    expect(el.className).toContain("ui-badge--ok");
    expect(el).toHaveAttribute("data-kit-probe", "badge");
    expect(el).toHaveAttribute("aria-label", "state ok");
    expect(ref.current).toBe(el);
  });

  it("Kbd renders a <kbd> with the mono cap class", () => {
    render(<Kbd data-kit-probe="kbd">⌘K</Kbd>);
    const el = screen.getByText("⌘K");
    expect(el.tagName).toBe("KBD");
    expect(el.className).toContain("ui-kbd");
  });

  it("Skeleton is aria-hidden and sizes via CSS custom properties, not literals", () => {
    render(<Skeleton width="40%" height="12px" data-kit-probe="sk" />);
    const sk = document.querySelector("[data-kit-probe='sk']")!;
    expect(sk.className).toContain("ui-skeleton");
    expect(sk).toHaveAttribute("aria-hidden", "true");
    expect((sk as HTMLElement).style.getPropertyValue("--ui-skeleton-w")).toBe("40%");
    expect((sk as HTMLElement).style.getPropertyValue("--ui-skeleton-h")).toBe("12px");
  });
});

describe("Tooltip (Radix)", () => {
  it("opens on focus/hover, renders content + theme class, keeps the trigger's own attrs", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Runs the review" data-kit-probe="tip-content">
          <button data-kit-probe="tip-trigger" aria-label="run">
            Run
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "run" });
    expect(trigger).toHaveAttribute("data-kit-probe", "tip-trigger");
    await user.hover(trigger);
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("Runs the review");
    expect(tip.className).toContain("ui-tooltip");
    expect(tip).toHaveAttribute("data-kit-probe", "tip-content");
    await user.unhover(trigger);
  });
});

describe("DropdownMenu (Radix)", () => {
  it("opens on the trigger, arrow-keys rows, selects on Enter — ref/data-* forwarded", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu trigger={<button data-kit-probe="menu-trigger">Actions</button>}>
        <DropdownMenuLabel>Project</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onSelect}>Open</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Delete</DropdownMenuItem>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("ui-menu");
    const item = screen.getByRole("menuitem", { name: "Open" });
    expect(item.className).toContain("ui-menu-item");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(item).toHaveAttribute("data-highlighted"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });
});

describe("Dialog (Radix)", () => {
  it("renders title/description/overlay, Escape fires onOpenChange, ref/data-* on content", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <Dialog
        open
        onOpenChange={onOpenChange}
        title="Delete the draft"
        description="This cannot be undone."
        data-kit-probe="dlg"
        ref={ref}
      >
        <p>body</p>
      </Dialog>,
    );
    const dlg = await screen.findByRole("dialog");
    expect(dlg.className).toContain("ui-dialog");
    expect(dlg).toHaveAttribute("data-kit-probe", "dlg");
    expect(ref.current).toBe(dlg);
    expect(screen.getByText("Delete the draft").className).toContain("ui-dialog-title");
    expect(document.querySelector(".ui-dialog-overlay")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Sheet — the non-modal variant keeps REQ-IDE-41", () => {
  it("leaves outside content focusable (no focus trap, no inert/aria-hidden, no overlay)", async () => {
    render(
      <div>
        <button data-kit-probe="outside">Outside</button>
        <Sheet open onOpenChange={() => {}} title="Panel">
          <button data-kit-probe="inside">Inside</button>
        </Sheet>
      </div>,
    );
    const outside = screen.getByRole("button", { name: "Outside" });
    const sheet = document.querySelector(".ui-sheet")!;
    expect(sheet).not.toBeNull();
    expect(document.querySelector(".ui-dialog-overlay")).toBeNull();
    // No focus trap: the outside control still takes DOM focus and keeps its interactivity.
    act(() => {
      (outside as HTMLElement).focus();
    });
    expect(document.activeElement).toBe(outside);
    expect(outside.getAttribute("aria-hidden")).toBeNull();
    expect(outside.getAttribute("inert")).toBeNull();
    // The sheet content exists and is styled.
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.className).toContain("ui-sheet--right");
  });
});

function ToastHarness({ input }: { input: ToastInput }): ReactNode {
  const { push } = useToast();
  return <button onClick={() => push(input)}>emit</button>;
}

describe("Toast queue (in-house)", () => {
  afterEach(() => vi.useRealTimers());

  it("queues a role=status toast, auto-dismisses, and the named dismiss button removes it", () => {
    render(
      <ToastProvider durationMs={4000} dismissLabel="Dismiss notice" viewportLabel="Notifications">
        <ToastHarness input={{ title: "Saved", body: "Draft 3", tone: "ok" }} />
      </ToastProvider>,
    );
    // Fake timers BEFORE the push, so the auto-dismiss timeout lands in the fake clock.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "emit" }));
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("ui-toast--ok");
    expect(toast.textContent).toContain("Saved");
    expect(toast.textContent).toContain("Draft 3");
    const region = document.querySelector(".ui-toast-viewport");
    expect(region).toHaveAttribute("aria-label", "Notifications");
    // Auto-dismiss on the timer.
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByRole("status")).toBeNull();
    // Manual dismiss uses the copy-provided accessible name.
    fireEvent.click(screen.getByRole("button", { name: "emit" }));
    screen.getByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("useToast outside a provider throws loudly", () => {
    function Bare(): ReactNode {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/inside <ToastProvider>/);
  });
});

describe("moved primitives.tsx exports — rendered behaviour unchanged", () => {
  it("Pill renders the same span+dot structure and text (toned via theme class)", () => {
    render(<Pill label="Running" tone="running" />);
    const pill = screen.getByText("Running");
    expect(pill.tagName).toBe("SPAN");
    expect(pill.className).toContain("ui-pill--running");
    const dot = pill.querySelector("[aria-hidden='true']")!;
    expect(dot.className).toContain("ui-pill-dot");
  });

  it("Chip keeps its span/link duality, title and rel=noreferrer", () => {
    const { rerender } = render(<Chip label="tag" title="hint" />);
    const tag = screen.getByText("tag");
    expect(tag.tagName).toBe("SPAN");
    expect(tag).toHaveAttribute("title", "hint");
    expect(tag.className).toContain("ui-chip");
    rerender(<Chip label="link" href="https://x.test" />);
    const link = screen.getByText("link");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://x.test");
    expect(link).toHaveAttribute("title", "https://x.test");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("FetchedUrlChip keeps data-fetched, the ✓ marker and the search variant", () => {
    const { rerender } = render(
      <FetchedUrlChip url="https://src.test/a" host="src.test" fetchedLabel="fetched" />,
    );
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("data-fetched", "true");
    expect(a).toHaveAttribute("title", "https://src.test/a");
    expect(a.textContent).toContain("✓");
    expect(a.textContent).toContain("fetched");
    expect(a.textContent).toContain("src.test");
    rerender(
      <FetchedUrlChip
        url="https://src.test/b"
        host="src.test"
        fetchedLabel="Search result"
        retrievedBy="search"
      />,
    );
    const b = screen.getByRole("link");
    expect(b).toHaveAttribute("data-fetched", "search");
    expect(b.textContent).not.toContain("✓");
  });

  it("ActionLink keeps its primary link", () => {
    render(<ActionLink label="Start" href="/p/x/run" />);
    const link = screen.getByRole("link", { name: "Start" });
    expect(link).toHaveAttribute("href", "/p/x/run");
    expect(link.className).toContain("ui-action-link");
  });
});

describe("a planted DialogClose", () => {
  it("closes a controlled dialog via the consumer's own button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="T">
        <DialogClose>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
      </Dialog>,
    );
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
