// The live feed's label maps (§5.5; REQ-IDE-14; P1.05): the copy table's per-event templates + enum maps,
// assembled into the `FeedLabelMaps` the SSR render and the embedded `data-feed-labels` JSON share — the
// ide.js island formats live SSE rows with the SAME controlled copy (no label is authored client-side, and
// a type without a template renders nothing — the fail-closed rule). Numeric/enum fields interpolate;
// bounded payload strings (url, query, note text) are the §12.5-whitelisted display fields.

import { RUN_EVENTS } from "@rhema/contracts";
import { filterFeed, type FeedDensity } from "@rhema/findings-core";
import { formatFeedRow, type FeedLabelMaps } from "@rhema/ide";
import type { FeedRow } from "@rhema/ui";
import { COPY } from "./copy.js";
import type { FeedEventRow } from "./data.js";

/** The maps both sides render with — templates from COPY.feed, enums from the shared copy tables. */
export function feedLabelMaps(): FeedLabelMaps {
  return {
    t: COPY.feed.templates,
    enums: {
      phase: COPY.review.phaseLabel,
      verdict: COPY.review.verdictLabel,
      severity: COPY.review.severityLabel,
      to: COPY.review.runStateLabel,
      from: COPY.review.runStateLabel,
      // {kind} serves gates + artifacts + findings — the vocabularies are disjoint, so one map resolves all.
      kind: { ...COPY.gates.kindLabel, ...COPY.feed.artifactKind, ...COPY.feed.findingKind },
      passed: COPY.feed.passed,
      action: {
        approve: "approved",
        approve_autonomous: "approved",
        keep_planning: "kept planning",
        wait: "waited",
        stop: "stopped",
        expired: "expired",
      },
    },
  };
}

/** The maps serialized for `data-feed-labels` (the island's row formatter input). */
export function feedLabelMapsJson(): string {
  return JSON.stringify(feedLabelMaps());
}

/**
 * SSR feed rows: filter the replayed events to the density, then render each through the same
 * `formatFeedRow` the island uses — a type without a template drops out rather than rendering raw.
 * `density` on each row is the CONTRACT density the island's tab switch re-filters on.
 */
export function feedRowsFor(events: readonly FeedEventRow[], density: FeedDensity): FeedRow[] {
  const maps = feedLabelMaps();
  const rows: FeedRow[] = [];
  for (const ev of filterFeed(events, density)) {
    const t = formatFeedRow(ev.type, ev.payload, maps);
    if (!t) continue;
    rows.push({ type: ev.type, label: t.label, ...(t.detail ? { detail: t.detail } : {}), density: ev.density });
  }
  return rows;
}

/** Assert the maps cover the catalogue the feed can show (a missing template = a dropped row, by design). */
export function feedTemplateCoverage(): { type: string; covered: boolean }[] {
  const maps = feedLabelMaps();
  return Object.keys(RUN_EVENTS)
    .filter((t) => RUN_EVENTS[t as keyof typeof RUN_EVENTS].visibility === "user")
    .map((t) => ({ type: t, covered: maps.t[t] != null }));
}
