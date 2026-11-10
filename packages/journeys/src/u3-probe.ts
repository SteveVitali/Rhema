// R7PANE.1 (REQ-PANE-4, REQ-DACC-7) — the shared `U3.occlusion` geometry probe. The deployed
// leg (r7legs.ts) calls `u3ProbePage` over the signed-in surface at the four desktop sizes and
// the demo surface at 390×844; the Stage-A local test (u3-occlusion.local.test.ts) calls the
// SAME probe over the demo surface at all five sizes against a local build — the demo mounts
// the identical `.ide` geometry, so the probe body is one source of truth.
// 249_R7GUARD.1 adds the tour-target arm: `u3UnscrimmedViolation` is the shared "no
// un-scrimmed overlay over a target" assertion the local five-size walk and the deployed
// leg's demo arm both call over `TOUR_STEPS`' targets (REQ-PANE-4's "every tour target").

import type { Page } from "playwright";
import { assertActionable } from "./occlusion.js";

const CH_PX = 9.7; // LAYOUT.chPx — the spec's ch→px fact mirrored in the probe.

export interface U3ProbeOpts {
  /** a demo surface hides the Chat tab (REQ-DWEB-7) — the probe asserts the gate instead. */
  readonly demo?: boolean;
  /** screenshot path, when the caller wants one. */
  readonly shot?: string;
}

export interface U3OcclusionTarget {
  /** a stable name for error output (the tour step id, or a surface name). */
  readonly id: string;
  /** the DOM-contract selector the guard probes. */
  readonly selector: string;
}

/**
 * REQ-PANE-4 / REQ-GUARD-4 — the shared "no un-scrimmed overlay over a target" assertion.
 * For each `{id, selector}` the page carries, no open un-scrimmed panel/overlay/menu
 * intersects it. The in-page census counts an element when it renders out-of-flow
 * (absolute/fixed) with a non-zero box and no live scrim stands between it and the content
 * beneath:
 *   - `.ide-panel` in overlay/sheet mode arms `[data-ide-scrim]` — the pane minus its scrim
 *     is the R5 defect the guard exists to catch; a scrimmed pane is legal modal state;
 *   - a modal Radix `.ui-dialog`/`.ui-sheet` paints `.ui-dialog-overlay` (its scrim) — a
 *     non-modal sheet still counts (it floats over the column by design);
 *   - popper surfaces (`[data-radix-popper-content-wrapper]` and the `.ui-menu`/`.ui-popover`/
 *     `.ui-select-content`/`.ui-tooltip` contents inside one) carry no scrim — they count
 *     whenever open;
 *   - the tour coach mark `[data-demo-tour]` counts with centre-point semantics — the
 *     D2.tour rule: a container target tolerates the mark at its edges, a pointed target
 *     fails the moment the mark sits over its centre.
 * A pointed target (under ~55% of the viewport) fails on any rect intersection with a
 * non-mark overlay; a container target fails when an overlay contains its centre point.
 * Returns the first violation as a message, or `null`.
 */
export async function u3UnscrimmedViolation(
  page: Page,
  targets: readonly U3OcclusionTarget[],
): Promise<string | null> {
  return page.evaluate(
    (list) => {
      interface Box {
        x: number;
        y: number;
        w: number;
        h: number;
      }
      const rect = (el: Element): Box | null => {
        const r = el.getBoundingClientRect();
        return r.width === 0 || r.height === 0
          ? null
          : { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const shown = (el: Element | null): boolean =>
        el != null &&
        !(el as HTMLElement).hidden &&
        getComputedStyle(el).display !== "none" &&
        getComputedStyle(el).visibility !== "hidden";
      const outOfFlow = (el: Element): boolean => {
        const pos = getComputedStyle(el).position;
        return pos === "absolute" || pos === "fixed";
      };
      const scrimShown = shown(document.querySelector("[data-ide-scrim]"));
      const dialogScrimShown = shown(document.querySelector(".ui-dialog-overlay"));

      interface Overlay extends Box {
        label: string;
        mark: boolean;
      }
      const overlays: Overlay[] = [];
      const seen = new Set<Element>();
      const push = (el: Element, label: string, mark: boolean): void => {
        if (seen.has(el)) return;
        seen.add(el);
        const r = rect(el);
        if (r != null) overlays.push({ label, mark, ...r });
      };

      // `.ide-panel` — counts only when it floats over the column with no scrim armed.
      for (const el of document.querySelectorAll(".ide-panel")) {
        if (scrimShown || !shown(el) || !outOfFlow(el)) continue;
        push(el, "the right panel (.ide-panel)", false);
      }
      // Radix dialog/sheet content — `.ui-dialog-overlay` is the scrim; a NON-modal sheet
      // has no overlay and stays counted (its float is deliberate, so it must never cover).
      for (const el of document.querySelectorAll(".ui-dialog, .ui-sheet")) {
        if (dialogScrimShown || !shown(el) || !outOfFlow(el)) continue;
        push(el, `a dialog/sheet (.${(el as HTMLElement).className.split(" ")[0]})`, false);
      }
      // Popper surfaces (menus, popovers, select content, tooltips) — never scrimmed.
      // Radix portals them under a fixed-position wrapper, so the overlay box is the
      // nearest out-of-flow ancestor's (the wrapper's); `seen` dedupes the contents of
      // one wrapper to a single report. (The wrapper's Radix-internal attribute is
      // deliberately not named — the DOM contract only manifests our own hooks.)
      for (const el of document.querySelectorAll(
        ".ui-menu, .ui-popover, .ui-select-content, .ui-tooltip",
      )) {
        if (!shown(el)) continue;
        let box: Element = el;
        for (let a: Element | null = el; a != null; a = a.parentElement) {
          if (outOfFlow(a)) {
            box = a;
            break;
          }
        }
        if (!outOfFlow(box)) continue;
        push(box, `a menu/popover (<${el.tagName.toLowerCase()}>)`, false);
      }
      // The tour coach mark — centre-point semantics.
      for (const el of document.querySelectorAll("[data-demo-tour]")) {
        if (!shown(el) || !outOfFlow(el)) continue;
        push(el, "the tour coach mark", true);
      }

      const hit = (a: Box, b: Box): boolean =>
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const contains = (o: Overlay, cx: number, cy: number): boolean =>
        cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h;

      for (const t of list) {
        const el = document.querySelector(t.selector);
        if (el == null) return `target ${t.id} (${t.selector}) is absent`;
        if (!shown(el)) return `target ${t.id} (${t.selector}) is not rendered`;
        const tr = rect(el);
        if (tr == null) return `target ${t.id} (${t.selector}) has a zero-size box`;
        const container = tr.w * tr.h >= 0.55 * window.innerWidth * window.innerHeight;
        const cx = Math.min(Math.max(tr.x + tr.w / 2, 1), window.innerWidth - 1);
        const cy = Math.min(Math.max(tr.y + tr.h / 2, 1), window.innerHeight - 1);
        for (const o of overlays) {
          if (o.mark || container) {
            if (contains(o, cx, cy)) {
              return `${o.label} covers ${t.id} (${t.selector})'s centre`;
            }
          } else if (hit(tr, o)) {
            return `${o.label} intersects target ${t.id} (${t.selector})`;
          }
        }
      }
      return null;
    },
    targets.map((t) => ({ id: t.id, selector: t.selector })),
  );
}

/**
 * The per-size probe: the right panel closed by default below 1280 (a persisted docked intent
 * never auto-opens an overlay/sheet), zero intersection between the Page/dossier columns and
 * any open un-scrimmed panel/overlay/menu, the ≥45-ch floor at ≥768, every tab actionable,
 * scrim + Esc on the on-demand modes, and the separator's ARIA contract.
 */
export async function u3ProbePage(
  page: Page,
  w: number,
  h: number,
  opts: U3ProbeOpts = {},
): Promise<void> {
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
      return r.width === 0 || r.height === 0
        ? null
        : { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const hit = (
      a: { x: number; y: number; w: number; h: number } | null,
      b: { x: number; y: number; w: number; h: number } | null,
    ) =>
      a != null &&
      b != null &&
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h;
    const paper = box(document.querySelector(".ide-page .paper"));
    const letter = box(document.querySelector("article .paper"));
    for (const sel of [".ide-panel"]) {
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
  // The chord is a bare chrome key — inert while a field or the Page holds focus (the blank
  // Page's title-focus claim can hold it at the first size), so the caret blurs out of any
  // zone first — the same arm U2/U5 take. The press also raced the listener mount once at
  // T1d (1440×900): bound the wait on the open state and allow one retry; a still-closed
  // panel then throws honestly — a non-opening panel is a defect, never masked.
  if ((await ideAttr("data-panel")) !== "open") {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let opened = false;
    for (let attempt = 0; attempt < 2 && !opened; attempt++) {
      await page.keyboard.press("]");
      opened = await page
        .waitForSelector("[data-ide][data-panel='open']", { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) throw new Error(`the right panel did not open on demand at ${w}×${h}`);
  }
  if (opts.demo) {
    // REQ-DWEB-7 — a demo boot hides the Chat trigger; the other four stay actionable.
    const chat = page.locator("[data-ide-panel-tab='chat']");
    const hidden = await chat
      .evaluate((el) => (el as HTMLElement).hidden || el.hasAttribute("disabled"))
      .catch(() => false);
    if (!hidden) throw new Error(`the demo Chat trigger is not hidden/disabled at ${w}×${h}`);
    for (const tab of ["findings", "claims", "timeline", "feed"] as const) {
      await assertActionable(
        page.locator(`[data-ide-panel-tab='${tab}']`),
        `panel tab ${tab} @${w}×${h}`,
      );
    }
  } else {
    for (const tab of ["chat", "findings", "claims", "timeline", "feed"] as const) {
      await assertActionable(
        page.locator(`[data-ide-panel-tab='${tab}']`),
        `panel tab ${tab} @${w}×${h}`,
      );
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
    // close again for the trailing intersection assert — the same bounded arm as the
    // open: a raced toggle would carry an open panel into the next size's auto-open
    // check and misreport it as a defect.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.keyboard.press("]");
      const closed = await page
        .waitForSelector("[data-ide][data-panel='closed']", { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (closed) break;
    }
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
      const hit =
        r.left < paper.right &&
        paper.left < r.right &&
        r.top < paper.bottom &&
        paper.top < r.bottom;
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
