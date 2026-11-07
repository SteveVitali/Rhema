// SPA.9 — the Desk's live feed binding (§5.5; REQ-ISL-14, REQ-BFF-12/24, REQ-UX-9). The island
// tail, ported to a React effect: the same-origin `EventSource` resumes at `?after=<lastSeq>`,
// server-built `FeedLabelMaps` (the `["feed-labels"]` Query — never a client-authored string)
// format every live row, malformed/unknown frames drop (fail-closed), and the 400-row bound +
// `usage.tick`/`step.*` run-card patches are verbatim. The SPA delta is the Query leg: a live
// event schedules a trailing-debounced `["bff"]` invalidation so surface data converges —
// `usage.tick` is exempt (its reading lands in the card meter directly; refetching per tick is
// the storm REQ-UX-15's one-SSE rule exists to prevent). The panel is `aria-live="polite"`, so
// every appended row IS the live-region announcement (the island's live-region vocabulary,
// unchanged).

import { useEffect, useRef, type RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  feedRowVisible,
  formatFeedRow,
  type FeedDensityTab,
  type FeedLabelMaps,
} from "@rhema/ide";
import { isDemo } from "../demo.js";
import type { IdeChromeFeed } from "./chrome-data.js";

export interface IdeFeedOpts {
  readonly hostRef: RefObject<HTMLElement | null>;
  /** The published feed slice — absent ⇒ the desk's feed tab keeps its empty state. */
  readonly feed?: IdeChromeFeed;
  /** The `["feed-labels"]` query data — the tail stays closed until maps resolve. */
  readonly maps?: FeedLabelMaps;
  readonly queryClient: QueryClient;
}

const PHASE_GLYPH: Record<string, string> = { done: "✓", running: "◐", pending: "○", skipped: "○", off: "○" };

export function useIdeFeed(opts: IdeFeedOpts): void {
  const latest = useRef(opts);
  latest.current = opts;
  const host = opts.hostRef;
  const feed = opts.feed;
  const maps = opts.maps;

  // Density-tab clicks are delegated on the ide root (stable under React child churn) and scoped
  // to the feed panel — bound once, independent of the feed slice's presence.
  useEffect(() => {
    const ide = host.current?.querySelector<HTMLElement>("[data-ide]");
    if (!ide) return;
    const onClick = (e: MouseEvent): void => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-feed-density]");
      const panel = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-feed-run]");
      if (!b || !panel) return;
      const density = (b.dataset["feedDensity"] as FeedDensityTab) ?? "details";
      // `data-density` on the section is the ONE truth — the append leg reads it back so the tab
      // click and the SSE appender can't drift apart (the island's single variable, DOM-stamped).
      const section = panel.querySelector<HTMLElement>("[data-live-feed]");
      if (section) section.dataset["density"] = density;
      panel.querySelectorAll<HTMLElement>("[data-feed-density]").forEach((el) =>
        el.setAttribute("aria-pressed", String(el.dataset["feedDensity"] === density)),
      );
      panel.querySelectorAll<HTMLElement>("[data-feed-density-row]").forEach((row) => {
        row.hidden = !feedRowVisible(row.dataset["feedDensityRow"] ?? "summary", density);
      });
    };
    ide.addEventListener("click", onClick);
    return () => ide.removeEventListener("click", onClick);
  }, [host]);

  // The SSE tail — rebinds when the feed slice (run/url/seq) or the label maps change.
  const feedRunId = feed?.runId;
  const feedEventsUrl = feed?.eventsUrl;
  const feedLastSeq = feed?.lastSeq;
  const feedDensity = feed?.density;
  useEffect(() => {
    const ide = host.current?.querySelector<HTMLElement>("[data-ide]");
    if (!ide || !feedRunId || !feedEventsUrl || !maps) return;
    const feedPanel = ide.querySelector<HTMLElement>("[data-feed-run]");
    if (!feedPanel) return;
    const feedSection = feedPanel.querySelector<HTMLElement>("[data-live-feed]");
    const rowsUl = feedPanel.querySelector<HTMLElement>("[data-feed-rows]");
    let lastSeq = Number.parseInt(feedPanel.dataset["feedLastSeq"] ?? "0", 10) || feedLastSeq || 0;

    // Re-filter once at bind so the replayed rows obey the selected density.
    const feedDensityTab: FeedDensityTab =
      (feedSection?.dataset["density"] as FeedDensityTab | undefined) ?? feedDensity ?? "details";
    if (feedSection) feedSection.dataset["density"] = feedDensityTab;
    feedPanel.querySelectorAll<HTMLElement>("[data-feed-density]").forEach((el) =>
      el.setAttribute("aria-pressed", String(el.dataset["feedDensity"] === feedDensityTab)),
    );
    feedPanel.querySelectorAll<HTMLElement>("[data-feed-density-row]").forEach((row) => {
      row.hidden = !feedRowVisible(row.dataset["feedDensityRow"] ?? "summary", feedDensityTab);
    });

    let invalidateTimer: ReturnType<typeof setTimeout> | undefined;
    /** Trailing 150 ms debounce — a phase-transition burst converges to ONE invalidation. */
    const scheduleInvalidate = (): void => {
      if (invalidateTimer) return;
      invalidateTimer = setTimeout(() => {
        invalidateTimer = undefined;
        // R7SYNC.1 (REQ-SPEED-3) — scoped: the run's project subtree + the inbox badge, not
        // every cached twin. The slug parses off the feed's own `/p/:slug/r/:runId/events` URL.
        const slug = /^\/p\/([^/]+)\/r\//.exec(latest.current.feed?.eventsUrl ?? "")?.[1];
        void latest.current.queryClient.invalidateQueries({
          queryKey: slug != null ? ["bff", "p", slug] : ["bff", "p"],
        });
        void latest.current.queryClient.invalidateQueries({ queryKey: ["bff", "app", "inbox"] });
      }, 150);
    };

    const appendRow = (ev: { seq?: number; type?: string; payload?: unknown; density?: string }): void => {
      if (!rowsUl || typeof ev.type !== "string") return;
      if (typeof ev.seq === "number") lastSeq = Math.max(lastSeq, ev.seq);
      const density = typeof ev.density === "string" ? ev.density : "summary";
      // the CURRENT tab (the section's stamped attr — the delegated click owns it)
      const selected =
        (feedSection?.dataset["density"] as FeedDensityTab | undefined) ?? feedDensityTab;
      if (!feedRowVisible(density, selected)) return;
      // RPT.1 — a provisional usage tick renders its ≈ template (provisional is never ambiguous).
      const key =
        ev.type === "usage.tick" &&
        typeof ev.payload === "object" &&
        ev.payload != null &&
        (ev.payload as Record<string, unknown>)["provisional"] === true
          ? "usage.tick.provisional"
          : ev.type;
      const text = formatFeedRow(key, ev.payload, maps);
      if (!text) return; // fail-closed: no template ⇒ no row
      const li = document.createElement("li");
      li.dataset.feedEvent = ev.type;
      li.dataset.feedDensityRow = density;
      li.style.display = "flex";
      li.style.gap = "10px";
      li.style.padding = "4px 0";
      li.style.fontSize = "13px";
      const label = document.createElement("span");
      label.textContent = text.label;
      li.appendChild(label);
      if (text.detail) {
        const d = document.createElement("span");
        d.textContent = text.detail;
        li.appendChild(d);
      }
      rowsUl.appendChild(li);
      while (rowsUl.childElementCount > 400) rowsUl.firstElementChild?.remove();
    };

    const cardEl = feedRunId !== "" ? ide.querySelector<HTMLElement>(`[data-run-card="${feedRunId}"]`) : null;
    const patchCard = (ev: { type?: string; payload?: unknown }): void => {
      if (cardEl == null || typeof ev.type !== "string") return;
      const p = typeof ev.payload === "object" && ev.payload != null ? (ev.payload as Record<string, unknown>) : {};
      if (ev.type === "usage.tick" || ev.type === "cost.final") {
        const spent = Number(p["spentCredits"]);
        const cap = Number(p["capCredits"]);
        if (!Number.isFinite(spent) || !Number.isFinite(cap)) return;
        const provisional = ev.type === "usage.tick" && p["provisional"] === true;
        const creditsEl = cardEl.querySelector<HTMLElement>("[data-credits]");
        if (creditsEl) {
          const rendered = formatFeedRow(
            provisional ? "card.meterProvisional" : "card.meter",
            { spentCredits: spent.toLocaleString("en-US"), capCredits: cap.toLocaleString("en-US") },
            maps,
          );
          if (rendered) creditsEl.textContent = rendered.label;
          if (provisional) creditsEl.setAttribute("data-provisional", "true");
          else creditsEl.removeAttribute("data-provisional");
        }
        const meter = cardEl.querySelector<HTMLElement>("[data-credit-meter]");
        if (meter && cap > 0) meter.style.width = `${Math.min(100, Math.max(0, Math.round((spent / cap) * 100)))}%`;
      }
      if (ev.type === "step.started" || ev.type === "step.finished") {
        const phase = typeof p["phase"] === "string" ? p["phase"] : null;
        const li = phase != null ? cardEl.querySelector<HTMLElement>(`[data-phase="${phase}"]`) : null;
        if (li) {
          const status = ev.type === "step.started" ? "running" : "done";
          li.setAttribute("data-phase-status", status);
          const glyph = li.querySelector("span");
          if (glyph) {
            glyph.textContent = PHASE_GLYPH[status] ?? "○";
            glyph.style.color = status === "running" ? "var(--state-running)" : "var(--state-ready)";
          }
        }
      }
    };

    if (typeof EventSource === "undefined") return;
    // R7DEM.5 (REQ-DWEB-7; R3 §4 row 1) — belt-and-braces: a demo twin never carries `feed`
    // (activeRun is always null), so this arm is unreachable today — but if a future demo
    // shape ever supplies one, the read-only demo still opens NO EventSource, ever.
    if (isDemo()) return;
    const src = new EventSource(
      `${feedEventsUrl}${feedEventsUrl.includes("?") ? "&" : "?"}after=${lastSeq}`,
    );
    const onEvent = (m: Event): void => {
      let ev: { type?: string; payload?: unknown };
      try {
        ev = JSON.parse((m as MessageEvent).data as string) as { type?: string; payload?: unknown };
      } catch {
        return; // a malformed frame is dropped — fail-closed
      }
      patchCard(ev);
      appendRow(ev);
      // ticks carry their own truth (the card meter) — everything else converges the data.
      if (ev.type !== "usage.tick") scheduleInvalidate();
    };
    for (const type of Object.keys(maps.t)) {
      if (type.startsWith("card.")) continue; // pseudo-keys (meter copy) aren't event types
      src.addEventListener(type, onEvent);
    }
    src.onerror = () => {
      /* EventSource auto-reconnects; Last-Event-ID resumes exactly-once (§12.5) */
    };
    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      src.close();
    };
  }, [host, feedRunId, feedEventsUrl, feedLastSeq, feedDensity, maps]);
}
