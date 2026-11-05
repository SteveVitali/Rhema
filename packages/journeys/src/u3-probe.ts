// R7PANE.1 (REQ-PANE-4, REQ-DACC-7) — the shared `U3.occlusion` geometry probe. The deployed
// leg (r7legs.ts) calls `u3ProbePage` over the signed-in surface at the four desktop sizes and
// the demo surface at 390×844; the Stage-A local test (u3-occlusion.local.test.ts) calls the
// SAME probe over the demo surface at all five sizes against a local build — the demo mounts
// the identical `.ide` geometry, so the probe body is one source of truth.

import type { Page } from "playwright";
import { assertActionable } from "./occlusion.js";

const CH_PX = 9.7; // LAYOUT.chPx — the spec's ch→px fact mirrored in the probe.

export interface U3ProbeOpts {
  /** a demo surface hides the Chat tab (REQ-DWEB-7) — the probe asserts the gate instead. */
  readonly demo?: boolean;
  /** screenshot path, when the caller wants one. */
  readonly shot?: string;
}

/**
 * The per-size probe: the right panel closed by default below 1280 (a persisted docked intent
 * never auto-opens an overlay/sheet), zero intersection between the Page/dossier columns and
 * any open un-scrimmed panel/overlay/menu, the ≥45-ch floor at ≥768, every tab actionable,
 * scrim + Esc on the on-demand modes, and the separator's ARIA contract.
 */
export async function u3ProbePage(page: Page, w: number, h: number, opts: U3ProbeOpts = {}): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.locator("[data-ide][data-pane-mode]").waitFor({ state: "attached" });
  const ideAttr = async (name: string): Promise<string | null> =>
    page.locator("[data-ide]").getAttribute(name);

  if (w < 1280 && (await ideAttr("data-panel")) === "open") {
    throw new Error(`the right panel auto-opened as an overlay/sheet at ${w}×${h}`);
  }
  const bad = await page.evaluate(() => {
    const scrim = document.querySelector<HTMLElement>("[data-ide-scrim]");
    const scrimShown = scrim != null && getComputedStyle(scrim).display !== "none";
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 || r.height === 0 ? null : { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const hit = (
      a: { x: number; y: number; w: number; h: number } | null,
      b: { x: number; y: number; w: number; h: number } | null,
    ) => a != null && b != null && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const paper = box(document.querySelector(".ide-page .paper"));
    const letter = box(document.querySelector("article .paper"));
    for (const sel of [".ide-panel", ".ide-files"]) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const pos = getComputedStyle(el).position;
      if ((pos !== "absolute" && pos !== "fixed") || scrimShown) continue;
      const r = box(el);
      if (hit(r, paper) || hit(r, letter)) {
        return `${sel} sits un-scrimmed over the page/dossier column`;
      }
    }
    return null;
  });
  if (bad) throw new Error(`${bad} at ${w}×${h}`);

  if (w >= 768) {
    const ch = await page.evaluate((k) => {
      const paper = document.querySelector(".ide-page .paper");
      if (!paper) return -1;
      return Math.floor(paper.getBoundingClientRect().width / k);
    }, CH_PX);
    if (ch < 45) throw new Error(`the Page column is <45 ch (${ch}) at ${w}×${h}`);
  }

  // every tab is actionable — the ] chord is the primary open path; open the panel on demand
  // whenever it isn't already (closed-by-default below 1280, possibly findings-free ≥1280).
  if ((await ideAttr("data-panel")) !== "open") {
    await page.keyboard.press("]");
    if ((await ideAttr("data-panel")) !== "open") {
      throw new Error(`the right panel did not open on demand at ${w}×${h}`);
    }
  }
  if (opts.demo) {
    // REQ-DWEB-7 — a demo boot hides the Chat trigger; the other four stay actionable.
    const chat = page.locator("[data-ide-panel-tab='chat']");
    const hidden = await chat.evaluate((el) => (el as HTMLElement).hidden || el.hasAttribute("disabled")).catch(() => false);
    if (!hidden) throw new Error(`the demo Chat trigger is not hidden/disabled at ${w}×${h}`);
    for (const tab of ["findings", "claims", "timeline", "feed"] as const) {
      await assertActionable(page.locator(`[data-ide-panel-tab='${tab}']`), `panel tab ${tab} @${w}×${h}`);
    }
  } else {
    for (const tab of ["chat", "findings", "claims", "timeline", "feed"] as const) {
      await assertActionable(page.locator(`[data-ide-panel-tab='${tab}']`), `panel tab ${tab} @${w}×${h}`);
    }
  }

  if (w < 1280) {
    const scrimmed = await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-ide-scrim]");
      return s != null && getComputedStyle(s).display !== "none";
    });
    if (!scrimmed) throw new Error(`the open overlay/sheet has no scrim at ${w}×${h}`);
    await page.keyboard.press("Escape");
    if ((await ideAttr("data-panel")) !== "closed") {
      throw new Error(`Esc did not close the overlay/sheet at ${w}×${h}`);
    }
  } else {
    await page.keyboard.press("]"); // close again for the trailing intersection assert
    const bad2 = await page.evaluate(() => {
      const scrim = document.querySelector<HTMLElement>("[data-ide-scrim]");
      const scrimShown = scrim != null && getComputedStyle(scrim).display !== "none";
      if (scrimShown) return "the scrim stayed armed with no overlay open";
      const el = document.querySelector<HTMLElement>(".ide-panel");
      if (!el) return null;
      const pos = getComputedStyle(el).position;
      if (pos !== "absolute" && pos !== "fixed") return null;
      const r = el.getBoundingClientRect();
      const paper = document.querySelector(".ide-page .paper")?.getBoundingClientRect();
      if (!paper) return null;
      const hit = r.left < paper.right && paper.left < r.right && r.top < paper.bottom && paper.top < r.bottom;
      return hit ? "an un-scrimmed panel covers the page column" : null;
    });
    if (bad2) throw new Error(`${bad2} at ${w}×${h}`);
  }

  const sep = page.locator('[data-ide-handle="panel"]');
  if ((await sep.getAttribute("role")) !== "separator") {
    throw new Error(`the panel handle is not role="separator" at ${w}×${h}`);
  }
  if (opts.shot) await page.screenshot({ path: opts.shot });
}
