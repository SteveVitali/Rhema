// JOURNEY.1 — the actionable-control assertion (PR-J6 finding: chat's Send was reachable in the DOM
// but covered). A control is actionable when it is visible, enabled, and its center point is not
// covered by another element — Playwright's own actionability hit-target check backs the click, this
// helper makes the "unobscured" part an explicit, deterministic assertion with a named failure.

import type { Locator } from "playwright";

/**
 * Assert `locator` is actionable — visible, enabled, and not covered at its center point — then
 * return it (the caller clicks/fills). Throws with the control's name when any leg fails.
 */
export async function assertActionable(locator: Locator, name: string): Promise<Locator> {
  const count = await locator.count();
  if (count === 0) throw new Error(`${name}: not in the DOM`);
  if (count > 1) throw new Error(`${name}: ${count} matches — the selector is ambiguous`);
  const el = locator.first();
  if (!(await el.isVisible())) throw new Error(`${name}: not visible`);
  if (!(await el.isEnabled())) throw new Error(`${name}: not enabled`);
  const coveredBy = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return "(zero-size box)";
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (top === node || node.contains(top) || (top && top.contains(node))) return null;
    return top ? `<${top.tagName.toLowerCase()} class="${top.className}">` : "(no element at point)";
  });
  if (coveredBy) throw new Error(`${name}: occluded at its center point by ${coveredBy}`);
  return el;
}

/** Bounded enable-wait for controls that mount disabled until async state lands — the Review
 *  launch disables itself while the estimate computes (`est.missing`), and a one-shot enable
 *  assert raced it into a false "not enabled" (R6FIX.50; live datum 2026-11-25: a funded leg
 *  failed ~9 s in with "Estimate pending — the draft is still being measured"). Falling
 *  through on expiry is deliberate — the caller's assertActionable produces the precise line. */
export async function waitEnabled(locator: Locator, ms = 60_000): Promise<void> {
  const el = locator.first();
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await el.isEnabled({ timeout: 1_000 }).catch(() => false)) return;
    await el.page().waitForTimeout(500);
  }
}

/**
 * Assert a clickable target is actionable AND click it — the common pair. `click` re-runs
 * Playwright's own hit-target check, so an occlusion that develops between the assert and the click
 * still fails rather than silently landing elsewhere.
 */
export async function clickActionable(locator: Locator, name: string): Promise<void> {
  const el = await assertActionable(locator, name);
  await el.click();
}
