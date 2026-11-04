// 221 R7DEM.5 (REQ-DWEB-13; S-12) — the snapshot-marker bundle grep: NO snapshot byte may ride
// `public/spa`. The demo reads its corpus through same-origin twins; anything in this marker set
// inside an emitted bundle means snapshot JSON was imported into the client graph — the exact
// leak REQ-DWEB-13 forbids (the tour's lazy chunk included — its 222 module must not bundle
// snapshot data either).
//
// The marker set is calibrated: every entry appears in ZERO files of a correct build today —
// corpus-relative artifact paths, snapshot envelope/value strings, and the replayed-DTO field
// names the client never reads. Legitimate lookalikes are excluded on purpose: essay keys ride
// `DEMO_ESSAYS` in `@rhema/contracts` (bundled by design), `agent-discourse` is committed COPY,
// and `notPublishedRefs`/`importRule`/`phaseSource`/`not_recorded` are DTO field names the
// client legitimately references. A `.map` file's `sourcesContent` reproduces source COMMENTS,
// so corpus paths mentioned in comments are not proof of a data leak — the markers below are
// chosen to be data-only strings no comment would carry.
//
// Missing build: a skip on a dev box, a failure under CI (the unit job builds first).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PUBLIC_SPA = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public/spa");

/** Snapshot/corpus strings that must never appear in any emitted public/spa file. */
const DEMO_SNAPSHOT_MARKERS: readonly string[] = [
  // the replayed-DTO envelope values (the client checks `replayed === true` and truthiness —
  // it never names these literals)
  "inferred_from_delivered_files",
  "recordSource",
  // committed fixture artifact/source identifiers — data, never code
  "v1-response-ledger",
  "taxonomy_reference_sheet",
  "marsh-viscosity-2021",
  "ondatje-ledger-2024",
  "freeform-gazette-note",
  // the snapshot file suffix on disk
  ".md.json",
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".js") || name.endsWith(".map")) yield p;
  }
}

const HAS_BUILD = existsSync(PUBLIC_SPA);
const CI = process.env.CI === "true" || process.env.CI === "1";

describe("the snapshot-marker bundle grep (REQ-DWEB-13)", () => {
  it("public/spa emits no snapshot/corpus bytes", () => {
    if (!HAS_BUILD) {
      if (CI) throw new Error("apps/web/public/spa is absent — build the web app before this check");
      console.warn("skip — apps/web/public/spa is absent (build the web app to arm the grep)");
      return;
    }
    const files = [...walk(PUBLIC_SPA)];
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of DEMO_SNAPSHOT_MARKERS) {
        if (text.includes(m)) hits.push(`${f.split("/public/spa/")[1]}: ${JSON.stringify(m)}`);
      }
    }
    expect(hits, `snapshot markers leaked into public/spa:\n${hits.join("\n")}`).toEqual([]);
  });
});
