// R7SYNC.1 (REQ-SPEED-3; R6 UXC-34/35; ADR-128's REQ-NAVM-7 item) — the delegated
// pointerover/focusin prefetcher: ONE document listener pair (the nav-intercept precedent).
// A hover or keyboard focus on an in-app anchor resolves its href through the declared
// `prefetchQueryForHref` map and issues at most one `prefetchQuery` per href per focus pass —
// the QueryClient dedupes in-flight and cached reads. Only PREFETCH_SAFE twins resolve (the
// mark-read/mint twins return null); router `defaultPreload` stays off. Demo boots restrict
// to `demo~` twins (never `/bff/search`, never a session-gated read).

import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";
import { prefetchQueryForHref } from "./queries.js";
import type { SpaBoot } from "./boot.js";

export function installPrefetcher(
  queryClient: QueryClient,
  getBoot: () => SpaBoot | null,
): () => void {
  let last = "";
  const maybe = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const a = t.closest("a[href]");
    const href = a?.getAttribute("href") ?? "";
    if (!href.startsWith("/p/") && !href.startsWith("/app") && !href.startsWith("/usage") &&
        !href.startsWith("/voices") && !href.startsWith("/v/") && !href.startsWith("/demo")) return;
    if (href === last && e.type === "pointerover") return;
    last = href;
    const demo = getBoot()?.demo;
    const q = prefetchQueryForHref(href, { demoSlug: demo?.slug ?? null });
    if (q != null) void queryClient.prefetchQuery(q as FetchQueryOptions);
  };
  document.addEventListener("pointerover", maybe, true);
  document.addEventListener("focusin", maybe, true);
  return () => {
    document.removeEventListener("pointerover", maybe, true);
    document.removeEventListener("focusin", maybe, true);
  };
}
