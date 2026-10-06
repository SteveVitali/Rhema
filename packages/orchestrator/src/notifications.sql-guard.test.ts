import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createOrchestratorTestDb } from "./testing/index.js";

// HOT.1 — the SQL-prepare class guard for notifications.ts. The digest bug (`r.finished_at` — a column
// that never existed) compiled, typechecked, and unit-passed for months because nothing PREPARE'd the
// literals. This guard extracts every literal SQL passed to `.query(` in notifications.ts and PREPAREs
// it against a migrated PGlite — a nonexistent column/table or a syntax error fails the suite at the
// exact statement. It also fails on `${}` interpolation inside a query literal: dynamic-SQL assembly is
// the unsafe-construction half of the same class.

interface SqlLiteral {
  readonly sql: string;
  readonly line: number;
  readonly interpolated: boolean;
}

/** Extract the first-argument string/template literals of every `.query(` call in the source. */
function sqlLiterals(src: string): SqlLiteral[] {
  const out: SqlLiteral[] = [];
  const callSite = /\.query\(\s*(['"`])/g;
  for (const m of src.matchAll(callSite)) {
    const quote = m[1]!;
    let i = m.index! + m[0].length;
    let buf = "";
    let interpolated = false;
    while (i < src.length) {
      const ch = src[i]!;
      if (ch === "\\") {
        buf += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) break;
      if (quote === "`" && ch === "$" && src[i + 1] === "{") interpolated = true;
      buf += ch;
      i += 1;
    }
    out.push({ sql: buf, line: src.slice(0, m.index).split("\n").length, interpolated });
  }
  return out;
}

describe("notifications.ts SQL literals — prepare class guard (HOT.1)", () => {
  const src = readFileSync(fileURLToPath(new URL("./notifications.ts", import.meta.url)), "utf8");
  const literals = sqlLiterals(src);

  it("finds every .query( literal — the extraction itself is asserted (guard against a dead regex)", () => {
    expect(literals.length).toBeGreaterThan(10); // the file carries ~20 statements today
    // every literal must look like SQL, not an unrelated string argument
    for (const l of literals) {
      expect(l.sql.trim().toLowerCase()).toMatch(/^(select|insert|update|delete|with)\b/);
    }
  });

  it("no query literal interpolates ${} — parameterized $n only (unsafe-construction guard)", () => {
    const bad = literals.filter((l) => l.interpolated);
    expect(bad.map((l) => `line ${l.line}`)).toEqual([]);
  });

  it("every literal PREPAREs against the migrated schema (catches dead columns like r.finished_at)", async () => {
    const db = await createOrchestratorTestDb();
    try {
      for (const [i, l] of literals.entries()) {
        // PREPARE parses AND plans: a nonexistent column/table errors here, not in production.
        await expect(
          db.pg.query(`prepare hot1_guard_${i} as ${l.sql}`),
          `line ${l.line}: ${l.sql.slice(0, 90).replace(/\s+/g, " ")}…`,
        ).resolves.toBeDefined();
      }
    } finally {
      await db.close();
    }
  });
});
