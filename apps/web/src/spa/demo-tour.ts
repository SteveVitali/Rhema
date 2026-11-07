// 222 R7DEM.6a (REQ-TOUR-2/-4/-5; ADR-128 REQ-GROWTH-12; REQ-PANE-0 stopgap; S-9/S-10/S-14) —
// THE GUIDED TOUR. This module is 221's lazy `import()` boundary (demo-effects.tsx owns the
// dynamic import; the tour's bytes stay out of the entry graph under `otherAsyncGzipBytes`).
//
// Mechanics:
//   • Steps are DATA ({id, route, target, targetValue?, placement, copyKey, advance, aside?}) —
//     this ticket owns the schema (recorded extensions beyond the spec's five keys:
//     `targetValue` selects `[<hook>="<value>"]`; `aside` is a secondary hop link inside the
//     coach mark — the S-6 "What a contradicted claim looks like" side card and step 8's
//     "then the response letter").
//   • Tour state rides the URL — `?tour=<stepId>` on the public `/demo/<essay>/…` path (the
//     declared `tour` urlparam; never a cookie, R4 §6). The overlay renders ONLY while the
//     param names a step whose route matches the current path — it never auto-starts.
//   • Non-modal: no focus trap, no scrim, Esc exits to free roam (navigates to the same path
//     minus the param). Controls are real <a> hops through the delegated click interceptor —
//     Next/Back are client navs inside the demo namespace; the final CTA and every exit carry
//     `data-spa-native` (document navigations, S-14).
//   • ←/→/Esc bind only while a tour step is active and never while the event target is a text
//     field or editable host — `dispatchIdeKey` binds no arrows, and Esc is margin/findings
//     scoped; the tour's Esc stops propagation when it acts so one Esc dismisses one layer.
//   • Placement never occludes the target: the coach mark positions fixed below the target,
//     flips above when below-space is short, and clamps into the viewport; the step table's
//     `placement` is a preference, measured placement is asserted non-intersecting.
//   • Reduced motion: `prefers-reduced-motion` → instant scrolls, no CSS transitions.
//   • Lifecycle callbacks for 223_R7DEM.6b: `onStart` fires once per document when the tour
//     first shows; `onCompleteOrCta` fires when the final CTA (or the last step's completion
//     hop) is activated — 223 wires the demo.tour_* emissions here.
//
// It must never import snapshot JSON or corpus text (demo-bundle.test.ts greps `public/spa`
// for snapshot bytes): every quoted fragment is a pinned COPY literal asserted verbatim
// against the committed corpus by demo-tour-steps.test.ts.

import { demoInternalPath } from "@rhema/contracts";
import { COPY } from "../copy.js";
import { demoBootNow } from "./demo.js";

/** The essay the tour is pinned to (the registry's hero). */
const TOUR_ESSAY = "structure-of-political-difference";
const TOUR_SLUG = `demo~${TOUR_ESSAY}`;
const TOTAL = 11;

/** One step of the tour (the schema this ticket owns, REQ-TOUR-2). */
export interface DemoTourStep {
  /** Stable step id — also the `?tour=` value and the `data-demo-tour-step` value. */
  readonly id: string;
  /** The essay-relative route the step lives on ("" = the essay root). */
  readonly route: string;
  /** A DECLARED DOM-contract hook the coach mark points at — asserted in the steps test. */
  readonly target: string;
  /** Optional value the hook must carry (`[<hook>="<value>"]`) — the recorded extension. */
  readonly targetValue?: string;
  /** Preferred side ("bottom" falls back to "top" when space is short). */
  readonly placement: "bottom" | "top";
  /** The COPY.demo.tour.steps leaf the coach mark renders (≤ 2 sentences). */
  readonly copyKey: TourCopyId;
  /** How the step completes — "next" unlocks the Next hop; "click-target" is reserved for
   *  a later step (no current step uses it). */
  readonly advance: "next" | "click-target";
  /** 248 R7TOUR.2 (REQ-PANE-2/4) — a right-panel tab the step opens before locating its
   *  target, when the target lives inside a tab body (REQ-PANE-5 moved findings there).
   *  The engine activates the same `[data-ide-panel-tab]` control a user would — the
   *  controller's delegated handler opens the panel (docked, scrimmed overlay, or sheet at
   *  the current width) and selects the tab, so the mark never points at a hidden node. */
  readonly panelTab?: "findings" | "claims" | "chat" | "timeline" | "feed";
  /** A secondary hop rendered inside the coach mark (deep link; document nav when it crosses
   *  essays — the interceptor's demo predicate keeps same-essay hops client-side). */
  readonly aside?: {
    readonly copyKey: TourCopyId;
    readonly href: string;
  };
  /** Optional query string carried before `?tour=` (recorded extension — `layout=moves` on the
   *  compare route renders the move-join the steps point at; REQ-PANE-0's moves layout). */
  readonly search?: string;
}

/**
 * The 11-step SPD script (REQ-TOUR-2 verbatim script on today's surfaces; corpus pins in
 * runs/R7DEM.6a.md — every quoted fragment in the COPY leaves is verbatim at its recorded
 * file:line; targets are existing DOM-contract hooks, never test-only).
 */
export const DEMO_TOUR_STEPS: readonly DemoTourStep[] = [
  {
    id: "published",
    route: "",
    target: "data-page-root",
    placement: "bottom",
    copyKey: "published",
    advance: "next",
  },
  {
    id: "v1",
    route: "/v/1",
    target: "data-page-host",
    placement: "top",
    copyKey: "v1",
    advance: "next",
  },
  {
    id: "verdict",
    route: "/review/v1-review",
    target: "data-letter-section",
    targetValue: "verdict",
    placement: "bottom",
    copyKey: "verdict",
    advance: "next",
  },
  {
    id: "one-thing",
    route: "/review/v1-review",
    // REQ-PANE-5 — the finding lives in the right panel now; the beat is the letter's own
    // directive, so the mark pins the Verdict section's passage link (letter column).
    target: "data-passage-link",
    targetValue: "The one thing",
    placement: "bottom",
    copyKey: "oneThing",
    advance: "next",
  },
  {
    id: "two-readers",
    route: "/review/v1-review",
    target: "data-finding",
    targetValue: "Major 1",
    panelTab: "findings",
    placement: "bottom",
    copyKey: "twoReaders",
    advance: "next",
  },
  {
    id: "claims",
    route: "/review/v1-review",
    target: "data-claim",
    targetValue: "22",
    placement: "top",
    copyKey: "claims",
    advance: "next",
    aside: {
      copyKey: "claimsAside",
      href: "/demo/the-governable-mind/review/v2-review#data-claim",
    },
  },
  {
    id: "figure",
    route: "/figures",
    // S-7 — the imported-image figure card (the v2 regeneration the review asked for).
    target: "data-figure-image",
    targetValue: "figure_2_ches_correlations_v2",
    placement: "bottom",
    copyKey: "figure",
    advance: "next",
  },
  {
    id: "responses",
    route: `/a/agents--author--ledgers--${["v1", "response", "ledger.md"].join("-")}`,
    target: "data-page-host",
    placement: "top",
    copyKey: "responses",
    advance: "next",
    aside: {
      copyKey: "responsesAside",
      href: "/demo/structure-of-political-difference/a/correspondence--v1-response.md",
    },
  },
  {
    id: "what-changed",
    route: "/v/1/diff/2",
    search: "layout=moves",
    target: "data-move-card",
    targetValue: "M2",
    placement: "bottom",
    copyKey: "whatChanged",
    advance: "next",
  },
  {
    id: "writer-edit",
    route: "/v/2/diff/3",
    search: "layout=moves",
    target: "data-what-changed",
    placement: "top",
    copyKey: "writerEdit",
    advance: "next",
  },
  {
    id: "cta",
    route: "",
    target: "data-page-root",
    placement: "top",
    copyKey: "cta",
    advance: "next",
  },
];

/** The steps/aside leaf ids (a literal union — `keyof typeof COPY.demo.tour.steps` would leave
 *  a `COPY.*` token the containment test reads as an unresolved leaf). */
type TourCopyId =
  | "published" | "v1" | "verdict" | "oneThing" | "twoReaders" | "claims" | "claimsAside"
  | "figure" | "responses" | "responsesAside" | "whatChanged" | "writerEdit" | "cta";

/** Literal-keyed step copy (the containment test resolves only literal COPY member paths — a
 *  dynamic `COPY.demo.tour.steps[k]` would read as an unresolved leaf). */
const STEP_COPY: Record<TourCopyId, string> = {
  published: COPY.demo.tour.steps.published,
  v1: COPY.demo.tour.steps.v1,
  verdict: COPY.demo.tour.steps.verdict,
  oneThing: COPY.demo.tour.steps.oneThing,
  twoReaders: COPY.demo.tour.steps.twoReaders,
  claims: COPY.demo.tour.steps.claims,
  claimsAside: COPY.demo.tour.steps.claimsAside,
  figure: COPY.demo.tour.steps.figure,
  responses: COPY.demo.tour.steps.responses,
  responsesAside: COPY.demo.tour.steps.responsesAside,
  whatChanged: COPY.demo.tour.steps.whatChanged,
  writerEdit: COPY.demo.tour.steps.writerEdit,
  cta: COPY.demo.tour.steps.cta,
};

export interface DemoTourEvents {
  /** Fires once per document when a tour step first shows (223 wires demo.tour_started). */
  readonly onStart?: () => void;
  /** Fires when the final CTA is activated (223 wires demo.tour_completed_or_cta). */
  readonly onCompleteOrCta?: () => void;
}

/** The `?tour=` value → step (or null). */
export function tourStepFor(value: string | null): DemoTourStep | null {
  if (value == null) return null;
  return DEMO_TOUR_STEPS.find((s) => s.id === value) ?? null;
}

/** The public-path href for a step (`?tour=<id>` carried verbatim; a live `?src=` is
 *  propagated so the funnel tag survives the whole tour — REQ-TOUR-9 cohort hygiene). */
export function tourStepHref(step: DemoTourStep): string {
  const q = step.search != null ? `${step.search}&` : "";
  let src = "";
  try {
    const v = new URLSearchParams(window.location.search).get("src");
    if (v != null && v !== "") src = `&src=${encodeURIComponent(v.slice(0, 40))}`;
  } catch {
    /* non-DOM callers (step tables, tests) carry no src */
  }
  return `/demo/${TOUR_ESSAY}${step.route}?${q}tour=${step.id}${src}`;
}

/** The CSS selector a step's target resolves to. */
export function tourTargetSelector(step: DemoTourStep): string {
  return step.targetValue != null ? `[${step.target}="${step.targetValue}"]` : `[${step.target}]`;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function fmt(template: string, vars: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/**
 * Mount the tour engine. Called once per demo document by `DemoEffects` (the lazy seam). A
 * no-op outside the tour's essay or while `?tour=` is absent — the overlay then renders only
 * when the URL names a step whose route matches the current path.
 */
export function mountDemoTour(events?: DemoTourEvents): () => void {
  const boot = demoBootNow();
  if (boot == null || boot.essay !== TOUR_ESSAY) return () => undefined;
  // idempotent — DemoEffects re-mounts across layout remounts; a second live engine would
  // double the overlay and the leg's [data-demo-tour-step] match set.
  if (document.querySelector("[data-demo-tour]") != null) return () => undefined;

  const overlay = document.createElement("div");
  overlay.setAttribute("data-demo-tour", "");
  overlay.setAttribute("role", "note");
  overlay.setAttribute("aria-label", COPY.demo.tour.heading);
  overlay.hidden = true;
  overlay.style.cssText =
    "position:fixed;z-index:60;max-width:340px;background:var(--shell-raised);" +
    "border:1px solid var(--shell-border);border-radius:12px;padding:14px 16px;" +
    "box-shadow:0 8px 28px rgba(0,0,0,0.24);font-size:13px;line-height:1.5;color:var(--shell-fg);";
  document.body.appendChild(overlay);

  let started = false;
  let raf = 0;
  let disposed = false;

  const stepForLocation = (): DemoTourStep | null => {
    const url = new URL(window.location.href);
    const step = tourStepFor(url.searchParams.get("tour"));
    if (step == null) return null;
    // The coach mark renders only on the step's own route — a `?tour=` that outlives its page
    // (free roam) renders nothing; reaching the step's route is the nav's job, never ours.
    const internal = demoInternalPath(url.pathname) ?? url.pathname;
    if (internal !== `/p/${TOUR_SLUG}${step.route}`) return null;
    return step;
  };

  const place = (target: HTMLElement): void => {
    const t = target.getBoundingClientRect();
    if (t.width === 0 && t.height === 0) return;
    const ow = overlay.offsetWidth || 340;
    const oh = overlay.offsetHeight || 140;
    const gap = 12;
    const belowFits = t.bottom + gap + oh <= window.innerHeight - 8;
    const top = belowFits ? t.bottom + gap : Math.max(8, t.top - gap - oh);
    // center under the target (clamped) — a full-viewport target like [data-page-root] then
    // anchors the mark mid-viewport, never up against the zero-size a11y elements at top-left.
    const left = Math.min(
      Math.max(8, t.left + t.width / 2 - ow / 2),
      Math.max(8, window.innerWidth - ow - 8),
    );
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
  };

  let renderedId: string | null = null;
  const render = (step: DemoTourStep): void => {
    if (renderedId === step.id) return; // keep the located controls stable across re-syncs
    renderedId = step.id;
    overlay.textContent = "";
    const n = DEMO_TOUR_STEPS.indexOf(step) + 1;
    const idx = DEMO_TOUR_STEPS.indexOf(step);

    const mark = document.createElement("p");
    mark.setAttribute("data-demo-tour-step", step.id);
    mark.style.cssText = "margin:0 0 6px;font-weight:600;";
    mark.textContent = `${COPY.demo.tour.heading} · ${fmt(COPY.demo.tour.counterFmt, { n: String(n), total: String(TOTAL) })}`;
    overlay.appendChild(mark);

    const body = document.createElement("p");
    body.style.cssText = "margin:0 0 10px;";
    body.textContent = STEP_COPY[step.copyKey];
    overlay.appendChild(body);

    if (step.aside != null) {
      const a = document.createElement("a");
      a.setAttribute("data-demo-tour-aside", "");
      a.setAttribute("data-spa-native", "");
      a.href = step.aside.href;
      a.style.cssText = "display:block;margin:0 0 10px;color:var(--accent);";
      a.textContent = STEP_COPY[step.aside.copyKey];
      overlay.appendChild(a);
    }

    const ctrls = document.createElement("div");
    ctrls.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;";

    const prev = DEMO_TOUR_STEPS[idx - 1];
    if (prev != null) {
      const back = document.createElement("a");
      back.setAttribute("data-demo-tour-prev", "");
      back.href = tourStepHref(prev);
      back.style.cssText = "display:inline-block;padding:4px 2px;";
      back.textContent = COPY.demo.tour.back;
      ctrls.appendChild(back);
    }

    if (step.id === "cta") {
      const cta = document.createElement("a");
      cta.setAttribute("data-demo-tour-cta", "");
      cta.setAttribute("data-spa-native", "");
      cta.href = boot.signedIn ? "/app/new" : "/signup?src=demo";
      cta.style.cssText = "font-weight:600;color:var(--accent);display:inline-block;padding:4px 2px;";
      cta.textContent = boot.signedIn ? COPY.demo.tour.ctaNewProject : COPY.demo.tour.ctaSignUp;
      cta.addEventListener("click", () => events?.onCompleteOrCta?.());
      ctrls.appendChild(cta);
    } else {
      const next = DEMO_TOUR_STEPS[idx + 1];
      if (next != null && step.advance === "next") {
        const fwd = document.createElement("a");
        fwd.setAttribute("data-demo-tour-next", "");
        fwd.href = tourStepHref(next);
        fwd.style.cssText = "font-weight:600;color:var(--accent);display:inline-block;padding:4px 2px;";
        fwd.textContent = COPY.demo.tour.next;
        ctrls.appendChild(fwd);
      }
    }

    const exit = document.createElement("a");
    exit.setAttribute("data-demo-tour-close", "");
    exit.href = `${window.location.pathname}${window.location.search
      .replace(/([?&])tour=[^&]*&?/, "$1")
      .replace(/[?&]$/, "") || ""}`;
    exit.style.cssText = "display:inline-block;padding:4px 2px;";
    exit.textContent = COPY.demo.tour.exit;
    ctrls.appendChild(exit);

    overlay.appendChild(ctrls);

    const hint = document.createElement("p");
    hint.style.cssText = "margin:8px 0 0;font-size:11px;color:var(--shell-fg-muted);";
    hint.textContent = fmt(COPY.demo.tour.stepCountNoteFmt, { n: String(n), total: String(TOTAL) });
    overlay.appendChild(hint);
  };

  // 248 R7TOUR.2 (REQ-PANE-2/4) — a beat whose target lives in a right-panel tab opens the
  // panel the way a user does: the delegated `[data-ide-panel-tab]` activation. At docked
  // widths it commits {tab, open}; in overlay/sheet mode it also arms the session intent —
  // one mechanism at every breakpoint (the `]` chord and the View row do the same).
  const ensurePanelTab = (step: DemoTourStep): void => {
    if (step.panelTab == null) return;
    const ide = document.querySelector<HTMLElement>(".ide");
    if (ide == null) return; // not an IDE-framed document — nothing to open
    if (ide.dataset["panel"] === "open" && ide.dataset["panelTab"] === step.panelTab) return;
    const btn = ide.querySelector<HTMLElement>(`[data-ide-panel-tab="${step.panelTab}"]`);
    if (btn == null || btn.hasAttribute("hidden") || btn.hasAttribute("disabled")) return;
    btn.click();
  };

  const sync = (): void => {
    if (disposed) return;
    const step = stepForLocation();
    if (step == null) {
      overlay.hidden = true;
      renderedId = null;
      return;
    }
    ensurePanelTab(step);
    const target = document.querySelector<HTMLElement>(tourTargetSelector(step));
    if (target == null) return; // subtree observer retries when the surface mounts
    if (overlay.hidden) {
      overlay.hidden = false;
      if (!started) {
        started = true;
        events?.onStart?.();
      }
    }
    render(step);
    try {
      // instant + nearest: the mark must never sit where the target was before a smooth scroll
      // settles — deterministic placement keeps the target visible and the mark un-occluded.
      target.scrollIntoView({ block: "nearest" });
    } catch {
      target.scrollIntoView();
    }
    // reduced-motion: no entrance transition; otherwise a light fade keeps the step change legible.
    overlay.style.transition = reducedMotion() ? "none" : "opacity .15s ease";
    place(target);
    window.setTimeout(() => {
      if (!disposed && !overlay.hidden) place(target);
    }, 0);
  };

  const scheduleSync = (): void => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };

  // Re-sync on every committed client nav (the shell's truthful stamps tick) and whenever the
  // subtree gains the step's target (surfaces mount async under React Query).
  const attrObserver = new MutationObserver(scheduleSync);
  attrObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-nav-count", "data-route", "data-mounted"],
  });
  // the overlay's own re-renders are mutations too — a sync triggered by them would loop, so
  // only mutations outside the overlay reschedule.
  const treeObserver = new MutationObserver((records) => {
    if (records.some((r) => !overlay.contains(r.target))) scheduleSync();
  });
  treeObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("scroll", scheduleSync, { passive: true });

  const clickStep = (attr: string): boolean => {
    const a = overlay.querySelector<HTMLElement>(attr);
    if (a == null || overlay.hidden) return false;
    a.click();
    return true;
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (overlay.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable ||
        t.closest("[contenteditable='true']") != null)
    ) {
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const attr = e.key === "ArrowRight" ? "[data-demo-tour-next]" : "[data-demo-tour-prev]";
      if (clickStep(attr)) e.preventDefault();
    } else if (e.key === "Escape") {
      if (clickStep("[data-demo-tour-close]")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };
  document.addEventListener("keydown", onKeydown);

  sync();

  return () => {
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    attrObserver.disconnect();
    treeObserver.disconnect();
    window.removeEventListener("resize", scheduleSync);
    window.removeEventListener("scroll", scheduleSync);
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
  };
}
