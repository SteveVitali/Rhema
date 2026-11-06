// REQ-WRITE-1 — the format bubble's placement rule (R7WRITE.1a). PURE: the bubble sits ABOVE the
// selection's bounding rect and flips below ONLY when there is no room above; in either case its
// rect never intersects the selection's client rects (those live inside the bounding rect, so a
// bounding-rect placement guarantees non-intersection). The controller measures the rendered
// bubble and calls this; the test pins the three selection positions + the flip rule.

export interface BubbleRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
}

export interface BubblePlacement {
  readonly top: number;
  readonly left: number;
  /** where the bubble landed — `"above"` is the rule; `"below"` only when there is no room. */
  readonly placed: "above" | "below";
}

const GAP = 8;
const EDGE = 8;

/**
 * Place the bubble for a selection whose bounding rect is `sel` (viewport coords). `bubble` is the
 * measured `{width, height}` of the mounted bubble; `viewport` is `{w, h}`.
 *
 *   above: `sel.top - height - 8`, used whenever ≥ `EDGE` — the bubble's bottom edge rests 8 px
 *          above the selection's top line and can never cover it;
 *   below: `sel.bottom + 8` (clamped into the viewport) — ONLY when there is no room above.
 */
export function formatBubblePlacement(
  sel: BubbleRect,
  bubble: { readonly width: number; readonly height: number },
  viewport: { readonly w: number; readonly h: number },
): BubblePlacement {
  const left = Math.max(
    EDGE,
    Math.min(sel.left + sel.width / 2 - bubble.width / 2, viewport.w - bubble.width - EDGE),
  );
  const aboveTop = sel.top - bubble.height - GAP;
  if (aboveTop >= EDGE) return { top: aboveTop, left, placed: "above" };
  const top = Math.min(sel.bottom + GAP, Math.max(EDGE, viewport.h - bubble.height - EDGE));
  return { top, left, placed: "below" };
}
