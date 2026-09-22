import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { growParserFixtures } from "./parser-fixture-growth.mjs";

let root;
let sourceDir;
let fixturesRoot;

// validate: known sidecar filenames are "ok" unless the JSON body carries `{ "_bad": true }`.
const validate = (filename, jsonText) => {
  const known = ["01-claim-ledger.json", "findings.json", "rubric.json", "structure-plan.json"];
  if (!known.includes(filename)) return "failed";
  try {
    return JSON.parse(jsonText)._bad ? "failed" : "ok";
  } catch {
    return "failed";
  }
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pfg-"));
  sourceDir = join(root, "rhema");
  fixturesRoot = join(root, "fixtures");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(fixturesRoot, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function src(name, body) {
  writeFileSync(join(sourceDir, name), JSON.stringify(body));
}

describe("growParserFixtures (P0.15 copy step; ledger F10)", () => {
  it("copies validated (parseStatus ok) sidecars into a new project directory", () => {
    src("01-claim-ledger.json", { claims: [] });
    src("findings.json", { findings: [] });
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "new-dossier", validate });
    expect(res.grown.sort()).toEqual(["01-claim-ledger.json", "findings.json"]);
    expect(existsSync(join(fixturesRoot, "new-dossier", "findings.json"))).toBe(true);
    // content preserved + newline-terminated
    expect(readFileSync(join(fixturesRoot, "new-dossier", "01-claim-ledger.json"), "utf8").endsWith("\n")).toBe(true);
  });

  it("rejects a failed sidecar (never a silent partial — REQ-SPEC-12)", () => {
    src("findings.json", { _bad: true });
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "d", validate });
    expect(res.rejected).toEqual(["findings.json"]);
    expect(res.grown).toEqual([]);
    expect(existsSync(join(fixturesRoot, "d", "findings.json"))).toBe(false);
  });

  it("rejects an unknown filename", () => {
    src("notes.json", { x: 1 });
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "d", validate });
    expect(res.rejected).toEqual(["notes.json"]);
  });

  it("never clobbers an existing curated seed (write-once golden corpus)", () => {
    mkdirSync(join(fixturesRoot, "seeded"), { recursive: true });
    writeFileSync(join(fixturesRoot, "seeded", "rubric.json"), JSON.stringify({ curated: true }));
    src("rubric.json", { curated: false });
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "seeded", validate });
    expect(res.skippedExisting).toEqual(["rubric.json"]);
    expect(res.grown).toEqual([]);
    expect(JSON.parse(readFileSync(join(fixturesRoot, "seeded", "rubric.json"), "utf8")).curated).toBe(true);
  });

  it("apply:false is a dry run — plans the growth, writes nothing", () => {
    src("findings.json", { findings: [] });
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "dry", validate, apply: false });
    expect(res.grown).toEqual(["findings.json"]);
    expect(existsSync(join(fixturesRoot, "dry"))).toBe(false);
  });

  it("ignores non-json files and a missing source dir", () => {
    writeFileSync(join(sourceDir, "phase-result.md"), "done");
    const res = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "d", validate });
    expect(res.grown).toEqual([]);
    const none = growParserFixtures({ sourceDir: join(root, "nope"), fixturesRoot, projectSlug: "d", validate });
    expect(none).toEqual({ grown: [], skippedExisting: [], rejected: [] });
  });

  it("refuses an unsafe project slug", () => {
    expect(() => growParserFixtures({ sourceDir, fixturesRoot, projectSlug: "../escape", validate })).toThrow(/unsafe/);
  });
});
