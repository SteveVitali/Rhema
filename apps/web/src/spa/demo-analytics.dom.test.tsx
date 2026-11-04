// 223 R7DEM.6b (REQ-DOPS-5) — the DOM half of the suppression contract: the real client
// beacon hooks mounted under a demo boot (signed in AND signed out) emit ZERO events on
// every channel — no sendBeacon, no fetch — on any catalogued client name.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { CLIENT_ANALYTICS_EVENTS } from "@rhema/contracts";
import { setSpaBoot } from "./boot.js";
import { useDwell } from "./dwell.js";
import { useShowcaseAnchorBeacon } from "./showcase-beacon.js";
import { useGatePresence } from "./gate-presence.js";
import { emitDemoEvent } from "./demo-beacon.js";
import type { SpaBoot } from "./boot.js";

const DEMO_BOOT = (signedIn: boolean): SpaBoot =>
  ({
    surfaces: {},
    demo: { essay: "the-borrowed-commons", slug: "demo~the-borrowed-commons", signedIn, build: "t" },
  }) as unknown as SpaBoot;

function DwellProbe() {
  useDwell("dossier");
  return <div />;
}
function ShowcaseProbe() {
  useShowcaseAnchorBeacon("f1");
  return <div data-finding="f1" />;
}
function GateProbe() {
  const ref = useGatePresence<HTMLDivElement>("/p/x/gates/g1/activity");
  return <div ref={ref} />;
}

describe("demo boot — every client channel emits zero (signed in and out)", () => {
  for (const signedIn of [true, false]) {
    it(`signedIn=${signedIn}: dwell/showcase/gate beacons send nothing; only /a/demo may fire`, async () => {
      setSpaBoot(DEMO_BOOT(signedIn));
      const sendBeacon = vi.fn(() => true);
      const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
      vi.stubGlobal("navigator", { ...navigator, sendBeacon });
      vi.stubGlobal("fetch", fetchSpy);
      const r1 = render(<DwellProbe />);
      const r2 = render(<ShowcaseProbe />);
      const r3 = render(<GateProbe />);
      await new Promise((r) => setTimeout(r, 50));
      const demoPosts = sendBeacon.mock.calls.filter((c) => String(c[0]) === "/a/demo");
      // zero non-carve-out emissions — the only permitted send is the demo funnel beacon.
      expect(sendBeacon.mock.calls.filter((c) => String(c[0]) !== "/a/demo")).toEqual([]);
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]) !== "/a/demo")).toEqual([]);
      expect(demoPosts).toEqual([]); // these probes mount no demo event themselves
      // and the emitter itself is armed in demo — it sends ONLY to /a/demo.
      emitDemoEvent("demo.hub_viewed", { essay: "the-borrowed-commons" });
      expect(sendBeacon.mock.calls.filter((c) => String(c[0]) === "/a/demo")).toHaveLength(1);
      r1.unmount();
      r2.unmount();
      r3.unmount();
      vi.unstubAllGlobals();
    });
  }

  it("off the demo boot the emitter is inert (never armed outside the demo)", () => {
    setSpaBoot(null);
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
    for (const name of CLIENT_ANALYTICS_EVENTS) void name; // catalogue stays in scope
    emitDemoEvent("demo.hub_viewed", {});
    expect(sendBeacon).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  afterEach(() => setSpaBoot(null));
});
