// 223 R7DEM.6b (REQ-TOUR-9; ADR-126; REQ-DACC-3) — the ONE demo client emitter. Three
// anonymous funnel events ride `sendBeacon` → `POST /a/demo` → `POST /analytics/demo` →
// `rhema_demo_event_insert` → `demo_events`. Armed ONLY on a demo boot (`isDemo()`) — a
// caller on any other surface is a no-op. `src` rides the URL's `?src=` (cohort hygiene:
// the D-legs navigate `?src=jrn`). No cookies, no session, no fetch retry — the beacon is
// fire-and-forget telemetry that never gates anything.

import { isDemo } from "./demo.js";

/** The catalogue's three demo.* names (ANALYTICS_EVENTS / emission-audit both pin these). */
export const DEMO_ANALYTICS_EVENTS = [
  "demo.hub_viewed",
  "demo.tour_started",
  "demo.tour_completed_or_cta",
] as const;
export type DemoAnalyticsEvent = (typeof DEMO_ANALYTICS_EVENTS)[number];

interface DemoEventProps {
  readonly essay?: string;
  readonly step?: number;
  readonly src?: string;
}

/** The `?src=` acquisition label on the current document (≤ 40 chars — the table's bound). */
function srcFromLocation(): string | undefined {
  try {
    const v = new URLSearchParams(window.location.search).get("src");
    return v != null && v !== "" ? v.slice(0, 40) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Emit one anonymous demo event. A no-op outside a demo boot; a no-op when `sendBeacon` is
 * unavailable (the beacon is the ONLY transport — a keepalive fetch would carry credentials
 * by default, and anonymous telemetry is not worth a code path that could). Payload is built
 * to the server's ≤ 256 B envelope before it leaves.
 */
export function emitDemoEvent(
  event: DemoAnalyticsEvent,
  props: DemoEventProps = {},
): void {
  if (!isDemo()) return;
  try {
    const body = JSON.stringify({
      event,
      ...(props.essay ? { essay: props.essay.slice(0, 80) } : {}),
      ...(props.step != null ? { step: Math.trunc(props.step) } : {}),
      src: (props.src ?? srcFromLocation())?.slice(0, 40),
    });
    navigator.sendBeacon("/a/demo", new Blob([body], { type: "text/plain" }));
  } catch {
    /* telemetry never throws into a demo surface */
  }
}
