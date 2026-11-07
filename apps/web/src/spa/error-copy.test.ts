import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintCopy, lintInternalTerms, BANNED_INTERNAL_TERM_ALLOW } from "@rhema/contracts";
import { collectCopyStrings } from "../copy.js";
import { BffError } from "./bff.js";
import {
  ERROR_CODES,
  errorCopy,
  errorMessage,
  errorSentence,
  hasErrorCopy,
  logBffError,
} from "../error-copy.js";

// R7COPY.1c (REQ-COPY-2; UXC-27) — the error-code inventory's extraction + coverage test. The
// committed `ERROR_CODES` in error-copy.ts is the extraction output; this file re-derives it
// from the emission sources and fails on any drift — a new un-inventoried emitted code is
// exactly the defect this leg exists to catch. Every inventory code must also resolve to real
// copy (a BY_CODE entry or a family), never the fallback — an unmapped row is reported here.

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/src/spa
const SRC = join(HERE, ".."); // apps/web/src
const ROOT = join(SRC, "..", "..", ".."); // repo root
const API_SRC = join(ROOT, "apps", "api", "src");
const WEB_SRC = SRC;

/**
 * The producer modules whose `{ok:false, reason|error}` unions the api routes surface verbatim
 * through `c.json({ error: res.reason })` / `{ error: res.error }` — a NEW pass-through source
 * file (a shared helper whose refusal union reaches `{error}`) must be appended here.
 */
const PRODUCER_FILES: readonly string[] = [
  "packages/orchestrator/src/run-creation.ts",
  "packages/orchestrator/src/cancel.ts",
  "packages/orchestrator/src/reactions.ts",
  "packages/orchestrator/src/gate-resolution.ts",
  "packages/mirror/src/manual-revision.ts",
  "packages/findings-core/src/apply.ts",
  "packages/assistant/src/threads.ts",
];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) yield p;
  }
}

/** Strip comments so `error: "…"` inside a doc comment never counts as an emission. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** Literal words that can appear inside scanned positions but are never user-facing codes. */
const TYPE_WORDS = new Set([
  "string", "number", "boolean", "undefined", "object", "null", "true", "false",
  "void", "unknown", "error", "reason", "code", "detail", "status",
]);

const PATTERNS: readonly RegExp[] = [
  /\berror:\s*"([^"{}$]+)"/g, // `c.json({ error: "…" })` — codes AND prose, both emitted
  /\breason:\s*"([a-z][a-z0-9_]*)"/g, // `{ ok:false, reason: "…" }` producer literals
  /\.(?:reason|error)\s*===?\s*"([a-z][a-z0-9_]*)"/g, // pass-through members named at the site
  /(?:code|error)\s*\?\?\s*"([a-z][a-z0-9_]*)"/g, // `e.code ?? "…"` defaults
  /\bcode:\s*(?:[^",;\n]*\?\s*)?"([a-z][a-z0-9_]+)"/g, // `{ status, code: "…" }` + ternary-heads
  /\b\w*[Ii]nvalid\([^)]*?"([a-z][a-z0-9_]+)"/g, // `chatInvalid(c, slug, "chat_*_required")` args
];

function extractFrom(src: string, into: Set<string>): void {
  const text = stripComments(src);
  for (const re of PATTERNS) for (const m of text.matchAll(re)) {
    if (!TYPE_WORDS.has(m[1]!)) into.add(m[1]!);
  }
}

function extractEmittedCodes(): Set<string> {
  const codes = new Set<string>();
  for (const f of walk(API_SRC)) extractFrom(readFileSync(f, "utf8"), codes);
  for (const f of walk(WEB_SRC)) {
    if (f.includes(`${join("spa")}/`)) {
      // the SPA's own emissions: `new BffError(status, "<code>")` literal codes only.
      if (f.endsWith(`${join("", "bff.ts")}`)) {
        for (const line of readFileSync(f, "utf8").split("\n")) {
          if (!line.includes("BffError(")) continue;
          for (const m of line.matchAll(/"([a-z][a-z0-9_]*)"/g)) {
            if (!TYPE_WORDS.has(m[1]!)) codes.add(m[1]!);
          }
        }
      }
      continue;
    }
    extractFrom(readFileSync(f, "utf8"), codes);
  }
  for (const rel of PRODUCER_FILES) extractFrom(readFileSync(join(ROOT, rel), "utf8"), codes);
  return codes;
}

describe("REQ-COPY-2 — the committed error-code inventory", () => {
  const emitted = extractEmittedCodes();
  const inventory = new Set(ERROR_CODES);

  it("the extraction covers real emissions (sanity floor)", () => {
    expect(emitted.size).toBeGreaterThan(200);
    for (const c of ["unauthenticated", "not_found", "upstream_unavailable", "insufficient_balance", "chat_turn_required", "fork_read_by_run", "request_failed"])
      expect(emitted.has(c), `emitted ${c}`).toBe(true);
  });

  it("every emitted code has an inventory row — a new un-mapped code fails here", () => {
    const missing = [...emitted].filter((c) => !inventory.has(c)).sort();
    expect(missing, `emitted codes with no inventory row:\n${missing.join("\n")}`).toEqual([]);
  });

  it("the inventory carries no row a source never emits (no dead rows)", () => {
    const dead = [...inventory].filter((c) => !emitted.has(c)).sort();
    expect(dead, `inventory rows never emitted:\n${dead.join("\n")}`).toEqual([]);
  });

  it("a seeded api route emitting an un-inventoried code fails the extraction check", () => {
    const seeded = new Set(emitted);
    extractFrom(`return c.json({ error: "totally_new_code" }, 422);`, seeded);
    expect(seeded.has("totally_new_code")).toBe(true);
    const missing = [...seeded].filter((c) => !inventory.has(c));
    expect(missing).toEqual(["totally_new_code"]);
  });

  it("every inventory code resolves to real copy — unmapped rows are reported", () => {
    const unmapped = [...inventory].filter((c) => !hasErrorCopy(c)).sort();
    expect(unmapped, `inventory codes falling back:\n${unmapped.join("\n")}`).toEqual([]);
  });
});

describe("REQ-COPY-2 — errorCopy(code)", () => {
  it("maps the named codes to their own sentences", () => {
    expect(errorCopy("insufficient_balance").sentence).toContain("enough credits");
    expect(errorCopy("unauthenticated").action).toBe("Sign in again.");
    expect(errorCopy("fork_read_by_run").sentence.toLowerCase()).toContain("a run already read");
  });
  it("the fallback answers a sentence plus action for an unknown code — never the code", () => {
    const e = errorCopy("definitely_not_a_code");
    expect(e.sentence.length).toBeGreaterThan(0);
    expect(e.action.length).toBeGreaterThan(0);
    expect(`${e.sentence} ${e.action}`).not.toContain("definitely_not_a_code");
  });
  it("errorSentence composes sentence + action without the code", () => {
    expect(errorSentence("lock_held")).not.toContain("lock_held");
    expect(errorSentence("lock_held")).toContain("run");
  });
  it("requestId is logged on every mapped error — code + id only, never detail (spy)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const err = new BffError(409, "lock_held", { detail: "s3cr3t@x.com", requestId: "req_abc" });
    const text = errorMessage(err);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]![0] as string;
    expect(line).toContain("lock_held");
    expect(line).toContain("req_abc");
    expect(line).not.toContain("s3cr3t@x.com");
    expect(text).not.toContain("lock_held");
    expect(text).not.toContain("s3cr3t@x.com");
    warn.mockRestore();
  });
  it("logBffError degrades the absent id to 'none'", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logBffError(new BffError(500, "internal_error"));
    expect(warn.mock.calls[0]![0]).toContain("request none");
    warn.mockRestore();
  });
});

describe("REQ-COPY-2 — no raw-code display in apps/web/src/spa (UXC-27 grep)", () => {
  const spaFiles = [...walk(SRC + "/spa")].filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx") && !f.endsWith(".dom.test.tsx"));
  it("zero `err.detail` / display-position `err.code` outside the named allowlist", () => {
    // The ONE module that owns the raw fields, plus the run-sheet's code→COPY lookup table
    // (a lookup, never a render — the AC bans DISPLAY, not the code as a map key).
    const ALLOWED: readonly { file: string; pattern: RegExp }[] = [
      { file: `${join("", "bff.ts")}`, pattern: /.*/ },
      { file: `${join("", "error-copy.ts")}`, pattern: /.*/ },
      { file: `${join("surfaces", "run-sheet.tsx")}`, pattern: /noticeByCode\[/ },
      { file: `${join("surfaces", "editor.tsx")}`, pattern: /\? err\.code :/ },
    ];
    const hits: string[] = [];
    for (const file of spaFiles) {
      const rel = file.slice((SRC + "/spa").length + 1);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/\berr\.(detail|code)\b/.test(line)) return;
        const allowed = ALLOWED.some(
          (a) => rel === a.file.replace(/^\.?/, "") && a.pattern.test(line),
        );
        if (!allowed) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe("REQ-COPY-2 — every errorCopy leaf passes 244's lint", () => {
  it("the whole errors/errorActions bank is lint-clean", () => {
    const pairs = collectCopyStrings().filter(([k]) => k.startsWith("errors.") || k.startsWith("errorActions."));
    expect(pairs.length).toBeGreaterThan(40);
    expect(lintCopy(pairs)).toEqual([]);
    expect(lintInternalTerms(pairs, { allow: BANNED_INTERNAL_TERM_ALLOW })).toEqual([]);
  });
  it("every composed errorCopy output is itself lint-clean", () => {
    const pairs = ERROR_CODES.map((c): [string, string] => [`err.${c}`, errorSentence(c)]);
    expect(lintCopy(pairs)).toEqual([]);
    expect(lintInternalTerms(pairs, { allow: BANNED_INTERNAL_TERM_ALLOW })).toEqual([]);
  });
});
