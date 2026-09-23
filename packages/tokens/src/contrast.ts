// WCAG 2.2 contrast math over the §5.9 token table (REQ-IDE-42). The design system ships its contrast
// invariants as COMPUTED unit tests — never asserted by eye: shell body ≥ 7:1, paper body ≥ 10:1 (AAA
// reading contrast), chips ≥ 4.5:1, non-text marks ≥ 3:1. Pure functions over #rrggbb hex.

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a `#rgb`/`#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors, in [1, 21]. */
export function contrastRatio(a: string, b: string): number {
  const sorted = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  const hi = sorted[0]!;
  const lo = sorted[1]!;
  return (hi + 0.05) / (lo + 0.05);
}
