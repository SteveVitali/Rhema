import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPARATIVE_WAVE_MET,
  LEGAL_PAGES,
  lintGrowthCopy,
  PRICING,
  PUBLIC_CLAIMS,
  PUBLIC_CLAIM_COPY,
  claimsForAudience,
  publicClaimEnabled,
} from "@rhema/contracts";
import { meteredNoticeTemplate } from "@rhema/ledger";
import { collectCopyStrings, createWebApp, type DataSource } from "@rhema/web";

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
  // R6LGL.1 — the legal/trust pages' renderer (its strings live in copy.ts — already scanned —
  // but the component's own literals count as shipped surface too).
  "apps/web/src/legal.tsx",
  "apps/web/src/server.ts",
  "packages/contracts/src/notifications.ts",
  "apps/api/src/server.ts",
  "apps/api/src/settings-routes.ts",
  "apps/api/src/invite.ts",
  "apps/worker/src/notification-jobs.ts",
  "apps/worker/src/export-jobs.ts",
  // R6MNY.1 (REQ-LCH-5f) — the paid-account metered notice is launch-surface copy: its template,
  // its live entrypoint, and its runner are swept like every other shipped surface.
  "packages/ledger/src/metered-notice.ts",
  "integration/src/metered-notice.ts",
  "scripts/live/send-metered-notice.mjs",
];

const clientDir = join(REPO, "apps/web/src/client");
const exportDir = join(REPO, "apps/export/src");
const clientFiles = readdirSync(clientDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `apps/web/src/client/${f}`);
const exportFiles = readdirSync(exportDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `apps/export/src/${f}`);

// SPA.8 — the Vite SPA source tree (`apps/web/src/spa`, incl. routes/) is a shipped surface too:
// same claim sweep, recursive, tests excluded (assertions legitimately quote copy).
import { statSync } from "node:fs";
function* walkSurface(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walkSurface(p);
    else yield p;
  }
}
const spaFiles = [...walkSurface(join(REPO, "apps/web/src/spa"))]
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/\.dom\.test\.tsx$/.test(f))
  .map((f) => f.slice(REPO.length + 1));

const ALL_SURFACES = [...SURFACE_FILES, ...clientFiles, ...exportFiles, ...spaFiles];

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

  it("the shipped config hides only the claims still gated — ACT.1 flipped the trial flag ON; the AUDIENCE holds it (ADR-042)", () => {
    // ACT.1 — `trial.firstReviewIncluded` is enabled at flag level; the operator pause lives in
    // `trial.audience` ('test_tenants'), which `claimsForAudience` folds over every render. A
    // non-covered viewer (the real-user default) still resolves the claim OFF.
    expect(publicClaimEnabled("trial.firstReviewIncluded")).toBe(true);
    expect(PRICING.trial.audience).toBe("test_tenants");
    expect(
      publicClaimEnabled("trial.firstReviewIncluded", claimsForAudience(PUBLIC_CLAIMS, false)),
    ).toBe(false);
    // `plans.whatItCovers` is ON — but its renderers emit only the pricer-COMPUTED line
    // (`planCoverageLine`); the gated pricing.json copy is retired text, not rendered copy.
    expect(publicClaimEnabled("plans.whatItCovers")).toBe(true);
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

// R6MNY.1 (REQ-LCH-5f) — the lint's rendered-output half for the two surfaces the money-flip adds:
// the paid-account metered NOTICE (its template is surface copy — the source scan above covers the
// files; this sweeps the rendered text/html) and the five LEGAL pages rendered end-to-end (the copy
// table covers the strings; this catches anything the ⟦KEY⟧ rendering or the banner would emit).
describe("the rendered metered notice sweeps clean (REQ-LCH-5f)", () => {
  const msg = meteredNoticeTemplate({ effectiveDate: "2026-11-02", appOrigin: "https://rhema.tools" });

  it("the rendered subject/text/html carry no claim pattern and pass the wired lint", () => {
    for (const surface of [msg.subject, msg.text, msg.html]) {
      const hits = CLAIM_PATTERNS.filter((re) => re.test(surface)).map((re) => String(re));
      expect(hits, `notice matched ${hits.join(", ")}`).toEqual([]);
    }
    expect(
      lintGrowthCopy([
        { key: "metered-notice.subject", text: msg.subject },
        { key: "metered-notice.text", text: msg.text },
      ]),
    ).toEqual([]);
    // REQ-BILL-18's rule — the notice never frames the change as a bill.
    for (const surface of [msg.subject, msg.text, msg.html]) {
      expect(surface).not.toMatch(/you will be billed/i);
    }
  });
});

describe("the rendered legal pages sweep clean — and stay unapproved (REQ-LCH-5f)", () => {
  const app = createWebApp({
    dataSource: { checkSession: async () => true } as unknown as DataSource,
    session: () => null,
  });

  it.each(LEGAL_PAGES.map((p) => [p.routeId, p.approved] as const))(
    "%s renders no claim pattern — and its draft banner holds while approved is %s",
    async (routeId, approved) => {
      const res = await app.request(routeId);
      expect(res.status, routeId).toBe(200);
      const html = await res.text();
      const hits = CLAIM_PATTERNS.filter((re) => re.test(html)).map((re) => String(re));
      expect(hits, `${routeId} matched ${hits.join(", ")}`).toEqual([]);
      // The operator-owned posture (R6LGL.1): an unapproved page MUST still show its draft banner —
      // the launch sweep pins that nothing quietly ships approved text.
      if (!approved) expect(html, routeId).toContain("data-legal-draft");
    },
  );
});
