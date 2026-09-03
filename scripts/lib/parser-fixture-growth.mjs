// The green-dossier → parser-fixture growth step (P0.15; §11.1, ledger F10). Per fixtures/README.md
// "every green nightly dossier becomes a parser fixture: the nightly runner copies each delivered run's
// validated `.rhema/*.json` sidecars (those that passed delivery validation with `parseStatus = ok`)
// into a project directory under packages/protocols/fixtures/". P0.04 owns the glob-driven parse/round-trip
// suites; P0.15 owns THIS copy step. Pure fs + an injected `validate` (the runner wires @rhema/protocols'
// parseSidecar) so this lib is deterministically testable without the private parser.
//
// Fixtures are a WRITE-ONCE golden corpus: an existing file is never clobbered (a curated seed stays
// authoritative). Only `parseStatus === "ok"` sidecars are grown; a failed one is rejected (never a silent
// partial — REQ-SPEC-12 / REQ-DATA-7 amended). A new green dossier => a new project directory.

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Grow the parser-fixture corpus from one delivered run's `.rhema/` sidecars.
 *
 * @param {object} args
 * @param {string} args.sourceDir       - the delivered run's `.rhema/` directory (holds `*.json` sidecars).
 * @param {string} args.fixturesRoot    - packages/protocols/fixtures (the golden corpus root).
 * @param {string} args.projectSlug     - the project directory to grow under (e.g. a dossier slug).
 * @param {(filename: string, jsonText: string) => "ok"|"failed"} args.validate
 *        - returns "ok" iff the sidecar validates against its schema (the runner passes parseSidecar). A
 *          filename `validate` does not recognise MUST return "failed".
 * @param {boolean} [args.apply=true]   - when false, a dry run (compute the plan, write nothing).
 * @returns {{ grown: string[], skippedExisting: string[], rejected: string[] }}
 */
export function growParserFixtures({ sourceDir, fixturesRoot, projectSlug, validate, apply = true }) {
  if (!projectSlug || projectSlug.includes("/") || projectSlug.startsWith(".")) {
    throw new Error(`growParserFixtures: unsafe projectSlug ${JSON.stringify(projectSlug)}`);
  }
  const grown = [];
  const skippedExisting = [];
  const rejected = [];

  const targetDir = join(fixturesRoot, projectSlug);
  const files = existsSync(sourceDir)
    ? readdirSync(sourceDir).filter((f) => f.endsWith(".json")).sort()
    : [];

  for (const filename of files) {
    const jsonText = readFileSync(join(sourceDir, filename), "utf8");
    if (validate(filename, jsonText) !== "ok") {
      rejected.push(filename); // a failed (or unknown) sidecar is never grown — no silent partial
      continue;
    }
    const dest = join(targetDir, filename);
    if (existsSync(dest)) {
      skippedExisting.push(filename); // write-once golden corpus — never clobber a curated seed
      continue;
    }
    if (apply) {
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(dest, jsonText.endsWith("\n") ? jsonText : jsonText + "\n");
    }
    grown.push(filename);
  }

  return { grown, skippedExisting, rejected };
}
