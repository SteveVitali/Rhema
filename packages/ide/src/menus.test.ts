import { describe, expect, it } from "vitest";
import { parseCommand, resolveCommand } from "@rhema/commands";
import { contextMenuItems, selectionMenuItems, selectionMenuModel } from "./menus.js";
import { paletteModel } from "./palette.js";

const CTX = { projectSlug: "demo" };
const resolve = (command: string) => {
  const r = parseCommand(command);
  if (!r.ok) throw new Error(`unparsable: ${command}`);
  return resolveCommand(r.command, CTX);
};

describe("the §7.4 format bubble (REQ-WRITE-1; R7WRITE.1a)", () => {
  it("group 1 is Bold/Italic/Link/H2/H3/Quote/Bulleted/Numbered — local format actions, never commands", () => {
    const { format } = selectionMenuModel();
    expect(format.map((i) => i.label)).toEqual([
      "Bold",
      "Italic",
      "Link",
      "H2",
      "H3",
      "Quote",
      "Bulleted",
      "Numbered",
    ]);
    for (const item of format) {
      expect(item.format).toBeDefined();
      expect(item.command).toBeUndefined();
    }
  });

  it("group 2 carries the agent verbs; each resolves to the run sheet (no POST) with an optional cost hint", () => {
    const { agent } = selectionMenuModel({ costHints: { review: "≈ 560 cr" } });
    expect(agent.map((i) => i.label)).toEqual([
      "Ask",
      "Visualize",
      "Fact-check",
      "Review this section",
    ]);
    expect(agent[0]!.action).toBe("ask");
    expect(agent[0]!.command).toBeUndefined();
    for (const item of agent.slice(1)) {
      const r = resolve(item.command!);
      expect(r.kind).toBe("sheet");
      if (r.kind === "sheet") expect(r.path).toMatch(/\/p\/demo\/(run|visualize)\?/);
    }
    expect(agent.find((i) => i.label === "Review this section")!.hint).toBe("≈ 560 cr");
  });

  it("no 'not available yet' item renders — Line edit / Cut to length are removed, not disabled (I6)", () => {
    const labels = selectionMenuItems().map((i) => i.label);
    expect(labels).not.toContain("Line edit");
    expect(labels).not.toContain("Cut to length");
    // and no item resolves disabled-with-reason — every row is actionable.
    for (const item of selectionMenuItems().filter((i) => i.command)) {
      expect(resolve(item.command!).kind).not.toBe("disabled");
    }
  });

  it("the leading Comment slot is reserved for 238 — null today, nothing renders for it", () => {
    const model = selectionMenuModel();
    expect(model.comment).toBeNull();
    expect(selectionMenuItems()[0]!.format).toBe("bold"); // no dead first row
  });

  it("the bubble's agent commands resolve byte-identically to the same string typed in the palette", () => {
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
