// SPA.10 — the REQ-BETA-10 dwell heartbeat as a React effect (design/28 F5: "the dwell-beacon
// logic moves into the bundle"; design/22 §4 — beacons are fire-and-forget 204s that never gate
// navigation and never surface as errors). Verbatim port of render.tsx `dwellBeacon`: post
// `{surface, ms}` to `/a/dwell` every 30 s while the tab is visible and once on hide, skipping
// beats under 4 s; `sendBeacon` first, keepalive `fetch` as the fallback.

import { useEffect } from "react";
import { isDemo } from "./demo.js";

/**
 * Mount the heartbeat for the named surface. The caller is the surface component itself, so the
 * beacon runs exactly while that surface is mounted — the document-level `<script>`'s route-level
 * `dwellSurface` equivalent. StrictMode-safe: cleanup clears the interval + listener, so the
 * double-mount leaves exactly one heartbeat.
 */
export function useDwell(surface: string): void {
  useEffect(() => {
    // R7DEM.5 (REQ-DWEB-7; R3 §4 row 8) — no dwell heartbeats in the demo: the beacon would
    // attribute `surface.dwell` to a signed-in visitor's account (and REQ-DOPS-5's cohort
    // suppression means demo reads are never organic events anyway).
    if (isDemo()) return;
    let t0 = Date.now();
    const beat = () => {
      const ms = Date.now() - t0;
      if (ms < 4000) return;
      t0 = Date.now();
      const body = JSON.stringify({ surface, ms });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/a/dwell", new Blob([body], { type: "application/json" }));
      } else {
        void fetch("/a/dwell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") beat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface]);
}
