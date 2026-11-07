// 222 R7DEM.6a (REQ-TOUR-2/-4/-5; RV-29; S-8) — the tour step table's pins:
//   • every step.target resolves to a DECLARED DOM-contract hook (domContractMatch), never a
//     test-only hook, and every step.route resolves inside DEMO_ROUTE_IDS through the same
//     rewrite the public URLs take (the step half of REQ-TOUR-8's deep-link test);
//   • every “…”-quoted fragment in a step's COPY leaf is VERBATIM from the committed real SPD
//     corpus at the recorded file:line (the QUOTE_PINS table — corpus is read from disk, never
//     imported into the SPA chunk);
//   • every count in the pinned claim-ledger summary is DERIVED from the committed dossier
//     snapshot — a drift in either fails here;
//   • DEMO_TOUR_ENTRY_HREF carries `?tour=published` on the SPD essay root (the only start).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMO_ROUTE_IDS,
  DEMO_TOUR_ENTRY_HREF,
  DEMO_TOUR_FIRST_STEP,
  DEMO_TOUR_PARAM,
  demoDeepLink,
  demoInternalPath,
  spaRouteFor,
} from "@rhema/contracts";
import { IDE_KEYMAP, PANEL_TABS } from "@rhema/ide";
import { COPY } from "./copy.js";
import { domContractMatch } from "./dom-contract.js";
import { DEMO_TOUR_STEPS, tourStepHref, tourTargetSelector } from "./spa/demo-tour.js";

const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const CORPUS = join(HERE, "..", "..", "..", "packages", "demo-corpus");
const SPD = join(CORPUS, "corpus", "structure-of-political-difference");
const SPD_SNAPSHOT = join(CORPUS, "snapshots", "structure-of-political-difference");

function corpusLines(rel: string): string[] {
  return readFileSync(join(SPD, rel), "utf8").split("\n");
}

/** Collapse markdown emphasis + whitespace for a verbatim compare (COPY strips `*`). */
function normalize(s: string): string {
  return s.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

/** Every “…”-quoted span in a COPY leaf, in order. */
function quotedSpans(text: string): string[] {
  return [...text.matchAll(/“([^”]*)”/g)].map((m) => m[1]!);
}

/**
 * The corpus file:line table — one row per quoted fragment, positionally matched to the
 * leaf's “…” spans. {copyKey, file, from, to} — lines are 1-based inclusive.
 */
const QUOTE_PINS: readonly {
  copyKey: keyof typeof COPY.demo.tour.steps;
  file: string;
  from: number;
  to?: number;
}[] = [
  { copyKey: "v1", file: "drafts/v1.md", from: 1 },
  { copyKey: "verdict", file: "correspondence/v1-review/editors-letter.md", from: 11 },
  { copyKey: "oneThing", file: "correspondence/v1-review/editors-letter.md", from: 13 },
  { copyKey: "claims", file: "correspondence/v1-review/01-claim-ledger.md", from: 7, to: 8 },
  { copyKey: "claims", file: "correspondence/v1-review/01-claim-ledger.md", from: 148 },
  { copyKey: "whatChanged", file: "drafts/v2.md", from: 114 },
  // response-ledger verbatim cells — one pin per disposition cell the leaf names.
  { copyKey: "responses", file: "agents/author/ledgers/v1-response-ledger.md", from: 28 },
  { copyKey: "responses", file: "agents/author/ledgers/v1-response-ledger.md", from: 58 },
  { copyKey: "responses", file: "agents/author/ledgers/v1-response-ledger.md", from: 69 },
  { copyKey: "responses", file: "agents/author/ledgers/v1-response-ledger.md", from: 50 },
  { copyKey: "responses", file: "agents/author/ledgers/v1-response-ledger.md", from: 50 },
];

describe("the step schema is data pinned to the contract (REQ-TOUR-2)", () => {
  it("is exactly the 11-step script, in order, on SPD routes inside DEMO_ROUTE_IDS", () => {
    expect(DEMO_TOUR_STEPS.map((s) => s.id)).toEqual([
      "published",
      "v1",
      "verdict",
      "one-thing",
      "two-readers",
      "claims",
      "figure",
      "responses",
      "what-changed",
      "writer-edit",
      "cta",
    ]);
    for (const step of DEMO_TOUR_STEPS) {
      const internal = `/p/demo~structure-of-political-difference${step.route}`;
      const routeId = spaRouteFor(internal).routeId;
      expect(routeId, step.id).not.toBeNull();
      expect(DEMO_ROUTE_IDS, `${step.id} → ${routeId}`).toContain(routeId);
      // every step deep-links through 221a's builder (REQ-TOUR-8's step half).
      const link = demoDeepLink("structure-of-political-difference", step.route, step.target);
      expect(link.startsWith("/demo/structure-of-political-difference")).toBe(true);
    }
  });

  it("pins every target to a DECLARED DOM-contract hook — no test-only hooks", () => {
    for (const step of DEMO_TOUR_STEPS) {
      const hit = domContractMatch(step.target);
      expect(hit, `${step.id} target ${step.target}`).not.toBeNull();
    }
    // literal-selector spot pins — the asserted direction's concrete rows (re-pinned R7b:
    // beat 4 → the letter's passage link; beat 5 → the Findings-tab row; beat 7 → the
    // imported-image card).
    expect(tourTargetSelector(DEMO_TOUR_STEPS[2]!)).toBe('[data-letter-section="verdict"]');
    expect(tourTargetSelector(DEMO_TOUR_STEPS[3]!)).toBe('[data-passage-link="The one thing"]');
    expect(tourTargetSelector(DEMO_TOUR_STEPS[4]!)).toBe('[data-finding="Major 1"]');
    expect(tourTargetSelector(DEMO_TOUR_STEPS[5]!)).toBe('[data-claim="22"]'); // C23a
    expect(tourTargetSelector(DEMO_TOUR_STEPS[6]!)).toBe(
      '[data-figure-image="figure_2_ches_correlations_v2"]',
    );
    expect(tourTargetSelector(DEMO_TOUR_STEPS[8]!)).toBe('[data-move-card="M2"]');
  });

  it("every copyKey resolves to a ≤2-sentence COPY leaf, advance stays in the enum, and panelTab stays in PANEL_TABS", () => {
    for (const step of DEMO_TOUR_STEPS) {
      const leaf = COPY.demo.tour.steps[step.copyKey];
      expect(typeof leaf, step.copyKey).toBe("string");
      const sentences = leaf.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== "");
      expect(sentences.length, `${step.copyKey}: ${leaf}`).toBeLessThanOrEqual(2);
      expect(["next", "click-target"]).toContain(step.advance);
      // 248 — a declared panel tab only (the engine activates its real control).
      if (step.panelTab != null) {
        expect(PANEL_TABS).toContain(step.panelTab);
      }
      if (step.aside != null) {
        expect(COPY.demo.tour.steps[step.aside.copyKey], step.aside.copyKey).toBeTypeOf("string");
      }
    }
    // a panel-resident target names its tab; no other step may declare one.
    expect(DEMO_TOUR_STEPS.filter((s) => s.panelTab != null).map((s) => s.id)).toEqual([
      "two-readers",
    ]);
  });
});

describe("verbatim quotes equal the real corpus text at their pins (RV-29)", () => {
  it("every “…” span matches the corpus line(s) its pin names, in order", () => {
    const byKey = new Map<string, { file: string; from: number; to?: number }[]>();
    for (const pin of QUOTE_PINS) {
      byKey.set(pin.copyKey, [...(byKey.get(pin.copyKey) ?? []), pin]);
    }
    const keys = new Set(Object.keys(COPY.demo.tour.steps));
    for (const key of keys) {
      const leaf = COPY.demo.tour.steps[key as keyof typeof COPY.demo.tour.steps];
      const spans = quotedSpans(leaf);
      const pins = byKey.get(key) ?? [];
      expect(pins.length, `${key} has ${spans.length} quote span(s) but ${pins.length} pin(s)`).toBe(
        spans.length,
      );
      spans.forEach((span, i) => {
        const pin = pins[i]!;
        const lines = corpusLines(pin.file).slice(pin.from - 1, pin.to ?? pin.from);
        const haystack = normalize(lines.join("\n"));
        expect(
          haystack.includes(normalize(span)),
          `${key} span ${i} not verbatim in ${pin.file}:${pin.from}${pin.to ? `–${pin.to}` : ""}\n  span: ${span}\n  line(s): ${lines.join(" ")}`,
        ).toBe(true);
      });
    }
  });

  it("every count in the claim-ledger summary line is derived from the dossier snapshot", () => {
    const dossier = JSON.parse(
      readFileSync(join(SPD_SNAPSHOT, "dossier", "v1-review.json"), "utf8"),
    ) as { dto: { claims: { verdict: string }[] } };
    const verdicts = dossier.dto.claims.map((c) => c.verdict);
    const tally = (v: string) => verdicts.filter((x) => x === v).length;
    // the ledger's own summary text (01-claim-ledger.md:7–8) — the counts the leaf quotes.
    const summary = corpusLines("correspondence/v1-review/01-claim-ledger.md").slice(6, 8).join(" ");
    expect(summary).toContain(`24 of 24 (27 ledger entries)`);
    expect(dossier.dto.claims.length).toBe(27); // 24 claims → 27 entries (C23 ×4)
    expect(summary).toContain(`Verified: 22`);
    expect(summary).toContain(`Substantially accurate: 3`);
    expect(summary).toContain(`Misleading: 2`);
    expect(summary).toContain(`Contradicted: 0`);
    expect(tally("verified")).toBe(22);
    expect(tally("substantially_accurate")).toBe(3);
    expect(tally("misleading_in_context")).toBe(2);
    expect(tally("contradicted")).toBe(0);
  });

  it("the aside hop lands inside the demo allowlist and GM's III16 is contradicted Tier 1", () => {
    const claims = DEMO_TOUR_STEPS.find((s) => s.id === "claims")!;
    const [path, fragment] = claims.aside!.href.split("#");
    const internal = demoInternalPath(path!);
    expect(internal).not.toBeNull();
    expect(DEMO_ROUTE_IDS).toContain(spaRouteFor(internal!).routeId);
    expect(domContractMatch(fragment!)).not.toBeNull();
    const gm = JSON.parse(
      readFileSync(join(SPD_SNAPSHOT, "..", "the-governable-mind", "dossier", "v2-review.json"), "utf8"),
    ) as { dto: { claims: { id: string; verdict: string; tier: number }[] } };
    const iii16 = gm.dto.claims.find((c) => c.id === "III16")!;
    expect([iii16.verdict, iii16.tier]).toEqual(["contradicted", 1]);
  });
});

describe("the tour's keys collide with nothing committed (REQ-TOUR-2, REQ-KEYS-1)", () => {
  // The engine binds bare ArrowLeft / ArrowRight / Escape only while a step is active and
  // never inside inputs or with modifiers. The committed chord table + keymap must never
  // claim those keys — and the tour must never claim the sidebar/panel `[`/`]` keys.
  it("←/→/Esc appear in no reserved-chords.json row and no keymap arrow binding; `[`/`]` stay the shell's", () => {
    const chords = JSON.parse(
      readFileSync(
        join(HERE, "..", "..", "..", "packages", "ide", "src", "reserved-chords.json"),
        "utf8",
      ),
    ) as Record<string, string[]>;
    const reserved = Object.entries(chords)
      .filter(([k]) => k !== "$comment")
      .flatMap(([, v]) => v);
    for (const key of ["arrowleft", "arrowright", "escape"]) {
      expect(reserved, key).not.toContain(key);
    }
    // the keymap's only Esc binding is the findings-scoped "finding-escape" — coexistence the
    // engine documents (its Esc stops propagation when it acts, so one Esc dismisses one
    // layer); arrows it does not bind at all.
    const bound = new Set(
      IDE_KEYMAP.flatMap((b) => [b.chord, b.keys].filter((x): x is string => x != null)).map((c) =>
        c.toLowerCase(),
      ),
    );
    for (const key of ["arrowleft", "arrowright"]) {
      expect(bound.has(key), `keymap binds ${key}`).toBe(false);
    }
    expect(IDE_KEYMAP.filter((b) => b.chord === "escape").map((b) => b.actionKind)).toEqual([
      "finding-escape",
    ]);
    // and the tour never claims the shell's `[`/`]` — its handled set is exactly the three keys.
    expect(bound.has("[")).toBe(true);
    expect(bound.has("]")).toBe(true);
  });
});

describe("the tour entry (REQ-TOUR-4's start)", () => {
  it("DEMO_TOUR_ENTRY_HREF opens step 1 on SPD's essay root via ?tour=", () => {
    const [path, query] = DEMO_TOUR_ENTRY_HREF.split("?");
    expect(path).toBe("/demo/structure-of-political-difference");
    expect(query).toBe(`${DEMO_TOUR_PARAM}=${DEMO_TOUR_FIRST_STEP}`);
    expect(tourStepHref(DEMO_TOUR_STEPS[0]!)).toBe(DEMO_TOUR_ENTRY_HREF);
    expect(DEMO_TOUR_STEPS[0]!.id).toBe(DEMO_TOUR_FIRST_STEP);
  });
});
