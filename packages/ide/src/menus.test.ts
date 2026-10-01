import { describe, expect, it } from "vitest";
import { parseCommand, resolveCommand } from "@rhema/commands";
import { contextMenuItems, selectionMenuItems } from "./menus.js";
import { paletteModel } from "./palette.js";

const CTX = { projectSlug: "demo" };
const resolve = (command: string) => {
  const r = parseCommand(command);
  if (!r.ok) throw new Error(`unparsable: ${command}`);
  return resolveCommand(r.command, CTX);
};

describe("the §7.4 selection popover (REQ-CHAT-21/22)", () => {
  it("offers Ask · Visualize · Fact-check · Review this section; Line edit/Cut resolve disabled (1.x)", () => {
    const items = selectionMenuItems().filter((i) => !i.separator);
    expect(items.map((i) => i.label)).toEqual([
      "Ask",
      "Visualize",
      "Fact-check",
      "Review this section",
      "Line edit",
      "Cut to length",
    ]);
    // Ask is the free composer action — never a command, never a run.
    expect(items[0]!.action).toBe("ask");
    expect(items[0]!.command).toBeUndefined();
    for (const item of items.slice(1, 4)) {
      const r = resolve(item.command!);
      expect(r.kind).toBe("sheet");
      if (r.kind === "sheet") expect(r.path).toContain("/p/demo/run?");
    }
    for (const item of items.slice(4)) {
      expect(resolve(item.command!).kind).toBe("disabled");
    }
  });

  it("the popover's commands resolve byte-identically to the same string typed in the palette", () => {
    const review = selectionMenuItems().find((i) => i.label === "Review this section")!;
    const typed = paletteModel({ projectSlug: "demo" }, review.command!).commandRow?.resolution;
    expect(resolve(review.command!)).toEqual(typed);
    expect(review.command).toBe("/review @selection");
  });
});

describe("the artifact/Timeline context menu (REQ-CHAT-22)", () => {
  it("scopes the verbs to the right-clicked round's subject version", () => {
    const items = contextMenuItems(3).filter((i) => !i.separator);
    expect(items.map((i) => i.label)).toEqual(["Review v3 again", "Fact-check v3", "Revise v3", "Export v3"]);
    const review = resolve(items[0]!.command!);
    expect(review).toEqual({ kind: "sheet", workflow: "review", query: { workflow: "review", scope: "v3" }, path: "/p/demo/run?workflow=review&scope=v3" });
    // Export is free — it navigates, never opens the sheet (REQ-GROWTH-13).
    expect(resolve(items[3]!.command!)).toEqual({ kind: "navigate", path: "/p/demo/export?v=3" });
  });

  it("outside a round the bare verbs apply to the current head", () => {
    const items = contextMenuItems().filter((i) => !i.separator);
    expect(items[0]!.label).toBe("Review the draft again");
    expect(resolve(items[0]!.command!).kind).toBe("sheet");
  });
});
