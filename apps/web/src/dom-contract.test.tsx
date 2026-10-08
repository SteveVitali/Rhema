// apps/web/src/dom-contract.test.ts — SPA.7 (REQ-VFY-2, REQ-TST-2). The manifest's structural
// contract + the first manifest-consuming emission spec: the IdeShell SSR render is asserted
// against literal manifest hooks, so the shared shell's hook surface is proven, not just scanned.
// `check:dom-contract` (scripts/check-dom-contract.mjs) keeps the four gate directions; this file
// is the assertion leg for hooks no journey probes directly (data-fmt, the data-status-* meter
// family, the palette/menu/cheatsheet hooks).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SPA_SURFACES } from "@rhema/contracts";
import { IdeShell } from "@rhema/ui";
import {
  DOM_CONTRACT,
  DOM_CONTRACT_ENTRIES,
  domContractMatch,
  hooksForSurface,
  type DomContractSurface,
} from "./dom-contract.js";
import { expectManifestEmission } from "./spa/testkit.js";
import { COPY } from "./copy.js";

const BUCKETS: readonly DomContractSurface[] = ["shell", "public", "shared"];

describe("dom-contract manifest structure", () => {
  it("keys every flip surface plus the three non-flip buckets", () => {
    const keys = Object.keys(DOM_CONTRACT).sort();
    expect(keys).toEqual([...SPA_SURFACES, ...BUCKETS].sort());
  });

  it("has no duplicate (surface, kind, hook) rows", () => {
    const seen = new Set<string>();
    for (const e of DOM_CONTRACT_ENTRIES) {
      const k = `${e.surface}|${e.kind}|${e.hook}`;
      expect(seen.has(k), `duplicate manifest row ${k}`).toBe(false);
      seen.add(k);
    }
  });

  it("covers the ~90 load-bearing hooks research/04 enumerates (floor check)", () => {
    expect(DOM_CONTRACT_ENTRIES.length).toBeGreaterThanOrEqual(90);
  });

  it("domContractMatch resolves literals, prefix families, and misses", () => {
    expect(domContractMatch("data-run-sheet")?.surface).toBe("run-sheet");
    expect(domContractMatch("data-label-saving")?.hook).toBe("data-label-");
    expect(domContractMatch("ed.spine.0.ord")?.kind).toBe("field-prefix");
    expect(domContractMatch("toggle.rigor")?.kind).toBe("field-prefix");
    expect(domContractMatch("data-definitely-not-a-hook")).toBeNull();
  });
});

describe("ide-chrome emission parity — the SSR shell emits the manifest's hooks", () => {
  // Every literal here must resolve to a manifest entry (checked) AND be present in the rendered
  // markup (checked by expectManifestEmission). This is the reference pattern surface tickets
  // reuse: assert the rendered output against the manifest, never a hand-copied selector list.
  const IDE_CHROME_HOOKS = [
    "data-ide",
    "data-pane",
    "data-desk",
    "data-desk-panel",
    "data-desk-tab",
    "data-ide-desk-tab",
    "data-ide-desk-toggle",
    "data-margin",
    "data-timeline",
    "data-files",
    "data-finding-cards",
    "data-ide-menu",
    "data-ide-view-menu",
    "data-ide-theme-menu",
    "data-ide-view",
    "data-ide-theme",
    "data-ide-paper",
    "data-ide-reader",
    "data-ide-font",
    "data-ide-toggle",
    "data-ide-handle",
    "data-ide-files-toggle",
    "data-ide-timeline-toggle",
    "data-ide-cheatsheet",
    "data-ide-cheatsheet-close",
    "data-ide-palette",
    "data-palette",
    "data-palette-sections",
    "data-palette-search",
    "data-palette-input",
    "data-palette-results",
    "data-palette-empty",
    "data-theme-url",
    "data-paper-url",
    "data-paper-theme",
    "data-paper-surface",
    "data-app-theme-pref",
    "data-open",
    "data-view",
    "data-count",
    "data-current",
    "data-project-id",
    "data-run-state",
    "data-run-next",
    "data-feed-run",
    "data-feed-events",
    "data-feed-labels",
    "data-feed-last-seq",
    "data-live-feed",
    "data-feed-rows",
    "data-feed-event",
    "data-feed-density",
    "data-feed-density-row",
    "data-user",
    // shared meter/sync hooks the shell emits — the island rewrites these live
    "data-fmt",
    "data-status-words",
    "data-status-readmin",
    "data-status-venue",
    "data-finding-id",
  ] as const;

  const html = renderToStaticMarkup(
    <IdeShell
      project={{ slug: "demo", title: "Demo" }}
      labels={COPY.ide}
      userId="u1"
      projectId="p1"
      themeUrl="/p/demo/ide/theme"
      paperThemeUrl="/p/demo/ide/paper-theme"
      paletteSearchUrl="/p/demo/ide/palette-search"
      palette={JSON.stringify({ commands: [] })}
      activeRun={{ runId: "run_1", state: "running" }}
      runNextHref="/p/demo/r/run_1"
      feed={{
        runId: "run_1",
        eventsUrl: "/p/demo/r/run_1/events",
        density: "summary",
        rows: [{ type: "phase", label: "research done", detail: "3s", density: "details" }],
        labels: { heading: "Live", densityLabel: (d) => d },
        labelMaps: "{}",
        lastSeq: 3,
      }}
      status={{ words: 1200, readMin: 4, venueCap: "≤8k" }}
      findings={[{ id: "f1", severity: "warn", kind: "claim", excerpt: "claims x" }]}
    >
      <p>page body</p>
    </IdeShell>,
  );

  it("every asserted hook resolves to a manifest entry", () => {
    for (const hook of IDE_CHROME_HOOKS) {
      expect(domContractMatch(hook), `${hook} must be a manifest entry`).not.toBeNull();
    }
  });

  it("the rendered shell emits every asserted hook", () => {
    const entries = IDE_CHROME_HOOKS.map((h) => domContractMatch(h)!);
    const checked = expectManifestEmission(html, entries);
    expect(checked.length).toBe(IDE_CHROME_HOOKS.length);
  });
});

describe("per-surface hook inventory", () => {
  it("every surface declares ≥1 required hook or stays honestly conditional-only", () => {
    for (const surface of [...SPA_SURFACES, ...BUCKETS] as const) {
      const hooks = hooksForSurface(surface);
      expect(hooks.length, `${surface} has no manifest hooks`).toBeGreaterThan(0);
    }
  });
});
