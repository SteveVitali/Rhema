import { describe, expect, it } from "vitest";
import type { AgentTypeKey } from "@rhema/contracts";
import { compileSeatPolicy } from "./seat-tables.js";
import { evaluateToolUse } from "./hook.js";
import { newDenialState } from "./denials.js";
import { lexicalRealpath } from "./realpath.js";
import type { PhasePolicy, SeatPolicy } from "./types.js";

// AC1 (REQ-DATA-11; REQ-OBJ-8/10; §12.6) — the policy suite over every seat table row of §12.6, allow and
// deny. The two load-bearing boundaries — the Editor↔Drafter wall and the Editor's persona exclusions —
// are asserted as denials; no row may widen them (cross-cutting invariant).

const GEN_PHASE: PhasePolicy = { key: "draft", phaseClass: "generate", allowsSubagents: true };
const CTX = { resolveRealpath: lexicalRealpath, now: () => "2026-09-01T00:00:00.000Z" };

function policyFor(seat: AgentTypeKey): SeatPolicy {
  return compileSeatPolicy({
    seat,
    personaId: "p1",
    tools: ["read", "write", "web_search", "web_fetch"],
    phase: GEN_PHASE,
    runId: "run_1",
  });
}

/** Drive a Read or Write of `path` through the full hook and return the verdict. */
function check(seat: AgentTypeKey, op: "read" | "write", path: string): "allow" | "deny" {
  const tool = op === "read" ? "Read" : "Write";
  const input = op === "read" ? { file_path: path } : { file_path: path, content: "x" };
  return evaluateToolUse({ tool, input }, policyFor(seat), newDenialState(), CTX).decision;
}

interface Row {
  seat: AgentTypeKey;
  op: "read" | "write";
  path: string;
  expect: "allow" | "deny";
  why: string;
}

const P = "/work/project";
const V = "/work/personas/p1";

const TABLE: Row[] = [
  // ---- Drafter (author) ----
  { seat: "author", op: "read", path: `${P}/manifest.md`, expect: "allow", why: "shared record" },
  { seat: "author", op: "read", path: `${P}/drafts/v1.md`, expect: "allow", why: "shared drafts" },
  { seat: "author", op: "read", path: `${P}/preferences.md`, expect: "allow", why: "REQ-OBJ-10 Drafter" },
  { seat: "author", op: "write", path: `${P}/agents/author/dossier.md`, expect: "allow", why: "own namespace rw" },
  { seat: "author", op: "write", path: `${P}/drafts/v2.md`, expect: "deny", why: "drafts read-only" },
  { seat: "author", op: "read", path: `${V}/profile/voice-print.md`, expect: "allow", why: "Drafter voice" },
  { seat: "author", op: "read", path: `${V}/profile/lexicon.md`, expect: "allow", why: "Drafter voice" },
  { seat: "author", op: "read", path: `${P}/agents/editor/letter.md`, expect: "deny", why: "not own namespace" },

  // ---- Editor: the wall + persona exclusions ----
  { seat: "editor", op: "read", path: `${P}/drafts/v1.md`, expect: "allow", why: "shared drafts" },
  { seat: "editor", op: "write", path: `${P}/agents/editor/00-editors-letter.md`, expect: "allow", why: "own ns" },
  { seat: "editor", op: "read", path: `${P}/agents/author/notebook.md`, expect: "deny", why: "Editor↔Drafter wall" },
  { seat: "editor", op: "read", path: `${P}/preferences.md`, expect: "deny", why: "REQ-OBJ-10 Editor never" },
  { seat: "editor", op: "read", path: `${V}/profile/voice-print.md`, expect: "deny", why: "REQ-OBJ-8" },
  { seat: "editor", op: "read", path: `${V}/profile/lexicon.md`, expect: "deny", why: "REQ-OBJ-8" },
  { seat: "editor", op: "read", path: `${V}/profile/exemplars.md`, expect: "deny", why: "REQ-OBJ-8" },
  { seat: "editor", op: "read", path: `${V}/profile/positions.md`, expect: "allow", why: "Editor persona set" },
  { seat: "editor", op: "read", path: `${V}/profile/continuity.md`, expect: "allow", why: "Editor persona set" },
  { seat: "editor", op: "read", path: `${V}/profile/structure-repertoire.md`, expect: "allow", why: "Editor set" },

  // ---- Assistant: Editor persona + exemplars; frozen Drafter ledgers read-only; no drafts write ----
  { seat: "assistant", op: "read", path: `${V}/profile/exemplars.md`, expect: "allow", why: "Editor + exemplars" },
  { seat: "assistant", op: "read", path: `${V}/profile/voice-print.md`, expect: "deny", why: "not in set" },
  { seat: "assistant", op: "write", path: `${P}/agents/assistant/note.md`, expect: "allow", why: "own ns" },
  { seat: "assistant", op: "read", path: `${P}/preferences.md`, expect: "allow", why: "REQ-OBJ-10 Assistant" },
  { seat: "assistant", op: "read", path: `${P}/agents/author/ledgers/v1-response-ledger.md`, expect: "allow", why: "frozen ledger (F19)" },
  { seat: "assistant", op: "read", path: `${P}/agents/author/drafting/secret.md`, expect: "deny", why: "only ledgers, not the notebook" },

  // ---- Persona builder: no project mount; profile writable, docs read-only ----
  { seat: "persona_builder", op: "read", path: `${P}/drafts/v1.md`, expect: "deny", why: "no project mount" },
  { seat: "persona_builder", op: "read", path: `${V}/PERSONA.md`, expect: "allow", why: "persona seed" },
  { seat: "persona_builder", op: "read", path: `${V}/docs/sample1.md`, expect: "allow", why: "docs read-only" },
  { seat: "persona_builder", op: "write", path: `${V}/profile/voice-print.md`, expect: "allow", why: "profile writable" },
  { seat: "persona_builder", op: "write", path: `${V}/docs/x.md`, expect: "deny", why: "docs read-only" },
  // DEF.1 (F1, STB.3 profile-voice 01M3DJ5V…): the phase-result contract writes `.rhema/phase-result.json`
  // at the persona ROOT — the seat's harness-control area is readwrite there…
  { seat: "persona_builder", op: "write", path: `${V}/.rhema/phase-result.json`, expect: "allow", why: "persona-root .rhema rw (F1)" },
  { seat: "persona_builder", op: "write", path: `${V}/.rhema/voice-index.json`, expect: "allow", why: "persona-root .rhema rw (F1)" },
  // …and NEVER under the project root — the seat has no project mount at all (the signed
  // `.rhema/manifest.json` contract lives there; it must stay read-only to every seat).
  { seat: "persona_builder", op: "write", path: `${P}/.rhema/phase-result.json`, expect: "deny", why: "project .rhema never writable" },
  { seat: "persona_builder", op: "write", path: `${P}/.rhema/manifest.json`, expect: "deny", why: "signed mount contract stays read-only" },

  // ---- System: the loop reads tables, never a mirror ----
  { seat: "system", op: "read", path: `${P}/drafts/v1.md`, expect: "deny", why: "no mounts" },
  { seat: "system", op: "read", path: `${V}/PERSONA.md`, expect: "deny", why: "no mounts" },
];

describe("§12.6 seat mount tables (AC1)", () => {
  for (const row of TABLE) {
    it(`${row.seat} ${row.op} ${row.path.replace(P, "").replace(V, "persona") || "/"} → ${row.expect} (${row.why})`, () => {
      expect(check(row.seat, row.op, row.path)).toBe(row.expect);
    });
  }

  it("compiles the System seat with no persona root (no persona mounts)", () => {
    expect(policyFor("system").roots.persona).toBeUndefined();
  });

  it("compiles a persona root by substituting the run's persona id", () => {
    expect(policyFor("editor").roots.persona).toBe("/work/personas/p1");
  });
});
