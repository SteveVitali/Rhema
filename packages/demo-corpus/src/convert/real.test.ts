import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { parseSidecar } from "@rhema/protocols";
import { convertProject } from "./index.js";
import { readConvertOverrides } from "./overrides.js";

// REQ-CONV-12 (real half, amended spec §4.2) + REQ-CONV-6/15 + REQ-CORPUS-2/10/14 — the 217
// pipeline/golden harness, unchanged, pointed at the four REAL projects (219_R7DATA.1, post
// HUMAN-H14). Committed inputs: `corpus/<slug>/` (the H14-signed export, digest
// 19861a06c4401b8f9e1798751fe7dd6ab0e03b8670e974a4aab638c542116c91) and
// `overrides/<slug>/convert-overrides.json` (ids + file:line only). Committed outputs:
// `goldens/<slug>/` canonical JSON for every sidecar. Regenerate with
// `RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run …real.test.ts`.

const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "corpus");
const OVERRIDES = join(PKG, "overrides");
const GOLDENS = join(PKG, "goldens");
const REGEN = process.env.RHEMA_REGEN_GOLDENS === "1";

const SLUGS = [
  "the-politics-of-visibility",
  "structure-of-political-difference",
  "constitution-of-reason",
  "the-governable-mind",
] as const;

const SIDECAR_NAMES = new Set([
  "01-claim-ledger.json",
  "findings.json",
  "rubric.json",
  "response-ledger.json",
  "structure-plan.json",
]);

// Summary-count reconciliation is asserted on the rounds R2 §1 says reproduce exactly from the
// headings (after GM v1's C15 summary re-score rides its verdict-rescore override). GM v2 is the
// recorded residual (R2 §1 Self-consistency): reuse confirmations appear both as headings and as
// bullets under `## Reuse confirmations`, so its counts cannot reconcile by construction —
// declared here with the reason, asserted `false`, never silently green.
const RESIDUAL = {
  slug: "the-governable-mind",
  round: "v2",
  reason:
    "reuse confirmations appear both as headings and as `## Reuse confirmations` bullets (R2 §1)",
} as const;

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function corpusFiles(slug: string): Map<string, string> {
  const root = join(CORPUS, slug);
  const files = new Map<string, string>();
  for (const p of walk(root))
    files.set(relative(root, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));
  return files;
}

function project(slug: string) {
  const ovPath = join(OVERRIDES, slug, "convert-overrides.json");
  const parsed = readConvertOverrides(JSON.parse(readFileSync(ovPath, "utf8")));
  if (!parsed.ok) throw new Error(`${slug}: convert-overrides.json failed to parse`);
  const result = convertProject({ files: corpusFiles(slug), overrides: parsed.value });
  if (!result.ok) throw new Error(`${slug}: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

for (const slug of SLUGS) {
  describe(`real corpus → sidecars: ${slug} (REQ-CONV-2/6/12)`, () => {
    const result = project(slug);
    const goldenDir = join(GOLDENS, slug);

    it("converts green with zero error diagnostics", () => {
      expect(result.ok).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    });

    it("every emitted sidecar passes the real parseSidecar dispatch", () => {
      for (const [path, bytes] of result.outputs) {
        const name = path.split("/").pop()!;
        if (!SIDECAR_NAMES.has(name)) continue;
        expect(
          parseSidecar(name as never, { json: JSON.parse(bytes) }).parseStatus,
          path,
        ).toBe("ok");
      }
    });

    it("zero-unmapped lists are empty (verdicts, dispositions, statuses)", () => {
      expect(result.meta.unmapped).toEqual({ verdicts: [], dispositions: [], statuses: [] });
    });

    it("summary counts reconcile on the reconciling rounds; the GM v2 residual is recorded", () => {
      for (const [round, reconciled] of Object.entries(result.meta.summaryReconciled)) {
        if (slug === RESIDUAL.slug && round === RESIDUAL.round) {
          // declared residual — see RESIDUAL.reason above; the run record carries it too
          expect(reconciled, RESIDUAL.reason).toBe(false);
        } else {
          expect(reconciled, `${slug} ${round}`).toBe(true);
        }
      }
    });

    it("emitted outputs are canonical-JSON byte-equal to the committed goldens (and deterministic)", () => {
      if (REGEN) {
        for (const [path, bytes] of result.outputs) {
          const dest = join(goldenDir, path);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, bytes);
        }
        return;
      }
      const emitted = [...result.outputs.keys()].sort();
      const committed = [...walk(goldenDir)]
        .map((p) => relative(goldenDir, p).replace(/\\/g, "/"))
        .sort();
      expect(emitted).toEqual(committed);
      for (const [path, bytes] of result.outputs) {
        const golden = join(goldenDir, path);
        expect(
          existsSync(golden),
          `golden ${path} — regenerate with RHEMA_REGEN_GOLDENS=1`,
        ).toBe(true);
        expect(bytes, `golden ${path} byte-equality`).toBe(readFileSync(golden, "utf8"));
      }
      const again = project(slug);
      for (const [path, bytes] of result.outputs)
        expect(again.outputs.get(path)).toBe(bytes);
    });
  });
}

describe("real goldens: corpus self-checks (REQ-CORPUS-10, S-6)", () => {
  it("GM v2's round-2 ledger carries contradicted tier-1 claims with sources (assertShowcaseFixture shape)", async () => {
    const { assertShowcaseFixture } = await import("@rhema/contracts");
    const result = project("the-governable-mind");
    const ledger = JSON.parse(
      result.outputs.get("correspondence/v2-review/01-claim-ledger.json")!,
    );
    expect(() =>
      assertShowcaseFixture({ claims: ledger.claims }, "GM v2 claim ledger"),
    ).not.toThrow();
    // the three documented rows (R1 §3): III16, VII3-scope, XII2
    const labels = JSON.parse(
      result.outputs.get("correspondence/v2-review/labels.json")!,
    ).claims as { ordinal: number; id: string }[];
    for (const id of ["III16", "VII3-scope", "XII2"]) {
      const lab = labels.find((l) => l.id === id);
      expect(lab, id).toBeTruthy();
      const claim = ledger.claims[lab!.ordinal];
      expect(claim.tier, id).toBe(1);
      expect(claim.verdict, id).toBe("contradicted");
      expect(claim.sources?.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  it("SPD's C23a projects as Tier 1 · Misleading in context with its source (S-6)", () => {
    const result = project("structure-of-political-difference");
    const ledger = JSON.parse(
      result.outputs.get("correspondence/v1-review/01-claim-ledger.json")!,
    );
    const labels = JSON.parse(
      result.outputs.get("correspondence/v1-review/labels.json")!,
    ).claims as { ordinal: number; id: string }[];
    const lab = labels.find((l) => l.id === "C23a");
    expect(lab).toBeTruthy();
    const claim = ledger.claims[lab!.ordinal];
    expect(claim.tier).toBe(1);
    expect(claim.verdict).toBe("misleading_in_context");
    expect(claim.sources?.length ?? 0).toBeGreaterThan(0);
  });

  it("SPD v1→v2 what-changed carries natively linked hunks; unlinked hunks stay Unlinked (S-8, REQ-CONV-15)", () => {
    const result = project("structure-of-political-difference");
    const a = JSON.parse(result.outputs.get("what-changed/v1-v2.json")!);
    // the Discharges-column moves link hunks (M2 → F1, the new §III — S-8/RV-29 verified)
    expect(a.summary.linkedHunks).toBeGreaterThan(0);
    expect(a.moves.some((m: { moveId: string }) => m.moveId === "M2")).toBe(true);
    const m2 = a.moves.find((m: { moveId: string }) => m.moveId === "M2");
    expect(m2.hunks.length).toBeGreaterThan(0);
    expect(a.summary.unlinkedHunks).toBe(a.summary.hunks - a.summary.linkedHunks);
    for (const h of a.hunks)
      if (a.unlinked.hunks.includes(h.id)) expect(h.moveId).toBeNull();
  });
});

describe("override and allowlist rows carry ids + file:line only — no quoted prose (P4-27)", () => {
  const ALLOWED_KEYS = new Set([
    "version",
    "overrides",
    "kind",
    "claim",
    "verdict",
    "objection",
    "outcome",
    "major",
    "row",
    "finding",
    "disposition",
    "move",
    "cite",
    "note",
    "$comment",
    "entries",
    "id",
    "file",
    "line",
    "reason",
  ]);
  const FILELINE_RE = /^[^:]+:\d+$/;

  it("every convert-overrides.json row validates: declared fields only, every cite is file:line", () => {
    for (const slug of SLUGS) {
      const ov = JSON.parse(
        readFileSync(join(OVERRIDES, slug, "convert-overrides.json"), "utf8"),
      ) as { version: number; overrides: Record<string, unknown>[] };
      expect(ov.version).toBe(1);
      for (const [k] of Object.entries(ov)) expect(ALLOWED_KEYS.has(k), `${slug}:${k}`).toBe(true);
      for (const row of ov.overrides) {
        for (const [k, v] of Object.entries(row)) {
          expect(ALLOWED_KEYS.has(k), `${slug} row ${JSON.stringify(row)} key ${k}`).toBe(true);
          if (k === "cite") expect(String(v), `${slug} cite`).toMatch(FILELINE_RE);
          // mapped values are enums/ids/ints — never prose (no spaces beyond label idioms)
          if (k === "note") expect(typeof v).toBe("string");
        }
      }
    }
  });

  it("the denylist line-allowlist rows are the three S-11 Published credit lines, file:line only", () => {
    const allow = JSON.parse(
      readFileSync(join(CORPUS, "_rules/line-allowlist.json"), "utf8"),
    ) as { entries: { id: string; file: string; line: number; reason?: string }[] };
    expect(allow.entries).toHaveLength(3);
    for (const e of allow.entries) {
      expect(Object.keys(e).every((k) => ALLOWED_KEYS.has(k)), JSON.stringify(e)).toBe(true);
      expect(e.file).toMatch(/^constitution-of-reason|the-governable-mind|the-politics-of-visibility/);
      expect(e.file).toBe(`${e.file.split("/")[0]}/published.md`);
      expect(typeof e.line).toBe("number");
    }
  });
});
