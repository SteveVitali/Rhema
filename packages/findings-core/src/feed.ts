import { RUN_EVENTS, isUserVisible, type RunEventType } from "@rhema/contracts";

// The live feed's density split (§5.5; REQ-IDE-14). Two user densities — Summary (phase cards only) and Details
// (the default: phase cards + source/claim/finding/artifact/subagent/check cards) — plus Verbose behind the
// Advanced disclosure (every search query and fetch, blocked-domain notices, retries). Internal-visibility
// events are NEVER in the feed (REQ-ARCH-12). Framework-free filtering; the UI renders the kept events.

/** The three user-selectable feed densities (§5.5). `verbose` is Advanced-only. */
export type FeedDensity = "summary" | "details" | "verbose";

/** Which contract densities each user density includes (Details = Summary + Normal; Verbose = all three). */
const INCLUDED: Record<FeedDensity, ReadonlySet<string>> = {
  summary: new Set(["summary"]),
  details: new Set(["summary", "normal"]),
  verbose: new Set(["summary", "normal", "verbose"]),
};

export interface FeedEventLike {
  readonly type: string;
  readonly payload?: unknown;
}

/** True when the event is user-visible AND its density is included at the chosen feed density. */
export function feedIncludes(type: string, density: FeedDensity): boolean {
  if (!(type in RUN_EVENTS)) return false;
  const t = type as RunEventType;
  if (!isUserVisible(t)) return false; // internal events never reach the feed (REQ-ARCH-12)
  return INCLUDED[density].has(RUN_EVENTS[t].density);
}

/**
 * Filter a run's events to those the chosen density shows (§5.5). Internal events are dropped regardless of
 * density; an unknown event type is dropped (fail-closed — nothing un-catalogued reaches the feed).
 */
export function filterFeed<E extends FeedEventLike>(events: readonly E[], density: FeedDensity): E[] {
  return events.filter((e) => feedIncludes(e.type, density));
}
