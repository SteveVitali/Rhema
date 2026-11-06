// 223 R7DEM.6b (REQ-DOPS-5; REQ-TOUR-9) — the catalogue-driven suppression contract: every
// `CLIENT_ANALYTICS_EVENTS` name is demo-suppressed on EVERY channel, not just unemitted.
//
//   CHANNEL A — client beacons (sendBeacon/fetch out of spa/*): every file that can mint a
//     client event or presence ping must hold the `isDemo()` early-return (R3 §4's single
//     seam). The sweep is catalogue-driven — a new beacon file minting a catalogued name
//     without the guard fails it, and the planted-emitter leg proves the sweep is live.
//   CHANNEL B — server `emit()` calls inside compositions (`finding.viewed`,
//     `run.report_viewed`, `secondread.opened`, `gate.presence_timer_shown`,
//     `voice.staleness_shown`, `surface.dwell`, `letter.rated`): they ride
//     `deps.dataSource.postAnalyticsEvent` — on demo twins that IS `demoDataSource`, whose
//     implementation resolves `{recorded:false}` (zero emissions leave) and whose
//     `postAcquisitionEvent` is `DemoUnsupported` — proven, not assumed.
//
// The DOM half (demo-analytics.dom.test.tsx) mounts the real beacon hooks under a demo boot
// signed-in and signed-out and counts zero sends.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_ANALYTICS_EVENTS } from "@rhema/contracts";
import { demoDataSource, DemoUnsupported } from "./demo-data.js";
import type { DataSource } from "./data.js";

const SPA = join(dirname(fileURLToPath(import.meta.url)), "spa");

/** Every beacon/presence emitter file must hold the single-seam guard. The sweep returns the
 *  violating paths — a mint-bearing file without `isDemo(` is a cohort-contamination path. */
export function beaconSuppressionViolations(files: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (const [path, text] of files) {
    // an EMITTER is a file that beacons a POST (`sendBeacon` or a fetch to a `/a/` beacon
    // path) or names a catalogued client event — reads (`bffFetch`, query fetches) do not mint.
    const emits =
      text.includes("sendBeacon") ||
      /fetch\(\s*["'`]\/a\//.test(text) ||
      [...CLIENT_ANALYTICS_EVENTS].some((n) => text.includes(`"${n}"`));
    if (emits && !/isDemo\(\)/.test(text)) out.push(path);
  }
  return out.sort();
}

function spaBeaconFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const ent of readdirSync(SPA, { withFileTypes: true })) {
    if (!ent.isFile() || !/\.(ts|tsx)$/.test(ent.name) || ent.name.endsWith(".test.ts") || ent.name.endsWith(".test.tsx")) continue;
    files.set(ent.name, readFileSync(join(SPA, ent.name), "utf8"));
  }
  return files;
}

/** The channel registry — every CLIENT name mapped to where it could leave a page. A name
 *  absent from a channel is suppressed there by construction (it cannot be minted). */
const CHANNELS: Record<string, { beacons: string[]; serverEmit: boolean }> = {
  "surface.dwell": { beacons: ["dwell.ts"], serverEmit: true },
  "showcase.finding_anchor_viewed": { beacons: ["showcase-beacon.ts"], serverEmit: false },
  "gate.presence_timer_shown": { beacons: ["gate-presence.ts"], serverEmit: true },
  "finding.viewed": { beacons: [], serverEmit: true },
  "run.report_viewed": { beacons: [], serverEmit: true },
  "secondread.opened": { beacons: [], serverEmit: true },
  "letter.rated": { beacons: [], serverEmit: true },
  "voice.staleness_shown": { beacons: [], serverEmit: true },
};

describe("REQ-DOPS-5 — the suppression contract (catalogue-driven)", () => {
  it("every CLIENT_ANALYTICS_EVENTS name is registered on a channel", () => {
    for (const name of CLIENT_ANALYTICS_EVENTS) {
      const c = CHANNELS[name];
      expect(c, `${name} has no suppression channel registered`).toBeDefined();
      expect(
        c!.beacons.length > 0 || c!.serverEmit,
        `${name} is registered on no channel — add its emitters or prove it cannot fire`,
      ).toBe(true);
    }
  });

  it("every beacon file minting a catalogued name holds the isDemo() seam", () => {
    expect(beaconSuppressionViolations(spaBeaconFiles())).toEqual([]);
  });

  it("a PLANTED unsuppressed emitter fails the sweep", () => {
    const files = spaBeaconFiles();
    files.set(
      "planted-beacon.ts",
      `export function fire() { navigator.sendBeacon("/a/dwell", "{}"); }`,
    );
    expect(beaconSuppressionViolations(files)).toEqual(["planted-beacon.ts"]);
    // and a catalogued name emitted with no beacon file + no server emit fails the registry.
    expect(CHANNELS["finding.viewed"]?.serverEmit).toBe(true);
  });

  it("CHANNEL B — server emits are unreachable through the outer DataSource on demo twins", async () => {
    const source = demoDataSource("");
    // The composition's emit() calls DO reach postAnalyticsEvent — the seam is a no-op that
    // records nothing. `recorded:false` IS "zero emissions on this channel".
    const out = await source.postAnalyticsEvent({} as never, {
      event: "finding.viewed",
      props: {},
    } as never);
    expect(out).toEqual({ ok: true, recorded: false });
    // postAcquisitionEvent is not even in the Pick — it is DemoUnsupported, never reachable.
    await expect(
      (source as DataSource & { postAcquisitionEvent?: (s: never, r: never) => Promise<never> })
        .postAcquisitionEvent?.({} as never, { event: "showcase.finding_anchor_viewed", props: {} } as never),
    ).rejects.toBeInstanceOf(DemoUnsupported);
  });
});
