import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// SPA.28 — the removal-detecting pins (REQ-SEQ-4's removal leg; ticket 139's "every new behavior
// has a removal-detecting test" clause). The migration-window machinery is deleted: these scans
// fail the moment any of it is resurrected — a re-added `deps.spa` consult, a `?ssr=1` /
// `?renderer=spa` query read, an `x-rhema-renderer` header consult, a `SPA_OVERRIDES` /
// `SPA_SURFACES` env read, or the `spa-flag.ts` module itself. Comments are exempt (the
// retirement notes name the dead symbols on purpose); the scan tests CODE lines only.

const root = fileURLToPath(new URL("..", import.meta.url));

/** All non-test source files under `src/` (recursive — covers `src/spa/**` too). */
function* srcFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name.startsWith(".")) continue;
      yield* srcFiles(p);
    } else if (/\.(ts|tsx)$/.test(name.name) && !name.name.includes(".test.")) {
      yield p;
    }
  }
}

/** Source text with comment lines dropped (the retirement notes may name the dead symbols). */
function codeText(file: string): string {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*");
    })
    .join("\n");
}

function hits(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const file of srcFiles(join(root, "src"))) {
    if (pattern.test(codeText(file))) out.push(file);
  }
  return out;
}

describe("SPA.28 — the override machinery is gone (REQ-SEQ-4 removal)", () => {
  it("spa-flag.ts is deleted — no consult module remains on the request path", () => {
    expect(existsSync(join(root, "src", "spa-flag.ts"))).toBe(false);
    expect(existsSync(join(root, "src", "spa-flag.test.ts"))).toBe(false);
  });

  it("no source reads the retired request signals — ?ssr=1, ?renderer=, x-rhema-renderer", () => {
    expect(hits(/req\.query\(["']ssr["']\)/)).toEqual([]);
    expect(hits(/req\.query\(["']renderer["']\)/)).toEqual([]);
    expect(hits(/searchParams\.(get|set)\(\s*["'](ssr|renderer)["']/)).toEqual([]);
    expect(hits(/["']x-rhema-renderer["']|SPA_RENDERER_HEADER/)).toEqual([]);
  });

  it("no source reads the retired env/flag machinery — SPA_OVERRIDES, SPA_SURFACES, deps.spa", () => {
    expect(hits(/process\.env\.SPA_OVERRIDES|process\.env\.SPA_SURFACES/)).toEqual([]);
    expect(hits(/parseSpaSurfaces|spaSurfaces:|spaOverrides:|spaSurfaces\?|spaOverrides\?/)).toEqual([]);
    expect(hits(/createSpaConsult|ssrOverrideRequested|spaShellResponse|deps\.spa\b/)).toEqual([]);
  });
});

// SPACAP.3 → R7RO.1 — the forced-SSR parity pin, re-honested (REQ-RELOAD-5; ADR-128's REQ-ED-12
// item). The server's Page-family document arms now force SSR on `isPhoneRequest(c)` ALONE — the
// `row.showcase` arm is gone: a showcase row's Page renders INSIDE the SPA through the
// ReadOnlyProject carrier (`project.readOnlyProject` on the twins, `readOnlyProject` on the boot
// payload). The phone leg is unchanged (`deviceClass === "phone" && doc.pageMount` in the boot
// map), and no leaf consults a twin predicate for a renderer verdict any more.
describe("SPACAP.3 → R7RO.1 — phone-only forced SSR + the SPA read-only carrier", () => {
  const serverText = codeText(join(root, "src", "server.ts"));
  const shellText = codeText(join(root, "src", "spa-shell.ts"));
  const statesText = codeText(join(root, "src", "spa", "states.tsx"));
  const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

  it("the server's five Page-family document arms keep the verbatim phone-only predicate", () => {
    expect(count(serverText, /isPhoneRequest\(c\) \|\| row\.showcase === true/g)).toBe(0);
    expect(count(serverText, /const forcedSsr = isPhoneRequest\(c\);/g)).toBe(1);
    // The other four arms test `isPhoneRequest(c)` inline in the route predicate.
    expect(count(serverText, /if \(isPhoneRequest\(c\)\) \{/g)).toBe(4);
  });

  it("the boot map keeps the phone leg — the request-scoped half it CAN see", () => {
    expect(
      count(shellText, /deviceClass === "phone" && doc\.pageMount === true/g),
    ).toBe(1);
  });

  it("the client has no twin-driven renderer verdict — twinForcesSsr is deleted", () => {
    expect(count(statesText, /twinForcesSsr/)).toBe(0);
    const leafDir = join(root, "src", "spa", "routes", "_authenticated");
    const consulting = readdirSync(leafDir)
      .filter((name) => name.endsWith(".tsx"))
      .filter((name) => codeText(join(leafDir, name)).includes("twinForcesSsr("));
    expect(consulting).toEqual([]);
  });

  it("the twins + shell stamps carry the ReadOnlyProject carrier — the mechanism's row facts", () => {
    // 8 twin emits (5 Page-family + dossier + run-report + obligation-new) + 5 shell boot stamps;
    // the two doc twins add the `run_lock` arm. Delete a carrier and a count fails.
    expect(count(serverText, /readOnlyProject:/g)).toBe(13);
    expect(count(serverText, /reason: "showcase" as const/g)).toBe(13);
    expect(count(serverText, /reason: "run_lock" as const/g)).toBe(2);
  });
});
