import { describe, expect, it } from "vitest";
import { formatBubblePlacement, type BubbleRect } from "./bubble.js";

// REQ-WRITE-1 — the geometry contract: the bubble's rect NEVER intersects the selection's client
// rects (they live inside the bounding rect, so a bounding-rect placement is the guarantee), it
// sits above at top/mid/bottom selections, and it flips below ONLY when there is no room above.

const BUBBLE = { width: 320, height: 36 };
const VIEW = { w: 1440, h: 900 };

function intersects(p: { top: number }, sel: BubbleRect): boolean {
  const bottom = p.top + BUBBLE.height;
  return bottom > sel.top && p.top < sel.bottom;
}

describe("formatBubblePlacement (REQ-WRITE-1)", () => {
  it("a mid-page selection: the bubble sits above, non-intersecting", () => {
    const sel: BubbleRect = { top: 400, bottom: 460, left: 200, width: 300 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.placed).toBe("above");
    expect(p.top + BUBBLE.height).toBeLessThanOrEqual(sel.top);
    expect(intersects(p, sel)).toBe(false);
  });

  it("a bottom-of-viewport selection still floats above", () => {
    const sel: BubbleRect = { top: 820, bottom: 860, left: 200, width: 300 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.placed).toBe("above");
    expect(p.top + BUBBLE.height).toBeLessThanOrEqual(sel.top);
    expect(intersects(p, sel)).toBe(false);
  });

  it("a top-of-page selection flips below ONLY because there is no room above", () => {
    const sel: BubbleRect = { top: 20, bottom: 60, left: 200, width: 300 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.placed).toBe("below");
    expect(p.top).toBeGreaterThanOrEqual(sel.bottom);
    expect(intersects(p, sel)).toBe(false);
  });

  it("a selection with exactly the room above stays above — the flip is only when NO room", () => {
    // edge case: top = bubble height + gap + edge ⇒ the bubble exactly fits above.
    const sel: BubbleRect = { top: 36 + 8 + 8, bottom: 90, left: 200, width: 300 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.placed).toBe("above");
    expect(p.top).toBe(8); // pinned to the viewport edge
    expect(intersects(p, sel)).toBe(false);
  });

  it("a collapsed-width selection still centers + clamps horizontally", () => {
    const sel: BubbleRect = { top: 400, bottom: 420, left: 2, width: 0 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.left).toBe(8); // left-clamped — never bleeds off-screen
  });

  it("a right-edge selection clamps into the viewport", () => {
    const sel: BubbleRect = { top: 400, bottom: 420, left: 1400, width: 200 };
    const p = formatBubblePlacement(sel, BUBBLE, VIEW);
    expect(p.left + BUBBLE.width).toBeLessThanOrEqual(VIEW.w - 8);
  });
});
