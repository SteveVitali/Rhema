import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// OPS.2 (BL-27 / REQ-ARCH-39) — the runbook-completeness drift gate. STB.1 set
// `rhema:collabDatabaseUrl` as a Pulumi secret by hand and PROD-BRINGUP.md never named it: prod
// drifted from its own bring-up document with nothing watching. This test extracts every `rhema:*`
// config key the Pulumi program reads (a `pulumi.Config("rhema")` object's `get*`/`require*` call)
// and fails when `infra/PROD-BRINGUP.md` does not document that key as `rhema:<key>`.
//
// The extractor is also tested against itself: a source snippet reading a made-up key must be
// caught, so a refactor of this file can never silently widen the allowlist.

const here = dirname(fileURLToPath(import.meta.url));
const pulumiDir = join(here, "..", "pulumi");
const runbookPath = join(here, "..", "PROD-BRINGUP.md");

// `rhemaConfig.get("x")`, `rhemaConfig.getSecret("x")`, `rhemaConfig.getObject<T>("x")`,
// `new pulumi.Config("rhema").getBoolean("x")`, and the `require*` forms. The identifier is any
// variable the file bound to `new pulumi.Config("rhema")` — every call site in the program uses
// either that or the inline form, so the two patterns cover the surface.
const CONFIG_OBJECT_RE =
  /new\s+pulumi\.Config\("rhema"\)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+pulumi\.Config\("rhema"\)/g;
const callRe = (ident: string) =>
  new RegExp(
    String.raw`(?:${ident}|new\s+pulumi\.Config\("rhema"\))\s*\.\s*` +
      String.raw`(?:get|getSecret|getBoolean|getNumber|getObject|require|requireSecret|requireBoolean|requireNumber|requireObject)\s*` +
      String.raw`(?:<[^()\n]*>)?\s*\(\s*"([A-Za-z0-9_-]+)"`,
    "g",
  );

/** The `rhema:*` config keys a Pulumi program source file reads. */
function extractRhemaConfigKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const idents = new Set<string>(["rhemaConfig"]); // the program's conventional binding
  for (const m of source.matchAll(CONFIG_OBJECT_RE)) {
    if (m[1]) idents.add(m[1]);
  }
  for (const ident of idents) {
    for (const m of source.matchAll(callRe(ident))) keys.add(m[1]);
  }
  return keys;
}

/** The `rhema:*` keys that appear in the runbook (any `rhema:<key>` mention documents the key). */
function runbookDocumentedKeys(runbook: string): Set<string> {
  const documented = new Set<string>();
  for (const m of runbook.matchAll(/rhema:([A-Za-z0-9_-]+)/g)) documented.add(m[1]);
  return documented;
}

describe("runbook completeness (OPS.2 / REQ-ARCH-39 — every read rhema:* key is documented)", () => {
  const sources = readdirSync(pulumiDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(pulumiDir, f), "utf8"));
  const runbook = readFileSync(runbookPath, "utf8");
  const documented = runbookDocumentedKeys(runbook);

  it("extracts every rhemaConfig.get* key form the program uses", () => {
    const keys = extractRhemaConfigKeys(
      [
        `const c = new pulumi.Config("rhema");`,
        `c.get("plainKey");`,
        `rhemaConfig.getSecret("secretKey");`,
        `rhemaConfig.getObject<Record<string, string>>("objectKey");`,
        `new pulumi.Config("rhema").getBoolean("boolKey");`,
        `c.requireNumber("numKey");`,
        `other.get("notARhemaKey");`,
      ].join("\n"),
    );
    expect([...keys].sort()).toEqual(
      ["boolKey", "numKey", "objectKey", "plainKey", "secretKey"].sort(),
    );
  });

  it("an undocumented key is caught (the gate cannot be widened silently)", () => {
    const keys = extractRhemaConfigKeys(`rhemaConfig.getSecret("plantedKey");`);
    const missing = [...keys].filter((k) => !documented.has(k));
    expect(missing).toEqual(["plantedKey"]);
  });

  it("every rhema:* key read in infra/pulumi/*.ts is documented in PROD-BRINGUP.md", () => {
    const read = new Set<string>();
    for (const source of sources) {
      for (const k of extractRhemaConfigKeys(source)) read.add(k);
    }
    expect(read.size, "sanity: the program reads a non-trivial config surface").toBeGreaterThan(10);
    const missing = [...read].filter((k) => !documented.has(k)).sort();
    expect(
      missing,
      `rhema:* keys read in infra/pulumi/*.ts but undocumented in infra/PROD-BRINGUP.md — ` +
        `add a §2 entry for each (STB.1's hand-set collabDatabaseUrl is how this drifted)`,
    ).toEqual([]);
  });
});
