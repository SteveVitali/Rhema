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
import type { WhatChangedArtifact } from "./what-changed.js";

// REQ-CONV-2/6/10/12/15/17 — the pipeline + golden harness on the synthetic project (the same
// harness 219 points at the real projects): canonical-JSON byte equality for every sidecar,
// labels.json, rows.json and the what-changed artifacts; the summary-count reconciliation; the
// zero-unmapped lists; anchor-rung histograms; the stale-override failure; the planted-invalid
// abort with NO partial output; and the parseDraftLedgerSections pin.
// Regenerate goldens with `RHEMA_REGEN_GOLDENS=1 pnpm exec vitest run …pipeline.test.ts`.

const SLUG = "the-borrowed-commons";
const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "fixtures/synthetic/corpus", SLUG);
const OVERRIDES_DIR = join(PKG, "fixtures/synthetic/overrides", SLUG);
const GOLDENS = join(PKG, "fixtures/synthetic/goldens", SLUG);
const REGEN = process.env.RHEMA_REGEN_GOLDENS === "1";

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const files = new Map<string, string>();
for (const p of walk(CORPUS)) files.set(relative(CORPUS, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));

const overridesJson = JSON.parse(
  readFileSync(join(OVERRIDES_DIR, "convert-overrides.json"), "utf8"),
);
const overridesFile = readConvertOverrides(overridesJson);
if (!overridesFile.ok) throw new Error("fixture overrides failed to parse");

const project = convertProject({ files, overrides: overridesFile.value });

const SIDECAR_NAMES = new Set([
  "01-claim-ledger.json",
  "findings.json",
  "rubric.json",
  "response-ledger.json",
  "structure-plan.json",
]);

describe("pipeline on the synthetic project (REQ-CONV-2/6)", () => {
  it("converts green: ok, every emitted sidecar parseStatus ok, every override consumed", () => {
    if (!project.ok) throw new Error(JSON.stringify(project.diagnostics));
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    expect(project.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Every emitted sidecar re-validates through the real parseSidecar dispatch.
    for (const [path, bytes] of project.outputs) {
      const name = path.split("/").pop()!;
      if (!SIDECAR_NAMES.has(name)) continue;
      expect(
        parseSidecar(name as never, { json: JSON.parse(bytes) }).parseStatus,
        path,
      ).toBe("ok");
    }
  });

  it("a planted invalid sidecar aborts the pipeline with NO partial output", () => {
    // Plant a broken letter: no `## Scorecard` → rubric fails closed.
    const bad = new Map(files);
    bad.set(
      "correspondence/v1-review/editors-letter.md",
      "# letter\n\n- Verdict: x\n\n**The one thing:** y\n",
    );
    const r = convertProject({ files: bad, overrides: overridesFile.value });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r as { outputs?: unknown }).outputs).toBeUndefined();
    expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("a stale (unconsumed) override row fails the whole pipeline", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        ...overridesFile.value.overrides,
        { kind: "disposition", row: "ZZ9", disposition: "accept", cite: "x.md:1" },
      ],
    });
    if (!file.ok) throw new Error("bad file");
    const r = convertProject({ files, overrides: file.value });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.diagnostics.some((d) => d.code === "override_unconsumed")).toBe(true);
  });

  it("zero-unmapped lists: verdicts, dispositions, statuses", () => {
    if (!project.ok) throw new Error("not ok");
    expect(project.meta.unmapped).toEqual({ verdicts: [], dispositions: [], statuses: [] });
  });

  it("summary-count reconciliation holds on the fixture's ledgers", () => {
    if (!project.ok) throw new Error("not ok");
    expect(project.meta.summaryReconciled.v1).toBe(true);
  });
});

describe("what-changed artifacts (REQ-CONV-15)", () => {
  const artifact = (pair: string): WhatChangedArtifact => {
    if (!project.ok) throw new Error("not ok");
    const bytes = project.outputs.get(`what-changed/${pair}.json`);
    expect(bytes, pair).toBeTruthy();
    return JSON.parse(bytes!) as WhatChangedArtifact;
  };

  it("v1→v2 (Discharges round): moves with discharged entries link hunks; leftovers stay Unlinked", () => {
    const a = artifact("v1-v2");
    // M2's sole discharged row (F5) is a rebut → it renders as a rebutted card (§5.8), so the
    // joined move set is M1 + M3; the ledger still emits all three moves in `moves[]`.
    expect(a.summary.moves).toBe(2);
    expect(a.moves.map((m) => m.moveId)).toEqual(["M1", "M3"]);
    expect(a.moves.every((m) => m.hunks.length > 0)).toBe(true);
    expect(a.rebutted).toEqual([
      { findingOrdinal: 8, rationale: "rebut with evidence" },
      { findingOrdinal: 9, rationale: "decline" },
    ]);
    // linkage is coarse (R2 §4): M1's and M3's evidence anchors land inside the same mixed
    // region, so one hunk carries both moves — linked, never fabricated.
    expect(a.summary.linkedHunks).toBe(1);
    expect(a.moves.flatMap((m) => m.hunks)).toEqual(["h3", "h3"]);
    expect(a.summary.unlinkedHunks).toBe(a.summary.hunks - a.summary.linkedHunks);
    expect(a.summary.unlinkedHunks).toBeGreaterThan(0); // non-ledger edits stay Unlinked
    // no link is emitted without an entry carrying both moveOrdinal and an anchor
    const ledger = JSON.parse(
      project.ok ? project.outputs.get("agents/author/ledgers/v1-response-ledger.json")! : "",
    );
    for (const e of ledger.entries)
      if (e.disposition.moveOrdinal !== undefined) expect(e.anchor).toBeTruthy();
    // the unlinked remainder is recorded, never a fabricated link
    for (const h of a.hunks)
      if (a.unlinked.hunks.includes(h.id)) expect(h.moveId).toBeNull();
  });

  it("v2→v3 (no Discharges column): every hunk is Unlinked — never fabricated", () => {
    const a = artifact("v2-v3");
    expect(a.summary.linkedHunks).toBe(0);
    expect(a.summary.unlinkedHunks).toBe(a.summary.hunks);
    expect(a.hunks.every((h) => h.moveId === null)).toBe(true);
    expect(a.trace.at(-1)!.moveId).toBeUndefined();
    expect(a.trace.at(-1)!.hunkCount).toBe(a.summary.hunks);
  });
});

describe("draft ledgers render raw (REQ-CONV-17)", () => {
  it("row-indexed sections, `#` cells verbatim (Roman numerals survive — the upstream bug)", () => {
    if (!project.ok) throw new Error("not ok");
    const rows = JSON.parse(
      project.outputs.get("agents/author/drafting/v1/04-draft-ledger.rows.json")!,
    );
    expect(rows.rows).toHaveLength(4);
    expect(rows.rows.map((r: { ordinal: number }) => r.ordinal)).toEqual([0, 1, 2, 3]);
    expect(rows.rows.map((r: { hash: string }) => r.hash)).toEqual(["I", "II", "III", "IV"]);
    // no draft-ledger sidecar is ever emitted
    expect(
      [...project.outputs.keys()].filter((p) => /draft-ledger(?!\.rows)/.test(p)),
    ).toEqual([]);
  });

  it("nothing under src/convert imports parseDraftLedgerSections", () => {
    const convertDir = join(PKG, "src/convert");
    for (const p of walk(convertDir)) {
      if (!p.endsWith(".ts") || p.endsWith(".test.ts")) continue;
      const src = readFileSync(p, "utf8");
      expect(src, relative(convertDir, p)).not.toMatch(
        /import[^;]*parseDraftLedgerSections|[^a-zA-Z]parseDraftLedgerSections\s*\(/,
      );
    }
  });
});

describe("goldens (REQ-CONV-12 amended)", () => {
  it("every output is canonical-JSON byte-equal to the committed golden (byte-stable on re-run)", () => {
    if (!project.ok) throw new Error(JSON.stringify(project.diagnostics));
    if (REGEN) {
      for (const [path, bytes] of project.outputs) {
        const dest = join(GOLDENS, path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, bytes);
      }
      return;
    }
    const emitted = [...project.outputs.keys()].sort();
    const committed = [...walk(GOLDENS)]
      .map((p) => relative(GOLDENS, p).replace(/\\/g, "/"))
      .sort();
    expect(emitted).toEqual(committed);
    for (const [path, bytes] of project.outputs) {
      const golden = join(GOLDENS, path);
      expect(existsSync(golden), `golden ${path} — regenerate with RHEMA_REGEN_GOLDENS=1`).toBe(
        true,
      );
      expect(bytes, `golden ${path} byte-equality`).toBe(readFileSync(golden, "utf8"));
    }
    // determinism: a second run produces the identical outputs map
    const again = convertProject({ files, overrides: overridesFile.value });
    expect(again.ok).toBe(true);
    if (again.ok)
      for (const [path, bytes] of project.outputs)
        expect(again.outputs.get(path)).toBe(bytes);
  });
});
