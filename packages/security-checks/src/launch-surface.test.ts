import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPARATIVE_WAVE_MET,
  lintGrowthCopy,
  PRICING,
  PUBLIC_CLAIM_COPY,
  PUBLIC_CLAIM_IDS,
  publicClaimEnabled,
} from "@rhema/contracts";
import { collectCopyStrings } from "@rhema/web";

// P1.22 W8 — the launch-surface lint (REQ-EVAL-19 + REQ-POS-4/5/13). P1.17's `lintGrowthCopy` covers the
// marketing funnel keys; this sweep covers EVERYTHING ELSE that ships: the full copy table (IDE chrome,
// emails, run-sheet strings), the client modules, the transactional-email templates in contracts + api +
// worker, and the export-statement sources. Two independent layers:
//
//   1. the wired gate — COMPARATIVE_WAVE_MET must still be false (no criterion-meeting wave has landed,
//      so no comparative/superiority claim may compile on any surface), and lintGrowthCopy over the
//      collected copy table returns zero violations;
//
//   2. an audit-local scan — this suite's own pattern set (independent of the lint's implementation, so a
//      lint regression can't silently widen the launch surface) run over every shipped-surface source file,
//      comments stripped.
//
// Findings the scan can't reach (e.g. rendered HTML from external sources) are named in the §17 readout,
// not fabricate.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/** Audit-local claim patterns — comparative/superiority (REQ-EVAL-19) + evasion (REQ-POS-13). */
const CLAIM_PATTERNS: readonly RegExp[] = [
  /\bbetter\s+than\b/i,
  /\bbest[-\s](?:in[-\s]class|of[-\s]breed)\b/i,
  /\b(?:outperform|outperforming|outperforms)\b/i,
  /\b(?:beats?|crushes?|dwarfs?)\s+(?:grammarly|chatgpt|claude|gemini|copilot)\b/i,
  /\bfaster\s+than\b/i,
  /\bmore\s+accurate\s+than\b/i,
  /\b#\s?1\b/i,
  /\bunmatched\b/i,
  /\bin\s+a\s+class\s+of\s+its\s+own\b/i,
  /\bsuperior\b/i,
  // REQ-POS-13 — detection-evasion phrasing.
  /\bai[-\s]?detect/i,
  /\bundetectable\b/i,
  /\bturnitin\b/i,
  /\bgptzero\b/i,
];

/** Strip line + block comments so code commentary can't trip (or hide) a claim. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s\/\/[^'"`]*$/gm, " ");
}

/** The shipped-surface source files the sweep reads verbatim. */
const SURFACE_FILES = [
  "apps/web/src/copy.ts",
  "apps/web/src/server.ts",
  "packages/contracts/src/notifications.ts",
  "apps/api/src/server.ts",
  "apps/api/src/settings-routes.ts",
  "apps/api/src/invite.ts",
  "apps/worker/src/notification-jobs.ts",
  "apps/worker/src/export-jobs.ts",
];

const clientDir = join(REPO, "apps/web/src/client");
const exportDir = join(REPO, "apps/export/src");
const clientFiles = readdirSync(clientDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `apps/web/src/client/${f}`);
const exportFiles = readdirSync(exportDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `apps/export/src/${f}`);

const ALL_SURFACES = [...SURFACE_FILES, ...clientFiles, ...exportFiles];

describe("the REQ-EVAL-19 wave gate — the flag that must stay closed (P1.22 W8)", () => {
  it("COMPARATIVE_WAVE_MET is still false — no criterion-meeting wave has landed", () => {
    // If this flips, the SAME commit must land the approved copy — and this suite re-scans the surfaces.
    expect(COMPARATIVE_WAVE_MET).toBe(false);
  });

  it("the wired lint still fails a comparative claim while the gate is closed", () => {
    const violations = lintGrowthCopy([
      { key: "landing.proof.claim", text: "Better than Grammarly — #1 in a class of its own" },
    ]);
    expect(violations.some((v) => v.rule === "comparative_claim")).toBe(true);
  });
});

describe("the full copy table — the P1.17 lints over every key, not just the funnel", () => {
  it("collectCopyStrings lints clean end-to-end", () => {
    const entries = collectCopyStrings().map(([key, text]) => ({ key, text }));
    expect(entries.length).toBeGreaterThan(100); // the table is real, not a stub
    expect(lintGrowthCopy(entries)).toEqual([]);
  });

  it("no copy-table string carries a claim pattern — including IDE chrome + emails + run-sheet keys", () => {
    const hits: string[] = [];
    for (const [key, text] of collectCopyStrings()) {
      for (const re of CLAIM_PATTERNS) {
        if (re.test(text)) hits.push(`${key}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("HOT.1 — the hidden public claims stay out of the shipped surface", () => {
  /** The verbatim claim-ON strings a disabled claim must not leak — wherever they're authored. */
  const gatedStrings = (): string[] => {
    const out: string[] = [];
    if (!publicClaimEnabled("trial.firstReviewIncluded")) {
      out.push(...Object.values(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"]));
      out.push(PRICING.trial.includedNote);
    }
    if (!publicClaimEnabled("plans.whatItCovers")) {
      for (const p of Object.values(PRICING.plans))
        if (p.whatItCoversClaimId === "plans.whatItCovers") out.push(p.whatItCovers);
    }
    return out;
  };

  it("the shipped config hides every gated claim id", () => {
    for (const id of PUBLIC_CLAIM_IDS) expect(publicClaimEnabled(id)).toBe(false);
  });

  it("the gated spec fields mark exactly the ≈-loop coverage lines", () => {
    const gated = Object.entries(PRICING.plans).filter(([, p]) => p.whatItCoversClaimId != null);
    expect(gated.map(([tier]) => tier).sort()).toEqual(["studio", "studio_max", "writer"]);
    for (const [, p] of gated) expect(p.whatItCovers).toContain("≈");
  });

  it("the copy table contains no hidden claim's text — verbatim or as a retired phrase", () => {
    const texts = collectCopyStrings().map(([, t]) => t);
    for (const s of gatedStrings()) expect(texts).not.toContain(s);
    // the pre-HOT.1 claim copy was deleted outright — a phrase-level guard keeps it from returning
    // under another key (an exact-string check would miss a reworded leak).
    for (const phrase of [
      "first review is included",
      "included first review",
      "one included Review",
      "your review run is Included",
      "on us, plus a 150-credit pocket",
    ]) {
      expect(texts.filter((t) => t.includes(phrase))).toEqual([]);
    }
  });
});

describe("the audit-local surface scan — shipped sources, comments stripped", () => {
  it.each(ALL_SURFACES.map((f) => [f] as const))("%s carries no comparative/superiority/evasion claim", (file) => {
    const src = stripComments(read(file));
    const hits = CLAIM_PATTERNS.filter((re) => re.test(src)).map((re) => String(re));
    expect(hits, `${file} matched ${hits.join(", ")}`).toEqual([]);
  });
});
