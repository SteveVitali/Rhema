// SPA.4 (REQ-BND-8, REQ-UX-7/9, REQ-VFY-3, REQ-NAV-7) — the client head manager. On every committed
// navigation it (1) rewrites `document.title` through the same `docMetaFor` the SSR document stamps,
// (2) moves DOM focus to the route's `<h1>` — a hash target wins when the link carried one
// (deep-link parity — the browser does this on hard loads; the SPA must do it by hand), (3) echoes
// the title into a polite live region so assistive tech hears the route change, and (4) stamps the
// settle markers journeys probe: `data-route` (the `$param` routeId — the same string the SSR twin
// emits via `spaRouteFor`) and `data-mounted` once the match has resolved (REQ-VFY-3's
// `[data-route][data-mounted]` contract). Scroll restoration is the router's `scrollRestoration`
// option; no autofocus anywhere — the h1 receives focus, never a form control.
//
// NAVC.2 (REQ-NAVT-1) — the same committed transitions also tick `data-nav-count`: the served
// document stamps `"0"` and every later committed location key increments it once (push /
// replace / pop — hydration is the seed run, never a transition). A document load lands a
// fresh `"0"`, so the reset is itself the mechanism detector journeys pin (the navKey signal
// is the same committed-transition definition NAVC.1's interceptor suite pins).

import { useEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { spaRouteFor } from "@rhema/contracts";
import { docMetaFor } from "../doc-meta.js";

const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export function HeadManager(): ReactNode {
  const announcer = useRef<HTMLDivElement | null>(null);
  // The committed location key last counted — `null` until the first effect run (hydration),
  // and the tally so far (a fresh component instance per document ⇒ a fresh "0").
  const lastNavKey = useRef<string | null>(null);
  const navCount = useRef(0);
  const { navKey, pathname, hash, isLoading } = useRouterState({
    select: (s) => ({
      navKey: s.location.state.key ?? null,
      pathname: s.location.pathname,
      hash: s.location.hash,
      isLoading: s.isLoading,
    }),
  });

  useEffect(() => {
    const html = document.documentElement;
    // REQ-NAVT-1 — increment once per committed in-document location transition. `state.key`
    // rotates on every commit (push/replace mint new keys; a pop restores the target entry's
    // key — always ≠ the current one), so a key change IS the transition. The first run only
    // seeds — hydration must never count — and effect re-runs from an `isLoading` flip carry
    // the same key, so they can't double-count.
    if (lastNavKey.current == null) {
      lastNavKey.current = navKey;
    } else if (lastNavKey.current !== navKey) {
      lastNavKey.current = navKey;
      navCount.current += 1;
    }
    html.setAttribute("data-nav-count", String(navCount.current));
    // REQ-VFY-3 — the per-route settle probe. `spaRouteFor` is the same matcher the SSR document
    // uses, so `data-route` agrees across renderers; an unknown path stamps its normalized path
    // (the SSR fallback convention).
    html.setAttribute("data-route", spaRouteFor(pathname).routeId ?? (pathname.replace(/\/+$/, "") || "/"));
    const title = docMetaFor(pathname).title;
    document.title = title;
    if (announcer.current) {
      // Clear then set so a same-title navigation still reads as a route change.
      announcer.current.textContent = "";
      announcer.current.textContent = title;
    }
    if (isLoading) {
      // REQ-NAVT-2 — pending is UNresolved: `data-route` already flipped to the new route, so
      // `data-mounted` must leave with it — `[data-route][data-mounted]` means "resolved leaf"
      // again and a mid-transition settle can no longer false-pass on the stale pair.
      html.removeAttribute("data-mounted");
      return;
    }
    // `data-mounted` flips only after the route's match has resolved — pending stays unmounted
    // (the shell never stamps it statically; a served SSR document carries it by completeness).
    html.setAttribute("data-mounted", "");
    const hashTarget = hash !== "" ? document.getElementById(hash) : null;
    const focusEl = hashTarget ?? document.querySelector("[data-spa-root] h1");
    if (focusEl instanceof HTMLElement) {
      if (!focusEl.hasAttribute("tabindex")) focusEl.tabIndex = -1;
      focusEl.focus();
    }
  }, [navKey, pathname, hash, isLoading]);

  return (
    <div
      ref={announcer}
      aria-live="polite"
      role="status"
      data-route-announcer
      style={SR_ONLY}
    />
  );
}
