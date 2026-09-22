import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, buildFinding, fakeExtractor, type BenchmarkTestDb } from "./testing/harness.js";
import { createMatchTask, defaultMatcher, loadMatchRecords } from "./matching.js";
import { confirmedNovelties } from "./adjudication.js";
import { normalizeArmOutput } from "./normalization.js";
import { runWorkshopCommand, parseWorkshopArgs, listPendingTasks, WorkshopCliError } from "./workshop-cli.js";
import { createWave, recordArmRun } from "@rhema/benchmark";
import type { GoldFinding } from "@rhema/benchmark";

const deps = testDeps();

// Gold whose body matches the "matched" raw text so defaultMatcher suggests, and omits the "novel" one.
const GOLD: GoldFinding[] = [
  { finding: buildFinding({ id: "g1", body: "the argument on page two lacks a citation", severity: "major" }), material: true },
];

describe("workshop CLI arg parsing", () => {
  it("parses subcommand + --flag value + boolean flags", () => {
    expect(parseWorkshopArgs(["decide", "--arm-finding", "f1", "--verdict", "matched", "--llm"])).toEqual({
      command: "decide",
      flags: { "arm-finding": "f1", verdict: "matched", llm: true },
    });
  });
  it("rejects a stray non-flag argument", () => {
    expect(() => parseWorkshopArgs(["decide", "oops"])).toThrow(WorkshopCliError);
  });
});

describe("workshop CLI over a live wave (D-P0.14-2, PGlite)", () => {
  let db: BenchmarkTestDb;
  let waveId: string;
  let matchedFindingId: string;
  let novelFindingId: string;

  beforeEach(async () => {
    db = await createBenchmarkTestDb();
    waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
    // A4 produces a finding that matches gold; A1 produces a finding the gold set omits (a novelty candidate).
    const a4Run = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h4" });
    const a1Run = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A1", configHash: "h1" });
    const [matched] = await normalizeArmOutput(db.exec, deps, {
      armRunId: a4Run, rawText: "major: the argument on page two lacks a citation", draftId: "d1", extractor: fakeExtractor(),
    });
    const [novel] = await normalizeArmOutput(db.exec, deps, {
      armRunId: a1Run, rawText: "minor: a stylistic quibble the gold set omits entirely", draftId: "d1", extractor: fakeExtractor(),
    });
    matchedFindingId = matched!.id;
    novelFindingId = novel!.id;
    await createMatchTask(db.exec, deps, { waveId, draftId: "d1", arm: "A4", armFindingId: matchedFindingId, armFinding: matched!.finding, goldFindings: GOLD, matcher: defaultMatcher() });
    await createMatchTask(db.exec, deps, { waveId, draftId: "d1", arm: "A1", armFindingId: novelFindingId, armFinding: novel!.finding, goldFindings: GOLD });
  });
  afterEach(async () => {
    await db.close();
  });

  it("lists pending tasks BLIND to arm, records decisions, and confirms novelty", async () => {
    const exec = db.exec;
    // list-pending shows finding ids + suggestions but NEVER the arm (A1/A4 absent).
    const listed = await runWorkshopCommand(exec, deps, ["list-pending", "--wave", waveId]);
    expect(listed).toContain(matchedFindingId);
    expect(listed).toContain(novelFindingId);
    expect(listed).not.toMatch(/\bA1\b|\bA4\b/);
    expect((await listPendingTasks(exec, { waveId })).length).toBe(2);

    // Record a binding 'matched' decision (requires --gold) and a novelty decision.
    const r1 = await runWorkshopCommand(exec, deps, ["decide", "--arm-finding", matchedFindingId, "--verdict", "matched", "--gold", "g1", "--by", "matcher-1"]);
    expect(r1).toContain("recorded matched");
    await runWorkshopCommand(exec, deps, ["decide", "--arm-finding", novelFindingId, "--verdict", "valid_but_missed_by_gold", "--by", "matcher-1"]);

    // Both decisions land as MatchRecords the scorer reads.
    expect((await loadMatchRecords(exec, { waveId, draftId: "d1", arm: "A4" }))[0]).toMatchObject({ verdict: "matched", goldFindingId: "g1" });

    // Senior confirms the novelty → it counts toward the novelty metric.
    const rc = await runWorkshopCommand(exec, deps, ["confirm-novelty", "--arm-finding", novelFindingId, "--by", "senior-1"]);
    expect(rc).toContain("confirmed novelty");
    expect(await confirmedNovelties(exec, { waveId, draftId: "d1", arm: "A1" })).toBe(1);

    // Nothing left pending.
    expect(await runWorkshopCommand(exec, deps, ["list-pending", "--wave", waveId])).toBe("no pending match tasks");
  });

  it("records both-order pairwise preferences", async () => {
    const exec = db.exec;
    const p1 = await runWorkshopCommand(exec, deps, ["prefer", "--wave", waveId, "--draft", "d1", "--arm-a", "A4", "--arm-b", "A1", "--presentation", "ab", "--preferred", "a", "--by", "editor-1"]);
    expect(p1).toContain("recorded preference");
    await runWorkshopCommand(exec, deps, ["prefer", "--wave", waveId, "--draft", "d1", "--arm-a", "A4", "--arm-b", "A1", "--presentation", "ba", "--preferred", "a", "--by", "editor-1"]);
  });

  it("'matched' without --gold is rejected by the underlying invariant", async () => {
    await expect(runWorkshopCommand(db.exec, deps, ["decide", "--arm-finding", matchedFindingId, "--verdict", "matched", "--by", "m"])).rejects.toThrow(/must name the gold finding/);
  });

  it("rejects an invalid verdict and an unknown command", async () => {
    await expect(runWorkshopCommand(db.exec, deps, ["decide", "--arm-finding", matchedFindingId, "--verdict", "nope", "--by", "m"])).rejects.toThrow(/invalid --verdict/);
    await expect(runWorkshopCommand(db.exec, deps, ["frobnicate"])).rejects.toThrow(/unknown command/);
  });
});
