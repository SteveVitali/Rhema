import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertShowcaseFixture } from "@rhema/contracts";
import { resolveAnchor, splitMarkdownBlocks } from "@rhema/findings-core";
import { parseSidecar } from "@rhema/protocols";
import { canonicalJson } from "./index.js";
import { convertClaimLedger } from "./claim-ledger.js";
import { sourceNoteIndex } from "./source-note.js";
import { OverrideBook, readConvertOverrides } from "./overrides.js";

// REQ-CONV-2/3/4/5/6/11/12 + REQ-CORPUS-10/15 — the synthetic claim-ledger goldens: both review
// rounds of `the-borrowed-commons` convert to `parseSidecar`-clean claimLedgerSidecars, the R2 §1
// heading variants each have an assertion, the summary counts reconcile, the anchor-rung histogram
// is golden-pinned, and the R2 negative controls still fail the real validator.
//
// Goldens regenerate with `RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run
// packages/demo-corpus/src/convert/claim-ledger.test.ts`; they are committed and byte-compared.

const SLUG = "the-borrowed-commons";
const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "fixtures/synthetic/corpus", SLUG);
const GOLDENS = join(PKG, "fixtures/synthetic/goldens", SLUG);
const REGEN = process.env.RHEMA_REGEN_GOLDENS === "1";

const notes = (() => {
  const out: { slug: string; markdown: string }[] = [];
  for (const who of ["author", "editor"] as const) {
    const dir = join(CORPUS, "agents", who, "research", "sources");
    for (const f of readdirSync(dir)) {
      out.push({ slug: f.replace(/\.md$/, ""), markdown: readFileSync(join(dir, f), "utf8") });
    }
  }
  return out;
})();
const sourceNotes = sourceNoteIndex(notes);

const ROUNDS = ["v1", "v2"] as const;
const converted = ROUNDS.map((round) => {
  const markdown = readFileSync(
    join(CORPUS, "correspondence", `${round}-review`, "01-claim-ledger.md"),
    "utf8",
  );
  const draftMarkdown = readFileSync(join(CORPUS, "drafts", `${round}.md`), "utf8");
  const r = convertClaimLedger(markdown, { draftMarkdown, sourceNotes });
  return { round, markdown, draftMarkdown, blocks: splitMarkdownBlocks(draftMarkdown), r };
});

function golden(rel: string, value: unknown): void {
  const path = join(GOLDENS, rel);
  const bytes = canonicalJson(value);
  if (REGEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return;
  }
  expect(existsSync(path), `golden ${rel} — regenerate with RHEMA_REGEN_GOLDENS=1`).toBe(true);
  expect(bytes, `golden ${rel} byte-equality`).toBe(readFileSync(path, "utf8"));
}

describe("claim-ledger conversion on the synthetic fixture (REQ-CONV-3/5)", () => {
  it.each(ROUNDS)(
    "%s converts: 100% heading parse, zero unmapped verdicts, parseSidecar ok",
    (round) => {
      const c = converted.find((x) => x.round === round)!;
      expect(c.r.ok).toBe(true);
      if (!c.r.ok) return;
      expect(c.r.value.meta.unmappedVerdicts).toEqual([]);
      expect(c.r.value.meta.headings).toBe(c.r.value.meta.entries);
      expect(c.r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const gate = parseSidecar("01-claim-ledger.json", { json: c.r.value.sidecar });
      expect(gate.parseStatus).toBe("ok");
    },
  );

  it("v1 emits every heading variant in the coverage table (R2 §1)", () => {
    const c = converted[0]!;
    if (!c.r.ok) throw new Error("v1 conversion failed");
    const claims = c.r.value.sidecar.claims;
    const labels = c.r.value.labels.claims;
    const byId = (id: string) => claims[labels.findIndex((l) => l.id === id)]!;

    // Lettered sub-claim + `Tier 2, escalated to Tier 1` → final tier wins (S-6 proof shape).
    expect(byId("C7b")).toMatchObject({ ordinal: 0, tier: 1, verdict: "contradicted" });
    expect(byId("C7b")?.note).toContain("escalated to Tier 1");
    // Section-style id, plain `Verified`.
    expect(byId("III4")).toMatchObject({ ordinal: 1, tier: 1, verdict: "verified" });
    // `Tier 2 (escalated: …)` keeps tier 2; the free-text verdict canonicalizes on the first
    // keyword and the remainder is preserved verbatim in `note`.
    expect(byId("IV2-scope")).toMatchObject({ ordinal: 2, tier: 2, verdict: "substantially_accurate" });
    expect(byId("IV2-scope")?.note).toContain("(escalated: reputationally protective)");
    expect(byId("IV2-scope")?.note).toContain("on substance; the quotation is unverifiable");
    // ID parenthetical + verdict qualifier both preserved; reused-note source recovered.
    expect(byId("V3")?.note).toContain("(reuse C2, fix checked)");
    expect(byId("V3")?.note).toContain("(reuse confirmation)");
    expect(byId("V3")?.sources?.[0]?.url).toBe("https://books.example.org/marsh/averly-footbridge");
    // `Tier 2 (epigraph)` qualifier — an `escalated:`/`(epigraph)` parenthetical is not a
    // `escalated to Tier m`, so the declared tier stands.
    expect(byId("P4")).toMatchObject({ tier: 2, verdict: "misleading_in_context" });
    expect(byId("P4")?.note).toContain("(epigraph)");
    // Mixed free-text verdict → first keyword wins.
    expect(byId("C9")).toMatchObject({ verdict: "contradicted" });
    expect(byId("C9")?.note).toContain("in one clause (major escalation)");
    // `Skipped` + `(not scored — evaluative)` → unverifiable, no sources, note carries it.
    expect(byId("X11")).toMatchObject({ ordinal: 6, tier: 3, verdict: "unverifiable" });
    expect(byId("X11")?.sources).toBeUndefined();
    expect(byId("X11")?.url).toBeUndefined();
    expect(byId("X11")?.note).toContain("(not scored — evaluative)");
    // kind / sourceCheck are never emitted.
    for (const claim of claims) {
      expect(claim.kind).toBeUndefined();
      expect(claim.sourceCheck).toBeUndefined();
      expect(claim.humanAdded).toBe(false);
    }
    // H2 appendices did not glue: exactly 7 claims, not 7 + reuse bullets.
    expect(claims).toHaveLength(7);
    expect(labels).toHaveLength(7);
  });

  it("v2 section ids (`II6`, `VII3-scope`) convert with the same grammar", () => {
    const c = converted[1]!;
    if (!c.r.ok) throw new Error("v2 conversion failed");
    const labels = c.r.value.labels.claims;
    expect(labels.map((l) => l.id)).toEqual(["II6", "VII3-scope"]);
    expect(c.r.value.sidecar.claims.map((c) => c.verdict)).toEqual([
      "verified",
      "misleading_in_context",
    ]);
  });

  it("inventoryCount comes from the header (≠ row count); accessedAt is the check session date", () => {
    const [v1, v2] = converted;
    if (!v1.r.ok || !v2.r.ok) throw new Error("conversion failed");
    expect(v1.r.value.meta.inventoryCount).toBe(24);
    expect(v1.r.value.sidecar.inventoryCount).toBe(24);
    expect(v1.r.value.sidecar.claims).toHaveLength(7);
    expect(v2.r.value.meta.inventoryCount).toBe(31);
    for (const claim of v1.r.value.sidecar.claims) {
      if (claim.sources?.length) {
        expect(claim.accessedAt).toBe("2026-08-02T00:00:00Z");
        // REQ-OBJ-18 by construction: url === sources[0] of the verdict-determining stance.
        expect(claim.url).toBe(claim.sources[0]?.url);
        expect(claim.normalizedUrl).toBe(claim.sources[0]?.normalizedUrl);
      }
    }
  });

  it("the summary-count check reproduces both ledgers' Summary blocks", () => {
    for (const c of converted) {
      if (!c.r.ok) throw new Error("conversion failed");
      expect(c.r.value.meta.summaryReconciled, `${c.round} summary`).toBe(true);
    }
    expect(converted[0]!.r.ok && converted[0]!.r.value.meta.summaryCounts).toEqual({
      verified: 2,
      substantially_accurate: 1,
      misleading_in_context: 1,
      contradicted: 2,
      unverifiable: 1,
    });
  });

  it("REQ-CORPUS-10 (S-6): the fixture carries a Tier-1 Contradicted claim with a source", () => {
    const c = converted[0]!;
    if (!c.r.ok) throw new Error("v1 conversion failed");
    expect(() =>
      assertShowcaseFixture({ claims: c.r.value.sidecar.claims }, "synthetic v1 claim ledger"),
    ).not.toThrow();
  });
});

describe("anchors (REQ-CONV-11)", () => {
  it("every emitted anchor resolves through resolveAnchor to the same block", () => {
    for (const c of converted) {
      if (!c.r.ok) throw new Error("conversion failed");
      for (const claim of c.r.value.sidecar.claims) {
        if (!claim.anchor) continue;
        const back = resolveAnchor(claim.anchor, c.blocks);
        expect(back.blockId, `${c.round} ordinal ${claim.ordinal}`).toBe(claim.anchor.blockId);
      }
    }
  });

  it("the anchor-rung histogram is golden-pinned", () => {
    const histogram = Object.fromEntries(
      converted.map((c) => {
        if (!c.r.ok) throw new Error("conversion failed");
        return [`correspondence/${c.round}-review/01-claim-ledger.md`, c.r.value.meta.anchorRungs];
      }),
    );
    golden("anchor-histogram.json", { version: 1, files: histogram });
    // The expected fixture shape (also asserts the golden isn't silently all-`none`).
    const v1 = converted[0]!.r.ok ? converted[0]!.r.value.meta.anchorRungs : null;
    expect(v1?.none ?? 99).toBeLessThanOrEqual(1);
    expect((v1?.exact ?? 0) + (v1?.["exact-multi"] ?? 0) + (v1?.normalized ?? 0)).toBeGreaterThanOrEqual(4);
  });
});

describe("goldens (REQ-CONV-12, synthetic claims part)", () => {
  it("sidecars and labels are canonical-JSON byte-equal on re-run", () => {
    for (const c of converted) {
      if (!c.r.ok) throw new Error("conversion failed");
      const dir = `correspondence/${c.round}-review`;
      golden(`${dir}/01-claim-ledger.json`, c.r.value.sidecar);
      golden(`${dir}/labels.json`, c.r.value.labels);
    }
  });
});

describe("negative controls (R2 header; REQ-CONV-2)", () => {
  const base = converted[0]!;
  const firstClaim = () => (base.r.ok ? base.r.value.sidecar.claims[0]! : undefined);

  it.each(["Misleading", "Skipped", "Verified (reuse confirmation)"])(
    'raw verdict string "%s" fails the real validator (the explicit table is required)',
    (raw) => {
      const claim = firstClaim()!;
      const j = { ...base.r.value.sidecar, claims: [{ ...claim, verdict: raw }] };
      expect(parseSidecar("01-claim-ledger.json", { json: j }).parseStatus).toBe("failed");
    },
  );

  it("a `url` that is not the first determining source fails REQ-OBJ-18", () => {
    const claim = firstClaim()!;
    const j = {
      ...base.r.value.sidecar,
      claims: [{ ...claim, url: "https://elsewhere.example.org/not-the-source" }],
    };
    expect(parseSidecar("01-claim-ledger.json", { json: j }).parseStatus).toBe("failed");
  });

  it("an unmapped heading verdict fails the conversion", () => {
    const md = base.markdown.replace("Contradicted\n", "Approbated\n");
    const r = convertClaimLedger(md, { draftMarkdown: base.draftMarkdown });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "verdict_unmapped")).toBe(true);
  });

  it("a non-appendix heading the grammar does not cover fails the conversion", () => {
    const md = base.markdown + "\n### Free-form appendix\n\nbody\n";
    const r = convertClaimLedger(md, { draftMarkdown: base.draftMarkdown });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "heading_unparsed")).toBe(true);
  });
});

describe("overrides (REQ-CONV-6)", () => {
  it("a consumed verdict-rescore applies", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        {
          kind: "verdict-rescore",
          claim: "III4",
          verdict: "contradicted",
          cite: "correspondence/v1-review/01-claim-ledger.md:99",
        },
      ],
    });
    if (!file.ok) throw new Error("fixture override file rejected");
    const book = OverrideBook.from(file.value);
    const c = converted[0]!;
    const r = convertClaimLedger(c.markdown, {
      draftMarkdown: c.draftMarkdown,
      sourceNotes,
      overrides: book,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const labels = r.value.labels.claims;
    const idx = labels.findIndex((l) => l.id === "III4");
    expect(r.value.sidecar.claims[idx]?.verdict).toBe("contradicted");
    expect(r.value.sidecar.claims[idx]?.note).toContain("re-scored contradicted");
    expect(r.value.sidecar.claims[idx]?.note).toContain(file.value.overrides[0]?.cite);
    // The stance follows the re-scored verdict, so REQ-OBJ-18 still holds.
    expect(r.value.sidecar.claims[idx]?.sources?.[0]?.stance).toBe("contradicts");
    expect(book.unconsumed()).toEqual([]);
  });

  it("a stale override row fails the conversion", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        {
          kind: "verdict-rescore",
          claim: "NO-SUCH-CLAIM",
          verdict: "contradicted",
          cite: "correspondence/v1-review/01-claim-ledger.md:1",
        },
      ],
    });
    if (!file.ok) throw new Error("fixture override file rejected");
    const c = converted[0]!;
    const r = convertClaimLedger(c.markdown, {
      draftMarkdown: c.draftMarkdown,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "override_unconsumed")).toBe(true);
  });
});
